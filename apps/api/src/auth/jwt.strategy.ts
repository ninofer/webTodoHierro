import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import type { UsuarioSesion } from '@todohierro/shared';

export const COOKIE_SESION = 'th_sesion';

/**
 * Extrae el token de la cookie, no de la cabecera Authorization.
 *
 * La cookie es HttpOnly: el JavaScript de la página no la puede leer, así que un
 * XSS no se lleva la sesión. Un token en localStorage sí se lo lleva.
 */
function desdeCookie(req: Request): string | null {
  const cookies = req.cookies as Record<string, string> | undefined;
  return cookies?.[COOKIE_SESION] ?? null;
}

interface Carga {
  sub: string;
  nombre: string;
  /** idUsuario del escritorio. Los tokens de antes del módulo de presupuestos no lo tienen. */
  uid?: number;
  /** Permiso de reportes. Sólo `true` literal habilita. */
  rep?: boolean;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([desdeCookie]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRETO'),
    });
  }

  validate(carga: Carga): UsuarioSesion {
    if (!Number.isInteger(carga.uid)) {
      throw new UnauthorizedException('Tu sesión es de una versión anterior del portal: volvé a ingresar.');
    }
    return { idUsuario: carga.uid as number, nick: carga.sub, nombre: carga.nombre, reportes: carga.rep === true };
  }
}
