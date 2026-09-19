import { ConfigService } from '@nestjs/config';
import { SqlService } from '../../src/sql/sql.service';

/**
 * El API arranca aunque la base no responda.
 *
 * El 19/09/2026 se cayó la regla del Mikrotik que permite el 1433. `onModuleInit`
 * lanzó la excepción, Nest abortó el arranque y `app.listen()` nunca corrió: el
 * proceso figuraba `online` en pm2 pero no servía nada, ni siquiera `/api/salud`
 * —que es justo el endpoint que uno consulta cuando algo anda mal—. El síntoma
 * fue "el puerto 3001 no responde", que manda a buscar al lado equivocado.
 *
 * Se apunta a una IP no ruteable con un timeout corto: la conexión no puede
 * prosperar, y eso es exactamente lo que la prueba necesita.
 */
function configFalsa(valores: Record<string, string>): ConfigService {
  return {
    get: (clave: string) => valores[clave],
    getOrThrow: (clave: string) => {
      const valor = valores[clave];
      if (valor === undefined) throw new Error(`falta ${clave}`);
      return valor;
    },
  } as unknown as ConfigService;
}

describe('guarda: arranque-sin-base', () => {
  let servicio: SqlService;

  beforeEach(() => {
    servicio = new SqlService(
      configFalsa({
        // 203.0.113.0/24 es el rango reservado para documentación (RFC 5737):
        // no se rutea a ningún lado, así que el intento siempre expira.
        SQL_HOST: '203.0.113.1',
        SQL_PUERTO: '1433',
        SQL_BASE: 'inexistente',
        SQL_USUARIO: 'nadie',
        SQL_CLAVE: 'nada',
        SQL_TIMEOUT_CONEXION_MS: '300',
      }),
    );
  });

  afterEach(async () => {
    await servicio.onModuleDestroy();
  });

  it('onModuleInit no falla cuando la base no responde', async () => {
    // No alcanza con `not.toThrow()`. Si alguien convierte el método en `async`,
    // el fallo no se lanza de forma sincrónica: vuelve como promesa rechazada, y
    // Nest aborta el arranque igual. La verificación por mutación del 19/09/2026
    // encontró esta prueba en verde con el error puesto, que es el defecto que
    // venía a evitar.
    await expect(Promise.resolve(servicio.onModuleInit() as unknown)).resolves.toBeUndefined();
  });

  it('informa que no está conectado y por qué, en vez de romper', async () => {
    servicio.onModuleInit();
    await new Promise((listo) => setTimeout(listo, 1500));

    expect(servicio.conectado).toBe(false);
    expect(servicio.errorDeConexion).toEqual(expect.any(String));
  });

  it('una consulta sin conexión falla con un mensaje que dice qué revisar', async () => {
    servicio.onModuleInit();
    await new Promise((listo) => setTimeout(listo, 1500));

    // El mensaje nombra lo que hay que ir a mirar. "Cannot read properties of
    // undefined (reading 'request')" no le sirve a nadie a las diez de la noche.
    await expect(servicio.consultar('SELECT 1')).rejects.toThrow(/OpenVPN|Mikrotik|1433/);
  });
});
