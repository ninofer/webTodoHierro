import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { UsuarioSesion } from '@todohierro/shared';

export const MENSAJE_SIN_REPORTES =
  'Tu usuario no tiene permiso para ver reportes: pedile al administrador que te habilite "reportes" en el padrón.';

/**
 * Los reportes muestran toda la facturación del negocio. Esconder el menú en la
 * pantalla sólo avisa; el que impide es este guard, en cada ruta de reportes.
 * La guarda reportes-protegidos comprueba que ninguna quede sin él.
 */
@Injectable()
export class ReportesGuard implements CanActivate {
  canActivate(contexto: ExecutionContext): boolean {
    const usuario = contexto.switchToHttp().getRequest<Request>().user as UsuarioSesion | undefined;
    if (usuario?.reportes !== true) throw new ForbiddenException(MENSAJE_SIN_REPORTES);
    return true;
  }
}
