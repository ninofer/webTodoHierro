/**
 * Reglas y contrato del módulo de presupuestos.
 *
 * El precio, el IVA y los subtotales NO se calculan acá: los calculan los SP del
 * cliente (`sp_agregarDetFacturacionTmp_producto_web` y compañía), igual que en
 * el escritorio. Lo que vive acá es lo que la pantalla y el servidor tienen que
 * decidir igual antes de llamar a la base: qué cantidad es aceptable y cuándo se
 * avisa de un faltante de stock.
 */

/** Lista de precio, con los mismos números que usa `detFacturacionTmp.tipoPrecio`. */
export const TIPO_PRECIO = {
  MINORISTA: 1,
  MAYORISTA: 2,
} as const;

export type TipoPrecio = (typeof TIPO_PRECIO)[keyof typeof TIPO_PRECIO];

export function esTipoPrecio(valor: unknown): valor is TipoPrecio {
  return valor === TIPO_PRECIO.MINORISTA || valor === TIPO_PRECIO.MAYORISTA;
}

/** Qué se está agregando al carrito. Cada uno tiene su SP y su tipo de cantidad. */
export type TipoItem = 'producto' | 'servicio';

/**
 * Límites de la cantidad de un renglón, tomados de los parámetros de los SP:
 * - producto: `@cantidad numeric(10,4)` → hasta 999.999,9999 con 4 decimales.
 * - servicio: `@cantidad numeric(4)` → entero hasta 9.999. En el escritorio el
 *   parámetro es Integer y los decimales se pierden sin aviso; acá se rechazan.
 */
export const LIMITES_CANTIDAD: Record<TipoItem, { maximo: number; decimales: number }> = {
  producto: { maximo: 999999, decimales: 4 },
  servicio: { maximo: 9999, decimales: 0 },
};

/**
 * Devuelve el mensaje de error de una cantidad, o `null` si es aceptable.
 * El mensaje dice qué hacer y nombra el valor recibido.
 */
export function validarCantidad(cantidad: unknown, tipo: TipoItem): string | null {
  const limite = LIMITES_CANTIDAD[tipo];
  if (typeof cantidad !== 'number' || !Number.isFinite(cantidad)) {
    return 'La cantidad tiene que ser un número; se recibió «' + String(cantidad) + '».';
  }
  if (cantidad <= 0) {
    return 'La cantidad tiene que ser mayor que cero; se recibió ' + cantidad + '.';
  }
  if (cantidad > limite.maximo) {
    return (
      'La cantidad máxima de un ' + tipo + ' es ' + limite.maximo +
      '; se recibió ' + cantidad + '. Dividila en varios renglones.'
    );
  }
  if (decimalesDe(cantidad) > limite.decimales) {
    return limite.decimales === 0
      ? 'La cantidad de un servicio tiene que ser entera; se recibió ' + cantidad + '.'
      : 'La cantidad admite hasta ' + limite.decimales + ' decimales; se recibió ' + cantidad + '.';
  }
  return null;
}

function decimalesDe(n: number): number {
  const texto = String(n);
  const punto = texto.indexOf('.');
  return punto < 0 ? 0 : texto.length - punto - 1;
}

/**
 * Tope del precio escrito a mano. El parámetro del SP es `money`, que admite
 * mucho más; el tope está para que un cero de más (2.000.000 en vez de 200.000)
 * no pase sin que nadie lo mire.
 */
export const PRECIO_MANUAL_MAXIMO = 999_999_999;

/**
 * Devuelve el mensaje de error de un precio manual, o `null` si es aceptable.
 * En guaraníes: entero y mayor que cero. El escritorio acepta decimales y los
 * redondea en el SP; acá se piden enteros para que lo que se ve sea lo que queda.
 */
export function validarPrecioManual(precio: unknown): string | null {
  if (typeof precio !== 'number' || !Number.isFinite(precio)) {
    return 'El precio tiene que ser un número; se recibió «' + String(precio) + '».';
  }
  if (precio <= 0) {
    return 'El precio tiene que ser mayor que cero; se recibió ' + precio + '.';
  }
  if (!Number.isInteger(precio)) {
    return 'El precio va en guaraníes, sin decimales; se recibió ' + precio + '.';
  }
  if (precio > PRECIO_MANUAL_MAXIMO) {
    return 'El precio máximo es ' + PRECIO_MANUAL_MAXIMO + '; se recibió ' + precio + '. Revisá que no sobre un cero.';
  }
  return null;
}

/**
 * Hay faltante cuando se pide más de lo que hay. Igual que el escritorio
 * (`frmFacturacionTotal.cargarProductoFacturacion`), es un aviso: no bloquea,
 * porque un presupuesto no descuenta stock.
 */
export function hayFaltanteDeStock(cantidad: number, stock: number): boolean {
  return cantidad > stock;
}

/* ------------------------------------------------------------------ */
/* Contrato entre el API y la web                                      */
/* ------------------------------------------------------------------ */

/** Un renglón del carrito, tal como lo devuelve `sp_consultaDetFacturacionTmp_web`. */
export interface ItemCarrito {
  /** Número de renglón; es lo que se usa para quitarlo. */
  nro: number;
  /** Código del producto, o id del servicio. */
  codigo: string;
  descripcion: string;
  /** 'MINORISTA', 'MAYORISTA' o 'SERVICIO', como lo guarda la base. */
  nombreTipoPrecio: string;
  precio: number;
  cantidad: number;
  exenta: number;
  gravada5: number;
  gravada10: number;
  /** La base marcó el renglón con error (por ejemplo, sin stock). Va en rojo. */
  tieneError: boolean;
  esServicio: boolean;
}

/** Los totales de `sumarTotal` del escritorio (frmFacturacionTotal.vb). */
export interface TotalesCarrito {
  total: number;
  descuento: number;
  iva5: number;
  iva10: number;
  totalIva: number;
  /** Mayorista si algún renglón lo es; si no, minorista. */
  tipoPrecio: TipoPrecio;
}

export interface Carrito {
  items: ItemCarrito[];
  totales: TotalesCarrito;
}

/** Respuesta de agregar un renglón: el carrito nuevo y, si corresponde, un aviso. */
export interface RespuestaCarrito {
  carrito: Carrito;
  aviso?: string;
}

/**
 * Cómo se precia un producto antes de agregarlo, según sp_precioMercaderia.
 * Si `precioManual`, la pantalla pide el precio, como frmItemFacturacionTotal, y
 * lo propone con `precioSugerido`: el mayorista, igual que frmStock.vb:150.
 */
export interface PrecioProducto {
  precioManual: boolean;
  precioSugerido: number;
}

export interface ClienteResumen {
  id: number;
  ruc: string;
  nombre: string;
  grupo: string;
  email: string;
}

export interface Vendedor {
  id: number;
  nombre: string;
}

export interface Servicio {
  id: number;
  nombre: string;
  precio: number;
}

export interface PresupuestoGuardado {
  idPresupuesto: number;
}
