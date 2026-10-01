import { ForbiddenException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { AuthController } from '../../src/auth/auth.controller';
import type { AuthService } from '../../src/auth/auth.service';
import { FrenoLoginService } from '../../src/auth/freno-login.service';
import type { HabilitacionRepositorio } from '../../src/auth/habilitacion.repositorio';
import {
  HABILITACION_CACHE_MS,
  HabilitacionService,
  MENSAJE_NO_HABILITADO,
} from '../../src/auth/habilitacion.service';
import { JwtStrategy } from '../../src/auth/jwt.strategy';
import type { UsuariosService } from '../../src/auth/usuarios.service';
import { validarPadron } from '../../src/auth/usuarios.service';

/**
 * Tener clave en el padrón de la web no alcanza para entrar: el usuario tiene que
 * estar en `usuarioWeb`, que administra el sistema del cliente. Y cada usuario
 * del padrón tiene que traer su idUsuario, porque con él la base separa el
 * carrito de cada uno.
 */

function repositorioFalso(respuestas: boolean[] | Error): HabilitacionRepositorio & { llamadas: number } {
  const falso = {
    llamadas: 0,
    async estaEnUsuarioWeb(): Promise<boolean> {
      falso.llamadas++;
      if (respuestas instanceof Error) throw respuestas;
      return respuestas[Math.min(falso.llamadas - 1, respuestas.length - 1)] ?? false;
    },
  };
  return falso as unknown as HabilitacionRepositorio & { llamadas: number };
}

function controlador(habilitado: boolean) {
  const cookies: string[] = [];
  const usuarios = {
    verificar: async () => ({ idUsuario: 7, nick: 'ana', nombre: 'Ana' }),
  } as unknown as UsuariosService;
  const auth = { firmar: () => 'token', horasDeVida: 12 } as unknown as AuthService;
  const freno = new FrenoLoginService();
  const habilitacion = new HabilitacionService(repositorioFalso([habilitado]));
  const respuesta = { cookie: (nombre: string) => cookies.push(nombre) } as unknown as Response;
  return {
    cookies,
    entrar: () =>
      new AuthController(usuarios, auth, freno, habilitacion).login(
        { nick: 'ana', clave: 'correcta' },
        '10.0.0.1',
        respuesta,
      ),
  };
}

describe('guarda: login-habilitacion', () => {
  it('con la clave correcta pero fuera de usuarioWeb, no hay sesión', async () => {
    const c = controlador(false);
    await expect(c.entrar()).rejects.toThrow(ForbiddenException);
    await expect(c.entrar()).rejects.toThrow(MENSAJE_NO_HABILITADO);
    // Lo que importa es que no se entregó la cookie, no sólo que hubo excepción.
    expect(c.cookies).toEqual([]);
  });

  it('habilitado, entra y recibe la cookie con su idUsuario', async () => {
    const c = controlador(true);
    await expect(c.entrar()).resolves.toEqual({ usuario: { idUsuario: 7, nick: 'ana', nombre: 'Ana' } });
    expect(c.cookies).toHaveLength(1);
  });

  it('sin base, se niega: no se supone que está habilitado', async () => {
    const servicio = new HabilitacionService(repositorioFalso(new Error('sin túnel')));
    await expect(servicio.estaHabilitado(7)).rejects.toThrow(ServiceUnavailableException);
  });

  it('la respuesta se recuerda un minuto y después se vuelve a preguntar', async () => {
    const repo = repositorioFalso([true, false]);
    const servicio = new HabilitacionService(repo);
    const t0 = 1_000_000;

    expect(await servicio.estaHabilitado(7, t0)).toBe(true);
    expect(await servicio.estaHabilitado(7, t0 + HABILITACION_CACHE_MS - 1)).toBe(true);
    expect(repo.llamadas).toBe(1);

    // Pasado el minuto, el que fue deshabilitado en el sistema ya no puede operar.
    expect(await servicio.estaHabilitado(7, t0 + HABILITACION_CACHE_MS)).toBe(false);
    expect(repo.llamadas).toBe(2);
  });

  it('un usuario del padrón sin idUsuario hace fallar la carga, nombrándolo', () => {
    const base = { nick: 'Pedro', nombre: 'Pedro', hash: 'x' };
    expect(() => validarPadron([base])).toThrow(/"pedro".*idUsuario/);
    expect(() => validarPadron([{ ...base, idUsuario: 0 }])).toThrow(/"pedro"/);
    expect(() => validarPadron([{ ...base, idUsuario: '5' }])).toThrow(/"pedro"/);
    expect(validarPadron([{ ...base, idUsuario: 5 }])[0]).toMatchObject({ nick: 'pedro', idUsuario: 5 });
  });

  it('un token sin idUsuario (de antes de este cambio) no es una sesión válida', () => {
    const config = { getOrThrow: () => 'x'.repeat(32) } as unknown as ConfigService;
    const estrategia = new JwtStrategy(config);
    expect(() => estrategia.validate({ sub: 'ana', nombre: 'Ana' })).toThrow(UnauthorizedException);
    expect(estrategia.validate({ sub: 'ana', nombre: 'Ana', uid: 7 })).toEqual({
      idUsuario: 7,
      nick: 'ana',
      nombre: 'Ana',
      reportes: false,
    });
  });
});
