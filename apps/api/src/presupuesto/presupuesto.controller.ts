import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import type {
  Carrito,
  ClienteResumen,
  PrecioProducto,
  PresupuestoGuardado,
  RespuestaCarrito,
  Servicio,
  UsuarioSesion,
  Vendedor,
} from '@todohierro/shared';
import { UsuarioActual } from '../auth/usuario-actual.decorador';
import {
  AgregarProductoDto,
  AgregarServicioDto,
  BuscarDto,
  GuardarPresupuestoDto,
  TipoPrecioDto,
} from './dto/presupuesto.dto';
import { PresupuestoService } from './presupuesto.service';

/** Todo requiere sesión: el guard JWT es global. */
@Controller('presupuesto')
export class PresupuestoController {
  constructor(private readonly presupuesto: PresupuestoService) {}

  @Get('clientes/por-defecto')
  clientePorDefecto(@UsuarioActual() usuario: UsuarioSesion): Promise<ClienteResumen> {
    return this.presupuesto.clientePorDefecto(usuario);
  }

  @Get('clientes')
  clientes(@UsuarioActual() usuario: UsuarioSesion, @Query() consulta: BuscarDto): Promise<ClienteResumen[]> {
    return this.presupuesto.buscarClientes(usuario, consulta.q ?? '');
  }

  @Get('vendedores')
  vendedores(@UsuarioActual() usuario: UsuarioSesion, @Query() consulta: BuscarDto): Promise<Vendedor[]> {
    return this.presupuesto.buscarVendedores(usuario, consulta.q ?? '');
  }

  @Get('servicios')
  servicios(@UsuarioActual() usuario: UsuarioSesion, @Query() consulta: BuscarDto): Promise<Servicio[]> {
    return this.presupuesto.buscarServicios(usuario, consulta.q ?? '');
  }

  @Get('productos/:id/precio')
  precioProducto(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<PrecioProducto> {
    return this.presupuesto.precioProducto(usuario, id);
  }

  @Get('carrito')
  carrito(@UsuarioActual() usuario: UsuarioSesion): Promise<Carrito> {
    return this.presupuesto.carrito(usuario);
  }

  @Post('carrito/productos')
  agregarProducto(
    @UsuarioActual() usuario: UsuarioSesion,
    @Body() datos: AgregarProductoDto,
  ): Promise<RespuestaCarrito> {
    return this.presupuesto.agregarProducto(usuario, datos.idProducto, datos.cantidad, datos.tipoPrecio, datos.precio);
  }

  @Post('carrito/servicios')
  agregarServicio(
    @UsuarioActual() usuario: UsuarioSesion,
    @Body() datos: AgregarServicioDto,
  ): Promise<RespuestaCarrito> {
    return this.presupuesto.agregarServicio(usuario, datos.idServicio, datos.cantidad, datos.precio);
  }

  @Put('carrito/tipo-precio')
  tipoPrecio(@UsuarioActual() usuario: UsuarioSesion, @Body() datos: TipoPrecioDto): Promise<Carrito> {
    return this.presupuesto.cambiarTipoPrecio(usuario, datos.tipoPrecio);
  }

  @Delete('carrito/:nro')
  quitar(@UsuarioActual() usuario: UsuarioSesion, @Param('nro', ParseIntPipe) nro: number): Promise<Carrito> {
    return this.presupuesto.quitar(usuario, nro);
  }

  @Delete('carrito')
  limpiar(@UsuarioActual() usuario: UsuarioSesion): Promise<Carrito> {
    return this.presupuesto.limpiar(usuario);
  }

  @Post()
  guardar(
    @UsuarioActual() usuario: UsuarioSesion,
    @Body() datos: GuardarPresupuestoDto,
  ): Promise<PresupuestoGuardado> {
    return this.presupuesto.guardar(usuario, datos.idCliente, datos.idVendedor);
  }

  @Get(':id/pdf')
  async pdf(
    @UsuarioActual() usuario: UsuarioSesion,
    @Param('id', ParseIntPipe) id: number,
    @Res() respuesta: Response,
  ): Promise<void> {
    const archivo = await this.presupuesto.pdf(usuario, id);
    respuesta
      .status(200)
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="presupuesto-${id}.pdf"`,
        'Cache-Control': 'no-store',
      })
      .send(archivo);
  }
}
