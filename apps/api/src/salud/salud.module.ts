import { Module } from '@nestjs/common';
import { CatalogoModule } from '../catalogo/catalogo.module';
import { SaludController } from './salud.controller';

@Module({
  imports: [CatalogoModule],
  controllers: [SaludController],
})
export class SaludModule {}
