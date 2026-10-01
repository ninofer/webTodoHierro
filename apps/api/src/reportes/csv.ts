/**
 * CSV como lo exporta el escritorio (ExportarACsv de frmReporteRankingVentaCliente):
 * separador punto y coma, cada campo entre comillas, UTF-8.
 *
 * Se agrega el BOM al principio: sin él, Excel en Windows abre el archivo como
 * ANSI y «PEÑA» sale «PEÃ‘A». Los montos van como número sin separador de miles,
 * para que Excel los sume; el escritorio los exporta como texto formateado.
 */
export function aCsv(encabezados: string[], filas: Array<Array<string | number | null>>): Buffer {
  const campo = (v: string | number | null) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const lineas = [encabezados, ...filas].map((f) => f.map(campo).join(';'));
  return Buffer.from('﻿' + lineas.join('\r\n') + '\r\n', 'utf8');
}
