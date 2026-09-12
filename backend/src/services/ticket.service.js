// src/services/ticket.service.js
// Genera el buffer de texto plano optimizado para impresoras térmicas POS (58mm/80mm).
// Usa comandos ESC/POS básicos (inicialización y alimentación) que la mayoría
// de impresoras térmicas aceptan, y alineación por espacios para compatibilidad.
const empresa = require('../utils/empresa');

// Cantidad de caracteres por línea según el ancho del papel.
const ANCHOS = { 58: 32, 80: 48 };

const formatearMoneda = (valor) => `$ ${Number(valor || 0).toLocaleString('es-CO')}`;

// Divide un texto en líneas que no superen el ancho disponible. Las palabras
// más largas que el ancho (CUFE, enlaces, etc.) se parten por caracteres para
// que ninguna línea desborde la tira de texto de la térmica.
const ajustarTexto = (texto, ancho) => {
  const palabras = String(texto).split(' ');
  const lineas = [];
  let actual = '';

  const nuevaLinea = () => {
    if (actual.trim()) lineas.push(actual.trim());
    actual = '';
  };

  for (let palabra of palabras) {
    // Partir palabras que superan el ancho en fragmentos de 'ancho' caracteres.
    while (palabra.length > ancho) {
      nuevaLinea();
      lineas.push(palabra.slice(0, ancho));
      palabra = palabra.slice(ancho);
    }
    if (!palabra) continue; // huecos por espacios dobles
    const candidata = actual ? `${actual} ${palabra}` : palabra;
    if (candidata.length > ancho) {
      nuevaLinea();
      actual = palabra;
    } else {
      actual = candidata;
    }
  }
  nuevaLinea();
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

// Igual que centrar pero para textos que pueden ocupar varias líneas: se
// parten con ajustarTexto y cada línea resultante se centra. Evita que un
// mensaje largo (p. ej. el enlace de validación de la DIAN) desborde la tira.
const centrarTexto = (texto, ancho) =>
  ajustarTexto(texto, ancho).map((linea) => centrar(linea, ancho));

// Genera el buffer del ticket en texto plano UTF-8.
const generarTicket = (factura, { ancho = '80' } = {}) => {
  const chars = ANCHOS[ancho] || 48;

  const lineas = [];

  // Encabezado (los datos dinámicos se envuelven para no desbordar la tira)
  lineas.push(...centrarTexto(empresa.nombre.toUpperCase(), chars));
  lineas.push(...centrarTexto(empresa.documento, chars));
  lineas.push(...centrarTexto(`${empresa.ciudad} - Tel: ${empresa.telefono}`, chars));
  lineas.push(centrar('*'.repeat(chars), chars));

  lineas.push(...centrarTexto(`FACTURA No. ${factura.prefijo || ''}${factura.numero_factura}`, chars));
  lineas.push(...centrarTexto(`Fecha: ${factura.creado_en}`, chars));
  lineas.push(...centrarTexto(`Cliente: ${factura.cliente_nombre || 'Consumidor Final'}`, chars));
  lineas.push(...centrarTexto(`Vendedor: ${factura.usuario_nombre || ''}`, chars));
  lineas.push(...centrarTexto(`Pago: ${factura.tipo_pago}`, chars));
  lineas.push('-'.repeat(chars));

  // Detalle
  factura.detalles.forEach((detalle) => {
    const nombreLineas = ajustarTexto(detalle.producto_nombre, chars);
    nombreLineas.forEach((linea, idx) => {
      lineas.push(idx === 0 ? `${detalle.cantidad} x ${linea}` : `    ${linea}`);
    });
    const impText = Array.isArray(detalle.impuestos) && detalle.impuestos.length > 0
      ? detalle.impuestos.map((t) => `${t.nombre} ${Number(t.porcentaje)}%`).join(' + ')
      : `${detalle.impuesto_porcentaje}%`;
    lineas.push(
      `    ${formatearMoneda(detalle.precio_unitario)} c/u  ${impText}`
    );
    if (Number(detalle.descuento) > 0) {
      lineas.push(`    Descuento: - ${formatearMoneda(detalle.descuento)}`);
    }
    lineas.push(alinearDerecha(`Subtotal: ${formatearMoneda(detalle.subtotal)}`, chars));
    lineas.push(' '.repeat(chars));
  });

  lineas.push('-'.repeat(chars));
  lineas.push(`Subtotal: ${formatearMoneda(factura.subtotal)}`);
  lineas.push(`Impuestos: ${formatearMoneda(factura.impuesto_total)}`);

  // Descuento: si hay descuentos de línea y además adicional, se desglosan
  // para que el cliente entienda de dónde sale el renglón.
  const descLineas = (factura.detalles || [])
    .reduce((acc, d) => acc + (Number(d.descuento) || 0), 0);
  const descAdicional = Math.max(0, Number(factura.descuento || 0) - descLineas);

  if (descLineas > 0 && descAdicional > 0) {
    lineas.push(`Descuento productos: - ${formatearMoneda(descLineas)}`);
    lineas.push(`Descuento adicional: - ${formatearMoneda(descAdicional)}`);
  } else if (Number(factura.descuento) > 0) {
    lineas.push(`Descuento: - ${formatearMoneda(factura.descuento)}`);
  }

  lineas.push(...centrarTexto(`TOTAL: ${formatearMoneda(factura.total)}`, chars));
  lineas.push('*'.repeat(chars));

  // Facturación electrónica: si la factura tiene CUFE, se muestra en el ticket
  // para que el cliente pueda validarla ante la DIAN.
  if (factura.cufe) {
    lineas.push(centrar('FACTURA ELECTRÓNICA DIAN', chars));
    lineas.push('CUFE:');
    lineas.push(...ajustarTexto(factura.cufe, chars));
    lineas.push(...centrarTexto('Válida en catalogo-vpfe.dian.gov.co', chars));
    lineas.push('*'.repeat(chars));
  }

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

// Genera el buffer del ticket de una NOTA correctiva (crédito/débito) en texto
// plano para impresora térmica POS, con el mismo estilo del ticket de factura.
const generarNotaTicket = (nota, { ancho = '80' } = {}) => {
  const chars = ANCHOS[ancho] || 48;
  const esCredito = nota.tipo === 'credito';
  const titulo = esCredito ? 'NOTA CRÉDITO' : 'NOTA DÉBITO';

  const lineas = [];

  // Encabezado (los datos dinámicos se envuelven para no desbordar la tira)
  lineas.push(...centrarTexto(empresa.nombre.toUpperCase(), chars));
  lineas.push(...centrarTexto(empresa.documento, chars));
  lineas.push(...centrarTexto(`${empresa.ciudad} - Tel: ${empresa.telefono}`, chars));
  lineas.push(centrar('*'.repeat(chars), chars));

  lineas.push(...centrarTexto(`${titulo} ${nota.prefijo || ''}${nota.numero_nota}`, chars));
  lineas.push(...centrarTexto(`Fecha: ${nota.creado_en}`, chars));
  lineas.push(...centrarTexto(`Cliente: ${nota.cliente_nombre || 'Consumidor Final'}`, chars));
  const numOriginal = nota.factura_prefijo
    ? `${nota.factura_prefijo}-${nota.factura_numero}`
    : `${nota.factura_numero || ''}`;
  lineas.push(...centrarTexto(`Factura original: ${numOriginal || '—'}`, chars));
  lineas.push(...centrarTexto(`Motivo: ${nota.motivo || titulo}`, chars));
  lineas.push('-'.repeat(chars));

  // Detalle
  (nota.detalles || []).forEach((detalle) => {
    const nombreLineas = ajustarTexto(detalle.producto_nombre, chars);
    nombreLineas.forEach((linea, idx) => {
      lineas.push(idx === 0 ? `${detalle.cantidad} x ${linea}` : `    ${linea}`);
    });
    lineas.push(`    ${formatearMoneda(detalle.precio_unitario)} c/u  ${detalle.impuesto_porcentaje}%`);
    if (Number(detalle.descuento) > 0) {
      lineas.push(`    Descuento: - ${formatearMoneda(detalle.descuento)}`);
    }
    lineas.push(alinearDerecha(`Subtotal: ${formatearMoneda(detalle.subtotal)}`, chars));
    lineas.push(' '.repeat(chars));
  });

  lineas.push('-'.repeat(chars));
  lineas.push(`Subtotal: ${formatearMoneda(nota.subtotal)}`);
  lineas.push(`Impuestos: ${formatearMoneda(nota.impuesto_total)}`);
  if (Number(nota.descuento) > 0) {
    lineas.push(`Descuento: - ${formatearMoneda(nota.descuento)}`);
  }
  lineas.push(...centrarTexto(`TOTAL: ${formatearMoneda(nota.total)}`, chars));
  lineas.push('*'.repeat(chars));

  // Facturación electrónica: CUDE del documento si ya fue emitido.
  if (nota.cufe) {
    lineas.push(centrar(`${titulo} ELECTRÓNICA DIAN`, chars));
    lineas.push('CUDE:');
    lineas.push(...ajustarTexto(nota.cufe, chars));
    lineas.push(...centrarTexto('Válida en catalogo-vpfe.dian.gov.co', chars));
    lineas.push('*'.repeat(chars));
  }

  lineas.push(centrar('¡Gracias por su compra!', chars));
  lineas.push('');

  const texto = lineas.join('\r\n');
  const comandoInicio = Buffer.from([0x1b, 0x40]); // ESC @
  const comandoFin = Buffer.from([0x0a, 0x0a, 0x0a, 0x0a]);

  return Buffer.concat([
    comandoInicio,
    Buffer.from(`${texto}\r\n`, 'utf8'),
    comandoFin
  ]);
};

module.exports = { generarTicket, generarNotaTicket };
