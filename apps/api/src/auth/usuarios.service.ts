import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import * as argon2 from 'argon2';
import type { UsuarioSesion } from '@todohierro/shared';

/** Un usuario del portal, tal como está en el archivo del padrón. */
interface UsuarioGuardado {
  nick: string;
  nombre: string;
  hash: string;
  /** Su usuario del sistema de escritorio. Ver UsuarioSesion.idUsuario. */
  idUsuario: number;
  /** Opcional en el archivo; si falta, no ve reportes. */
  reportes: boolean;
}

/**
 * Valida el padrón al cargarlo. Un usuario sin `idUsuario` no puede hacer
 * presupuestos, y si se lo deja entrar, el primer intento falla contra la base con
 * un error que no dice qué pasa. Mejor que la carga falle ahora, nombrando a quién.
 */
export function validarPadron(leidos: unknown): UsuarioGuardado[] {
  if (!Array.isArray(leidos)) {
    throw new Error('El padrón tiene que ser una lista de usuarios.');
  }
  return leidos.map((u: Partial<UsuarioGuardado>, i) => {
    const nick = typeof u.nick === 'string' ? u.nick.toLowerCase() : '';
    if (nick === '' || typeof u.hash !== 'string' || typeof u.nombre !== 'string') {
      throw new Error(`El usuario número ${i + 1} del padrón no tiene nick, nombre o hash.`);
    }
    if (!Number.isInteger(u.idUsuario) || (u.idUsuario as number) <= 0) {
      throw new Error(
        `El usuario "${nick}" no tiene un idUsuario válido (se leyó ${JSON.stringify(u.idUsuario)}). ` +
          'Agregale "idUsuario" con su número de usuario del sistema de escritorio.',
      );
    }
    if (u.reportes !== undefined && typeof u.reportes !== 'boolean') {
      // "reportes": "si" pasaría como verdadero en cualquier if descuidado.
      throw new Error(
        `El usuario "${nick}" tiene "reportes": ${JSON.stringify(u.reportes)}. Tiene que ser true, false o no estar.`,
      );
    }
    return { nick, nombre: u.nombre, hash: u.hash, idUsuario: u.idUsuario as number, reportes: u.reportes === true };
  });
}

/**
 * Padrón de usuarios del portal.
 *
 * Vive en pc-servicios, NO en la base del cliente. El sistema de escritorio
 * guarda sus contraseñas cifradas con un certificado de SQL Server —cifrado
 * reversible, no hash— y validar contra él exigiría darle a web_ro CONTROL sobre
 * ese certificado. Ver docs/01-arquitectura.md, punto 6.
 *
 * La clave es de la web; la habilitación la decide el sistema del cliente
 * (tabla usuarioWeb, ver HabilitacionService).
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
      this.usuarios = validarPadron(JSON.parse(crudo));
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
  async verificar(nick: string, clave: string): Promise<UsuarioSesion | null> {
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
    return { idUsuario: usuario.idUsuario, nick: usuario.nick, nombre: usuario.nombre, reportes: usuario.reportes };
  }
}
