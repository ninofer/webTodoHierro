import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import * as argon2 from 'argon2';

/** Un usuario del portal, tal como está en el archivo del padrón. */
interface UsuarioGuardado {
  nick: string;
  nombre: string;
  hash: string;
}

/**
 * Padrón de usuarios del portal.
 *
 * Vive en pc-servicios, NO en la base del cliente. El sistema de escritorio
 * guarda sus contraseñas cifradas con un certificado de SQL Server —cifrado
 * reversible, no hash— y validar contra él exigiría EXECUTE sobre un objeto de
 * dbo, justo lo que el login web_ro deniega. Ver docs/01-arquitectura.md, punto 6.
 */
@Injectable()
export class UsuariosService implements OnModuleInit {
  private readonly log = new Logger(UsuariosService.name);
  private usuarios: UsuarioGuardado[] = [];

  /**
   * Hash contra el que se compara cuando el usuario no existe.
   *
   * Sin esto, un nick inexistente responde en microsegundos y uno real tarda lo
   * que tarda argon2: la diferencia permite averiguar qué usuarios existen sólo
   * midiendo el tiempo de respuesta.
   */
  private hashSenuelo!: string;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    this.hashSenuelo = await argon2.hash('senuelo-' + Date.now(), { type: argon2.argon2id });
    this.recargar();
  }

  /** Relee el padrón desde disco. Agregar un usuario no exige reiniciar el proceso. */
  recargar(): void {
    const ruta = this.config.getOrThrow<string>('USUARIOS_ARCHIVO');
    try {
      const crudo = readFileSync(ruta, 'utf8');
      const leidos = JSON.parse(crudo) as UsuarioGuardado[];
      this.usuarios = leidos.map((u) => ({ ...u, nick: u.nick.toLowerCase() }));
      this.log.log(`Padrón cargado: ${this.usuarios.length} usuarios`);
    } catch (error) {
      const detalle = error instanceof Error ? error.message : String(error);
      throw new Error(
        `No se pudo leer el padrón de usuarios en "${ruta}": ${detalle}. ` +
          `Creá el archivo con deploy/crear-usuario.js o corregí USUARIOS_ARCHIVO en el .env.`,
      );
    }
  }

  /**
   * Verifica nick y contraseña. Devuelve el usuario o null.
   *
   * Siempre corre argon2.verify, exista el usuario o no, para que el tiempo de
   * respuesta no delate qué nicks están dados de alta.
   */
  async verificar(nick: string, clave: string): Promise<{ nick: string; nombre: string } | null> {
    const buscado = nick.trim().toLowerCase();
    const usuario = this.usuarios.find((u) => u.nick === buscado);
    const hash = usuario?.hash ?? this.hashSenuelo;

    let coincide = false;
    try {
      coincide = await argon2.verify(hash, clave);
    } catch {
      coincide = false;
    }

    if (!usuario || !coincide) return null;
    return { nick: usuario.nick, nombre: usuario.nombre };
  }
}
