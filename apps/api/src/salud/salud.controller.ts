import { Controller, Get } from '@nestjs/common';
import { CatalogoService } from '../catalogo/catalogo.service';
import { SqlService } from '../sql/sql.service';
import { Publico } from '../auth/publico.decorador';

@Controller('salud')
export class SaludController {
  constructor(
    private readonly catalogo: CatalogoService,
    private readonly sql: SqlService,
  ) {}

  /**
   * Estado del proceso. Público a propósito: lo consulta el monitoreo, que no
   * tiene sesión. No devuelve ningún dato del cliente, sólo contadores y el
   * motivo del último fallo — que es lo primero que uno quiere ver cuando el
   * portal no trae datos.
   */
  @Publico()
  @Get()
  estado() {
    return {
      ...this.catalogo.estado(),
      base: {
        conectada: this.sql.conectado,
        error: this.sql.errorDeConexion,
      },
      ts: new Date().toISOString(),
    };
  }
}
