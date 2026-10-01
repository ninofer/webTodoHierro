import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { UsuarioSesion } from '@todohierro/shared';
import type { HabilitacionService } from '../../src/auth/habilitacion.service';
import type { CatalogoService } from '../../src/catalogo/catalogo.service';
import { archivosCon, leer, sinComentariosTs } from '../ayudas/archivos';
import { PresupuestoRepositorio } from '../../src/presupuesto/presupuesto.repositorio';
import { PresupuestoService } from '../../src/presupuesto/presupuesto.service';
import type { SqlService } from '../../src/sql/sql.service';

/**
 * El servicio del presupuesto: lo que decide antes de llamar a la base.
 *
 * - Dos guardados a la vez se hacen de a uno. El número del presupuesto se lee
 *   con max() sobre el idConfig que comparten todos; sin esto, los dos usuarios
 *   recibirían el mismo número.
 * - Lo que el escritorio no resuelve (varios lotes) se rechaza con un mensaje que
 *   manda al escritorio, en vez de cargar un renglón mal.
 * - Precio manual: el precio lo escribe el usuario, y el servidor lo exige para
 *   esos productos y lo rechaza para los demás. El precio de un producto normal
 *   lo calcula el SP, nunca el navegador.
 * - Servicios: el precio es editable siempre, como frmBuscarServicio. Si no
 *   viene, va el de la tabla.
 * - Sin habilitación en usuarioWeb, no se toca la base.
 * - De sp_precioMercaderia salen sólo el precio de venta y la marca de precio
 *   manual; la misma fila trae el costo.
 */

const ANA: UsuarioSesion = { idUsuario: 7, nick: 'ana', nombre: 'Ana', reportes: false };
const BETO: UsuarioSesion = { idUsuario: 8, nick: 'beto', nombre: 'Beto', reportes: false };

const esperar = (ms: number) => new Promise((listo) => setTimeout(listo, ms));

type RepoFalso = Record<string, (...args: never[]) => Promise<unknown>> & {
  eventos: string[];
  /** El último argumento con que se llamó agregarProducto: el precio manual, o null. */
  precioEnviado: () => number | null | undefined;
};

function repoFalso(cambios: Partial<Record<string, (...args: never[]) => Promise<unknown>>> = {}): RepoFalso {
  const eventos: string[] = [];
  let ultimoId = 100;
  let precioEnviado: number | null | undefined;
  const base: Record<string, (...args: never[]) => Promise<unknown>> = {
    configuracionWeb: async () => ({ idSucursal: 1, idDepositoVenta: 1 }),
    totales: async () => ({ renglones: 1, total: 1000, descuento: 0, iva5: 0, iva10: 90, tipoPrecio: 1 }),
    detalle: async () => [],
    cliente: async () => ({ id: 1, ruc: '123', nombre: 'Cliente', grupo: '', email: '' }),
    vendedor: async () => ({ id: 2, nombre: 'Vendedor' }),
    guardar: (async (d: { idUsuario: number }) => {
      eventos.push(`guardar:${d.idUsuario}`);
      await esperar(20);
      ultimoId++;
    }) as never,
    ultimoPresupuesto: async () => {
      eventos.push('leer-numero');
      return ultimoId;
    },
    lotes: async () => ({ cantidad: 0, stock: 0 }),
    servicio: async () => ({ id: 3, nombre: 'CORTE', precio: 15000 }),
    agregarServicio: (async (...args: unknown[]) => {
      eventos.push('agregar-servicio');
      precioEnviado = args[4] as number;
    }) as never,
    precioProducto: async () => ({ precioManual: false, precioSugerido: 200000 }),
    agregarProducto: (async (...args: unknown[]) => {
      eventos.push('agregar');
      precioEnviado = args[6] as number | null;
    }) as never,
    ...cambios,
  } as Record<string, (...args: never[]) => Promise<unknown>>;
  return Object.assign(base, { eventos, precioEnviado: () => precioEnviado }) as RepoFalso;
}

function servicio(repo: RepoFalso, habilitado = true): PresupuestoService {
  const habilitacion = {
    exigir: async () => {
      if (!habilitado) throw new ForbiddenException('no habilitado');
    },
  } as unknown as HabilitacionService;
  const catalogo = { porId: () => ({ nombre: 'CAÑO', codigo: '123' }) } as unknown as CatalogoService;
  const config = { get: () => undefined } as unknown as ConfigService;
  return new PresupuestoService(repo as unknown as PresupuestoRepositorio, habilitacion, catalogo, config);
}

