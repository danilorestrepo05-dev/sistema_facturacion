// scripts/test-factus.js
// Prueba del adaptador FACTUS (proveedor real DIAN).
// 1) Valida el mapeo del body (construirBody/mapearPago) sin contactar la API.
// 2) Valida que, con dian_proveedor=factus y SIN credenciales, la emisión no
//    rompe la venta: queda en estado 'local' y encolada (modelo offline).
const pool = require('../src/config/db');
const configModel = require('../src/models/config.model');
const facturaModel = require('../src/models/factura.model');
const dianService = require('../src/services/dian/dian.service');
const factus = require('../src/services/dian/adapters/factus.adapter');
const ubl = require('../src/services/dian/ubl');

let fallos = 0;
let pasos = 0;
const ok = (c, n, e = '') => { pasos++; if (c) console.log(`  OK  ${n}${e ? ` (${e})` : ''}`); else { fallos++; console.log(`[ERROR] ${n} ${e}`); } };

(async () => {
  const prev = await configModel.listarMapa();
  await configModel.actualizar('facturacion_electronica_habilitado', '1');
  await pool.query('UPDATE productos SET stock_actual = 30 WHERE id = 1');

  // Factura real para validar el mapeo del body.
  const f = await facturaModel.crear({
    estudiante: undefined, cliente_id: null, tipo_pago: 'efectivo',
    items: [{ producto_id: 1, cantidad: 2 }]
  }, 1);
  const factura = await facturaModel.buscarPorId(f.id);

  // --- 1) Mapeo de la forma de pago ---
  ok(factus.mapearPago('efectivo').payment_method_code === '10', 'mapearPago efecto -> método 10');
  ok(factus.mapearPago('efectivo').payment_form === '1', 'mapearPago efecto -> contado');
  ok(factus.mapearPago('credito').payment_form === '2', 'mapearPago credito -> pago_form 2');
  ok(factus.mapearPago('tarjeta').payment_method_code === '49', 'mapearPago tarjeta -> método 49');

  // --- 2) Construcción del body (sin llamar a la API) ---
  const adquirente = ubl.resolverAdquirente({ factura, config: { dian_adquirente_consumidor: '1' } });
  const body = factus.construirBody({ factura, adquirente });

  ok(body.document === '01', 'document es 01 (factura de venta)');
  ok(body.operation_type === '10', 'operation_type es 10 (estándar)');
  ok(body.reference_code.includes(String(factura.numero_factura)), 'reference_code único de la factura', body.reference_code);
  ok(Array.isArray(body.payment_details) && body.payment_details.length === 1, 'payment_details con un medio');
  ok(body.payment_details[0].amount === Number(factura.total).toFixed(2), 'amount del pago = total de la factura');
  ok(body.customer.identification_document_code === '31', 'adquirente consumidor tipo 31 (NIT)');
  ok(body.customer.names === undefined || body.customer.names === 'Consumidor Final', 'adquirente consumidor como persona natural');
  ok(Array.isArray(body.items) && body.items.length === factura.detalles.length, 'items igual número de líneas');
  ok(body.items[0].quantity === '2.00', 'cantidad con dos decimales (string)');
  ok(body.items[0].price !== undefined, 'price presente');
  ok(body.items[0].unit_measure_code === '94', 'unit_measure_code 94 (unidad)');
  ok(body.items[0].taxes && Array.isArray(body.items[0].taxes), 'taxes presente por línea');
  ok(body.items[0].standard_code === '999', 'standard_code 999');

  // --- 3) Factus sin credenciales -> no rompe la venta (cola offline) ---
  await configModel.actualizar('dian_proveedor', 'factus');
  const estado = await dianService.procesarFactura(factura.id);
  ok(estado === 'local', 'Con Factus sin credenciales la factura queda local', estado);

  const relanzada = await facturaModel.buscarPorId(factura.id);
  ok(relanzada.estado_dian === 'local', 'estado_dian=local en la factura');

  const [envio] = await pool.query(
    'SELECT estado FROM envios_dian WHERE factura_id = ? ORDER BY id DESC LIMIT 1',
    [factura.id]
  );
  ok(envio[0] && envio[0].estado === 'pendiente', 'Un envío pendiente quedó en la cola para reintento');

  // Limpieza.
  await configModel.actualizar('dian_proveedor', 'simulacion');
  await facturaModel.anular(factura.id, 1).catch(() => {});
  for (const [k, v] of Object.entries(prev)) await configModel.actualizar(k, v).catch(() => {});
  await pool.end();

  console.log(`\nRESULTADO: ${pasos} pasos, ${fallos} fallos.`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
