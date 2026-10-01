/**
 * Reglas y contrato de los reportes de ventas (Facturación total y Ranking).
 *
 * Los montos salen de los SP del cliente; acá sólo se agrupan. La agrupación
 * vive en shared para que la pantalla, el PDF y las pruebas cuenten igual: si
 * el PDF sumara por su lado, el día que alguien corrija una de las dos sumas la
 * pantalla y el papel dirían números distintos del mismo mes.
 */

/**
 * Tope del rango de un reporte. Un mes son unas 2.800 facturas y 10.000
 * renglones; un año, diez veces eso. Más que un año es una consulta pesada contra
 * una base que está facturando mientras tanto.
 */
export const RANGO_MAXIMO_DIAS = 366;

const FECHA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 'aaaa-mm-dd' → Date en UTC, o null si no es una fecha que exista. */
export function leerFechaIso(texto: unknown): Date | null {
  if (typeof texto !== 'string') return null;
  const m = FECHA_ISO.exec(texto);
  if (!m) return null;
  const fecha = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  // 2026-02-30 se convierte en 2 de marzo: eso no es la fecha que se pidió.
  return fecha.toISOString().slice(0, 10) === texto ? fecha : null;
}

export function fechaIso(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

/** 'aaaa-mm-dd' → 'dd/mm/aaaa', como lo muestra el escritorio. */
export function fechaLocal(iso: string): string {
  const m = FECHA_ISO.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** Mensaje de error del rango, o null si es aceptable. Nombra las fechas recibidas. */
export function validarRangoFechas(desde: unknown, hasta: unknown): string | null {
  const d = leerFechaIso(desde);
  const h = leerFechaIso(hasta);
  if (!d) return `La fecha desde tiene que tener el formato aaaa-mm-dd; se recibió «${String(desde)}».`;
  if (!h) return `La fecha hasta tiene que tener el formato aaaa-mm-dd; se recibió «${String(hasta)}».`;
  if (d > h) {
    return `La fecha desde (${fechaLocal(String(desde))}) es posterior a la fecha hasta (${fechaLocal(String(hasta))}). Invertilas.`;
  }
  const dias = diasEntre(d, h) + 1;
  if (dias > RANGO_MAXIMO_DIAS) {
    return `El rango pedido es de ${dias} días y el máximo es ${RANGO_MAXIMO_DIAS}. Pedí un año o menos.`;
  }
  return null;
}

function diasEntre(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/** Del primer día del mes de `hoy` hasta `hoy`: el rango con el que abre la pantalla. */
export function mesEnCurso(hoy: Date): { desde: string; hasta: string } {
  const desde = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), 1));
  const hasta = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
  return { desde: fechaIso(desde), hasta: fechaIso(hasta) };
}

/* ------------------------------------------------------------------ */
/* Facturación total                                                   */
/* ------------------------------------------------------------------ */

/** Un renglón de sp_reporteFacturacionTotalDetalle, ya traducido. */
export interface RenglonFacturacion {
  idFacturacion: number;
  /** 'aaaa-mm-dd' */
  fecha: string;
  factura: string;
  ruc: string;
  cliente: string;
  codigo: string;
  descripcion: string;
  grupo: string;
  esServicio: boolean;
  precio: number;
  /**
   * null en los servicios: el SP devuelve un 3 fijo como cantidad y el subtotal
   * igual al precio. Mostrar ese 3 sería inventar un dato.
   */
  cantidad: number | null;
  subtotal: number;
}

export interface FacturaResumen {
  idFacturacion: number;
  fecha: string;
  factura: string;
  ruc: string;
  cliente: string;
  total: number;
}

export interface TotalRotulado {
  rotulo: string;
  total: number;
  /** Sobre el total del período, de 0 a 100. */
  porcentaje: number;
}

export interface ResumenFacturacion {
  total: number;
  cantidadFacturas: number;
  ticketPromedio: number;
  cantidadClientes: number;
  /** Un elemento por día del rango, también los días sin venta (total 0). */
  porDia: Array<{ fecha: string; total: number }>;
  /**
   * Como el pie del reporte del escritorio: los grupos de mercadería (HIERROS,
   * FERRETERIA…) y, dentro de SERVICIOS, cada servicio por su nombre (FLETE,
   * ALQUILER, CORTE…). De mayor a menor.
   */
  porRubro: TotalRotulado[];
  /** Los productos (no servicios) que más facturaron, de mayor a menor. */
  topProductos: TotalRotulado[];
}

