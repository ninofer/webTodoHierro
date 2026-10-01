import PDFDocument from 'pdfkit';
import {
  fechaLocal,
  formatearGuaranies,
  type FacturaResumen,
  type ResumenFacturacion,
  type RespuestaRanking,
} from '@todohierro/shared';

/**
 * Los PDF de los reportes, con el encabezado de los reportes del escritorio
 * (empresa, título, Desde / Hasta) y una tabla que se parte en páginas repitiendo
 * los títulos de las columnas.
 */

interface Columna {
  titulo: string;
  ancho: number;
  alinear?: 'left' | 'right' | 'center';
}

const MARGEN = 30;
const ALTO_FILA = 14;
const FIN_PAGINA = 800;

function nuevoDocumento(titulo: string): { doc: PDFKit.PDFDocument; listo: Promise<Buffer> } {
  const doc = new PDFDocument({ size: 'A4', margin: MARGEN, bufferPages: true, info: { Title: titulo } });
  const partes: Buffer[] = [];
  doc.on('data', (p: Buffer) => partes.push(p));
  const listo = new Promise<Buffer>((resolver) => doc.on('end', () => resolver(Buffer.concat(partes))));
  return { doc, listo };
}

function encabezado(doc: PDFKit.PDFDocument, titulo: string, desde: string, hasta: string): number {
  doc.font('Times-Bold').fontSize(16).text('TODO HIERRO', MARGEN, 30);
  doc.font('Helvetica-Bold').fontSize(13).text(titulo, MARGEN, 55, { width: 535, align: 'center', underline: true });
  doc.font('Helvetica').fontSize(9).text(`Desde: ${fechaLocal(desde)}     Hasta: ${fechaLocal(hasta)}`, MARGEN, 76, {
    width: 535,
    align: 'center',
  });
  return 98;
}

function recortar(doc: PDFKit.PDFDocument, valor: string, ancho: number): string {
  if (doc.widthOfString(valor) <= ancho) return valor;
  let corto = valor;
  while (corto.length > 0 && doc.widthOfString(corto + '…') > ancho) corto = corto.slice(0, -1);
  return corto + '…';
}

function tituloColumnas(doc: PDFKit.PDFDocument, columnas: Columna[], y: number): number {
  doc.font('Helvetica-Bold').fontSize(8);
  let x = MARGEN;
  for (const c of columnas) {
    doc.rect(x, y, c.ancho, 16).stroke();
    doc.text(c.titulo, x, y + 4, { width: c.ancho, align: 'center' });
    x += c.ancho;
  }
  return y + 16;
}

/** Dibuja la tabla desde `y`; devuelve dónde terminó. */
function tabla(doc: PDFKit.PDFDocument, columnas: Columna[], filas: string[][], y: number): number {
  y = tituloColumnas(doc, columnas, y);
  for (const fila of filas) {
    if (y + ALTO_FILA > FIN_PAGINA) {
      doc.addPage();
      y = tituloColumnas(doc, columnas, MARGEN);
    }
    doc.font('Helvetica').fontSize(7.5);
    let x = MARGEN;
    columnas.forEach((c, i) => {
      doc.rect(x, y, c.ancho, ALTO_FILA).stroke();
      doc.text(recortar(doc, fila[i] ?? '', c.ancho - 6), x + 3, y + 4, {
        width: c.ancho - 6,
        align: c.alinear ?? 'left',
        lineBreak: false,
      });
      x += c.ancho;
    });
    y += ALTO_FILA;
  }
  return y;
}

function pieDePagina(doc: PDFKit.PDFDocument): void {
  const rango = doc.bufferedPageRange();
  for (let i = 0; i < rango.count; i++) {
    doc.switchToPage(rango.start + i);
    // El pie cae debajo del margen inferior: sin esto pdfkit abre una página
    // nueva por cada pie, y el PDF sale con una hoja en blanco por página.
    doc.page.margins.bottom = 0;
    doc.font('Helvetica-Oblique').fontSize(7).text(`Pág. ${i + 1} de ${rango.count}`, MARGEN, 815, {
      width: 535,
      align: 'right',
      lineBreak: false,
    });
  }
}

