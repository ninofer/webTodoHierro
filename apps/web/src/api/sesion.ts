import type { UsuarioSesion } from '@todohierro/shared';
import { pedir } from './cliente';

export function quienSoy(): Promise<UsuarioSesion> {
  return pedir<UsuarioSesion>('/auth/yo');
}

export function entrar(nick: string, clave: string): Promise<{ usuario: UsuarioSesion }> {
  return pedir<{ usuario: UsuarioSesion }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ nick, clave }),
  });
}

export function salir(): Promise<{ ok: true }> {
  return pedir<{ ok: true }>('/auth/logout', { method: 'POST' });
}
