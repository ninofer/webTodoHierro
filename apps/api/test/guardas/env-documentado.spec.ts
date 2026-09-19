import { archivosCon, leer, relativa, sinComentariosTs } from '../ayudas/archivos';

/**
 * Toda variable de entorno que el código lee está documentada en .env.ejemplo.
 *
 * Una variable sin documentar es una que alguien no define al desplegar, y cuyo
 * valor ausente aparece como un comportamiento raro en vez de como un error.
 */

/**
 * NODE_ENV la pone el entorno de ejecución, no nosotros: documentarla en
 * .env.ejemplo sugeriría que hay que definirla a mano, que es lo contrario de
 * lo que corresponde.
 */
const NO_SE_DOCUMENTAN = new Set(['NODE_ENV']);

function variablesLeidas(): Array<{ ruta: string; nombre: string }> {
  const fuentes = archivosCon(['.ts']).filter(
    (ruta) => ruta.includes('apps') && !ruta.includes('test'),
  );

  const patrones = [
    /process\.env\[?['"]([A-Z][A-Z0-9_]*)['"]\]?/g,
    /\.(?:get|getOrThrow)<[^>]*>\(\s*['"]([A-Z][A-Z0-9_]*)['"]/g,
    /\.(?:get|getOrThrow)\(\s*['"]([A-Z][A-Z0-9_]*)['"]/g,
  ];

  const leidas: Array<{ ruta: string; nombre: string }> = [];

  for (const ruta of fuentes) {
    const codigo = sinComentariosTs(leer(ruta));
    for (const patron of patrones) {
      for (const coincidencia of codigo.matchAll(patron)) {
        const nombre = coincidencia[1];
        if (nombre && !NO_SE_DOCUMENTAN.has(nombre)) {
          leidas.push({ ruta: relativa(ruta), nombre });
        }
      }
    }
  }

  return leidas;
}

function variablesDocumentadas(): Set<string> {
  const ejemplo = archivosCon(['.ejemplo']).find((r) => r.endsWith('.env.ejemplo'));
  if (!ejemplo) throw new Error('No se encontró apps/api/.env.ejemplo');

  const nombres = leer(ejemplo)
    .split(/\r?\n/)
    .filter((linea) => !linea.trimStart().startsWith('#'))
    .map((linea) => linea.split('=')[0]?.trim() ?? '')
    .filter((nombre) => /^[A-Z][A-Z0-9_]*$/.test(nombre));

  return new Set(nombres);
}

describe('guarda: env-documentado', () => {
  const leidas = variablesLeidas();
  const documentadas = variablesDocumentadas();

  it('el código lee variables y el ejemplo documenta algunas', () => {
    expect(leidas.length).toBeGreaterThan(0);
    expect(documentadas.size).toBeGreaterThan(0);
  });

  it('toda variable leída está en .env.ejemplo', () => {
    const faltantes = [
      ...new Set(
        leidas
          .filter(({ nombre }) => !documentadas.has(nombre))
          .map(({ ruta, nombre }) => `${nombre} (leída en ${ruta})`),
      ),
    ];

    expect(faltantes).toEqual([]);
  });
});
