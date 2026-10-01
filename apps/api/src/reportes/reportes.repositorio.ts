import { Injectable } from '@nestjs/common';
import * as sql from 'mssql';
import type { FilaRanking, RenglonFacturacion } from '@todohierro/shared';
import { SqlService } from '../sql/sql.service';

/**
 * El único lugar de los reportes que habla con la base. Sólo EXECUTE de los dos
 * SP del cliente (db/003-permisos-reportes.sql); ninguno escribe.
 *
 * Ninguno devuelve costo: se leyó su definición el 30/09/2026. Si algún día se
 * les agrega, la guarda sin-costos-expuestos no lo ve (el SQL no está acá), así
 * que lo que protege es leer por posición sólo las columnas que se nombran abajo.
 */

const texto = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());
const numero = (v: unknown): number => Number(v ?? 0) || 0;

/** 'dd/mm/aaaa' (CONVERT(varchar, fecha, 103) del SP) → 'aaaa-mm-dd'. */
export function isoDesdeDdMmAaaa(v: unknown): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto(v));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

/** Lo que el SP pone como grupo en los renglones de servicios. */
const GRUPO_SERVICIOS = 'SERVICIOS';

@Injectable()
export class ReportesRepositorio {
  constructor(private readonly sql: SqlService) {}

  /**
   * sp_reporteFacturacionTotalDetalle, por posición: el SP repite la columna
   * idFacturacion (la 6 y la 10), y con nombres la segunda pisaría a la primera.
   * Orden: 0 titulo, 1 desde, 2 hasta, 3 ruc, 4 cliente, 5 fecha (dd/mm/aaaa),
   * 6 idFacturacion, 7 factura, 8 ff, 9 idDet, 10 idFacturacion, 11 codigo,
   * 12 nombreProducto, 13 idGrupoProducto, 14 nombreGrupo, 15 precioDescuento,
   * 16 cantidad, 17 subTotal.
   */
  async facturacion(desde: Date, hasta: Date): Promise<RenglonFacturacion[]> {
    const peticion = this.sql.peticion();
    peticion.arrayRowMode = true;
    const r = await peticion
      .input('desde', sql.Date, desde)
      .input('hasta', sql.Date, hasta)
      .execute('dbo.sp_reporteFacturacionTotalDetalle');
    const filas = (r.recordsets as unknown as unknown[][][]).flat();
    return filas.map((f) => {
      const esServicio = texto(f[14]).toUpperCase() === GRUPO_SERVICIOS;
      return {
        idFacturacion: numero(f[6]),
        fecha: isoDesdeDdMmAaaa(f[5]),
        factura: texto(f[7]),
        ruc: texto(f[3]),
        cliente: texto(f[4]),
        codigo: texto(f[11]),
        descripcion: texto(f[12]),
        grupo: texto(f[14]),
        esServicio,
        precio: numero(f[15]),
        // En los servicios el SP devuelve un 3 fijo: no es la cantidad.
        cantidad: esServicio ? null : numero(f[16]),
        subtotal: numero(f[17]),
      };
    });
  }

  async ranking(desde: Date, hasta: Date, cantidad: number): Promise<FilaRanking[]> {
    const r = await this.sql
      .peticion()
      .input('desde', sql.Date, desde)
      .input('hasta', sql.Date, hasta)
      .input('cantidad', sql.Numeric(4, 0), cantidad)
      .execute('dbo.sp_consultaRankingVentas');
    const filas = (r.recordsets as unknown as Array<Array<Record<string, unknown>>>).flat();
    return filas.map((f) => ({
      nro: numero(f['nro']),
      idCliente: numero(f['idCliente']),
      ruc: texto(f['ruc']),
      cliente: texto(f['cliente']),
      telefono: texto(f['telefono']),
      total: numero(f['total']),
    }));
  }
}
