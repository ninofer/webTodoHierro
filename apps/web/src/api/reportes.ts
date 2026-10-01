import type { RespuestaFacturacion, RespuestaRanking } from '@todohierro/shared';
import { pedir } from './cliente';

function consulta(parametros: Record<string, string | number>): string {
  return new URLSearchParams(Object.entries(parametros).map(([k, v]) => [k, String(v)])).toString();
}

export const leerFacturacion = (desde: string, hasta: string, pagina: number, q: string) =>
  pedir<RespuestaFacturacion>(
    '/reportes/facturacion?' + consulta(q.trim() === '' ? { desde, hasta, pagina } : { desde, hasta, pagina, q: q.trim() }),
  );

export const leerRanking = (desde: string, hasta: string, cantidad: number) =>
  pedir<RespuestaRanking>('/reportes/ranking?' + consulta({ desde, hasta, cantidad }));

/** Las descargas van por enlace: el navegador manda la cookie de sesión solo. */
export const urlFacturacion = (formato: 'csv' | 'pdf', desde: string, hasta: string) =>
  `/api/reportes/facturacion.${formato}?` + consulta({ desde, hasta });

export const urlRanking = (formato: 'csv' | 'pdf', desde: string, hasta: string, cantidad: number) =>
  `/api/reportes/ranking.${formato}?` + consulta({ desde, hasta, cantidad });
