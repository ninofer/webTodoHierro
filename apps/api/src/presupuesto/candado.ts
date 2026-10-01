/**
 * Ejecuta tareas de a una, en orden de llegada.
 *
 * El número del presupuesto recién guardado se lee con max(idPresupuesto) sobre el
 * idConfig 999, que comparten todos los usuarios de la web. Si dos guardan a la
 * vez, los dos leerían el mismo número. Con esto, el guardado y la lectura del
 * número de uno terminan antes de que empiece el del otro.
 *
 * Alcanza porque pm2 corre una sola instancia del API (el worker del catálogo ya
 * lo exige). Con dos instancias, este candado dejaría de proteger.
 */
export class Candado {
  private cola: Promise<unknown> = Promise.resolve();

  ejecutar<T>(tarea: () => Promise<T>): Promise<T> {
    const resultado = this.cola.then(tarea);
    // El fallo de una tarea no traba a las siguientes.
    this.cola = resultado.catch(() => undefined);
    return resultado;
  }
}
