import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import type { Response } from 'express';
import { LIMITES, type RespuestaFacturacion, type RespuestaRanking, type UsuarioSesion } from '@todohierro/shared';
import { ReportesGuard } from '../auth/reportes.guard';
import { UsuarioActual } from '../auth/usuario-actual.decorador';
import { ReportesService } from './reportes.service';

/*
 * Los rangos se validan en el servicio con validarRangoFechas (shared): acá sólo
 * se exige la forma, para que un parámetro de más o con otro nombre dé 400.
 */
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MENSAJE_FECHA = 'La fecha tiene que tener el formato aaaa-mm-dd.';

class RangoDto {
  @Matches(FECHA, { message: MENSAJE_FECHA })
  desde!: string;

  @Matches(FECHA, { message: MENSAJE_FECHA })
  hasta!: string;
}

class FacturacionDto extends RangoDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  pagina?: number;

  @IsOptional()
  @IsString()
  @MaxLength(LIMITES.LARGO_MAXIMO_BUSQUEDA)
  q?: string;
}

class RankingDto extends RangoDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  cantidad?: number;
}

/**
 * Toda la clase detrás de ReportesGuard: los reportes muestran la facturación
 * entera del negocio. La guarda reportes-protegidos comprueba que siga así.
 */
@Controller('reportes')
@UseGuards(ReportesGuard)
export class ReportesController {
  constructor(private readonly reportes: ReportesService) {}

  @Get('facturacion')
  facturacion(@UsuarioActual() usuario: UsuarioSesion, @Query() c: FacturacionDto): Promise<RespuestaFacturacion> {
    return this.reportes.facturacion(usuario, c.desde, c.hasta, c.pagina ?? 1, c.q ?? '');
  }

  @Get('facturacion.csv')
  async facturacionCsv(@UsuarioActual() usuario: UsuarioSesion, @Query() c: RangoDto, @Res() res: Response): Promise<void> {
    enviar(res, await this.reportes.facturacionCsv(usuario, c.desde, c.hasta), 'text/csv; charset=utf-8', `facturacion-${c.desde}-${c.hasta}.csv`, true);
  }

  @Get('facturacion.pdf')
  async facturacionPdf(@UsuarioActual() usuario: UsuarioSesion, @Query() c: RangoDto, @Res() res: Response): Promise<void> {
    enviar(res, await this.reportes.facturacionPdf(usuario, c.desde, c.hasta), 'application/pdf', `facturacion-${c.desde}-${c.hasta}.pdf`, false);
  }

  @Get('ranking')
  ranking(@UsuarioActual() usuario: UsuarioSesion, @Query() c: RankingDto): Promise<RespuestaRanking> {
    return this.reportes.ranking(usuario, c.desde, c.hasta, c.cantidad ?? 0);
  }

  @Get('ranking.csv')
  async rankingCsv(@UsuarioActual() usuario: UsuarioSesion, @Query() c: RankingDto, @Res() res: Response): Promise<void> {
    enviar(res, await this.reportes.rankingCsv(usuario, c.desde, c.hasta, c.cantidad ?? 0), 'text/csv; charset=utf-8', `ranking-${c.desde}-${c.hasta}.csv`, true);
  }

  @Get('ranking.pdf')
  async rankingPdf(@UsuarioActual() usuario: UsuarioSesion, @Query() c: RankingDto, @Res() res: Response): Promise<void> {
    enviar(res, await this.reportes.rankingPdf(usuario, c.desde, c.hasta, c.cantidad ?? 0), 'application/pdf', `ranking-${c.desde}-${c.hasta}.pdf`, false);
  }
}

function enviar(res: Response, cuerpo: Buffer, tipo: string, nombre: string, descargar: boolean): void {
  res
    .status(200)
    .set({
      'Content-Type': tipo,
      'Content-Disposition': `${descargar ? 'attachment' : 'inline'}; filename="${nombre}"`,
      // Es la facturación del negocio: que no quede en ninguna caché intermedia.
      'Cache-Control': 'no-store',
    })
    .send(cuerpo);
}
