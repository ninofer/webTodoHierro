import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReportesController } from './reportes.controller';
import { ReportesRepositorio } from './reportes.repositorio';
import { ReportesService } from './reportes.service';

@Module({
  imports: [AuthModule],
  controllers: [ReportesController],
  providers: [ReportesRepositorio, ReportesService],
})
export class ReportesModule {}
