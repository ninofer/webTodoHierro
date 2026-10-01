import { ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { HabilitacionRepositorio } from './habilitacion.repositorio';

/** Cuánto se confía en una respuesta de `usuarioWeb` antes de volver a preguntar. */
export const HABILITACION_CACHE_MS = 60000;

export const MENSAJE_NO_HABILITADO =
  'Tu usuario no está habilitado para la web: pedile al administrador que lo habilite en el sistema.';

/**
 * Comprueba que el usuario siga en `usuarioWeb`.
 *
 * Se pregunta al entrar y antes de cada operación del presupuesto. El JWT dura 12
 * horas; sin este chequeo, a alguien deshabilitado a media mañana le quedaría la
 * tarde entera para seguir escribiendo en la base. La caché de un minuto evita
 * una consulta por clic sin dejar esa ventana abierta.
 */
@Injectable()
export class HabilitacionService {
  private readonly cache = new Map<number, { habilitado: boolean; hasta: number }>();

  constructor(private readonly repositorio: HabilitacionRepositorio) {}

  async estaHabilitado(idUsuario: number, ahora = Date.now()): Promise<boolean> {
    const guardado = this.cache.get(idUsuario);
    if (guardado && guardado.hasta > ahora) return guardado.habilitado;

    let habilitado: boolean;
    try {
      habilitado = await this.repositorio.estaEnUsuarioWeb(idUsuario);
    } catch (error) {
      // Sin base no se puede saber: se niega, no se supone que sí.
      const detalle = error instanceof Error ? error.message : String(error);
      throw new ServiceUnavailableException(
        `No se pudo comprobar la habilitación del usuario: ${detalle}`,
      );
    }

    this.cache.set(idUsuario, { habilitado, hasta: ahora + HABILITACION_CACHE_MS });
    return habilitado;
  }

  /** Lanza 403 con el mensaje que dice qué hacer, si el usuario no está habilitado. */
  async exigir(idUsuario: number): Promise<void> {
    if (!(await this.estaHabilitado(idUsuario))) {
      throw new ForbiddenException(MENSAJE_NO_HABILITADO);
    }
  }
}
