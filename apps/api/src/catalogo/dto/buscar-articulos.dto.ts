import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { LIMITES, normalizarPagina, normalizarTamano } from '@todohierro/shared';

/**
 * Lo que puede llegar por querystring a la búsqueda de artículos.
 *
 * El ValidationPipe global está en modo `forbidNonWhitelisted`: cualquier
 * parámetro que no esté acá hace fallar la petición con 400. Es deliberado —
 * un parámetro con un typo que se ignora en silencio es una búsqueda que
 * devuelve otra cosa sin avisar.
 */
export class BuscarArticulosDto {
  @IsOptional()
  @IsString()
  @MaxLength(LIMITES.LARGO_MAXIMO_BUSQUEDA)
  q?: string;

  @IsOptional()
  @Transform(({ value }) => normalizarPagina(value))
  @IsInt()
  @Min(1)
  pagina?: number;

  @IsOptional()
  @Transform(({ value }) => normalizarTamano(value))
  @IsInt()
  @Min(1)
  tamano?: number;
}
