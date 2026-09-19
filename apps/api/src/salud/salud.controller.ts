import { Controller, Get } from '@nestjs/common';
import { CatalogoService } from '../catalogo/catalogo.service';
import { Publico } from '../auth/publico.decorador';

@Controller('salud')
export class SaludController {
  constructor(private readonly catalogo: CatalogoService) {}

  /**
   * Estado del proceso. Público a propósito: lo consulta el monitoreo, que no
   * tiene sesión. No devuelve ningún dato del cliente, sólo contadores.
   */
  @Publico()
  @Get()
  estado() {
    return { ...this.catalogo.estado(), ts: new Date().toISOString() };
  }
}
