import { Injectable } from '@nestjs/common';
import * as sql from 'mssql';
import type { ClienteResumen, ItemCarrito, PrecioProducto, Servicio, TipoPrecio, Vendedor } from '@todohierro/shared';
import { SqlService } from '../sql/sql.service';

/**
 * El único lugar del módulo de presupuestos que habla con la base.
 *
 * ESTE ARCHIVO ESCRIBE EN PRODUCCIÓN, pero nunca directo: toda escritura es un
 * `.execute('dbo.sp_..._web')` de los procedimientos del cliente, los mismos que
 * usa (adaptados) el sistema de escritorio. Las tablas no aceptan INSERT, UPDATE
 * ni DELETE de web_ro (db/002-permisos-presupuesto.sql).
 *
 * Reglas que vigilan las guardas:
 * - Todo procedimiento y toda tabla que se nombra acá tiene su GRANT en db/002, y
 *   viceversa (sp-autorizados).
 * - Toda operación sobre el carrito lleva idConfig E idUsuario: el carrito 999 lo
 *   comparten todos los usuarios de la web (presupuesto-siempre-con-usuario).
 * - De sp_precioMercaderia se leen sólo las columnas 2 (precio mayorista) y 7
 *   (precio manual); la columna 1 de la misma fila es el costo (presupuesto-sin-costo).
 */

