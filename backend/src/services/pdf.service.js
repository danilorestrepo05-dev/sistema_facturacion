// src/services/pdf.service.js
// Genera el PDF de una factura en formato Carta o Media Carta usando PDFKit.
const PDFDocument = require('pdfkit');
const empresa = require('../utils/empresa');

// Dimensiones de página en puntos (1 punto = 1/72 pulgada).
const FORMATOS = {
  carta: [612, 792],
  media_carta: [612, 396]
};

// Formatea un número como moneda, p. ej. $ 52.000
const formatearMoneda = (valor) => `$ ${Number(valor || 0).toLocaleString('es-CO')}`;

// Convierte 'YYYY-MM-DD HH:mm:ss' a 'DD/MM/YYYY HH:mm'
const formatearFecha = (fechaSql) => {
  const [fecha, hora] = String(fechaSql || '').split(' ');
  const [a, m, d] = (fecha || '').split('-');
  return `${d}/${m}/${a} ${hora || ''}`;
};

// Genera el buffer del PDF de una factura.
// factura debe incluir: numero_factura, prefijo, cliente_nombre, usuario_nombre,
// tipo_pago, subtotal, impuesto_total, descuento, total, creado_en y detalles[].
const generarFacturaPDF = (factura, { formato = 'carta' } = {}) =>
  new Promise((resolve, reject) => {
    const size = FORMATOS[formato] || FORMATOS.carta;
    const esMedia = formato === 'media_carta';

    const doc = new PDFDocument({ size, margin: 32 });

    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const tTitulo = esMedia ? 12 : 16;
    const tNormal = esMedia ? 8 : 10;
    const tPequena = esMedia ? 7 : 8.5;
    const altoLinea = esMedia ? 10 : 14;
    const margen = 32;
    const ancho = size[0] - (margen * 2);

    // --- Encabezado con los datos de la empresa ---
    let y = margen;
    doc.font('Helvetica-Bold').fontSize(tTitulo).fillColor('#222222')
      .text(empresa.nombre, margen, y, { align: 'center', width: ancho });
    y += esMedia ? 14 : 24;

    doc.font('Helvetica').fontSize(tNormal).fillColor('#444444');
    [empresa.documento, empresa.direccion, `${empresa.ciudad} - Tel: ${empresa.telefono}`, empresa.email]
      .filter(Boolean)
      .forEach((linea) => {
        doc.text(linea, margen, y, { align: 'center', width: ancho });
        y += esMedia ? 9 : 13;
      });

    // --- Identificación de la factura ---
    y += esMedia ? 6 : 12;
    doc.moveTo(margen, y).lineTo(size[0] - margen, y).strokeColor('#cccccc').stroke();
    y += esMedia ? 8 : 12;

    doc.font('Helvetica-Bold').fillColor('#222222').fontSize(tNormal)
      .text(`FACTURA No. ${factura.prefijo || ''}${factura.numero_factura}`, margen, y);
    doc.font('Helvetica').fillColor('#555555')
      .text(`Fecha: ${formatearFecha(factura.creado_en)}`, margen, y, { align: 'right', width: ancho });
    y += altoLinea;

    doc.text(`Cliente: ${factura.cliente_nombre || 'Consumidor Final'}`, margen, y);
    doc.text(`Vendedor: ${factura.usuario_nombre || ''}`, margen, y, { align: 'right', width: ancho });
    y += altoLinea;

    doc.text(`Pago: ${factura.tipo_pago}`, margen, y);
    y += esMedia ? 6 : 10;

    // --- Tabla de detalle ---
    const colCant = 32;
    const colVlr = 82;
    const colImp = 40;
    const colTotal = 90;
    const colProd = ancho - colCant - colVlr - colImp - colTotal;

    const xCant = margen;
    const xProd = xCant + colCant;
    const xVlr = xProd + colProd;
    const xImp = xVlr + colVlr;
    const xTotal = xImp + colImp;

    doc.font('Helvetica-Bold').fontSize(tNormal).fillColor('#222222');
    doc.text('Cant', xCant, y, { width: colCant });
    doc.text('Producto', xProd, y, { width: colProd });
    doc.text('Vlr.Unit', xVlr, y, { width: colVlr, align: 'right' });
    doc.text('Imp', xImp, y, { width: colImp, align: 'right' });
    doc.text('Total', xTotal, y, { width: colTotal, align: 'right' });
    y += altoLinea;

    doc.moveTo(margen, y).lineTo(size[0] - margen, y).strokeColor('#cccccc').stroke();
    y += esMedia ? 4 : 6;

    // Filas del detalle (el nombre del producto se envuelve si es largo).
    doc.font('Helvetica').fontSize(tNormal).fillColor('#333333');
    factura.detalles.forEach((detalle) => {
      const cantidad = String(detalle.cantidad);
      const totalLinea = formatearMoneda(detalle.subtotal);
      const vlrUnit = formatearMoneda(detalle.precio_unitario);
      const impPorc = `${detalle.impuesto_porcentaje}%`;

      const envuelto = doc.heightOfString(detalle.producto_nombre, { width: colProd });
      const altoFila = Math.max(altoLinea, envuelto + (esMedia ? 2 : 4));

      doc.text(cantidad, xCant, y, { width: colCant });
      doc.text(detalle.producto_nombre, xProd, y, { width: colProd });
      doc.text(vlrUnit, xVlr, y, { width: colVlr, align: 'right' });
      doc.text(impPorc, xImp, y, { width: colImp, align: 'right' });
      doc.text(totalLinea, xTotal, y, { width: colTotal, align: 'right' });

      y += altoFila;
    });

    // --- Totales ---
    y += esMedia ? 4 : 6;
    const escribirTotal = (etiqueta, valor) => {
      doc.font('Helvetica').fontSize(tNormal).fillColor('#333333')
        .text(etiqueta, margen, y);
      doc.text(valor, margen, y, { align: 'right', width: ancho });
      y += altoLinea;
    };

    escribirTotal('Subtotal', formatearMoneda(factura.subtotal));
    escribirTotal('Impuestos', formatearMoneda(factura.impuesto_total));
    if (Number(factura.descuento) > 0) {
      escribirTotal('Descuento', `- ${formatearMoneda(factura.descuento)}`);
    }

    doc.moveTo(margen, y).lineTo(size[0] - margen, y).strokeColor('#888888').stroke();
    y += esMedia ? 6 : 10;

    doc.font('Helvetica-Bold').fontSize(esMedia ? 11 : 14).fillColor('#222222')
      .text('TOTAL', margen, y);
    doc.text(formatearMoneda(factura.total), margen, y, { align: 'right', width: ancho });
    y += esMedia ? 14 : 24;

    // --- Pie de página ---
    doc.font('Helvetica').fontSize(tPequena).fillColor('#777777')
      .text('¡Gracias por su compra!', margen, y, { align: 'center', width: ancho });

    doc.end();
  });

module.exports = { generarFacturaPDF };
