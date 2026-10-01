import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  TIPO_PRECIO,
  formatearStock,
  hayFaltanteDeStock,
  normalizarBusqueda,
  validarCantidad,
  validarPrecioManual,
  type Carrito,
  type ClienteResumen,
  type PrecioProducto,
  type PresupuestoGuardado,
  type RespuestaCarrito,
  type Servicio,
  type TipoPrecio,
  type UsuarioSesion,
  type Vendedor,
} from '@todohierro/shared';
import { HabilitacionService } from '../auth/habilitacion.service';
import { CatalogoService } from '../catalogo/catalogo.service';
import { Candado } from './candado';
import { PresupuestoRepositorio } from './presupuesto.repositorio';
import { armarPdfPresupuesto } from './presupuesto-pdf';

/** La fila de configPC que usa la web. La creó el usuario en la base. */
export const ID_CONFIG_WEB_POR_DEFECTO = 999;

/** Contado. El presupuesto web no ofrece crédito (fuera de la v1). */
const ID_TIPO_VENTA_CONTADO = 1;

/**
 * El presupuesto, paso por paso como el escritorio:
 * frmFacturacionTotal → frmStock / frmBuscarServicio → frmBuscarVendedor.
 *
 * Cada operación empieza comprobando que el usuario siga habilitado en
 * `usuarioWeb`: el JWT dura horas, la habilitación la decide el sistema.
 */
@Injectable()
export class PresupuestoService {
  readonly idConfig: number;
  private readonly candado = new Candado();

  constructor(
    private readonly repositorio: PresupuestoRepositorio,
    private readonly habilitacion: HabilitacionService,
    private readonly catalogo: CatalogoService,
    config: ConfigService,
  ) {
    const crudo = config.get<string>('ID_CONFIG_WEB');
    this.idConfig = crudo === undefined || crudo.trim() === '' ? ID_CONFIG_WEB_POR_DEFECTO : Number(crudo);
    if (!Number.isInteger(this.idConfig) || this.idConfig <= 0) {
      throw new Error(
        `ID_CONFIG_WEB vale "${crudo}" y tiene que ser el idConfig de la fila WEB de configPC ` +
          `(${ID_CONFIG_WEB_POR_DEFECTO}). Corregilo en el .env o borrá la línea.`,
      );
    }
  }

  /* ---------------- búsquedas ---------------- */

  async clientePorDefecto(usuario: UsuarioSesion): Promise<ClienteResumen> {
    await this.habilitacion.exigir(usuario.idUsuario);
    const cliente = await this.repositorio.clientePorDefecto();
    if (!cliente) {
      throw new NotFoundException(
        'No hay un cliente marcado como "primero en venta" en el sistema. Buscá el cliente con el botón Cliente.',
      );
    }
    return cliente;
  }

  async buscarClientes(usuario: UsuarioSesion, q: string): Promise<ClienteResumen[]> {
    await this.habilitacion.exigir(usuario.idUsuario);
    const texto = normalizarBusqueda(q);
    return texto === '' ? [] : this.repositorio.buscarClientes(texto);
  }

  async buscarVendedores(usuario: UsuarioSesion, q: string): Promise<Vendedor[]> {
    await this.habilitacion.exigir(usuario.idUsuario);
    return this.repositorio.buscarVendedores(normalizarBusqueda(q));
  }

  async buscarServicios(usuario: UsuarioSesion, q: string): Promise<Servicio[]> {
    await this.habilitacion.exigir(usuario.idUsuario);
    return this.repositorio.buscarServicios(normalizarBusqueda(q));
  }

  /* ---------------- carrito ---------------- */

  async carrito(usuario: UsuarioSesion): Promise<Carrito> {
    await this.habilitacion.exigir(usuario.idUsuario);
    return this.leerCarrito(usuario.idUsuario);
  }

