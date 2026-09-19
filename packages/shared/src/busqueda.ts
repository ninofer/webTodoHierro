import { LIMITES } from './limites';
import type { ModoBusqueda } from './tipos';

/**
 * Criterio de búsqueda del sistema de escritorio (frmConsultaPrecio.vb).
 *
 * Vive acá porque lo deciden los dos lados: la pantalla necesita saber por qué
 * campo está buscando para decírselo al usuario, y el servidor lo necesita para
 * filtrar. Dos copias empezarían iguales y se separarían en el primer arreglo.
 */
export function modoDeBusqueda(texto: string): ModoBusqueda {
  const limpio = texto.trim();
  if (limpio.length === 0) return 'todos';

  // El VB mira el primer carácter, no si todo el texto es numérico:
  // "176A" se busca como código, no como nombre.
  if (!/^\d/.test(limpio)) return 'nombre';

  return limpio.length <= LIMITES.LARGO_MAXIMO_CODIGO ? 'codigo' : 'barra';
}

/**
 * Deja el texto de búsqueda listo para usar: recortado y acotado al largo máximo.
 * Se aplica antes de `modoDeBusqueda`, para que un texto larguísimo no cambie el
 * modo por culpa de caracteres que igual se van a descartar.
 */
export function normalizarBusqueda(texto: string): string {
  return texto.trim().slice(0, LIMITES.LARGO_MAXIMO_BUSQUEDA);
}
