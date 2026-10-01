import { Injectable } from '@nestjs/common';
import * as sql from 'mssql';
import { SqlService } from '../sql/sql.service';

/**
 * Quién está habilitado para usar la web, según el sistema del cliente.
 *
 * La tabla `usuarioWeb` la administra el escritorio. Tener clave en el padrón de
 * la web no alcanza: si en el sistema le sacan la habilitación a alguien, deja de
 * poder operar acá sin que haya que tocar pc-servicios.
 */
export const SQL_HABILITADO = `
  SELECT COUNT(*) AS cantidad
  FROM dbo.usuarioWeb
  WHERE idUsuario = @idUsuario`;

@Injectable()
export class HabilitacionRepositorio {
  constructor(private readonly sql: SqlService) {}

  async estaEnUsuarioWeb(idUsuario: number): Promise<boolean> {
    const resultado = await this.sql
      .peticion()
      .input('idUsuario', sql.Int, idUsuario)
      .query<{ cantidad: number }>(SQL_HABILITADO);
    return (resultado.recordset[0]?.cantidad ?? 0) > 0;
  }
}
