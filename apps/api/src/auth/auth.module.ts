import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { FrenoLoginService } from './freno-login.service';
import { JwtStrategy } from './jwt.strategy';
import { UsuariosService } from './usuarios.service';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRETO'),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [UsuariosService, AuthService, FrenoLoginService, JwtStrategy],
  exports: [UsuariosService],
})
export class AuthModule {}
