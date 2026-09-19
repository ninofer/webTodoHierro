import { archivosCon, leer, relativa, sinComentariosTs } from '../ayudas/archivos';

/**
 * Ninguna ruta queda abierta por olvido.
 *
 * El guard JWT es global y la excepción se declara con @Publico(). Esta guarda
 * mantiene auditada la lista de excepciones: agregar una nueva obliga a tocar
 * este archivo, que es donde alguien va a preguntarse si corresponde.
 *
 * No se cuenta contra un número escrito a mano —eso se convierte en un contador
 * que alguien actualiza sin mirar— sino contra una lista con nombre y motivo.
 */

/** Las únicas rutas que pueden responder sin sesión, y por qué. */
const PUBLICAS_AUDITADAS: Record<string, string> = {
  'auth.controller.ts': 'el login, que es donde se obtiene la sesión',
  'salud.controller.ts': 'el chequeo de salud, que consulta el monitoreo y no devuelve datos del cliente',
};

describe('guarda: rutas-protegidas', () => {
  const controladores = archivosCon(['.controller.ts']).filter((r) => !r.includes('test'));

  it('hay controladores que revisar', () => {
    expect(controladores.length).toBeGreaterThan(0);
  });

  it('sólo los controladores auditados usan @Publico()', () => {
    const conPublico = controladores
      .filter((ruta) => /@Publico\s*\(\s*\)/.test(sinComentariosTs(leer(ruta))))
      .map((ruta) => relativa(ruta).split('/').pop() ?? '');

    const noAuditados = conPublico.filter((archivo) => !(archivo in PUBLICAS_AUDITADAS));
    expect(noAuditados).toEqual([]);
  });

  it('el guard global sigue registrado como APP_GUARD', () => {
    const modulo = archivosCon(['.ts']).find((r) => r.endsWith('app.module.ts'));
    expect(modulo).toBeDefined();

    // Se acota al bloque de providers: la sola mención de JwtGuard en un import
    // satisfaría la prueba sin que el guard esté aplicado.
    const codigo = sinComentariosTs(leer(modulo as string));
    const providers = codigo.match(/providers\s*:\s*\[([\s\S]*?)\]/)?.[1] ?? '';

    expect(providers).toContain('APP_GUARD');
    expect(providers).toContain('JwtGuard');
  });
});