  /**
   * Agrega un producto, resolviendo el idStock como frmStock.facturacionTotal
   * (frmStock.vb:86-260). Los dos casos en que el escritorio abre frmLote (varios
   * lotes, o el único lote en otro depósito) se rechazan: allí la rama de
   * facturación está comentada y el escritorio tampoco lo resuelve.
   *
   * Precio manual, como frmItemFacturacionTotal: si sp_precioMercaderia lo marca,
   * el precio lo escribe el usuario (la pantalla le propone el mayorista) y viaja
   * en `precio`. El servidor lo exige para esos productos y lo rechaza para los
   * demás: el precio de un producto normal lo calcula el SP, nunca el navegador.
   */
  async agregarProducto(
    usuario: UsuarioSesion,
    idProducto: number,
    cantidad: number,
    tipoPrecio: TipoPrecio,
    precio?: number,
  ): Promise<RespuestaCarrito> {
    await this.habilitacion.exigir(usuario.idUsuario);
    this.exigirCantidad(cantidad, 'producto');

    const articulo = this.catalogo.porId(idProducto);
    const nombre = articulo ? `"${articulo.nombre}" (código ${articulo.codigo})` : `con id ${idProducto}`;

    const config = await this.configuracion();

    const { precioManual } = await this.repositorio.precioProducto(idProducto);
    if (precioManual) {
      if (precio === undefined) {
        throw new BadRequestException(`El artículo ${nombre} tiene precio manual: escribí el precio antes de agregarlo.`);
      }
      const error = validarPrecioManual(precio);
      if (error) throw new BadRequestException(error);
    } else if (precio !== undefined) {
      throw new BadRequestException(
        `El artículo ${nombre} no tiene precio manual: el precio lo calcula el sistema. Volvé a agregarlo sin precio.`,
      );
    }

    const lotes = await this.repositorio.lotes(idProducto, config.idSucursal);
    let idStock = 0;

    if (lotes.cantidad > 1) {
      throw new BadRequestException(
        `El artículo ${nombre} tiene ${lotes.cantidad} lotes: elegí el lote desde el sistema de escritorio.`,
      );
    }
    if (lotes.cantidad === 1) {
      if (!(await this.repositorio.hayStockEnDeposito(idProducto, config.idDepositoVenta))) {
        throw new BadRequestException(
          `El artículo ${nombre} tiene su lote en otro depósito, no en el de venta ` +
            `(${config.idDepositoVenta}): presupuestalo desde el sistema de escritorio.`,
        );
      }
      const idLote = await this.repositorio.idLote(idProducto, config.idDepositoVenta, lotes.stock !== 0);
      idStock = idLote === null ? 0 : ((await this.repositorio.idStock(idProducto, config.idDepositoVenta, idLote)) ?? 0);
    }

    await this.repositorio.agregarProducto(
      this.idConfig,
      usuario.idUsuario,
      idProducto,
      idStock,
      cantidad,
      tipoPrecio,
      precioManual ? (precio as number) : null,
    );

    const respuesta: RespuestaCarrito = { carrito: await this.leerCarrito(usuario.idUsuario) };
    if (hayFaltanteDeStock(cantidad, lotes.stock)) {
      respuesta.aviso =
        `Se pidieron ${formatearStock(cantidad)} de ${nombre} y hay ${formatearStock(lotes.stock)} en stock. ` +
        'El presupuesto se cargó igual.';
    }
    return respuesta;
  }

  /** Para la pantalla: si hay que pedir el precio, y cuál proponer. */
  async precioProducto(usuario: UsuarioSesion, idProducto: number): Promise<PrecioProducto> {
    await this.habilitacion.exigir(usuario.idUsuario);
    return this.repositorio.precioProducto(idProducto);
  }

  /**
   * Agrega un servicio. El precio es editable siempre, como frmBuscarServicio:
   * la pantalla propone el de la tabla `servicio` y manda lo que quedó escrito.
   * Si no viene precio, va el de la tabla.
   */
  async agregarServicio(
    usuario: UsuarioSesion,
    idServicio: number,
    cantidad: number,
    precio?: number,
  ): Promise<RespuestaCarrito> {
    await this.habilitacion.exigir(usuario.idUsuario);
    this.exigirCantidad(cantidad, 'servicio');
    if (precio !== undefined) {
      const error = validarPrecioManual(precio);
      if (error) throw new BadRequestException(error);
    }

    const servicio = await this.repositorio.servicio(idServicio);
    if (!servicio) {
      throw new NotFoundException(`No existe un servicio activo con id ${idServicio}. Buscalo de nuevo en la lista.`);
    }
    await this.repositorio.agregarServicio(
      this.idConfig,
      usuario.idUsuario,
      idServicio,
      cantidad,
      precio ?? servicio.precio,
    );
    return { carrito: await this.leerCarrito(usuario.idUsuario) };
  }

  async cambiarTipoPrecio(usuario: UsuarioSesion, tipoPrecio: TipoPrecio): Promise<Carrito> {
    await this.habilitacion.exigir(usuario.idUsuario);
    await this.repositorio.cambiarTipoPrecio(this.idConfig, usuario.idUsuario, tipoPrecio);
    return this.leerCarrito(usuario.idUsuario);
  }

