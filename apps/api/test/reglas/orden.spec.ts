import { compararCodigos, type Articulo } from '@todohierro/shared';
import { CatalogoService } from '../../src/catalogo/catalogo.service';
import type { CatalogoRepositorio } from '../../src/catalogo/catalogo.repositorio';

function articulo(codigo: string, nombre: string, tipoPrecio = 1): Articulo {
  return {
    id: 0,
    codigo,
    codigoBarra: '',
    nombre,
    tipoPrecio,
    precio: 0,
    stock: 0,
    peso: 0,
    actualizado: '2026-01-01T00:00:00.000Z',
  };
}

/** Arma el servicio con un repositorio falso: no toca la base ni el planificador. */
async function servicioCon(articulos: Articulo[]): Promise<CatalogoService> {
  const repositorio = { traerCatalogoCompleto: async () => articulos };
  const servicio = new CatalogoService(
    repositorio as unknown as CatalogoRepositorio,
    {} as never,
    {} as never,
  );
  await servicio.recargar();
  return servicio;
}

describe('regla: orden del catálogo', () => {
  it('los códigos se comparan como números, no como texto', () => {
    // Alfabéticamente "10" va antes que "9"; el usuario espera lo contrario.
    const codigos = ['176', '10', '9', '1000', '176A', '2'];
    expect([...codigos].sort(compararCodigos)).toEqual(['2', '9', '10', '176', '176A', '1000']);
  });

  it('una búsqueda por nombre devuelve los artículos por código de menor a mayor', async () => {
    const servicio = await servicioCon([
      articulo('300', 'CAÑO NEGRO 1"'),
      articulo('25', 'CAÑO GALVANIZADO'),
      articulo('1', 'ALAMBRE'),
      articulo('100', 'CAÑO ESTRUCTURAL'),
      articulo('9', 'CAÑO ACERO'),
    ]);

    const { datos } = servicio.buscar('caño', 1, 50);

    // Los datos están elegidos para que el orden viejo (por nombre) dé otra
    // cosa: 9, 100, 25, 300. Así la prueba distingue un orden del otro.
    // "ALAMBRE" no tiene que aparecer: ordenar no reemplaza a filtrar.
    expect(datos.map((a) => a.codigo)).toEqual(['9', '25', '100', '300']);
  });

  it('el nombre se busca en cualquier parte, y el orden sigue siendo sólo por código', async () => {
    const servicio = await servicioCon([
      articulo('500', 'CAÑO NEGRO 2"'),
      articulo('40', 'TUBO CAÑO GALV'),
      articulo('7', 'CODO P/CAÑO'),
      articulo('300', 'CAÑO NEGRO 1"'),
      articulo('2', 'ALAMBRE'),
    ]);

    // Con LIKE 'CAÑO%' sólo saldrían 300 y 500. Los caños negros no van
    // agrupados arriba: mandan los códigos 7 y 40 aunque su nombre no empiece
    // con CAÑO.
    expect(servicio.buscar('caño', 1, 50).datos.map((a) => a.codigo)).toEqual([
      '7',
      '40',
      '300',
      '500',
    ]);
  });

  it('con el mismo código, el orden lo desempata la lista de precio', async () => {
    const servicio = await servicioCon([articulo('5', 'CAÑO', 3), articulo('5', 'CAÑO', 1)]);
    expect(servicio.buscar('', 1, 50).datos.map((a) => a.tipoPrecio)).toEqual([1, 3]);
  });
});
