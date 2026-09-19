import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sql from 'mssql';

/**
 * El único punto del API que abre conexiones a la base del cliente.
 *
 * Es producción viva: ahí se está facturando mientras la web consulta. De ahí
 * el pool chico y el timeout corto — la web nunca puede ser la razón por la que
 * el mostrador se frena.
 */
@Injectable()
export class SqlService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(SqlService.name);
  private pool!: sql.ConnectionPool;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    this.pool = new sql.ConnectionPool({
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
      connectionTimeout: 10000,
    });

    await this.pool.connect();
    this.log.log('Conectado a la base del cliente');
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.close();
  }

  /** Ejecuta una consulta sin parámetros y devuelve sus filas. */
  async consultar<T>(consulta: string): Promise<T[]> {
    const resultado = await this.pool.request().query<T>(consulta);
    return resultado.recordset;
  }

  /** Devuelve un request para consultas con parámetros. El SQL nunca se concatena. */
  peticion(): sql.Request {
    return this.pool.request();
  }
}
