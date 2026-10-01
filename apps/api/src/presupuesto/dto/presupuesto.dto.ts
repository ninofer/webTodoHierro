import { IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { LIMITES, TIPO_PRECIO, type TipoPrecio } from '@todohierro/shared';

/*
 * Lo que la pantalla puede mandar al módulo de presupuestos.
 *
 * NINGUNO lleva idUsuario ni idConfig. El usuario sale de la sesión y el idConfig
 * de la configuración del API: si vinieran del navegador, cualquiera podría
 * cargar ítems en el carrito de otro o guardar a nombre de otro. El ValidationPipe
 * global está en `forbidNonWhitelisted`, así que mandarlos igual da 400. La guarda
 * presupuesto-identidad lo comprueba.
 *
 * La cantidad sólo se exige numérica acá: el rango y los decimales los decide
 * `validarCantidad` de shared, que es la misma regla que usa la pantalla.
 */

const TIPOS_PRECIO: TipoPrecio[] = [TIPO_PRECIO.MINORISTA, TIPO_PRECIO.MAYORISTA];

export class BuscarDto {
  @IsOptional()
  @IsString()
  @MaxLength(LIMITES.LARGO_MAXIMO_BUSQUEDA)
  q?: string;
}

export class AgregarProductoDto {
  @IsInt()
  @Min(1)
  idProducto!: number;

  @IsNumber()
  cantidad!: number;

  @IsIn(TIPOS_PRECIO)
  tipoPrecio!: TipoPrecio;

  /**
   * Sólo para productos con precio manual. El rango lo decide validarPrecioManual
   * (shared); si el producto no es de precio manual, el servicio lo rechaza.
   */
  @IsOptional()
  @IsNumber()
  precio?: number;
}

export class AgregarServicioDto {
  @IsInt()
  @Min(1)
  idServicio!: number;

  @IsNumber()
  cantidad!: number;

  /**
   * El precio escrito en la pantalla. Opcional: si no viene, va el de la tabla
   * `servicio`. El rango lo decide validarPrecioManual (shared).
   */
  @IsOptional()
  @IsNumber()
  precio?: number;
}

export class TipoPrecioDto {
  @IsIn(TIPOS_PRECIO)
  tipoPrecio!: TipoPrecio;
}

export class GuardarPresupuestoDto {
  @IsInt()
  @Min(1)
  idCliente!: number;

  @IsInt()
  @Min(1)
  idVendedor!: number;
}
