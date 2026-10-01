import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { UsuarioSesion } from '@todohierro/shared';
import { JwtStrategy } from '../../src/auth/jwt.strategy';
import { MENSAJE_SIN_REPORTES, ReportesGuard } from '../../src/auth/reportes.guard';
import { validarPadron } from '../../src/auth/usuarios.service';

/**
 * Los reportes muestran toda la facturación del negocio: sólo los ve quien tiene
 * "reportes": true en el padrón. Por defecto, nadie.
 */

function contextoCon(usuario: Partial<UsuarioSesion> | undefined): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => ({ user: usuario }) }) } as unknown as ExecutionContext;
}

describe('guarda: reportes-permiso', () => {
  const guard = new ReportesGuard();

  it('sin el permiso, 403 con el mensaje que dice qué hacer', () => {
    expect(() => guard.canActivate(contextoCon({ idUsuario: 7, reportes: false }))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextoCon({ idUsuario: 7, reportes: false }))).toThrow(MENSAJE_SIN_REPORTES);
    expect(() => guard.canActivate(contextoCon(undefined))).toThrow(ForbiddenException);
  });

  it('con el permiso, pasa', () => {
    expect(guard.canActivate(contextoCon({ idUsuario: 7, reportes: true }))).toBe(true);
  });

  it('en el padrón, si falta vale false; si no es booleano, la carga falla nombrando al usuario', () => {
    const base = { nick: 'ana', nombre: 'Ana', hash: 'x', idUsuario: 7 };
    expect(validarPadron([base])[0]?.reportes).toBe(false);
    expect(validarPadron([{ ...base, reportes: true }])[0]?.reportes).toBe(true);
    // "si" es verdadero en cualquier if descuidado: tiene que rechazarse.
    expect(() => validarPadron([{ ...base, reportes: 'si' }])).toThrow(/"ana".*reportes/);
  });

  it('en el token, sólo true literal habilita', () => {
    const estrategia = new JwtStrategy({ getOrThrow: () => 'x'.repeat(32) } as unknown as ConfigService);
    expect(estrategia.validate({ sub: 'ana', nombre: 'Ana', uid: 7, rep: true }).reportes).toBe(true);
    expect(estrategia.validate({ sub: 'ana', nombre: 'Ana', uid: 7 }).reportes).toBe(false);
    expect(estrategia.validate({ sub: 'ana', nombre: 'Ana', uid: 7, rep: 'si' as unknown as boolean }).reportes).toBe(false);
  });
});