/** Escapa los comodines de LIKE: buscar "50%" no tiene que traer todo. */
export function patronLike(texto: string, modo: 'contiene' | 'empieza'): string {
  const limpio = texto.replace(/[[%_]/g, (c) => '[' + c + ']');
  return modo === 'contiene' ? '%' + limpio + '%' : limpio + '%';
}

const SQL_CONFIG_WEB = `
  SELECT idSucursal, idDepositoVenta
  FROM dbo.configPC
  WHERE idConfig = @idConfig`;

/* Búsqueda de clientes, con la regla de frmBuscarClienteVenta: un número busca
   por RUC desde el principio; un texto, por nombre en cualquier parte. */
const SQL_CLIENTES_POR_RUC = `
  SELECT TOP 50 idCliente, ruc, soloRuc, nombre, nombreGrupoCliente, email1
  FROM dbo.v_cliente
  WHERE activo = 1 AND soloRuc LIKE @patron
  ORDER BY nombre`;

const SQL_CLIENTES_POR_NOMBRE = `
  SELECT TOP 50 idCliente, ruc, soloRuc, nombre, nombreGrupoCliente, email1
  FROM dbo.v_cliente
  WHERE activo = 1 AND nombre LIKE @patron
  ORDER BY nombre`;

const SQL_CLIENTE = `
  SELECT idCliente, ruc, soloRuc, nombre, nombreGrupoCliente, email1
  FROM dbo.v_cliente
  WHERE idCliente = @idCliente`;

/** El cliente con el que abre la pantalla, como `inicializar()` del escritorio. */
const SQL_CLIENTE_POR_DEFECTO = `
  SELECT TOP 1 idCliente, ruc, soloRuc, nombre, nombreGrupoCliente, email1
  FROM dbo.v_cliente
  WHERE primeroVenta = 1`;

const SQL_VENDEDORES_POR_ID = `
  SELECT idVendedor, nombre, apellido
  FROM dbo.v_vendedor
  WHERE idVendedor = @idVendedor`;

const SQL_VENDEDORES_POR_NOMBRE = `
  SELECT TOP 50 idVendedor, nombre, apellido
  FROM dbo.v_vendedor
  WHERE nombre LIKE @patron
  ORDER BY nombre`;

const SQL_SERVICIOS = `
  SELECT TOP 50 idServicio, nombreServicio, precio
  FROM dbo.servicio
  WHERE activo = 1 AND nombreServicio LIKE @patron
  ORDER BY nombreServicio`;

const SQL_SERVICIO = `
  SELECT idServicio, nombreServicio, precio
  FROM dbo.servicio
  WHERE activo = 1 AND idServicio = @idServicio`;

/* Resolución del idStock, paso por paso como frmStock.facturacionTotal. */
const SQL_HAY_STOCK_EN_DEPOSITO = `
  SELECT COUNT(*) AS cantidad
  FROM dbo.stock
  WHERE idProducto = @idProducto AND idDeposito = @idDeposito`;

const SQL_LOTE_CON_STOCK = `
  SELECT TOP 1 idLote
  FROM dbo.stock
  WHERE idProducto = @idProducto AND idDeposito = @idDeposito AND cantidad <> 0`;

const SQL_LOTE_SIN_STOCK = `
  SELECT TOP 1 idLote
  FROM dbo.stock
  WHERE idProducto = @idProducto AND idDeposito = @idDeposito AND cantidad = 0`;

const SQL_ID_STOCK = `
  SELECT TOP 1 idStock
  FROM dbo.stock
  WHERE idProducto = @idProducto AND idDeposito = @idDeposito AND idLote = @idLote`;

/**
 * Los totales de `sumarTotal()` (frmFacturacionTotal.vb), en una sola consulta.
 * MAX(tipoPrecio) es "mayorista si algún renglón lo es": los servicios lo tienen
 * en NULL y no cuentan.
 */
const SQL_TOTALES = `
  SELECT COUNT(*) AS renglones,
         SUM(subTotal) AS total,
         SUM((precio - precioDescuento) * cantidad) AS descuento,
         SUM(iva5) AS iva5,
         SUM(iva10) AS iva10,
         MAX(tipoPrecio) AS tipoPrecio
  FROM dbo.detFacturacionTmp
  WHERE idConfig = @idConfig AND idUsuario = @idUsuario`;

/**
 * El número del presupuesto recién guardado, como frmBuscarVendedor.vb:196.
 * Decisión del usuario: max() sobre el idConfig de la web. El servicio guarda de
 * a uno por vez (ver Candado), así que dos usuarios de la web no se cruzan.
 */
const SQL_ULTIMO_PRESUPUESTO = `
  SELECT MAX(idPresupuesto) AS idPresupuesto
  FROM dbo.cabPresupuesto
  WHERE idConfig = @idConfig`;

const SQL_PRESUPUESTO_WEB = `
  SELECT idPresupuesto, totalVenta
  FROM dbo.cabPresupuesto
  WHERE idPresupuesto = @idPresupuesto AND idConfig = @idConfig`;

interface FilaCliente {
  idCliente: number;
  ruc: string | null;
  soloRuc: string | null;
  nombre: string | null;
  nombreGrupoCliente: string | null;
  email1: string | null;
}

function aCliente(f: FilaCliente): ClienteResumen {
  return {
    id: f.idCliente,
    // El escritorio muestra y guarda `soloruc` (sin DV); `ruc` queda de respaldo.
    ruc: (f.soloRuc ?? f.ruc ?? '').trim(),
    nombre: (f.nombre ?? '').trim(),
    grupo: (f.nombreGrupoCliente ?? '').trim(),
    email: (f.email1 ?? '').trim(),
  };
}

function aVendedor(f: { idVendedor: number; nombre: string | null; apellido: string | null }): Vendedor {
  return { id: f.idVendedor, nombre: [f.nombre, f.apellido].map((x) => (x ?? '').trim()).filter(Boolean).join(' ') };
}

function aServicio(f: { idServicio: number; nombreServicio: string | null; precio: number | null }): Servicio {
  return { id: f.idServicio, nombre: (f.nombreServicio ?? '').trim(), precio: Number(f.precio ?? 0) };
}

/** Lo que se guarda y lo que hace falta para el PDF. */
export interface DatosGuardado {
  idConfig: number;
  idUsuario: number;
  idSucursal: number;
  idCliente: number;
  idTipoVenta: number;
  ruc: string;
  cliente: string;
  total: number;
  descuento: number;
  idVendedor: number;
  tipoPrecio: TipoPrecio;
}

export interface FilaReporte {
  fecha: string;
  cliente: string;
  sucursal: string;
  ruc: string;
  direccion: string;
  telefono: string;
  formaPago: string;
  vendedor: string;
  codigo: string;
  mercaderia: string;
  precio: number;
  cantidad: number;
  subtotal: number;
  peso: number;
}

export interface TotalesCrudos {
  renglones: number;
  total: number;
  descuento: number;
  iva5: number;
  iva10: number;
  tipoPrecio: number | null;
}

const texto = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());
const numero = (v: unknown): number => Number(v ?? 0) || 0;

@Injectable()
export class PresupuestoRepositorio {
  constructor(private readonly sql: SqlService) {}

  /* ---------------- lecturas de apoyo ---------------- */

  async configuracionWeb(idConfig: number): Promise<{ idSucursal: number; idDepositoVenta: number } | null> {
    const r = await this.sql
      .peticion()
      .input('idConfig', sql.Int, idConfig)
      .query<{ idSucursal: number; idDepositoVenta: number }>(SQL_CONFIG_WEB);
    return r.recordset[0] ?? null;
  }

