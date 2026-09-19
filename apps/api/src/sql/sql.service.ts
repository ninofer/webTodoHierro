import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sql from 'mssql';

const REINTENTO_MS = 30000;

/**
 * El único punto del API que abre conexiones a la base del cliente.
 *
 * Es producción viva: ahí se está facturando mientras la web consulta. De ahí el
 * pool chico y el timeout corto — la web nunca puede ser la razón por la que el
 * mostrador se frena.
 *
 * NO FRENA EL ARRANQUE SI LA BASE NO RESPONDE. El 19/09/2026 se cayó la regla del
 * Mikrotik que permite el 1433, `onModuleInit` lanzó la excepción, Nest abortó el
 * arranque y `app.listen()` nunca corrió. El proceso figuraba `online` en pm2 pero
 * no servía nada — ni siquiera `/api/salud`, que es justo lo que uno consulta
 * cuando algo anda mal. Ahora levanta igual, informa el estado, y reintenta en
 * segundo plano.
 */
@Injectable()
export class SqlService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(SqlService.name);

  private pool: sql.ConnectionPool | null = null;
  private conectando = false;
  private ultimoError: string | null = null;
  private reintento: NodeJS.Timeout | null = null;
  private apagado = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    // Sin await y sin throw: el arranque del API no depende de que la base esté.
    void this.conectar();
  }

  async onModuleDestroy(): Promise<void> {
    this.apagado = true;
    if (this.reintento) clearTimeout(this.reintento);
    await this.pool?.close();
  }

  get conectado(): boolean {
    return this.pool?.connected === true;
  }

  get errorDeConexion(): string | null {
    return this.ultimoError;
  }

  /** Ejecuta una consulta sin parámetros y devuelve sus filas. */
  async consultar<T>(consulta: string): Promise<T[]> {
    const pool = this.exigirPool();
    const resultado = await pool.request().query<T>(consulta);
    return resultado.recordset;
  }

  /** Devuelve un request para consultas con parámetros. El SQL nunca se concatena. */
  peticion(): sql.Request {
    return this.exigirPool().request();
  }

  private exigirPool(): sql.ConnectionPool {
    if (!this.conectado || this.pool === null) {
      throw new Error(
        'No hay conexión con la base del cliente' +
          (this.ultimoError ? `: ${this.ultimoError}` : '') +
          '. Revisá el túnel OpenVPN y que el Mikrotik permita TCP 1433 hacia el servidor.',
      );
    }
    return this.pool;
  }

  private async conectar(): Promise<void> {
    if (this.conectando || this.conectado || this.apagado) return;
    this.conectando = true;

    const pool = new sql.ConnectionPool({
      server: this.config.getOrThrow<string>('SQL_HOST'),
      port: Number(this.config.get<string>('SQL_PUERTO') ?? 1433),
      database: this.config.getOrThrow<string>('SQL_BASE'),
      user: this.config.getOrThrow<string>('SQL_USUARIO'),
      password: this.config.getOrThrow<string>('SQL_CLAVE'),
      options: {
        // El tráfico va por la VPN terminada en el Mikrotik, no por internet.
        // Aun así SQL Server 2008 R2 cifra el paquete de login con TLS 1.0
        // siempre: sin NODE_OPTIONS=--tls-min-v1.0 el handshake falla antes de
        // llegar acá, con un error que no menciona TLS.
        encrypt: false,
        trustServerCertificate: true,
      },
      pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
      requestTimeout: 30000,
      connectionTimeout: Number(this.config.get<string>('SQL_TIMEOUT_CONEXION_MS') ?? 10000),
    });

    // Un pool que se cae solo no avisa por ningún lado si nadie escucha esto.
    pool.on('error', (error) => {
      this.ultimoError = error.message;
      this.log.error(`El pool reportó un error: ${error.message}`);
    });

    try {
      await pool.connect();
      this.pool = pool;
      this.ultimoError = null;
      this.log.log('Conectado a la base del cliente');
    } catch (error) {
      this.ultimoError = error instanceof Error ? error.message : String(error);
      this.log.error(
        `No se pudo conectar a la base: ${this.ultimoError}. ` +
          `Reintento en ${REINTENTO_MS / 1000} s.`,
      );
      this.programarReintento();
    } finally {
      this.conectando = false;
    }
  }

  private programarReintento(): void {
    if (this.apagado || this.reintento) return;
    this.reintento = setTimeout(() => {
      this.reintento = null;
      void this.conectar();
    }, REINTENTO_MS);
    // Que un reintento pendiente no sea lo único que mantiene vivo el proceso.
    this.reintento.unref?.();
  }
}
