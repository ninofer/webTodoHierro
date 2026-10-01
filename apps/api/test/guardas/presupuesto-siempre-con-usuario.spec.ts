import { archivosCon, leer, sinComentariosTs } from '../ayudas/archivos';

/**
 * Toda operación sobre el carrito lleva idConfig E idUsuario.
 *
 * El carrito de la web es detFacturacionTmp con idConfig 999, y lo comparten
 * todos los usuarios de la web: lo único que separa el de uno del de otro es el
 * idUsuario. Una llamada que se olvida de pasarlo mezcla carritos, o —como pasó
 * con el primer borrador de sp_guardarPresupuesto_nuevo_web, que borraba por
 * idConfig solo— vacía el de todos.
 *
 * Se mira el cuerpo de cada método del repositorio, no el archivo entero: con un
 * solo método que pase los dos, el archivo entero "los tendría".
 */

function metodosDelRepositorio(): Array<{ nombre: string; cuerpo: string }> {
  const ruta = archivosCon(['.ts']).find((r) => r.endsWith('presupuesto.repositorio.ts'));
  if (!ruta) throw new Error('No se encontró presupuesto.repositorio.ts');
  const codigo = sinComentariosTs(leer(ruta));
  const clase = codigo.slice(codigo.indexOf('export class PresupuestoRepositorio'));

  return clase
    .split(/\n {2}async /)
    .slice(1)
    .map((trozo) => ({ nombre: trozo.slice(0, trozo.indexOf('(')), cuerpo: trozo }));
}

/** Lo que toca el carrito: los SP _web y las consultas sobre detFacturacionTmp. */
function tocaElCarrito(cuerpo: string, constantes: Map<string, string>): boolean {
  if (/\.execute\(\s*'dbo\.\w+_web'/.test(cuerpo)) return true;
  // Una consulta que viene de una constante: se mira el texto de la constante.
  return [...cuerpo.matchAll(/\.query(?:<[^>]*>)?\(\s*(SQL_\w+)/g)].some((m) =>
    /detFacturacionTmp/i.test(constantes.get(m[1] as string) ?? ''),
  );
}

function constantesSql(): Map<string, string> {
  const ruta = archivosCon(['.ts']).find((r) => r.endsWith('presupuesto.repositorio.ts')) as string;
  const codigo = sinComentariosTs(leer(ruta));
  return new Map([...codigo.matchAll(/const (SQL_\w+) = `([\s\S]*?)`/g)].map((m) => [m[1] as string, m[2] as string]));
}

describe('guarda: presupuesto-siempre-con-usuario', () => {
  const metodos = metodosDelRepositorio();
  const constantes = constantesSql();
  const delCarrito = metodos.filter((m) => tocaElCarrito(m.cuerpo, constantes));

  it('el repositorio tiene métodos que tocan el carrito', () => {
    // Si el archivo cambia de forma y la separación en métodos deja de funcionar,
    // la prueba de abajo pasaría sin haber mirado nada.
    expect(metodos.length).toBeGreaterThan(5);
    expect(delCarrito.length).toBeGreaterThan(5);
  });

  it('cada método que toca el carrito pasa idConfig e idUsuario', () => {
    const conLosDos = delCarrito.filter(
      (m) => /\.input\(\s*'idConfig'/.test(m.cuerpo) && /\.input\(\s*'idUsuario'/.test(m.cuerpo),
    );
    // Contra la otra lista, no contra un número: la regla crece sola.
    expect(conLosDos.map((m) => m.nombre)).toEqual(delCarrito.map((m) => m.nombre));
  });

  it('cada consulta sobre detFacturacionTmp filtra por los dos', () => {
    const sinFiltro = [...constantes]
      .filter(([, texto]) => /detFacturacionTmp/i.test(texto))
      .filter(([, texto]) => !/idConfig\s*=\s*@idConfig/.test(texto) || !/idUsuario\s*=\s*@idUsuario/.test(texto))
      .map(([nombre]) => nombre);
    expect(sinFiltro).toEqual([]);
  });
});
