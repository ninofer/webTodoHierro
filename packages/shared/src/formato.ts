/**
 * Formatos que la pantalla muestra y el servidor usa en sus mensajes.
 *
 * Una copia en cada lado termina mostrando "Gs 167.270" en la tabla y "167270"
 * en el mensaje de la misma operación.
 */

const GUARANIES = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });

const STOCK_CON_DECIMALES = new Intl.NumberFormat('es-PY', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const STOCK_ENTERO = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });

/** Monto en guaraníes, sin decimales: la moneda no los tiene. */
export function formatearGuaranies(monto: number): string {
  return GUARANIES.format(monto);
}

/**
 * Cantidad de stock. La columna es `numeric` con cuatro decimales, pero casi
 * todos los artículos se manejan en unidades enteras: mostrar "494,0000" ensucia
 * la pantalla sin agregar nada. Los decimales aparecen sólo cuando existen.
 */
export function formatearStock(cantidad: number): string {
  return Number.isInteger(cantidad)
    ? STOCK_ENTERO.format(cantidad)
    : STOCK_CON_DECIMALES.format(cantidad);
}

/** Antigüedad del dato, en palabras, para la línea de estado de la pantalla. */
export function formatearAntiguedad(segundos: number): string {
  if (segundos < 60) return 'hace ' + segundos + ' s';
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return 'hace ' + minutos + ' min';
  const horas = Math.floor(minutos / 60);
  return 'hace ' + horas + ' h';
}
