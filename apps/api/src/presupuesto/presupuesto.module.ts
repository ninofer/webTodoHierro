import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CatalogoModule } from '../catalogo/catalogo.module';
import { PresupuestoController } from './presupuesto.controller';
import { PresupuestoRepositorio } from './presupuesto.repositorio';
import { PresupuestoService } from './presupuesto.service';

@Module({
  imports: [AuthModule, CatalogoModule],
  controllers: [PresupuestoController],
  providers: [PresupuestoRepositorio, PresupuestoService],
})
export class PresupuestoModule {}
