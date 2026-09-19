/**
 * Lectura y validación del entorno.
 *
 * Se valida al arrancar y no cuando se usa: un `SQL_CLAVE` vacío tiene que
 * frenar el proceso con un mensaje claro, no aparecer veinte minutos después
 * como «login failed» en medio de una consulta.
 */

export interface Configuracion {
  host: string;
  puerto: number;
  sql: {
    host: string;
    puerto: number;
    base: string;
    usuario: string;
    clave: string;
  };
  jwt: {
    secreto: string;
    horas: number;
  };
  cacheRefrescoMs: number;
  usuariosArchivo: string;
}

const LARGO_MINIMO_SECRETO = 32;

function obligatoria(nombre: string): string {
  const valor = process.env[nombre];
  if (valor === undefined || valor.trim() === '') {
    throw new Error(
      `Falta la variable de entorno ${nombre}. ` +
        `Copiá apps/api/.env.ejemplo a .env en la raíz del proyecto y completala.`,
    );
  }
  return valor.trim();
}

function numero(nombre: string, porDefecto: number): number {
  const crudo = process.env[nombre];
  if (crudo === undefined || crudo.trim() === '') return porDefecto;
  const valor = Number(crudo);
  if (!Number.isFinite(valor) || valor <= 0) {
    throw new Error(
      `La variable ${nombre} tiene el valor "${crudo}", que no es un número positivo. ` +
        `Poné un número o borrá la línea para usar ${porDefecto}.`,
    );
  }
  return valor;
}

export function leerConfiguracion(): Configuracion {
  const secreto = obligatoria('JWT_SECRETO');
  if (secreto.length < LARGO_MINIMO_SECRETO) {
    throw new Error(
      `JWT_SECRETO tiene ${secreto.length} caracteres y necesita al menos ${LARGO_MINIMO_SECRETO}. ` +
        `Generá uno nuevo y reiniciá con: pm2 restart todohierro-api --update-env`,
    );
  }

  const host = process.env['API_HOST']?.trim() || '127.0.0.1';

  return {
    host,
    puerto: numero('API_PUERTO', 3001),
    sql: {
      host: obligatoria('SQL_HOST'),
      puerto: numero('SQL_PUERTO', 1433),
      base: obligatoria('SQL_BASE'),
      usuario: obligatoria('SQL_USUARIO'),
      clave: obligatoria('SQL_CLAVE'),
    },
    jwt: {
      secreto,
      horas: numero('JWT_HORAS', 12),
    },
    cacheRefrescoMs: numero('CACHE_REFRESCO_MS', 120000),
    usuariosArchivo: obligatoria('USUARIOS_ARCHIVO'),
  };
}