describe('guarda: presupuesto-servicio', () => {
  it('dos guardados simultáneos se hacen de a uno y cada uno recibe su número', async () => {
    const repo = repoFalso();
    const s = servicio(repo);

    const [a, b] = await Promise.all([s.guardar(ANA, 1, 2), s.guardar(BETO, 1, 2)]);

    // El número de Ana se lee antes de que empiece el guardado de Beto.
    expect(repo.eventos).toEqual(['guardar:7', 'leer-numero', 'guardar:8', 'leer-numero']);
    expect(a.idPresupuesto).not.toBe(b.idPresupuesto);
  });

  it('un guardado que falla no traba a los siguientes', async () => {
    const repo = repoFalso({ totales: async () => ({ renglones: 0, total: 0, descuento: 0, iva5: 0, iva10: 0, tipoPrecio: null }) });
    const s = servicio(repo);
    await expect(s.guardar(ANA, 1, 2)).rejects.toThrow('no tiene ítems');
    await expect(s.guardar(ANA, 1, 2)).rejects.toThrow('no tiene ítems');
  });

  it('un producto con varios lotes se rechaza y no se carga', async () => {
    const repo = repoFalso({ lotes: async () => ({ cantidad: 3, stock: 10 }) });
    await expect(servicio(repo).agregarProducto(ANA, 5, 1, 1)).rejects.toThrow(/3 lotes.*escritorio/);
    expect(repo.eventos).not.toContain('agregar');
  });

  it('un producto normal se carga sin precio: lo calcula el SP', async () => {
    const repo = repoFalso();
    await servicio(repo).agregarProducto(ANA, 5, 1, 1);
    expect(repo.precioEnviado()).toBeNull();
  });

  it('un producto normal con precio mandado desde el navegador se rechaza', async () => {
    const repo = repoFalso();
    await expect(servicio(repo).agregarProducto(ANA, 5, 1, 1, 150000)).rejects.toThrow(/no tiene precio manual/);
    expect(repo.eventos).not.toContain('agregar');
  });

  it('un producto con precio manual exige el precio y lo manda al SP', async () => {
    const repo = repoFalso({ precioProducto: async () => ({ precioManual: true, precioSugerido: 84500 }) });
    const s = servicio(repo);

    await expect(s.agregarProducto(ANA, 5, 1, 1)).rejects.toThrow(/escribí el precio/);
    expect(repo.eventos).not.toContain('agregar');

    await s.agregarProducto(ANA, 5, 1, 1, 90000);
    // Viaja el precio escrito, no el sugerido.
    expect(repo.precioEnviado()).toBe(90000);
  });

  it('un precio manual inválido no llega a la base', async () => {
    const repo = repoFalso({ precioProducto: async () => ({ precioManual: true, precioSugerido: 84500 }) });
    await expect(servicio(repo).agregarProducto(ANA, 5, 1, 1, 0)).rejects.toThrow(BadRequestException);
    await expect(servicio(repo).agregarProducto(ANA, 5, 1, 1, 1500.5)).rejects.toThrow(BadRequestException);
    expect(repo.eventos).not.toContain('agregar');
  });

  it('un servicio sin precio escrito va con el precio de la tabla', async () => {
    const repo = repoFalso();
    await servicio(repo).agregarServicio(ANA, 3, 2);
    expect(repo.precioEnviado()).toBe(15000);
  });

  it('un servicio con precio escrito va con ese precio, no con el de la tabla', async () => {
    const repo = repoFalso();
    await servicio(repo).agregarServicio(ANA, 3, 2, 18000);
    expect(repo.precioEnviado()).toBe(18000);
  });

  it('un precio de servicio inválido no llega a la base', async () => {
    const repo = repoFalso();
    await expect(servicio(repo).agregarServicio(ANA, 3, 1, 0)).rejects.toThrow(BadRequestException);
    await expect(servicio(repo).agregarServicio(ANA, 3, 1, 99.5)).rejects.toThrow(BadRequestException);
    expect(repo.eventos).not.toContain('agregar-servicio');
  });

  it('pedir más que el stock avisa pero carga igual', async () => {
    const repo = repoFalso({ lotes: async () => ({ cantidad: 0, stock: 2 }) });
    const respuesta = await servicio(repo).agregarProducto(ANA, 5, 3, 1);
    expect(repo.eventos).toContain('agregar');
    expect(respuesta.aviso).toMatch(/3.*2/);
  });

  it('una cantidad inválida no llega a la base', async () => {
    const repo = repoFalso();
    await expect(servicio(repo).agregarProducto(ANA, 5, 0, 1)).rejects.toThrow(BadRequestException);
    expect(repo.eventos).toEqual([]);
  });

  it('sin habilitación no se toca la base', async () => {
    const repo = repoFalso();
    await expect(servicio(repo, false).agregarProducto(ANA, 5, 1, 1)).rejects.toThrow(ForbiddenException);
    await expect(servicio(repo, false).guardar(ANA, 1, 2)).rejects.toThrow(ForbiddenException);
    expect(repo.eventos).toEqual([]);
  });
});

describe('guarda: presupuesto-sin-costo', () => {
  it('de sp_precioMercaderia salen el precio y la marca, aunque la fila traiga el costo', async () => {
    const COSTO = 123456;
    const peticion = {
      arrayRowMode: false,
      input() {
        return this;
      },
      // idProducto, costo, mayorista, minorista, %may, %min, stock, tipo
      execute: async () => ({ recordsets: [[[10, COSTO, 200000, 250000, 10, 20, 5, 1]]] }),
    };
    const sql = { peticion: () => peticion } as unknown as SqlService;
    const resultado = await new PresupuestoRepositorio(sql).precioProducto(10);

    expect(resultado).toEqual({ precioManual: true, precioSugerido: 200000 });
    // Lo que NO tiene que estar: el costo, en ninguna forma.
    expect(JSON.stringify(resultado)).not.toContain(String(COSTO));
  });

  it('el cuerpo de precioProducto sólo accede a las columnas 2 y 7', () => {
    const ruta = archivosCon(['.ts']).find((r) => r.endsWith('presupuesto.repositorio.ts')) as string;
    const codigo = sinComentariosTs(leer(ruta));
    const desde = codigo.indexOf('async precioProducto(');
    const cuerpo = codigo.slice(desde, codigo.indexOf('\n  async ', desde + 1));
    const indices = [...new Set([...cuerpo.matchAll(/\[(\d+)\]/g)].map((m) => m[1]))].sort();
    expect(desde).toBeGreaterThan(0);
    // La columna 1 es el costo: no tiene que aparecer ningún otro índice.
    expect(indices).toEqual(['2', '7']);
  });
});
