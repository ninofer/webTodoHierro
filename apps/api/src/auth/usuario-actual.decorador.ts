import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { UsuarioSesion } from '@todohierro/shared';

/**
 * El usuario de la sesión, tal como lo dejó JwtStrategy.validate.
 *
 * Es la única fuente del idUsuario en los controladores: nunca el cuerpo ni la
 * URL de la petición.
 */
export const UsuarioActual = createParamDecorator(
  (_dato: unknown, contexto: ExecutionContext): UsuarioSesion =>
    contexto.switchToHttp().getRequest<Request>().user as UsuarioSesion,
);
