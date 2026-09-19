import { Injectable } from '@nestjs/common';
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
    return { nick: carga.sub, nombre: carga.nombre };
  }
}
