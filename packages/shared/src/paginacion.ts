import { LIMITES } from './limites';

/**
 * Convierte lo que llegó por querystring en un número de página usable.
 *
 * Todo lo que no sea un entero mayor o igual a 1 cae en la página 1: un `NaN`
 * propagado hasta el salteo de filas devuelve cero resultados y parece un
 * problema de datos.
 */
export function normalizarPagina(valor: unknown): number {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return 1;
  return Math.max(1, Math.floor(numero));
}

/** Tamaño de página, acotado al tope duro. */
export function normalizarTamano(valor: unknown): number {
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero <= 0) {
    return LIMITES.TAMANO_PAGINA_POR_DEFECTO;
  }
  return Math.min(LIMITES.TAMANO_PAGINA_MAXIMO, Math.floor(numero));
}

/** Filas a saltear para una página y tamaño dados. */
export function filasASaltear(pagina: number, tamano: number): number {
  return (pagina - 1) * tamano;
}
