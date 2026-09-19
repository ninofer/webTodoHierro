/**
 * Límites que la pantalla y el servidor tienen que respetar igual.
 *
 * Si sólo viven en el servidor, la pantalla pide 5.000 filas y recibe 200 sin
 * entender por qué. Si sólo viven en la pantalla, alguien llama al API por otro
 * camino y se lleva el catálogo entero.
 */
export const LIMITES = {
  /** Filas por página cuando el cliente no pide un tamaño. */
  TAMANO_PAGINA_POR_DEFECTO: 25,

  /** Tope duro de filas por página. El servidor lo impone, no lo sugiere. */
  TAMANO_PAGINA_MAXIMO: 200,

  /** Largo máximo del texto de búsqueda que se acepta. */
  LARGO_MAXIMO_BUSQUEDA: 60,

  /**
   * Hasta este largo, un texto numérico se interpreta como código de producto;
   * más largo, como código de barras. El número sale de frmConsultaPrecio.vb del
   * sistema de escritorio, donde la condición es `Len(Trim(txtBuscar.Text)) <= 6`.
   */
  LARGO_MAXIMO_CODIGO: 6,
} as const;
