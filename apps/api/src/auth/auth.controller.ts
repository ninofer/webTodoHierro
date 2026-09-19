import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { UsuarioSesion } from '@todohierro/shared';
import { AuthService } from './auth.service';
import { FrenoLoginService } from './freno-login.service';
import { COOKIE_SESION } from './jwt.strategy';
import { LoginDto } from './dto/login.dto';
import { Publico } from './publico.decorador';
import { UsuariosService } from './usuarios.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly usuarios: UsuariosService,
    private readonly auth: AuthService,
    private readonly freno: FrenoLoginService,
  ) {}

  @Publico()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() datos: LoginDto,
    @Ip() ip: string,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<{ usuario: UsuarioSesion }> {
    if (this.freno.frenado(ip)) {
      throw new UnauthorizedException(
        `Demasiados intentos fallidos. Esperá ${this.freno.minutosDeEspera} minutos e intentá de nuevo.`,
      );
    }

    const usuario = await this.usuarios.verificar(datos.nick, datos.clave);
    if (!usuario) {
      this.freno.registrarFallo(ip);
      // Un solo mensaje para nick inexistente y clave incorrecta: distinguirlos
      // le dice a quien prueba cuáles usuarios existen.
      throw new UnauthorizedException('Usuario o contraseña incorrectos.');
    }

    this.freno.limpiar(ip);

    respuesta.cookie(COOKIE_SESION, this.auth.firmar(usuario), {
      httpOnly: true,
      sameSite: 'lax',
      // En producción el portal va por HTTPS detrás de IIS. En desarrollo, sobre
      // http://127.0.0.1, una cookie `secure` no se guardaría.
      secure: process.env['NODE_ENV'] === 'production',
      path: '/',
      maxAge: this.auth.horasDeVida * 3600 * 1000,
    });

    return { usuario };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) respuesta: Response): { ok: true } {
    respuesta.clearCookie(COOKIE_SESION, { path: '/' });
    return { ok: true };
  }

  /** Quién soy. La pantalla la usa al cargar para saber si hay sesión viva. */
  @Get('yo')
  yo(@Req() peticion: Request): UsuarioSesion {
    return peticion.user as UsuarioSesion;
  }
}
