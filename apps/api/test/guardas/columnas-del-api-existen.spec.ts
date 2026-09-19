import { archivosCon, leer, relativa, sinComentariosSql, sinComentariosTs } from '../ayudas/archivos';

/**
 * Cada columna que el API nombra existe en la vista que consulta.
 *
 * Dos veces, en el proyecto de referencia, se inventó una columna de fecha que
 * no existía: TypeScript no dice nada, porque el SQL es un string, y el error
 * aparece recién contra la base real.
 *
 * La fuente de verdad es db/001-esquema-web.sql, que es lo que efectivamente se
 * aplicó en producción.
 */

function columnasDeLaVista(): Set<string> {
  const script = archivosCon(['.sql']).find((r) => r.endsWith('001-esquema-web.sql'));
  if (!script) throw new Error('No se encontró db/001-esquema-web.sql');

  const sql = sinComentariosSql(leer(script));
  const alias = sql.match(/\bAS\s+([a-z_][a-z0-9_]*)\s*(?=,|\r?\n|FROM)/gi) ?? [];

  return new Set(
    alias
      .map((texto) => texto.replace(/^\s*AS\s+/i, '').trim().toLowerCase())
      // `AS id` del alias de tabla no es una columna; los alias de columna de
      // esta vista son todos minúscula con guion bajo y no coinciden con `v`/`p`.
      .filter((nombre) => nombre.length > 1),
  );
}

function columnasQuePideElApi(): Array<{ ruta: string; columna: string }> {
  const repositorios = archivosCon(['.ts']).filter((r) => r.includes('repositorio'));
  const pedidas: Array<{ ruta: string; columna: string }> = [];

  for (const ruta of repositorios) {
    const codigo = sinComentariosTs(leer(ruta));

    // Se acota al SELECT ... FROM web.vw_articulos, no al archivo entero:
    // cualquier mención suelta en cualquier lado satisfaría la prueba.
    const consultas = codigo.match(/SELECT\s+([\s\S]*?)\s+FROM\s+web\./gi) ?? [];

    for (const consulta of consultas) {
      const cuerpo = consulta.replace(/SELECT\s+/i, '').replace(/\s+FROM\s+web\.$/i, '');
      for (const bruta of cuerpo.split(',')) {
        const columna = bruta.trim().toLowerCase();
        if (columna.length > 0) pedidas.push({ ruta: relativa(ruta), columna });
      }
    }
  }

  return pedidas;
}

describe('guarda: columnas-del-api-existen', () => {
  const deLaVista = columnasDeLaVista();
  const delApi = columnasQuePideElApi();

  it('la vista publica columnas y el API pide alguna', () => {
    expect(deLaVista.size).toBeGreaterThan(0);
    expect(delApi.length).toBeGreaterThan(0);
  });

  it('toda columna que el API pide existe en web.vw_articulos', () => {
    const inexistentes = delApi
      .filter(({ columna }) => !deLaVista.has(columna))
      .map(({ ruta, columna }) => `${ruta}: "${columna}" no existe en web.vw_articulos`);

    expect(inexistentes).toEqual([]);
  });
});
