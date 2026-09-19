import { archivosCon, leer, relativa, sinComentariosSql, sinComentariosTs } from '../ayudas/archivos';

/**
 * A la base del cliente se la lee, nunca se le escribe.
 *
 * Barre todo el repositorio, no sólo db/: el día que alguien escriba un INSERT
 * en un servicio del API, esta guarda tiene que verlo igual.
 *
 * La única excepción documentada es el esquema `web`, y sólo para crear objetos
 * de lectura. Ver CLAUDE.md y db/README.md.
 */

const ESCRITURAS = [
  /\bINSERT\s+INTO\b/i,
  /\bUPDATE\s+[a-z_[]/i,
  /\bDELETE\s+FROM\b/i,
  /\bMERGE\s+INTO\b/i,
  /\bTRUNCATE\s+TABLE\b/i,
  /\bDROP\s+TABLE\b/i,
  /\bALTER\s+TABLE\b/i,
];

/** Lo que sí puede crearse, y sólo dentro del esquema web. */
const CREACIONES_PERMITIDAS = [
  /\bCREATE\s+SCHEMA\s+web\b/i,
  /\bCREATE\s+VIEW\s+web\./i,
  /\bCREATE\s+PROCEDURE\s+web\./i,
  /\bDROP\s+VIEW\s+web\./i,
  /\bDROP\s+PROCEDURE\s+web\./i,
];

describe('guarda: lectura-de-produccion', () => {
  const scripts = archivosCon(['.sql']).map((ruta) => ({
    ruta: relativa(ruta),
    sql: sinComentariosSql(leer(ruta)),
  }));

  it('hay scripts de base de datos que revisar', () => {
    // Si algún día la carpeta db/ queda vacía o se renombra, esta guarda
    // pasaría en verde sin haber mirado nada. Es exactamente el olvido que
    // viene a evitar.
    expect(scripts.length).toBeGreaterThan(0);
  });

  it.each(ESCRITURAS.map((patron) => [patron.source, patron] as const))(
    'ningún script escribe: %s',
    (_nombre, patron) => {
      const culpables = scripts.filter((s) => patron.test(s.sql)).map((s) => s.ruta);
      expect(culpables).toEqual([]);
    },
  );

  it('toda creación de objetos ocurre dentro del esquema web', () => {
    const creaciones = scripts.flatMap((s) =>
      (s.sql.match(/\b(CREATE|ALTER|DROP)\s+(SCHEMA|VIEW|PROCEDURE|FUNCTION|TABLE|INDEX)[^;\n]*/gi) ?? [])
        .map((texto) => ({ ruta: s.ruta, texto: texto.trim() })),
    );

    const fueraDeWeb = creaciones
      .filter(({ texto }) => !CREACIONES_PERMITIDAS.some((p) => p.test(texto)))
      .map(({ ruta, texto }) => `${ruta}: ${texto}`);

    expect(fueraDeWeb).toEqual([]);
  });

  it('el SQL del API tampoco escribe', () => {
    const fuentes = archivosCon(['.ts']).filter((r) => r.includes('apps') && !r.includes('test'));
    const culpables: string[] = [];

    for (const ruta of fuentes) {
      const codigo = sinComentariosTs(leer(ruta));
      if (ESCRITURAS.some((patron) => patron.test(codigo))) culpables.push(relativa(ruta));
    }

    expect(culpables).toEqual([]);
  });
});
