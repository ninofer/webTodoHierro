import { Module } from '@nestjs/common';
import { CatalogoController } from './catalogo.controller';
import { CatalogoRepositorio } from './catalogo.repositorio';
import { CatalogoService } from './catalogo.service';

@Module({
  controllers: [CatalogoController],
  providers: [CatalogoRepositorio, CatalogoService],
  exports: [CatalogoService],
})
export class CatalogoModule {}
