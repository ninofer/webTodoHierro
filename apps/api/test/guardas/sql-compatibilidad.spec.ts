import { archivosCon, leer, relativa, sinComentariosSql, sinComentariosTs } from '../ayudas/archivos';

/**
 * Nada que el motor de producción no entienda.
 *
 * El cliente corre SQL Server 2008 R2. Cada una de estas construcciones existe
 * en versiones posteriores y compila sin problema en cualquier editor moderno:
 * el error aparece recién contra la base real, y para entonces ya está publicado.
 *
 * OFFSET ... FETCH nos mordió el 17/09/2026 en la paginación del catálogo; la
 * salida fue ROW_NUMBER().
 */
const PROHIBIDAS: ReadonlyArray<readonly [string, RegExp, string]> = [
  ['OFFSET ... FETCH', /\bOFFSET\s+[^;]*\bFETCH\b/i, 'usar ROW_NUMBER()'],
  ['STRING_AGG', /\bSTRING_AGG\s*\(/i, 'usar FOR XML PATH'],
  ['TRY_CONVERT', /\bTRY_CONVERT\s*\(/i, 'usar ISNUMERIC o ISDATE antes de CONVERT'],
  ['TRY_CAST', /\bTRY_CAST\s*\(/i, 'usar ISNUMERIC o ISDATE antes de CAST'],
  ['IIF', /\bIIF\s*\(/i, 'usar CASE WHEN'],
  ['THROW', /\bTHROW\b/i, 'usar RAISERROR'],
  ['CONCAT', /\bCONCAT\s*\(/i, 'usar el operador +'],
  ['DROP ... IF EXISTS', /\bDROP\s+(TABLE|VIEW|PROCEDURE|FUNCTION)\s+IF\s+EXISTS\b/i,
    'usar IF OBJECT_ID(...) IS NOT NULL antes del DROP'],
  ['LAG / LEAD', /\b(LAG|LEAD)\s*\(/i, 'resolverlo con un self join'],
  ['FORMAT', /\bFORMAT\s*\(/i, 'formatear en la aplicación, no en la base'],
];

/** Todo el SQL del repositorio: los scripts de db/ y las constantes del API. */
function todoElSql(): Array<{ ruta: string; sql: string }> {
  const scripts = archivosCon(['.sql']).map((ruta) => ({
    ruta: relativa(ruta),
    sql: sinComentariosSql(leer(ruta)),
  }));

  const delApi = archivosCon(['.ts'])
    .filter((ruta) => ruta.includes('repositorio'))
    .map((ruta) => ({
      ruta: relativa(ruta),
      sql: sinComentariosTs(leer(ruta)),
    }));

  return [...scripts, ...delApi];
}

describe('guarda: sql-compatibilidad', () => {
  const fuentes = todoElSql();

  it('hay SQL que revisar, en scripts y en el API', () => {
    expect(fuentes.filter((f) => f.ruta.endsWith('.sql')).length).toBeGreaterThan(0);
    expect(fuentes.filter((f) => f.ruta.endsWith('.ts')).length).toBeGreaterThan(0);
  });

  it.each(PROHIBIDAS.map(([nombre, patron, salida]) => [nombre, patron, salida] as const))(
    'no se usa %s (SQL Server 2012 o posterior)',
    (_nombre, patron, salida) => {
      const culpables = fuentes
        .filter((f) => patron.test(f.sql))
        .map((f) => `${f.ruta} — la salida es: ${salida}`);
      expect(culpables).toEqual([]);
    },
  );
});