  async quitar(usuario: UsuarioSesion, nro: number): Promise<Carrito> {
    await this.habilitacion.exigir(usuario.idUsuario);
    await this.repositorio.quitar(this.idConfig, usuario.idUsuario, nro);
    return this.leerCarrito(usuario.idUsuario);
  }

  async limpiar(usuario: UsuarioSesion): Promise<Carrito> {
    await this.habilitacion.exigir(usuario.idUsuario);
    await this.repositorio.limpiar(this.idConfig, usuario.idUsuario);
    return this.leerCarrito(usuario.idUsuario);
  }

  /* ---------------- guardar e imprimir ---------------- */

  /** Como frmBuscarVendedor.guardarPresupuesto, de a uno por vez (ver Candado). */
  guardar(usuario: UsuarioSesion, idCliente: number, idVendedor: number): Promise<PresupuestoGuardado> {
    return this.candado.ejecutar(async () => {
      await this.habilitacion.exigir(usuario.idUsuario);

      const totales = await this.repositorio.totales(this.idConfig, usuario.idUsuario);
      if (totales.renglones === 0) {
        throw new BadRequestException('El presupuesto no tiene ítems: agregá al menos un producto o un servicio.');
      }

      const cliente = await this.repositorio.cliente(idCliente);
      if (!cliente) {
        throw new NotFoundException(`No existe el cliente con id ${idCliente}. Elegilo de nuevo con el botón Cliente.`);
      }
      const vendedor = await this.repositorio.vendedor(idVendedor);
      if (!vendedor) {
        throw new NotFoundException(`No existe el vendedor con id ${idVendedor}. Elegilo de nuevo de la lista.`);
      }

      const config = await this.configuracion();
      await this.repositorio.guardar({
        idConfig: this.idConfig,
        idUsuario: usuario.idUsuario,
        idSucursal: config.idSucursal,
        idCliente,
        idTipoVenta: ID_TIPO_VENTA_CONTADO,
        // Los largos son los de los parámetros del SP: varchar(15) y varchar(60).
        ruc: cliente.ruc.slice(0, 15),
        cliente: cliente.nombre.slice(0, 60),
        total: totales.total,
        descuento: totales.descuento,
        idVendedor,
        tipoPrecio: totales.tipoPrecio === TIPO_PRECIO.MAYORISTA ? TIPO_PRECIO.MAYORISTA : TIPO_PRECIO.MINORISTA,
      });

      const idPresupuesto = await this.repositorio.ultimoPresupuesto(this.idConfig);
      if (idPresupuesto === null) {
        throw new ServiceUnavailableException(
          'El presupuesto se envió a la base pero no se pudo leer su número. Buscalo en el escritorio antes de reintentar.',
        );
      }
      return { idPresupuesto };
    });
  }

  async pdf(usuario: UsuarioSesion, idPresupuesto: number): Promise<Buffer> {
    await this.habilitacion.exigir(usuario.idUsuario);
    const cabecera = await this.repositorio.presupuestoWeb(idPresupuesto, this.idConfig);
    if (!cabecera) {
      throw new NotFoundException(
        `No existe un presupuesto web número ${idPresupuesto}. Los presupuestos del escritorio se imprimen desde el escritorio.`,
      );
    }
    const filas = await this.repositorio.reporte(idPresupuesto);
    return armarPdfPresupuesto(idPresupuesto, cabecera.total, filas);
  }

  /* ---------------- apoyo ---------------- */

  private async leerCarrito(idUsuario: number): Promise<Carrito> {
    const [items, t] = await Promise.all([
      this.repositorio.detalle(this.idConfig, idUsuario),
      this.repositorio.totales(this.idConfig, idUsuario),
    ]);
    return {
      items,
      totales: {
        total: t.total,
        descuento: t.descuento,
        iva5: t.iva5,
        iva10: t.iva10,
        totalIva: t.iva5 + t.iva10,
        tipoPrecio: t.tipoPrecio === TIPO_PRECIO.MAYORISTA ? TIPO_PRECIO.MAYORISTA : TIPO_PRECIO.MINORISTA,
      },
    };
  }

  private async configuracion(): Promise<{ idSucursal: number; idDepositoVenta: number }> {
    const config = await this.repositorio.configuracionWeb(this.idConfig);
    if (!config) {
      throw new ServiceUnavailableException(
        `No existe la fila ${this.idConfig} en configPC. Creala en el sistema o corregí ID_CONFIG_WEB en el .env.`,
      );
    }
    return config;
  }

  private exigirCantidad(cantidad: number, tipo: 'producto' | 'servicio'): void {
    const error = validarCantidad(cantidad, tipo);
    if (error) throw new BadRequestException(error);
  }
}
