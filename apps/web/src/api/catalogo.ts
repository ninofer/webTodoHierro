import type { RespuestaArticulos } from '@todohierro/shared';
import { pedir } from './cliente';

export function buscarArticulos(texto: string, pagina: number): Promise<RespuestaArticulos> {
  const parametros = new URLSearchParams({ pagina: String(pagina) });
  if (texto.trim().length > 0) parametros.set('q', texto.trim());
  return pedir<RespuestaArticulos>('/catalogo/articulos?' + parametros.toString());
}
