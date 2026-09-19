import { Injectable } from '@nestjs/common';
import type { Articulo } from '@todohierro/shared';
import { SqlService } from '../sql/sql.service';

/**
 * El único lugar del API que contiene SQL.
 *
 * Está concentrado acá a propósito: las guardas `columnas-del-api-existen` y
 * `sql-compatibilidad` leen estas constantes y las verifican contra el esquema
 * real y contra lo que SQL Server 2008 R2 entiende. Si el SQL se dispersa por
 * los servicios, esas guardas dejan de poder mirarlo.
 *
 * Restricciones del motor de producción (2008 R2): no existe OFFSET ... FETCH,
 * ni STRING_AGG, ni TRY_CONVERT, ni IIF.
 */

/**
 * Catálogo completo. Se trae entero una vez cada dos minutos y las búsquedas se
 * resuelven en memoria: la vista `web.vw_articulos` se apoya en
 * `dbo.v_stockPrecio`, que llama una función escalar por fila. Medido el
 * 17/09/2026: recorrerla cuesta 321 ms de servidor, y cada búsqueda pagaba entre
 * 384 y 634 ms. En memoria, 1 ms.
 *
 * Las columnas de costo (`costo`, `costoAnterior`, `precio2`) NO se traen: son el
 * dato más sensible de la base del cliente y ninguna pantalla las necesita.
 */
export const SQL_CATALOGO_COMPLETO = `
  SELECT id,
         codigo,
         codigo_barra,
         nombre,
         tipo_precio,
         precio,
         stock,
         peso,
         actualizado
  FROM web.vw_articulos
`;

/** Una fila cruda de la vista, con los nombres del esquema heredado. */
interface FilaArticulo {
  id: number;
  codigo: string | null;
  codigo_barra: string | null;
  nombre: string | null;
  tipo_precio: number;
  precio: number | null;
  stock: number | null;
  peso: number | null;
  actualizado: Date | null;
}

/**
 * Traducción del esquema heredado al contrato del API.
 * Ocurre una sola vez, acá, para que snake_case no llegue hasta la pantalla.
 */
function aArticulo(fila: FilaArticulo): Articulo {
  return {
    id: fila.id,
    codigo: (fila.codigo ?? '').trim(),
    codigoBarra: (fila.codigo_barra ?? '').trim(),
    nombre: (fila.nombre ?? '').trim(),
    tipoPrecio: fila.tipo_precio,
    precio: Number(fila.precio ?? 0),
    stock: Number(fila.stock ?? 0),
    peso: Number(fila.peso ?? 0),
    actualizado: (fila.actualizado ?? new Date(0)).toISOString(),
  };
}

@Injectable()
export class CatalogoRepositorio {
  constructor(private readonly sql: SqlService) {}

  async traerCatalogoCompleto(): Promise<Articulo[]> {
    const filas = await this.sql.consultar<FilaArticulo>(SQL_CATALOGO_COMPLETO);
    return filas.map(aArticulo);
  }
}