  async buscarClientes(textoBuscado: string): Promise<ClienteResumen[]> {
    const esNumero = /^\d+$/.test(textoBuscado);
    const r = await this.sql
      .peticion()
      .input('patron', sql.NVarChar(80), patronLike(textoBuscado, esNumero ? 'empieza' : 'contiene'))
      .query<FilaCliente>(esNumero ? SQL_CLIENTES_POR_RUC : SQL_CLIENTES_POR_NOMBRE);
    return r.recordset.map(aCliente);
  }

  async cliente(idCliente: number): Promise<ClienteResumen | null> {
    const r = await this.sql.peticion().input('idCliente', sql.Int, idCliente).query<FilaCliente>(SQL_CLIENTE);
    const fila = r.recordset[0];
    return fila ? aCliente(fila) : null;
  }

  async clientePorDefecto(): Promise<ClienteResumen | null> {
    const r = await this.sql.peticion().query<FilaCliente>(SQL_CLIENTE_POR_DEFECTO);
    const fila = r.recordset[0];
    return fila ? aCliente(fila) : null;
  }

  async buscarVendedores(textoBuscado: string): Promise<Vendedor[]> {
    const peticion = this.sql.peticion();
    const r = /^\d+$/.test(textoBuscado)
      ? await peticion.input('idVendedor', sql.Int, Number(textoBuscado)).query(SQL_VENDEDORES_POR_ID)
      : await peticion.input('patron', sql.NVarChar(80), patronLike(textoBuscado, 'contiene')).query(SQL_VENDEDORES_POR_NOMBRE);
    return r.recordset.map(aVendedor);
  }

  async vendedor(idVendedor: number): Promise<Vendedor | null> {
    const r = await this.sql.peticion().input('idVendedor', sql.Int, idVendedor).query(SQL_VENDEDORES_POR_ID);
    const fila = r.recordset[0];
    return fila ? aVendedor(fila) : null;
  }

  async buscarServicios(textoBuscado: string): Promise<Servicio[]> {
    const r = await this.sql
      .peticion()
      .input('patron', sql.NVarChar(80), patronLike(textoBuscado, 'contiene'))
      .query(SQL_SERVICIOS);
    return r.recordset.map(aServicio);
  }

  async servicio(idServicio: number): Promise<Servicio | null> {
    const r = await this.sql.peticion().input('idServicio', sql.Int, idServicio).query(SQL_SERVICIO);
    const fila = r.recordset[0];
    return fila ? aServicio(fila) : null;
  }

  /**
   * Cómo se precia el producto, como frmStock.facturacionTotal:
   * - columna 7 (`tipo`) = 1 → precio manual (frmStock.vb:144);
   * - columna 2 (`precioMayorista`) → el precio que se propone (frmStock.vb:150).
   * SE LEEN SÓLO ESAS DOS: la columna 1 de la misma fila es el costo, y no sale de
   * esta función. Si el SP devuelve varias filas, vale la última, como
   * `sp_traerValor` del escritorio.
   */
  async precioProducto(idProducto: number): Promise<PrecioProducto> {
    const peticion = this.sql.peticion();
    peticion.arrayRowMode = true;
    const r = await peticion.input('idProducto', sql.Int, idProducto).execute('dbo.sp_precioMercaderia');
    const filas = (r.recordsets as unknown as unknown[][][]).flat();
    const ultima = filas[filas.length - 1];
    return {
      precioManual: ultima !== undefined && Number(ultima[7]) === 1,
      precioSugerido: ultima === undefined ? 0 : Math.round(numero(ultima[2])),
    };
  }

  /**
   * sp_totalLoteStock: columna 0 = cantidad de lotes, columna 2 = stock total en
   * la sucursal. Si el producto no tiene ninguna fila de stock, el SP no devuelve
   * ningún conjunto de resultados: eso es "sin lotes".
   */
  async lotes(idProducto: number, idSucursal: number): Promise<{ cantidad: number; stock: number }> {
    const peticion = this.sql.peticion();
    peticion.arrayRowMode = true;
    const r = await peticion
      .input('idProducto', sql.Int, idProducto)
      .input('idsucursal', sql.Int, idSucursal)
      .execute('dbo.sp_totalLoteStock');
    const filas = (r.recordsets as unknown as unknown[][][]).flat();
    const ultima = filas[filas.length - 1];
    return ultima ? { cantidad: numero(ultima[0]), stock: numero(ultima[2]) } : { cantidad: 0, stock: 0 };
  }

