import { Controller, Get, Query } from '@nestjs/common';
import { LIMITES, type RespuestaArticulos } from '@todohierro/shared';
import { CatalogoService } from './catalogo.service';
import { BuscarArticulosDto } from './dto/buscar-articulos.dto';

@Controller('catalogo')
export class CatalogoController {
  constructor(private readonly catalogo: CatalogoService) {}

  /** Búsqueda paginada del catálogo. Requiere sesión: el guard JWT es global. */
  @Get('articulos')
  buscar(@Query() consulta: BuscarArticulosDto): RespuestaArticulos {
    return this.catalogo.buscar(
      consulta.q ?? '',
      consulta.pagina ?? 1,
      consulta.tamano ?? LIMITES.TAMANO_PAGINA_POR_DEFECTO,
    );
  }
}