export const TOP_PRODUCTOS = 10;

/** El rubro de un renglón, con el criterio del pie del reporte del escritorio. */
export function rubroDe(r: RenglonFacturacion): string {
  return r.esServicio ? r.descripcion : r.grupo;
}

export function resumirFacturacion(renglones: RenglonFacturacion[], desde: string, hasta: string): ResumenFacturacion {
  const total = renglones.reduce((s, r) => s + r.subtotal, 0);
  const facturas = new Set(renglones.map((r) => r.idFacturacion));
  const clientes = new Set(renglones.map((r) => `${r.ruc}|${r.cliente}`));

  const dias = new Map<string, number>();
  const d = leerFechaIso(desde);
  const h = leerFechaIso(hasta);
  if (d && h) {
    for (let t = d.getTime(); t <= h.getTime(); t += 86400000) dias.set(fechaIso(new Date(t)), 0);
  }
  for (const r of renglones) dias.set(r.fecha, (dias.get(r.fecha) ?? 0) + r.subtotal);

  return {
    total,
    cantidadFacturas: facturas.size,
    ticketPromedio: facturas.size === 0 ? 0 : Math.round(total / facturas.size),
    cantidadClientes: clientes.size,
    porDia: [...dias].sort(([a], [b]) => a.localeCompare(b)).map(([fecha, t]) => ({ fecha, total: t })),
    porRubro: agrupar(renglones, rubroDe, total),
    topProductos: agrupar(
      renglones.filter((r) => !r.esServicio),
      (r) => `${r.codigo} · ${r.descripcion}`,
      total,
    ).slice(0, TOP_PRODUCTOS),
  };
}

function agrupar(
  renglones: RenglonFacturacion[],
  clave: (r: RenglonFacturacion) => string,
  total: number,
): TotalRotulado[] {
  const grupos = new Map<string, number>();
  for (const r of renglones) grupos.set(clave(r), (grupos.get(clave(r)) ?? 0) + r.subtotal);
  return [...grupos]
    .map(([rotulo, t]) => ({ rotulo, total: t, porcentaje: total === 0 ? 0 : (t / total) * 100 }))
    .sort((a, b) => b.total - a.total || a.rotulo.localeCompare(b.rotulo));
}

/** Un renglón por factura, en el orden del reporte: por fecha y número. */
export function facturasDe(renglones: RenglonFacturacion[]): FacturaResumen[] {
  const porId = new Map<number, FacturaResumen>();
  for (const r of renglones) {
    const f = porId.get(r.idFacturacion);
    if (f) f.total += r.subtotal;
    else porId.set(r.idFacturacion, { idFacturacion: r.idFacturacion, fecha: r.fecha, factura: r.factura, ruc: r.ruc, cliente: r.cliente, total: r.subtotal });
  }
  return [...porId.values()].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.factura.localeCompare(b.factura));
}

export interface RespuestaFacturacion {
  desde: string;
  hasta: string;
  resumen: ResumenFacturacion;
  /** Una página de facturas; la tabla completa no viaja al navegador. */
  facturas: FacturaResumen[];
  pagina: number;
  tamano: number;
  /** Facturas que cumplen la búsqueda, no las de esta página. */
  totalFacturas: number;
}

/* ------------------------------------------------------------------ */
/* Ranking                                                             */
/* ------------------------------------------------------------------ */

/** Una fila de sp_consultaRankingVentas, como la grilla de frmReporteRankingVentaCliente. */
export interface FilaRanking {
  nro: number;
  idCliente: number;
  ruc: string;
  cliente: string;
  telefono: string;
  total: number;
}

export interface RespuestaRanking {
  desde: string;
  hasta: string;
  /** «Los primeros N»; 0 = todos, como en el escritorio. */
  cantidad: number;
  filas: FilaRanking[];
  total: number;
}

/** Tope del parámetro `@cantidad numeric(4)` del SP. */
export const RANKING_CANTIDAD_MAXIMA = 9999;

export function validarCantidadRanking(cantidad: unknown): string | null {
  if (typeof cantidad !== 'number' || !Number.isInteger(cantidad) || cantidad < 0 || cantidad > RANKING_CANTIDAD_MAXIMA) {
    return `«Los primeros» tiene que ser un entero entre 0 (todos) y ${RANKING_CANTIDAD_MAXIMA}; se recibió «${String(cantidad)}».`;
  }
  return null;
}
