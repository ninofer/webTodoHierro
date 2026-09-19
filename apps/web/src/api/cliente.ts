/**
 * Único punto por donde la pantalla habla con el API.
 *
 * La sesión viaja en una cookie HttpOnly, así que acá no hay ningún token que
 * manejar: el navegador la adjunta solo. Eso es a propósito — un token en
 * localStorage se lo lleva cualquier XSS.
 */

/** La sesión venció o no existe. Se distingue para poder mandar al login. */
export class SesionVencida extends Error {
  constructor() {
    super('La sesión venció. Volvé a entrar.');
    this.name = 'SesionVencida';
  }
}

/** El API respondió un error con mensaje propio. */
export class ErrorDelApi extends Error {
  constructor(
    mensaje: string,
    readonly estado: number,
  ) {
    super(mensaje);
    this.name = 'ErrorDelApi';
  }
}

interface CuerpoDeError {
  message?: string | string[];
}

export async function pedir<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  const respuesta = await fetch('/api' + ruta, {
    ...opciones,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...opciones.headers,
    },
  });

  if (respuesta.status === 401) throw new SesionVencida();

  if (!respuesta.ok) {
    let mensaje = 'No se pudo completar la operación.';
    try {
      const cuerpo = (await respuesta.json()) as CuerpoDeError;
      if (Array.isArray(cuerpo.message)) mensaje = cuerpo.message.join('. ');
      else if (cuerpo.message) mensaje = cuerpo.message;
    } catch {
      // El API no devolvió JSON. Queda el mensaje genérico.
    }
    throw new ErrorDelApi(mensaje, respuesta.status);
  }

  return (await respuesta.json()) as T;
}
