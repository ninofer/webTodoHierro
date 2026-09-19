import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { UsuarioSesion } from '@todohierro/shared';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  get horasDeVida(): number {
    return Number(this.config.get<string>('JWT_HORAS') ?? 12);
  }

  firmar(usuario: UsuarioSesion): string {
    return this.jwt.sign(
      { sub: usuario.nick, nombre: usuario.nombre },
      { expiresIn: `${this.horasDeVida}h` },
    );
  }
}
