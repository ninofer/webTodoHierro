import PDFDocument from 'pdfkit';
import { formatearGuaranies } from '@todohierro/shared';
import type { FilaReporte } from './presupuesto.repositorio';

/**
 * El PDF del presupuesto, calcado de rpt_presupuestoNuevo (el ejemplo es
 * presupuestoEjemplo.pdf, que no se commitea porque tiene datos de un cliente).
 *
 * Los datos salen de sp_reporteFacturaPresupuestoNuevo, el mismo SP que usa el
 * reporte de Crystal. Lo que el reporte tiene escrito en el diseño —encabezado de
 * la empresa y leyenda— está escrito acá.
 *
 * Heredado del SP: los servicios vienen con cantidad 1 y subtotal = precio, sin
 * importar la cantidad cargada. El total sale de cabPresupuesto y es correcto.
 * Ver docs/13-presupuestos.md.
 */

const EMPRESA = {
  nombre: 'TODO HIERRO',
  lineas: ['Tel.Fax: 071 - 205 952', 'Cel: 0975 - 943 339', 'email: todohierroenc@gmail.com'],
};

const LEYENDA = ['Válido hasta el término de la jornada', 'de la presente fecha'];

const DOS_DECIMALES = new Intl.NumberFormat('es-PY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Columnas de la tabla: x inicial, ancho y alineación. */
const COLUMNAS = [
  { titulo: 'Cantidad', x: 30, ancho: 55, alinear: 'center' as const },
  { titulo: 'Mercadería', x: 85, ancho: 280, alinear: 'left' as const },
  { titulo: 'Peso', x: 365, ancho: 65, alinear: 'center' as const },
  { titulo: 'Precio', x: 430, ancho: 65, alinear: 'right' as const },
  { titulo: 'SubTotal', x: 495, ancho: 70, alinear: 'right' as const },
];

const ALTO_FILA = 14;
const ALTO_PAGINA_UTIL = 780;

export function armarPdfPresupuesto(idPresupuesto: number, total: number, filas: FilaReporte[]): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 30, info: { Title: `Presupuesto ${idPresupuesto}` } });
  const partes: Buffer[] = [];
  doc.on('data', (parte: Buffer) => partes.push(parte));
  const listo = new Promise<Buffer>((resolver) => doc.on('end', () => resolver(Buffer.concat(partes))));

  const cab = filas[0];

  // Encabezado de la empresa y título.
  doc.font('Times-Bold').fontSize(20).text(EMPRESA.nombre, 40, 35);
  doc.font('Helvetica-Oblique').fontSize(10);
  EMPRESA.lineas.forEach((linea, i) => doc.text(linea, 40, 62 + i * 14));
  doc.font('Helvetica-Bold').fontSize(18).text('PRESUPUESTO', 250, 95, { underline: true });

  // Datos del presupuesto.
  let y = 135;
  doc.font('Helvetica').fontSize(8).text(cab?.fecha ?? '', 45, y);
  y += 14;
  etiqueta(doc, 'Cliente:', cab?.cliente ?? '', 45, y, 240);
  etiqueta(doc, 'RUC:', cab?.ruc ?? '', 290, y, 90);
  etiqueta(doc, 'Suc.:', cab?.sucursal ?? '', 385, y - 10, 100);
  etiqueta(doc, 'Vendedor:', cab?.vendedor ?? '', 385, y + 2, 100);
  y += 14;
  etiqueta(doc, 'Dirección:', cab?.direccion ?? '', 45, y, 240);
  etiqueta(doc, 'Teléfono:', cab?.telefono ?? '', 290, y, 90);
  etiqueta(doc, 'Forma Pago:', cab?.formaPago ?? '', 385, y, 100);

  doc.font('Helvetica-Bold').fontSize(9).text('Nº PRESUPUESTO', 490, 140, { width: 80, align: 'center' });
  doc.rect(495, 152, 70, 16).stroke();
  doc.text(formatearGuaranies(idPresupuesto), 495, 157, { width: 70, align: 'center' });

  // Tabla.
  y = 195;
  y = encabezadoTabla(doc, y);
  doc.font('Helvetica').fontSize(8);

  let pesoTotal = 0;
  for (const fila of filas) {
    if (y + ALTO_FILA > ALTO_PAGINA_UTIL) {
      doc.addPage();
      y = encabezadoTabla(doc, 40);
      doc.font('Helvetica').fontSize(8);
    }
    pesoTotal += fila.peso;
    const valores = [
      DOS_DECIMALES.format(fila.cantidad),
      fila.mercaderia,
      fila.peso > 0 ? DOS_DECIMALES.format(fila.peso) : '',
      formatearGuaranies(fila.precio),
      formatearGuaranies(fila.subtotal),
    ];
    COLUMNAS.forEach((c, i) => {
      doc.rect(c.x, y, c.ancho, ALTO_FILA).stroke();
      doc.text(recortar(doc, valores[i] ?? '', c.ancho - 6), c.x + 3, y + 4, { width: c.ancho - 6, align: c.alinear, lineBreak: false });
    });
    y += ALTO_FILA;
  }

  // Pie.
  y += 8;
  doc.font('Helvetica-Bold').fontSize(7).text('Peso Total Aprox.:', 30, y + 3);
  doc.fontSize(8).text(DOS_DECIMALES.format(pesoTotal), 100, y + 3);
  doc.fontSize(11).text('Total:', 430, y + 1);
  doc.rect(475, y - 2, 90, 16).fillAndStroke('#d9d9d9', '#000000');
  doc.fillColor('#000000').fontSize(9).text(formatearGuaranies(total), 475, y + 2, { width: 86, align: 'right' });

  y += 26;
  doc.fontSize(8);
  LEYENDA.forEach((linea, i) => doc.text(linea, 30, y + i * 10));

  doc.end();
  return listo;
}

function etiqueta(doc: PDFKit.PDFDocument, titulo: string, valor: string, x: number, y: number, ancho: number): void {
  doc.font('Helvetica-Bold').fontSize(7).text(titulo, x, y, { lineBreak: false });
  const anchoTitulo = doc.widthOfString(titulo) + 4;
  doc.font('Helvetica').fontSize(7.5);
  doc.text(recortar(doc, valor, ancho - anchoTitulo), x + anchoTitulo, y, { lineBreak: false });
}

/**
 * Recorta el texto al ancho disponible. `ellipsis` de pdfkit parte en palabras y
 * la segunda línea se monta sobre el renglón de abajo; en una ficha de datos es
 * preferible perder el final de un nombre largo.
 */
function recortar(doc: PDFKit.PDFDocument, valor: string, ancho: number): string {
  if (doc.widthOfString(valor) <= ancho) return valor;
  let corto = valor;
  while (corto.length > 0 && doc.widthOfString(corto + '…') > ancho) corto = corto.slice(0, -1);
  return corto + '…';
}

function encabezadoTabla(doc: PDFKit.PDFDocument, y: number): number {
  doc.font('Helvetica-Bold').fontSize(8.5);
  for (const c of COLUMNAS) {
    doc.rect(c.x, y, c.ancho, 18).stroke();
    doc.text(c.titulo, c.x, y + 5, { width: c.ancho, align: 'center' });
  }
  return y + 18;
}