  async hayStockEnDeposito(idProducto: number, idDeposito: number): Promise<boolean> {
    const r = await this.sql
      .peticion()
      .input('idProducto', sql.Int, idProducto)
      .input('idDeposito', sql.Int, idDeposito)
      .query<{ cantidad: number }>(SQL_HAY_STOCK_EN_DEPOSITO);
    return (r.recordset[0]?.cantidad ?? 0) > 0;
  }

  async idLote(idProducto: number, idDeposito: number, conStock: boolean): Promise<number | null> {
    const r = await this.sql
      .peticion()
      .input('idProducto', sql.Int, idProducto)
      .input('idDeposito', sql.Int, idDeposito)
      .query<{ idLote: number }>(conStock ? SQL_LOTE_CON_STOCK : SQL_LOTE_SIN_STOCK);
    return r.recordset[0]?.idLote ?? null;
  }

  async idStock(idProducto: number, idDeposito: number, idLote: number): Promise<number | null> {
    const r = await this.sql
      .peticion()
      .input('idProducto', sql.Int, idProducto)
      .input('idDeposito', sql.Int, idDeposito)
      .input('idLote', sql.Int, idLote)
      .query<{ idStock: number }>(SQL_ID_STOCK);
    return r.recordset[0]?.idStock ?? null;
  }

  /* ---------------- el carrito (idConfig + idUsuario, siempre) ---------------- */

  async agregarProducto(
    idConfig: number,
    idUsuario: number,
    idProducto: number,
    idStock: number,
    cantidad: number,
    tipoPrecio: TipoPrecio,
    /** Sólo para los productos con precio manual; si no, null y el precio lo calcula el SP. */
    precioManual: number | null,
  ): Promise<void> {
    await this.sql
      .peticion()
      .input('idConfig', sql.Int, idConfig)
      .input('idUsuario', sql.Int, idUsuario)
      .input('idItem', sql.Int, idProducto)
      .input('idStock', sql.Int, idStock)
      .input('cantidad', sql.Numeric(10, 4), cantidad)
      .input('tipoPrecio', sql.Numeric(1, 0), tipoPrecio)
      .input('tienePrecio', sql.Bit, precioManual !== null)
      .input('precioNuevo', sql.Money, precioManual ?? 0)
      .execute('dbo.sp_agregarDetFacturacionTmp_producto_web');
  }

  async agregarServicio(
    idConfig: number,
    idUsuario: number,
    idServicio: number,
    cantidad: number,
    precio: number,
  ): Promise<void> {
    await this.sql
      .peticion()
      .input('idConfig', sql.Int, idConfig)
      .input('idUsuario', sql.Int, idUsuario)
      .input('idItem', sql.Int, idServicio)
      .input('cantidad', sql.Numeric(4, 0), cantidad)
      .input('precio', sql.Money, precio)
      .execute('dbo.sp_agregarDetFacturacionTmp_servicio_nuevo_web');
  }

  /**
   * El detalle, por posición: sp_consultaDetFacturacionTmp_web devuelve las
   * columnas sin nombre. Orden: nro, código, descripción, tipo de precio, precio,
   * cantidad, exenta, gravada5, gravada10, idStock, tieneError, idItem.
   */
  async detalle(idConfig: number, idUsuario: number): Promise<ItemCarrito[]> {
    const peticion = this.sql.peticion();
    peticion.arrayRowMode = true;
    const r = await peticion
      .input('idConfig', sql.Int, idConfig)
      .input('idUsuario', sql.Int, idUsuario)
      .execute('dbo.sp_consultaDetFacturacionTmp_web');
    const filas = (r.recordsets as unknown as unknown[][][]).flat();
    return filas
      .map((f) => ({
        nro: numero(f[0]),
        codigo: texto(f[1]),
        descripcion: texto(f[2]),
        nombreTipoPrecio: texto(f[3]),
        precio: numero(f[4]),
        cantidad: numero(f[5]),
        exenta: numero(f[6]),
        gravada5: numero(f[7]),
        gravada10: numero(f[8]),
        tieneError: f[10] === true || f[10] === 1,
        esServicio: texto(f[3]) === 'SERVICIO',
      }))
      .sort((a, b) => a.nro - b.nro);
  }

