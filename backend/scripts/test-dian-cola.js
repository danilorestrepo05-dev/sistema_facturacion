// scripts/test-dian-cola.js
// Prueba de la COLA de reintentos offline de facturación electrónica DIAN.
//
// Escenario verificado:
//   1. Una factura queda con estado_dian='local' y un envío 'pendiente' en la
//      cola (simula un fallo previo: sin red / proveedor caído).
//   2. procesarColaPendiente() la reintenta y, al volver el proveedor de
//      simulación, la aprueba (estado_dian='aprobada', envío 'aprobada').
//   3. El job no rompe cuando la DIAN está deshabilitada o no hay pendientes.
const pool = require('../src/config/db');
const configModel = require('../src/models/config.model');
const facturaModel = require('../src/models/factura.model');
const dianService = require('../src/services/dian/dian.service');
const envioModel = require('../src/services/dian/envio.model');

let fallos = 0;
let pasos = 0;

function ok(condicion, nombre, extra = '') {
  pasos++;
  if (condicion) {
    console.log(`  OK  ${nombre}${extra ? ` (${extra})` : ''}`);
  } else {
    fallos++;
    console.log(`[ERROR] ${nombre} ${extra}`);
  }
}

(async () => {
  const prev = await configModel.listarMapa();
  await configModel.actualizar('facturacion_electronica_habilitado', '1');
  await pool.query('UPDATE productos SET stock_actual = 50 WHERE id = 1');

  // Factura base para los reintentos.
  const f = await facturaModel.crear({
    cliente_id: null, tipo_pago: 'efectivo', descuento: 0,
    items: [{ producto_id: 1, cantidad: 1 }]
  }, 1);
  ok(Boolean(f.id), 'Factura base creada', `id=${f.id}`);

  // Simula un fallo previo: envío pendiente con proximo_intento vencido, sin CUFE.
  await pool.query(
    `INSERT INTO envios_dian (factura_id, proveedor, estado, proximo_intento, intentos)
     VALUES (?, 'simulacion', 'pendiente', DATE_SUB(NOW(), INTERVAL 10 MINUTE), 2)`,
    [f.id]
  );
  const pend = await envioModel.buscarPorFactura(f.id);
  ok(pend && pend.estado === 'pendiente', 'Envío pendiente registrado en la cola', `id=${pend.id}`);

  // La factura aún no tiene CUFE (estado local).
  const antes = await facturaModel.buscarPorId(f.id);
  ok(!antes.cufe, 'Factura aún sin CUFE (esperando reintento)');

  // Procesa la cola: debería reintentar y aprobar.
  const resultado = await dianService.procesarColaPendiente();
  ok(resultado.procesados >= 1, 'procesarColaPendiente procesó al menos un envío', `procesados=${resultado.procesados}`);

  const despues = await facturaModel.buscarPorId(f.id);
  ok(despues.cufe, 'Factura ahora tiene CUFE tras el reintento');
  ok(despues.estado_dian === 'aprobada', 'La factura pasó a estado_dian aprobada', despues.estado_dian);
  const envio = await envioModel.buscarPorFactura(f.id);
  ok(envio.estado === 'aprobada', 'El envío quedó aprobado', envio.estado);

  // Cola sin pendientes: no debe fallar.
  const vacio = await dianService.procesarColaPendiente();
  ok(vacio.procesados === 0, 'Cola vacía no produce errores');

  // DIAN deshabilitada: no debe hacer nada.
  await configModel.actualizar('facturacion_electronica_habilitado', '0');
  const off = await dianService.procesarColaPendiente();
  ok(off.procesados === 0 && off.motivo === 'deshabilitada', 'Con DIAN deshabilitada no se procesa nada');

  // Limpieza.
  await facturaModel.anular(f.id, 1);
  for (const [k, v] of Object.entries(prev)) await configModel.actualizar(k, v).catch(() => {});
  await pool.end();

  console.log(`\nRESULTADO: ${pasos} pasos, ${fallos} fallos.`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => {
  console.error('[ERROR]', e.message);
  process.exit(1);
});
