import { BadRequestException, Injectable } from '@nestjs/common';
import {
  facturasDe,
  fechaLocal,
  leerFechaIso,
  normalizarBusqueda,
  normalizarPagina,
  resumirFacturacion,
  validarCantidadRanking,
  validarRangoFechas,
  type FacturaResumen,
  type RenglonFacturacion,
  type RespuestaFacturacion,
  type RespuestaRanking,
  type ResumenFacturacion,
  type UsuarioSesion,
} from '@todohierro/shared';
import { HabilitacionService } from '../auth/habilitacion.service';
import { aCsv } from './csv';
import { pdfFacturacion, pdfRanking } from './reportes-pdf';
import { ReportesRepositorio } from './reportes.repositorio';

/** Facturas por página en la pantalla. */
export const FACTURAS_POR_PAGINA = 50;

/**
 * Cuánto se reusa el resultado del SP de facturación para el mismo rango.
 * Pasar de página, buscar un cliente o bajar el CSV pide el mismo período varias
 * veces seguidas; sin esto, cada clic recorre otra vez un mes de renglones en la
 * base que está facturando.
 */
export const FACTURACION_CACHE_MS = 60000;
const FACTURACION_CACHE_MAX = 5;

interface Calculo {
  renglones: RenglonFacturacion[];
  resumen: ResumenFacturacion;
  facturas: FacturaResumen[];
}

@Injectable()
export class ReportesService {
  private readonly cache = new Map<string, { hasta: number; valor: Promise<Calculo> }>();

  constructor(
    private readonly repositorio: ReportesRepositorio,
    private readonly habilitacion: HabilitacionService,
  ) {}

  /* ---------------- facturación total ---------------- */

  async facturacion(
    usuario: UsuarioSesion,
    desde: string,
    hasta: string,
    pagina: number,
    busqueda: string,
    ahora = Date.now(),
  ): Promise<RespuestaFacturacion> {
    const c = await this.calcular(usuario, desde, hasta, ahora);
    const aguja = normalizarBusqueda(busqueda).toUpperCase();
    const filtradas =
      aguja === ''
        ? c.facturas
        : c.facturas.filter((f) => `${f.cliente} ${f.ruc} ${f.factura}`.toUpperCase().includes(aguja));
    const p = normalizarPagina(pagina);
    return {
      desde,
      hasta,
      resumen: c.resumen,
      facturas: filtradas.slice((p - 1) * FACTURAS_POR_PAGINA, p * FACTURAS_POR_PAGINA),
      pagina: p,
      tamano: FACTURAS_POR_PAGINA,
      totalFacturas: filtradas.length,
    };
  }

  /** El CSV detallado, un renglón por producto o servicio, como el reporte detallado del escritorio. */
  async facturacionCsv(usuario: UsuarioSesion, desde: string, hasta: string): Promise<Buffer> {
    const c = await this.calcular(usuario, desde, hasta);
    return aCsv(
      ['Fecha', 'Factura', 'Cliente', 'RUC', 'Código', 'Descripción', 'Grupo', 'Precio', 'Cantidad', 'SubTotal'],
      c.renglones.map((r) => [
        fechaLocal(r.fecha),
        r.factura,
        r.cliente,
        r.ruc,
        r.codigo,
        r.descripcion,
        r.grupo,
        r.precio,
        r.cantidad,
        r.subtotal,
      ]),
    );
  }

  async facturacionPdf(usuario: UsuarioSesion, desde: string, hasta: string): Promise<Buffer> {
    const c = await this.calcular(usuario, desde, hasta);
    return pdfFacturacion(desde, hasta, c.resumen, c.facturas);
  }

  /* ---------------- ranking ---------------- */

  async ranking(usuario: UsuarioSesion, desde: string, hasta: string, cantidad: number): Promise<RespuestaRanking> {
    await this.habilitacion.exigir(usuario.idUsuario);
    const [d, h] = this.rango(desde, hasta);
    const error = validarCantidadRanking(cantidad);
    if (error) throw new BadRequestException(error);
    const filas = await this.repositorio.ranking(d, h, cantidad);
    return { desde, hasta, cantidad, filas, total: filas.reduce((s, f) => s + f.total, 0) };
  }

  async rankingCsv(usuario: UsuarioSesion, desde: string, hasta: string, cantidad: number): Promise<Buffer> {
    const r = await this.ranking(usuario, desde, hasta, cantidad);
    // Las mismas columnas y el mismo orden que la grilla del escritorio.
    return aCsv(
      ['Nro.', 'Id Cliente', 'RUC', 'Cliente', 'Telefono', 'Total'],
      r.filas.map((f) => [f.nro, f.idCliente, f.ruc, f.cliente, f.telefono, f.total]),
    );
  }

  async rankingPdf(usuario: UsuarioSesion, desde: string, hasta: string, cantidad: number): Promise<Buffer> {
    return pdfRanking(await this.ranking(usuario, desde, hasta, cantidad));
  }

  /* ---------------- apoyo ---------------- */

  private rango(desde: string, hasta: string): [Date, Date] {
    const error = validarRangoFechas(desde, hasta);
    if (error) throw new BadRequestException(error);
    return [leerFechaIso(desde) as Date, leerFechaIso(hasta) as Date];
  }

  private async calcular(usuario: UsuarioSesion, desde: string, hasta: string, ahora = Date.now()): Promise<Calculo> {
    await this.habilitacion.exigir(usuario.idUsuario);
    const [d, h] = this.rango(desde, hasta);
    const clave = `${desde}|${hasta}`;

    const guardado = this.cache.get(clave);
    if (guardado && guardado.hasta > ahora) return guardado.valor;

    // Se guarda la promesa, no el resultado: dos pedidos del mismo rango que
    // llegan juntos (la pantalla y el CSV) esperan la misma consulta.
    const valor = this.repositorio.facturacion(d, h).then((renglones) => ({
      renglones,
      resumen: resumirFacturacion(renglones, desde, hasta),
      facturas: facturasDe(renglones),
    }));
    this.cache.set(clave, { hasta: ahora + FACTURACION_CACHE_MS, valor });
    valor.catch(() => this.cache.delete(clave));

    // La caché es chica: el período del mes y alguno más. Sale el más viejo.
    for (const k of this.cache.keys()) {
      if (this.cache.size <= FACTURACION_CACHE_MAX) break;
      if (k !== clave) this.cache.delete(k);
    }
    return valor;
  }
}