  async totales(idConfig: number, idUsuario: number): Promise<TotalesCrudos> {
    const r = await this.sql
      .peticion()
      .input('idConfig', sql.Int, idConfig)
      .input('idUsuario', sql.Int, idUsuario)
      .query(SQL_TOTALES);
    const f = r.recordset[0] ?? {};
    return {
      renglones: numero(f.renglones),
      total: numero(f.total),
      descuento: numero(f.descuento),
      iva5: numero(f.iva5),
      iva10: numero(f.iva10),
      tipoPrecio: f.tipoPrecio === null || f.tipoPrecio === undefined ? null : numero(f.tipoPrecio),
    };
  }

  async cambiarTipoPrecio(idConfig: number, idUsuario: number, tipoPrecio: TipoPrecio): Promise<void> {
    await this.sql
      .peticion()
      .input('idConfig', sql.Int, idConfig)
      .input('idUsuario', sql.Int, idUsuario)
      .input('tipoPrecio', sql.Numeric(1, 0), tipoPrecio)
      .execute('dbo.sp_updDetFacturacionTmp_producto_web');
  }

  async quitar(idConfig: number, idUsuario: number, nro: number): Promise<void> {
    await this.sql
      .peticion()
      .input('idConfig', sql.Int, idConfig)
      .input('idUsuario', sql.Int, idUsuario)
      .input('nro', sql.Int, nro)
      .execute('dbo.sp_eliminarDetFacturacionTmp_web');
  }

  async limpiar(idConfig: number, idUsuario: number): Promise<void> {
    await this.sql
      .peticion()
      .input('idConfig', sql.Int, idConfig)
      .input('idUsuario', sql.Int, idUsuario)
      .execute('dbo.sp_limpiarDetFacturacionTmp_web');
  }

  /* ---------------- guardado y reporte ---------------- */

  async guardar(d: DatosGuardado): Promise<void> {
    await this.sql
      .peticion()
      .input('idConfig', sql.Int, d.idConfig)
      .input('idUsuario', sql.Int, d.idUsuario)
      .input('idSucursal', sql.Int, d.idSucursal)
      .input('idCliente', sql.Int, d.idCliente)
      .input('idTipoVenta', sql.Int, d.idTipoVenta)
      .input('ruc', sql.VarChar(15), d.ruc)
      .input('cliente', sql.VarChar(60), d.cliente)
      .input('totalVenta', sql.Money, d.total)
      .input('totalDescuento', sql.Money, d.descuento)
      .input('idUsuarioAlta', sql.Int, d.idUsuario)
      .input('idVendedor', sql.Int, d.idVendedor)
      .input('tipoPrecio', sql.Numeric(1, 0), d.tipoPrecio)
      .execute('dbo.sp_guardarPresupuesto_nuevo_web');
  }

  async ultimoPresupuesto(idConfig: number): Promise<number | null> {
    const r = await this.sql
      .peticion()
      .input('idConfig', sql.Int, idConfig)
      .query<{ idPresupuesto: number | null }>(SQL_ULTIMO_PRESUPUESTO);
    return r.recordset[0]?.idPresupuesto ?? null;
  }

  /** El presupuesto, sólo si lo hizo la web: la web no imprime los del escritorio. */
  async presupuestoWeb(idPresupuesto: number, idConfig: number): Promise<{ total: number } | null> {
    const r = await this.sql
      .peticion()
      .input('idPresupuesto', sql.Int, idPresupuesto)
      .input('idConfig', sql.Int, idConfig)
      .query<{ totalVenta: number }>(SQL_PRESUPUESTO_WEB);
    const fila = r.recordset[0];
    return fila ? { total: numero(fila.totalVenta) } : null;
  }

  /** Los datos de rpt_presupuestoNuevo, del mismo SP que usa el escritorio. */
  async reporte(idPresupuesto: number): Promise<FilaReporte[]> {
    const r = await this.sql
      .peticion()
      .input('idPresupuesto', sql.Int, idPresupuesto)
      .execute('dbo.sp_reporteFacturaPresupuestoNuevo');
    const filas = (r.recordsets as unknown as Array<Array<Record<string, unknown>>>).flat();
    return filas.map((f) => ({
      fecha: texto(f['fecha']),
      cliente: texto(f['cliente']),
      sucursal: texto(f['sucursal']),
      ruc: texto(f['ruc']),
      direccion: texto(f['direccion']),
      telefono: texto(f['telefono']),
      formaPago: texto(f['formapago']),
      vendedor: texto(f['vendedor']),
      codigo: texto(f['codigo']),
      mercaderia: texto(f['mercaderia']),
      precio: numero(f['precio']),
      cantidad: numero(f['cantidad']),
      subtotal: numero(f['subtotal']),
      peso: numero(f['peso']),
    }));
  }
}
