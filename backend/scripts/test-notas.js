// scripts/test-notas.js
// Prueba del NÚCLEO de notas correctivas (débito y crédito):
// creación a partir de la factura original, numeración, y emisión del
// documento electrónico (CUDE + XML UBL 2.1 CreditNote/DebitNote).
const pool = require('../src/config/db');
const configModel = require('../src/models/config.model');
const facturaModel = require('../src/models/factura.model');
const notaModel = require('../src/models/nota_correctiva.model');
const dianService = require('../src/services/dian/dian.service');

let fallos = 0;
let pasos = 0;
function ok(condicion, nombre, extra = '') {
  pasos++;
  if (condicion) console.log(`  OK  ${nombre}${extra ? ` (${extra})` : ''}`);
  else { fallos++; console.log(`[ERROR] ${nombre} ${extra}`); }
}

(async () => {
  const prev = await configModel.listarMapa();
  await configModel.actualizar('facturacion_electronica_habilitado', '1');
  await pool.query('UPDATE productos SET stock_actual = 100 WHERE id = 1');

  // 1) Factura base (con DIAN aprobada) sobre la que se emiten las notas.
  const f = await facturaModel.crear({
    cliente_id: null, tipo_pago: 'efectivo', descuento: 0,
    items: [{ producto_id: 1, cantidad: 2 }]
  }, 1);
  await dianService.procesarFactura(f.id);
  const factura = await facturaModel.buscarPorId(f.id);
  ok(factura.estado_dian === 'aprobada', 'Factura base aprobada por DIAN', `id=${f.id} total=${factura.total}`);

  // 2) Nota CRÉDITO por el total (anulación electrónica).
  const nc = await notaModel.crear({
    tipo: 'credito', factura_original_id: f.id, motivo: 'Anulación total',
    preferencia_motivo: 'anulacion'
  }, 1);
  ok(nc.tipo === 'credito', 'Nota crédito creada', `${nc.prefijo}-${nc.numero_nota} total=${nc.total}`);
  ok(Number(nc.total) === Number(factura.total), 'Nota crédito total igual a la factura original');
  ok(nc.estado_dian === 'local', 'Nota crédito inicia local hasta procesar DIAN');

  // Emite el documento electrónico de la nota crédito.
  const estadoNC = await dianService.procesarNota(nc.id);
  const ncProc = await notaModel.buscarPorId(nc.id);
  ok(estadoNC === 'aprobada', 'Nota crédito aprobada por DIAN', estadoNC);
  ok(ncProc.cufe && ncProc.cufe.length === 96, 'CUDE de la nota crédito (SHA-384, 96 hex)');
  ok(ncProc.xml_dian && ncProc.xml_dian.includes('<CreditNote'), 'XML tiene raíz CreditNote');
  ok(ncProc.xml_dian && ncProc.xml_dian.includes('InvoiceDocumentReference'), 'XML referencia la factura original');

  // 3) Nota DÉBITO (incrementa la factura original).
  const montoDebito = 5000;
  const nd = await notaModel.crear({
    tipo: 'debito', factura_original_id: f.id, monto: montoDebito,
    motivo: 'Ajuste por cobro adicional', preferencia_motivo: 'ajuste'
  }, 1);
  ok(nd.tipo === 'debito', 'Nota débito creada', `${nd.prefijo}-${nd.numero_nota}`);
  ok(Number(nd.total) === Number(montoDebito), 'Nota débito usa el monto de ajuste', `total=${nd.total}`);

  const estadoND = await dianService.procesarNota(nd.id);
  const ndProc = await notaModel.buscarPorId(nd.id);
  ok(estadoND === 'aprobada', 'Nota débito aprobada por DIAN', estadoND);
  ok(ndProc.xml_dian && ndProc.xml_dian.includes('<DebitNote'), 'XML tiene raíz DebitNote');

  // 4) Validaciones: crédito mayor al total rechazada; débito sin monto rechazada.
  let errorCredito = null;
  try { await notaModel.crear({ tipo: 'credito', factura_original_id: f.id, monto: factura.total + 999 }, 1); }
  catch (e) { errorCredito = e.message; }
  ok(errorCredito, 'Nota crédito mayor al total de la factura rechazada', errorCredito || '');

  let errorDebito = null;
  try { await notaModel.crear({ tipo: 'debito', factura_original_id: f.id }, 1); }
  catch (e) { errorDebito = e.message; }
  ok(errorDebito, 'Nota débito sin monto rechazada', errorDebito || '');

  // Limpieza: anula las notas y la factura de prueba.
  await notaModel.anular(nc.id);
  await notaModel.anular(nd.id);
  await facturaModel.anular(f.id, 1);
  for (const [k, v] of Object.entries(prev)) await configModel.actualizar(k, v).catch(() => {});
  await pool.end();

  console.log(`\nRESULTADO: ${pasos} pasos, ${fallos} fallos.`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error('[ERROR]', e.message); process.exit(1); });
