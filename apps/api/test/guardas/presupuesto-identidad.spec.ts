import { BadRequestException, ValidationPipe, type ArgumentMetadata } from '@nestjs/common';
import { archivosCon, leer, sinComentariosTs } from '../ayudas/archivos';
import {
  AgregarProductoDto,
  AgregarServicioDto,
  GuardarPresupuestoDto,
  TipoPrecioDto,
} from '../../src/presupuesto/dto/presupuesto.dto';

/**
 * El idUsuario y el idConfig nunca vienen del navegador.
 *
 * Si vinieran, cualquiera con sesión podría cargar ítems en el carrito de otro,
 * o guardar un presupuesto a nombre de otro. Salen de la sesión (UsuarioActual)
 * y de la configuración del API.
 */

// El mismo pipe que main.ts registra como global.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: false },
});

const CASOS: Array<[string, unknown, Record<string, unknown>]> = [
  ['AgregarProductoDto', AgregarProductoDto, { idProducto: 10, cantidad: 1, tipoPrecio: 1 }],
  ['AgregarServicioDto', AgregarServicioDto, { idServicio: 3, cantidad: 1 }],
  ['TipoPrecioDto', TipoPrecioDto, { tipoPrecio: 2 }],
  ['GuardarPresupuestoDto', GuardarPresupuestoDto, { idCliente: 1, idVendedor: 2 }],
];

describe('guarda: presupuesto-identidad', () => {
  it.each(CASOS)('%s acepta el cuerpo válido', async (_n, tipo, valido) => {
    const meta: ArgumentMetadata = { type: 'body', metatype: tipo as ArgumentMetadata['metatype'] };
    await expect(pipe.transform(valido, meta)).resolves.toMatchObject(valido);
  });

  it.each(CASOS)('%s rechaza un idUsuario o idConfig mandado por el navegador', async (_n, tipo, valido) => {
    const meta: ArgumentMetadata = { type: 'body', metatype: tipo as ArgumentMetadata['metatype'] };
    await expect(pipe.transform({ ...valido, idUsuario: 99 }, meta)).rejects.toThrow(BadRequestException);
    await expect(pipe.transform({ ...valido, idConfig: 1 }, meta)).rejects.toThrow(BadRequestException);
  });

  it('el controlador toma el usuario sólo de la sesión, nunca del cuerpo ni la URL', () => {
    const ruta = archivosCon(['.ts']).find((r) => r.endsWith('presupuesto.controller.ts'));
    if (!ruta) throw new Error('No se encontró presupuesto.controller.ts');
    const codigo = sinComentariosTs(leer(ruta));

    // Cada método que recibe `usuario` lo recibe por @UsuarioActual().
    const parametrosUsuario = codigo.match(/\busuario: UsuarioSesion/g) ?? [];
    const porSesion = codigo.match(/@UsuarioActual\(\) usuario: UsuarioSesion/g) ?? [];
    expect(parametrosUsuario.length).toBeGreaterThan(0);
    expect(porSesion.length).toBe(parametrosUsuario.length);

    // Y en ningún lado se lee un idUsuario de lo que manda el navegador.
    expect(codigo).not.toMatch(/(datos|consulta|body|params?)\.idUsuario/);
    expect(codigo).not.toMatch(/@(Param|Query|Body)\(\s*'idUsuario'/);
  });
});
