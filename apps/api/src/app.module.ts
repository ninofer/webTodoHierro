import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { JwtGuard } from './auth/jwt.guard';
import { CatalogoModule } from './catalogo/catalogo.module';
import { SaludModule } from './salud/salud.module';
import { SqlModule } from './sql/sql.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // El .env vive en la raíz del monorepo, no en apps/api: es el mismo
      // archivo que lee pm2, cuyo cwd es la raíz.
      envFilePath: ['../../.env', '.env'],
    }),
    ScheduleModule.forRoot(),
    SqlModule,
    AuthModule,
    CatalogoModule,
    SaludModule,
  ],
  providers: [
    // Guard global: todo pide sesión salvo lo marcado con @Publico().
    { provide: APP_GUARD, useClass: JwtGuard },
  ],
})
export class AppModule {}
