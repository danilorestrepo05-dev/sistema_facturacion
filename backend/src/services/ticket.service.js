// src/services/ticket.service.js
// Genera el buffer de texto plano optimizado para impresoras térmicas POS (58mm/80mm).
// Usa comandos ESC/POS básicos (inicialización y alimentación) que la mayoría
// de impresoras térmicas aceptan, y alineación por espacios para compatibilidad.
const empresa = require('../utils/empresa');

// Cantidad de caracteres por línea según el ancho del papel.
const ANCHOS = { 58: 32, 80: 48 };

const formatearMoneda = (valor) => `$ ${Number(valor || 0).toLocaleString('es-CO')}`;

// Divide un texto en líneas que no superen el ancho disponible.
const ajustarTexto = (texto, ancho) => {
  const palabras = String(texto).split(' ');
  const lineas = [];
  let actual = '';

  for (const palabra of palabras) {
    if ((actual + ' ' + palabra).trim().length > ancho) {
      if (actual) lineas.push(actual.trim());
      actual = palabra;
    } else {
      actual = `${actual} ${palabra}`.trim();
    }
  }
  if (actual) lineas.push(actual.trim());
  return lineas.length ? lineas : [''];
};

// Centra un texto agregando espacios a ambos lados.
const centrar = (texto, ancho) => {
  const sobrante = Math.max(0, ancho - texto.length);
  const izquierda = Math.floor(sobrante / 2);
  return ' '.repeat(izquierda) + texto + ' '.repeat(sobrante - izquierda);
};

// Alinea a la derecha agregando espacios a la izquierda.
const alinearDerecha = (texto, ancho) =>
  ' '.repeat(Math.max(0, ancho - texto.length)) + texto;

// Genera el buffer del ticket en texto plano UTF-8.
const generarTicket = (factura, { ancho = '80' } = {}) => {
  const chars = ANCHOS[ancho] || 48;

  const lineas = [];

  // Encabezado
  lineas.push(centrar(empresa.nombre.toUpperCase(), chars));
  lineas.push(centrar(empresa.documento, chars));
  lineas.push(centrar(`${empresa.ciudad} - Tel: ${empresa.telefono}`, chars));
  lineas.push(centrar('*'.repeat(chars), chars));

  lineas.push(centrar(`FACTURA No. ${factura.prefijo || ''}${factura.numero_factura}`, chars));
  lineas.push(centrar(`Fecha: ${factura.creado_en}`, chars));
  lineas.push(centrar(`Cliente: ${factura.cliente_nombre || 'Consumidor Final'}`, chars));
  lineas.push(centrar(`Vendedor: ${factura.usuario_nombre || ''}`, chars));
  lineas.push(centrar(`Pago: ${factura.tipo_pago}`, chars));
  lineas.push('-'.repeat(chars));

  // Detalle
  factura.detalles.forEach((detalle) => {
    const nombreLineas = ajustarTexto(detalle.producto_nombre, chars);
    nombreLineas.forEach((linea, idx) => {
      lineas.push(idx === 0 ? `${detalle.cantidad} x ${linea}` : `    ${linea}`);
    });
    lineas.push(
      `    ${formatearMoneda(detalle.precio_unitario)} c/u  IVA ${detalle.impuesto_porcentaje}%`
    );
    lineas.push(alinearDerecha(`Subtotal: ${formatearMoneda(detalle.subtotal)}`, chars));
    lineas.push(' '.repeat(chars));
  });

  lineas.push('-'.repeat(chars));
  lineas.push(`Subtotal: ${formatearMoneda(factura.subtotal)}`);
  lineas.push(`Impuestos: ${formatearMoneda(factura.impuesto_total)}`);
  if (Number(factura.descuento) > 0) {
    lineas.push(`Descuento: - ${formatearMoneda(factura.descuento)}`);
  }
  lineas.push(centrar(`TOTAL: ${formatearMoneda(factura.total)}`, chars));
  lineas.push('*'.repeat(chars));
  lineas.push(centrar('¡Gracias por su compra!', chars));
  lineas.push('');

  // Comando ESC/POS: inicializa la impresora + 3 avances de línea al final.
  const texto = lineas.join('\r\n');
  const comandoInicio = Buffer.from([0x1b, 0x40]); // ESC @
  const comandoFin = Buffer.from([0x0a, 0x0a, 0x0a, 0x0a]); // avance de papel

  return Buffer.concat([
    comandoInicio,
    Buffer.from(`${texto}\r\n`, 'utf8'),
    comandoFin
  ]);
};

module.exports = { generarTicket };
