import { archivosCon, leer, relativa, sinComentariosSql, sinComentariosTs } from '../ayudas/archivos';

/**
 * El API toca `dbo` sólo a través de lo que db/002-permisos-presupuesto.sql
 * autoriza, y los permisos vigentes no autorizan nada que el API no use.
 *
 * Desde el módulo de presupuestos la web escribe en la base del cliente, pero
 * sólo ejecutando los SP del cliente. La lista de esos SP existe dos veces: en
 * los GRANT que se aplican en producción y en el código que los llama. Si se
 * separan, pasa una de dos cosas: el API llama algo sin permiso y falla recién
 * contra la base real, o queda un permiso que nadie usa y nadie recuerda por qué
 * se dio. Esta guarda las cuenta una contra la otra.
 */

interface Permisos {
  ejecutar: Set<string>;
  leer: Set<string>;
}

/**
 * Los permisos como quedan en producción: se recorren los scripts de db/ en orden
 * numérico, y dentro de cada uno en el orden en que aparecen, sumando cada GRANT
 * y restando cada REVOKE. Una migración aplicada no se edita, así que retirar un
 * permiso es un REVOKE en el script siguiente.
 */
function permisosDeLosScripts(): Permisos {
  const scripts = archivosCon(['.sql'])
    .filter((r) => /[\\/]db[\\/]\d{3}-[^\\/]+\.sql$/.test(r))
    .sort((a, b) => relativa(a).localeCompare(relativa(b)));
  if (!scripts.some((r) => r.endsWith('002-permisos-presupuesto.sql'))) {
    throw new Error('No se encontró db/002-permisos-presupuesto.sql');
  }

  const permisos: Permisos = { ejecutar: new Set(), leer: new Set() };
  const patron = /\b(GRANT|REVOKE)\s+(EXECUTE|SELECT)\s+ON\s+dbo\.(\w+)/gi;

  for (const script of scripts) {
    for (const m of sinComentariosSql(leer(script)).matchAll(patron)) {
      const destino = (m[2] as string).toUpperCase() === 'EXECUTE' ? permisos.ejecutar : permisos.leer;
      const objeto = (m[3] as string).toLowerCase();
      if ((m[1] as string).toUpperCase() === 'GRANT') destino.add(objeto);
      else destino.delete(objeto);
    }
  }
  return permisos;
}

interface Uso {
  ruta: string;
  objeto: string;
}

function repositorios(): Array<{ ruta: string; codigo: string }> {
  return archivosCon(['.ts'])
    .filter((r) => r.includes('repositorio') && r.includes('apps') && !r.includes('test'))
    .map((r) => ({ ruta: relativa(r), codigo: sinComentariosTs(leer(r)) }));
}

describe('guarda: sp-autorizados', () => {
  const permisos = permisosDeLosScripts();
  const fuentes = repositorios();

  // `.execute('dbo.sp_x')`: la única forma admitida de llamar un procedimiento.
  const ejecuciones: Uso[] = fuentes.flatMap(({ ruta, codigo }) =>
    [...codigo.matchAll(/\.execute(?:<[^>]*>)?\(\s*'dbo\.(\w+)'/g)].map((m) => ({
      ruta,
      objeto: (m[1] as string).toLowerCase(),
    })),
  );

  // FROM y JOIN en mayúscula: así no se confunden con `import ... from`.
  const lecturas: Array<Uso & { calificado: boolean; esquema: string }> = fuentes.flatMap(
    ({ ruta, codigo }) =>
      [...codigo.matchAll(/\b(?:FROM|JOIN)\s+([A-Za-z_][\w.]*)/g)].map((m) => {
        const nombre = m[1] as string;
        const punto = nombre.indexOf('.');
        return {
          ruta,
          calificado: punto > 0,
          esquema: punto > 0 ? nombre.slice(0, punto).toLowerCase() : '',
          objeto: (punto > 0 ? nombre.slice(punto + 1) : nombre).toLowerCase(),
        };
      }),
  );

  it('hay permisos y usos que comparar', () => {
    // Si el script se renombra o los repositorios dejan de llamarse así, todo lo
    // de abajo pasaría en verde sin haber mirado nada.
    expect(permisos.ejecutar.size).toBeGreaterThan(0);
    expect(permisos.leer.size).toBeGreaterThan(0);
    expect(ejecuciones.length).toBeGreaterThan(0);
  });

  it('los procedimientos se llaman sólo con .execute(\'dbo.x\'), nunca con EXEC en un texto', () => {
    // Un EXEC dentro de un string no lo ve la comparación de abajo.
    const conExec = fuentes
      .filter(({ codigo }) => /\bEXEC(UTE)?\s+[\w[]/i.test(codigo.replace(/\.execute\(/g, '')))
      .map(({ ruta }) => ruta);
    const executeRaro = fuentes.flatMap(({ ruta, codigo }) =>
      [...codigo.matchAll(/\.execute(?:<[^>]*>)?\(\s*(?!'dbo\.\w+')([^)]*)\)/g)].map(
        (m) => `${ruta}: .execute(${m[1]})`,
      ),
    );
    expect(conExec).toEqual([]);
    expect(executeRaro).toEqual([]);
  });

  it('todo procedimiento que el API ejecuta tiene su GRANT EXECUTE en db/002', () => {
    const sinPermiso = ejecuciones
      .filter(({ objeto }) => !permisos.ejecutar.has(objeto))
      .map(({ ruta, objeto }) => `${ruta}: dbo.${objeto} no tiene GRANT EXECUTE vigente en db/`);
    expect(sinPermiso).toEqual([]);
  });

  it('toda tabla o vista que el API lee va con esquema, y las de dbo tienen su GRANT SELECT', () => {
    const problemas = lecturas
      .filter((l) => !l.calificado || (l.esquema !== 'web' && l.esquema !== 'dbo') ||
        (l.esquema === 'dbo' && !permisos.leer.has(l.objeto)))
      .map((l) =>
        !l.calificado
          ? `${l.ruta}: "${l.objeto}" sin esquema; escribí dbo.${l.objeto} o web.${l.objeto}`
          : `${l.ruta}: ${l.esquema}.${l.objeto} no tiene GRANT SELECT vigente en db/`,
      );
    expect(problemas).toEqual([]);
  });

  it('los permisos vigentes no autorizan nada que el API no use', () => {
    const usados = new Set(ejecuciones.map((e) => e.objeto));
    const leidos = new Set(lecturas.filter((l) => l.esquema === 'dbo').map((l) => l.objeto));
    const sobrantes = [
      ...[...permisos.ejecutar].filter((sp) => !usados.has(sp)).map((sp) => `EXECUTE dbo.${sp}`),
      ...[...permisos.leer].filter((o) => !leidos.has(o)).map((o) => `SELECT dbo.${o}`),
    ];
    expect(sobrantes).toEqual([]);
  });
});