function lineaTotal(doc: PDFKit.PDFDocument, rotulo: string, valor: string, y: number): number {
  if (y + 22 > FIN_PAGINA) {
    doc.addPage();
    y = MARGEN;
  }
  doc.font('Helvetica-Bold').fontSize(10).text(rotulo, MARGEN + 280, y + 6, { width: 140, align: 'right' });
  doc.text(valor, MARGEN + 425, y + 6, { width: 110, align: 'right' });
  return y + 22;
}

export function pdfRanking(r: RespuestaRanking): Promise<Buffer> {
  const { doc, listo } = nuevoDocumento('Ranking de ventas');
  let y = encabezado(doc, 'RANKING DE VENTAS', r.desde, r.hasta);
  doc.font('Helvetica').fontSize(8).text(r.cantidad === 0 ? 'Todos los clientes' : `Los primeros ${r.cantidad}`, MARGEN, y);
  y += 14;
  y = tabla(
    doc,
    [
      { titulo: 'Nro.', ancho: 35, alinear: 'center' },
      { titulo: 'Id Cliente', ancho: 55, alinear: 'center' },
      { titulo: 'RUC', ancho: 75, alinear: 'center' },
      { titulo: 'Cliente', ancho: 200 },
      { titulo: 'Teléfono', ancho: 80 },
      { titulo: 'Total', ancho: 90, alinear: 'right' },
    ],
    r.filas.map((f) => [String(f.nro), String(f.idCliente), f.ruc, f.cliente, f.telefono, formatearGuaranies(f.total)]),
    y,
  );
  lineaTotal(doc, 'TOTAL', formatearGuaranies(r.total), y);
  pieDePagina(doc);
  doc.end();
  return listo;
}

export function pdfFacturacion(
  desde: string,
  hasta: string,
  resumen: ResumenFacturacion,
  facturas: FacturaResumen[],
): Promise<Buffer> {
  const { doc, listo } = nuevoDocumento('Facturación total');
  let y = encabezado(doc, 'REPORTE DE FACTURACION TOTAL', desde, hasta);

  // Primero el resumen por rubro, que en el escritorio está recién al final.
  y = tabla(
    doc,
    [
      { titulo: 'Rubro', ancho: 250 },
      { titulo: '%', ancho: 60, alinear: 'right' },
      { titulo: 'Total', ancho: 110, alinear: 'right' },
    ],
    resumen.porRubro.map((x) => [x.rotulo, x.porcentaje.toFixed(1).replace('.', ',') + ' %', formatearGuaranies(x.total)]),
    y,
  );
  y = lineaTotal(doc, 'TOTAL VENTA', formatearGuaranies(resumen.total), y);
  doc.font('Helvetica').fontSize(8).text(
    `${resumen.cantidadFacturas} facturas · ticket promedio Gs ${formatearGuaranies(resumen.ticketPromedio)} · ${resumen.cantidadClientes} clientes`,
    MARGEN,
    y,
  );
  y += 20;

  tabla(
    doc,
    [
      { titulo: 'Nro', ancho: 35, alinear: 'center' },
      { titulo: 'Fecha', ancho: 55, alinear: 'center' },
      { titulo: 'Factura', ancho: 80, alinear: 'center' },
      { titulo: 'Cliente', ancho: 200 },
      { titulo: 'RUC', ancho: 75, alinear: 'center' },
      { titulo: 'Total', ancho: 90, alinear: 'right' },
    ],
    facturas.map((f, i) => [String(i + 1), fechaLocal(f.fecha), f.factura, f.cliente, f.ruc, formatearGuaranies(f.total)]),
    y,
  );
  pieDePagina(doc);
  doc.end();
  return listo;
}
