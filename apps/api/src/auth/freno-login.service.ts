import { Injectable } from '@nestjs/common';

const INTENTOS_MAXIMOS = 5;
const VENTANA_MS = 15 * 60 * 1000;

/**
 * Freno a la fuerza bruta contra el login.
 *
 * En memoria y por IP. Alcanza porque el proceso es uno solo (pm2 con una
 * instancia): si algún día se escala a varios, este estado tiene que salir del
 * proceso o el freno se multiplica por la cantidad de instancias.
 */
@Injectable()
export class FrenoLoginService {
  private readonly intentos = new Map<string, { cantidad: number; desde: number }>();

  frenado(ip: string): boolean {
    const registro = this.intentos.get(ip);
    if (!registro) return false;
    if (Date.now() - registro.desde > VENTANA_MS) {
      this.intentos.delete(ip);
      return false;
    }
    return registro.cantidad >= INTENTOS_MAXIMOS;
  }

  registrarFallo(ip: string): void {
    const registro = this.intentos.get(ip) ?? { cantidad: 0, desde: Date.now() };
    registro.cantidad += 1;
    this.intentos.set(ip, registro);
  }

  limpiar(ip: string): void {
    this.intentos.delete(ip);
  }

  get minutosDeEspera(): number {
    return VENTANA_MS / 60000;
  }
}
