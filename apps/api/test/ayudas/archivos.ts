import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** Raíz del monorepo. Las guardas barren todo, no la carpeta donde apareció el error. */
export const RAIZ = resolve(__dirname, '..', '..', '..', '..');

const IGNORADAS = new Set(['node_modules', 'dist', '.git', 'logs', '.tmp']);

/** Todos los archivos del repositorio con alguna de las extensiones dadas. */
export function archivosCon(extensiones: string[], desde = RAIZ): string[] {
  const encontrados: string[] = [];

  for (const entrada of readdirSync(desde)) {
    if (IGNORADAS.has(entrada)) continue;
    const ruta = join(desde, entrada);

    if (statSync(ruta).isDirectory()) {
      encontrados.push(...archivosCon(extensiones, ruta));
    } else if (extensiones.some((ext) => entrada.endsWith(ext))) {
      encontrados.push(ruta);
    }
  }

  return encontrados;
}

export function leer(ruta: string): string {
  return readFileSync(ruta, 'utf8');
}

/** Ruta relativa a la raíz, para que los mensajes de error se puedan leer. */
export function relativa(ruta: string): string {
  return ruta.slice(RAIZ.length + 1).replace(/\\/g, '/');
}

/**
 * Saca los comentarios de un SQL.
 *
 * Sin esto, una guarda que busca la palabra "costo" se dispara con el comentario
 * que explica por qué el costo no se expone. Comprobar que el código existe no
 * comprueba que se ejecuta, y su reverso: encontrar una palabra en un comentario
 * no es encontrarla en el código.
 */
export function sinComentariosSql(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ');
}

/** Saca los comentarios de un TypeScript. Misma razón que arriba. */
export function sinComentariosTs(codigo: string): string {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
