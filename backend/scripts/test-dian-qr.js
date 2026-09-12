// backend/scripts/test-dian-qr.js
// Verifica que la representación gráfica (PDF y ticket POS) incluya el CUFE
// y el código QR de la facturación electrónica DIAN, cuando la factura tiene CUFE.
//
// Uso:
//   node scripts/test-dian-qr.js
//
// Devuelve código de salida 0 si todo pasa, 1 si hay fallos.

const pool = require('../src/config/db');
const configModel = require('../src/models/config.model');
const facturaModel = require('../src/models/factura.model');
const dianService = require('../src/services/dian/dian.service');
const pdfService = require('../src/services/pdf.service');
const ticketService = require('../src/services/ticket.service');

let pasos = 0;
let fallos = 0;
const ok = (m) => { pasos++; console.log(`  [OK] ${m}`); };
const fail = (m) => { fallos++; console.error(`  [FALLO] ${m}`); };
const check = (c, m) => (c ? ok(m) : fail(m));

async function main() {
  console.log('=== Test PDF + Ticket con CUFE/QR (DIAN) ===\n');

  const configPrevia = await configModel.listarMapa();
  let facturaId = null;

  try {
    console.log('1) Configuración DIAN');
    await configModel.actualizar('facturacion_electronica_habilitado', '1');
    await configModel.actualizar('dian_proveedor', 'simulacion');
    await configModel.actualizar('dian_modo_test', '1');

    const [productos] = await pool.query('SELECT id FROM productos WHERE activo = 1 LIMIT 1');
    const [usuarios] = await pool.query('SELECT id FROM usuarios WHERE activo = 1 LIMIT 1');
    if (!productos[0] || !usuarios[0]) {
      console.error('Faltan productos o usuarios en la BD.');
      process.exit(1);
    }

    console.log('\n2) Emisión y procesamiento DIAN');
    const factura = await facturaModel.crear({
      cliente_id: null, tipo_pago: 'efectivo', descuento: 0,
      items: [{ producto_id: productos[0].id, cantidad: 1 }]
    }, usuarios[0].id);
    facturaId = factura.id;
    const estado = await dianService.procesarFactura(factura.id);
    check(estado === 'aprobada', `factura #${factura.numero_factura} aprobada (estado=${estado})`);

    const procesada = await facturaModel.buscarPorId(factura.id);
    check(Boolean(procesada.cufe), 'CUFE presente en la factura');

    console.log('\n3) PDF (carta y media carta)');
    for (const formato of ['carta', 'media_carta']) {
      const buffer = await pdfService.generarFacturaPDF(procesada, { formato });
      const latin = buffer.toString('latin1');
      check(buffer.length > 1000, `PDF ${formato} generado (${buffer.length} bytes)`);
      check(latin.includes('%PDF'), `PDF ${formato} tiene cabecera %PDF`);
      // El PDF incrusta el QR como objeto de imagen (XObject). En un PDF el
      // texto y los streams van comprimidos (FlateDecode), por lo que el QR se
      // verifica por la presencia del objeto de imagen, no por bytes literales.
      check(latin.includes('/Image') && latin.includes('/XObject'),
        `PDF ${formato} incrusta el código QR (objeto /Image)`);
    }

    console.log('\n4) Ticket POS (texto plano)');
    for (const ancho of ['80', '58']) {
      const buffer = await ticketService.generarTicket(procesada, { ancho });
      const texto = buffer.toString('utf8');
      const maxChars = ancho === '58' ? 32 : 48;
      check(texto.includes('FACTURA ELECTRÓNICA DIAN'), `Ticket ${ancho}mm incluye etiqueta FACTURA ELECTRÓNICA DIAN`);
      // El CUFE (96 hex) se imprime PARTIDO en segmentos de maxChars: cada
      // fragmento debe salir completo en el ticket.
      const fragmentos = String(procesada.cufe).match(new RegExp(`.{1,${maxChars}}`, 'g'));
      check(fragmentos.every((f) => texto.includes(f)),
        `Ticket ${ancho}mm imprime el CUFE completo (partido en ${maxChars})`);
      // Ninguna línea imprimible debe superar el ancho. Se descarta la secuencia
      // ESC @ (inicialización de impresora) que va pegada al inicio del buffer.
      const limpias = texto.replace(/\u001b@/g, '').split('\r\n');
      const desbordes = limpias.filter((l) => l.length > maxChars);
      check(desbordes.length === 0,
        `Ticket ${ancho}mm sin líneas desbordadas (máx ${maxChars} chars)`);
    }
  } catch (err) {
    console.error('\nError durante la prueba:', err);
    fail(err.message);
  } finally {
    console.log('\n5) Restauración de configuración');
    for (const [clave, valor] of Object.entries(configPrevia)) {
      await configModel.actualizar(clave, valor).catch(() => {});
    }
    await pool.end();
  }

  console.log(`\nRESULTADO: ${pasos} pasos, ${fallos} fallos.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
