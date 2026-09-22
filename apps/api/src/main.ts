import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { leerConfiguracion } from './config/configuracion';

async function arrancar(): Promise<void> {
  // Se valida el entorno antes de levantar nada: un SQL_CLAVE vacío tiene que
  // frenar acá con un mensaje claro, no veinte minutos después.
  const config = leerConfiguracion();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  /*
    Sin esto, el freno del login bloquea el portal entero.

    Detrás de nginx todas las peticiones llegan desde 127.0.0.1, así que req.ip
    sería la misma para todos los usuarios: al quinto intento fallido de
    cualquiera, el login queda cerrado quince minutos para todo el mundo.

    Se confía sólo en loopback. Como el API no escucha en ninguna otra interfaz,
    la única fuente posible de X-Forwarded-For es nginx, y nadie puede
    falsificarla desde afuera.
  */
  app.set('trust proxy', 'loopback');

  app.use(helmet());
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // 127.0.0.1 en producción. nginx es el único camino hacia el API: si esto
  // escucha en 0.0.0.0, cualquiera en la red le habla directo y saltea el HTTPS,
  // el WAF y todo lo que nginx hace adelante.
  await app.listen(config.puerto, config.host);

  new Logger('arranque').log(
    `API escuchando en http://${config.host}:${config.puerto}/api`,
  );
}

void arrancar();
