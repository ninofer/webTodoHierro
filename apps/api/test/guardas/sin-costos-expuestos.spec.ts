import { archivosCon, leer, relativa, sinComentariosSql, sinComentariosTs } from '../ayudas/archivos';

/**
 * El costo de compra no cruza nunca.
 *
 * `dbo.v_stockPrecio` expone costo, costoAnterior y precio2, que derivan del
 * costo de compra. Es el dato más sensible de la base del cliente: si se filtra,
 * queda expuesto frente a sus competidores y a sus proveedores. Ninguna pantalla
 * del portal lo necesita.
 *
 * Se comprueba lo que NO tiene que estar, y sobre el SQL sin comentarios: los
 * comentarios de db/001 y del repositorio nombran esas columnas justamente para
 * explicar por qué no se exponen.
 */

const PROHIBIDAS = ['costoAnterior', 'costoStock', 'comisionCanje', 'precio2', 'costo'];

describe('guarda: sin-costos-expuestos', () => {
  const fuentes = [
    ...archivosCon(['.sql']).map((ruta) => ({
      ruta: relativa(ruta),
      texto: sinComentariosSql(leer(ruta)),
    })),
    ...archivosCon(['.ts'])
      .filter((ruta) => ruta.includes('apps') && !ruta.includes('test'))
      .map((ruta) => ({ ruta: relativa(ruta), texto: sinComentariosTs(leer(ruta)) })),
  ];

  it('hay fuentes que revisar', () => {
    expect(fuentes.length).toBeGreaterThan(0);
  });

  it.each(PROHIBIDAS)('ninguna fuente nombra la columna %s', (columna) => {
    const patron = new RegExp(`\\b${columna}\\b`, 'i');
    const culpables = fuentes.filter((f) => patron.test(f.texto)).map((f) => f.ruta);
    expect(culpables).toEqual([]);
  });
});
