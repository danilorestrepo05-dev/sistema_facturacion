// src/services/dian/qr.js
// Genera el código QR de la factura electrónica DIAN y su contenido de texto.
//
// CONTENIDO DEL QR (formato oficial DIAN, Anexo Técnico / Anexo 003):
//   Un bloque de texto plano con líneas "Campo: valor", separadas por salto
//   de línea, con la información clave del documento + el CUFE:
//     NumFac   = número de factura (prefijo-número o solo número).
//     FecFac   = fecha de emisión en formato AAAAMMDDHHMMSS.
//     NitFac   = NIT del facturador sin puntos ni guiones.
//     DocAdq   = documento del adquirente sin puntos ni guiones.
//     ValFac   = valor sin impuestos, dos decimales, sin separadores.
//     ValIva   = valor del IVA, dos decimales, sin separadores.
//     ValOtroIm= valor de otros impuestos, dos decimales.
//     ValTolFac= valor total del documento (incluye impuestos).
//     CUFE     = Código Único de Factura Electrónica (puede incluir URL de
//                consulta oficial: catalogo-vpfe.dian.gov.co/...)
//
// NOTA DE PRECISIÓN: conforme al Anexo 1.8/1.9 el QR es un texto plano con este
// conjunto de campos. En modo simulación usamos el CUFE calculado localmente y
// NO hay URL de validación DIAN real (se agrega la del portal cuando exista una
// habilitación real en el paso 7).

const QRCode = require('qrcode');
const ubl = require('./ubl');

// Construye el contenido de texto que va dentro del QR para una factura.
// Recibe la factura ya enriquecida (con cufe) y la empresa del .env.
const contenidoQr = ({ factura, empresa, cufe }) => {
  // El número de documento proviene de la factura o, en notas correctivas, del
  // campo numero_nota (mismo prefijo). Ambos son campos válidos para el QR.
  const numeroDocumento = factura.numero_factura ?? factura.numero_nota;
  const numFac = factura.prefijo
    ? `${factura.prefijo}-${numeroDocumento}`
    : String(numeroDocumento);
  const fecFac = ubl.formatearFechaCufe(factura.creado_en || new Date());
  const nitFac = String(empresa.documento || '').replace(/[^\d]/g, '');
  const docAdq = String(factura.cliente_documento || '')
    .replace(/[^\d]/g, '') || '222222222222';
  // En los totales se usa el formato de dos decimales sin separadores.
  const valFac = ubl.formatearMonto(Number(factura.subtotal) - Number(factura.descuento || 0));
  const valIva = ubl.formatearMonto(factura.impuesto_total);
  const valOtroIm = '0.00'; // otros impuestos además de IVA (no se discriminan aquí)
  const valTolFac = ubl.formatearMonto(factura.total);

  const linea = (nombre, valor) => `${nombre}: ${valor}`;
  const lineas = [
    linea('NumFac', numFac),
    linea('FecFac', fecFac),
    linea('NitFac', nitFac),
    linea('DocAdq', docAdq),
    linea('ValFac', valFac),
    linea('ValIva', valIva),
    linea('ValOtroIm', valOtroIm),
    linea('ValTolFac', valTolFac),
    linea('CUFE', cufe || '')
  ];

  // Cuando hay CUFE se agrega el enlace oficial de consulta de la DIAN.
  if (cufe) {
    lineas.push(`https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${cufe}`);
  }

  return lineas.join('\n');
};

// Genera el buffer PNG del QR (listo para incrustar en el PDF con PDFKit).
const generarImagenQr = async (contenido, opciones = {}) => {
  const buffer = await QRCode.toBuffer(contenido, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: opciones.width || 200
  });
  return buffer;
};

module.exports = { contenidoQr, generarImagenQr };
