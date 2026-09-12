// backend/scripts/test-dian.js
// Prueba end-to-end de la facturación electrónica DIAN (modo simulación).
// Ejecuta el flujo real contra MySQL: habilita DIAN, crea una factura,
// la procesa contra el adaptador de simulación y verifica que se persistan
// CUFE, XML y estado en la base de datos.
//
// Uso:
//   node scripts/test-dian.js
//
// Devuelve un código de salida 0 si todo pasa, 1 si hay fallos.

const pool = require('../src/config/db');
const configModel = require('../src/models/config.model');
const facturaModel = require('../src/models/factura.model');
const dianService = require('../src/services/dian/dian.service');
const envioModel = require('../src/services/dian/envio.model');
const ubl = require('../src/services/dian/ubl');

let pasos = 0;
let fallos = 0;

const ok = (mensaje) => { pasos++; console.log(`  [OK] ${mensaje}`); };
const fail = (mensaje) => { fallos++; console.error(`  [FALLO] ${mensaje}`); };
const check = (condicion, mensaje) => (condicion ? ok(mensaje) : fail(mensaje));

async function main() {
  console.log('=== Test Facturación Electrónica DIAN (simulación) ===\n');

  // Estado anterior para restaurar al final.
  const configPrevia = await configModel.listarMapa();
  // Identificadores de la prueba con cliente registrado (para limpiar al final).
  let clienteTempId = null;
  let facturaClienteId = null;

  try {
    // 1) Activa la facturación electrónica.
    console.log('1) Configuración DIAN');
    await configModel.actualizar('facturacion_electronica_habilitado', '1');
    await configModel.actualizar('dian_proveedor', 'simulacion');
    await configModel.actualizar('dian_modo_test', '1');
    await configModel.actualizar('dian_adquirente_consumidor', '1');
    const config = await configModel.listarMapa();
    check(Number(config.facturacion_electronica_habilitado) === 1, 'facturación electrónica habilitada');

    // 2) Busca un producto y un usuario válidos para crear una factura de prueba.
    console.log('\n2) Preparación de datos');
    const [productos] = await pool.query('SELECT id, nombre, precio_venta, impuesto_id, stock_actual FROM productos WHERE activo = 1 LIMIT 1');
    const [usuarios] = await pool.query('SELECT id FROM usuarios WHERE activo = 1 LIMIT 1');
    if (!productos[0] || !usuarios[0]) {
      console.error('No hay productos o usuarios en la BD; no se puede probar la factura.');
      process.exit(1);
    }
    const producto = productos[0];
    check(Boolean(producto), `producto de prueba: ${producto.nombre} (id ${producto.id})`);

    // 3) Crea una factura real en la BD.
    console.log('\n3) Emisión de factura');
    const factura = await facturaModel.crear({
      cliente_id: null,
      tipo_pago: 'efectivo',
      descuento: 0,
      items: [{ producto_id: producto.id, cantidad: 1 }]
    }, usuarios[0].id);
    check(Boolean(factura.id), `factura #${factura.numero_factura} emitida (id ${factura.id})`);
    check(Number(factura.total) > 0, `total factura: ${factura.total}`);

    // 4) Procesa la facturación electrónica (adaptador de simulación).
    console.log('\n4) Procesamiento DIAN');
    const estado = await dianService.procesarFactura(factura.id);
    check(estado === 'aprobada', `estado DIAN: ${estado}`);

    // 5) Verifica que el CUFE y el XML quedaron persistidos en la factura.
    console.log('\n5) Verificación de persistencia');
    const facturaProcesada = await facturaModel.buscarPorId(factura.id);
    check(Boolean(facturaProcesada.cufe), 'CUFE generado y persistido en factura');
    if (facturaProcesada.cufe) {
      check(String(facturaProcesada.cufe).length === 96, `CUFE de 96 caracteres (SHA-384 hex): ${facturaProcesada.cufe.slice(0, 16)}...`);
    }
    check(Boolean(facturaProcesada.xml_dian), 'XML UBL 2.1 persistido en factura');
    check(facturaProcesada.estado_dian === 'aprobada', `estado_dian en factura: ${facturaProcesada.estado_dian}`);
    if (facturaProcesada.xml_dian) {
      check(facturaProcesada.xml_dian.includes('<Invoice'), 'XML contiene raíz <Invoice>');
      check(facturaProcesada.xml_dian.includes('UBLVersionID'), 'XML contiene UBLVersionID');
    }

    // 6) Verifica la cola de envíos.
    console.log('\n6) Cola de envíos');
    const envio = await envioModel.buscarPorFactura(factura.id);
    check(Boolean(envio), 'registro en envios_dian');
    if (envio) {
      check(envio.estado === 'aprobada', `estado en cola: ${envio.estado}`);
      check(envio.proveedor === 'simulacion', `proveedor: ${envio.proveedor}`);
      check(Boolean(envio.track_id), `track_id: ${envio.track_id}`);
    }

    // 7) Validaciones del adquirente (unidad: resolverAdquirente).
    console.log('\n7) Validaciones del adquirente');
    const sinClientePermitido = ubl.resolverAdquirente({
      factura: { cliente_id: null, cliente_documento: null },
      config: { dian_adquirente_consumidor: '1' }
    });
    check(
      sinClientePermitido.tipo === 'consumidor' && sinClientePermitido.tipo_documento === '31',
      'sin cliente y consumidor permitido → Consumidor Final'
    );

    let error = null;
    try {
      ubl.resolverAdquirente({
        factura: { cliente_id: null, cliente_documento: null },
        config: { dian_adquirente_consumidor: '0' }
      });
    } catch (e) { error = e.message; }
    check(Boolean(error) && /Consumidor Final/.test(error), 'sin cliente y consumidor bloqueado → rechaza emisión');

    const adquirenteNit = ubl.resolverAdquirente({
      factura: {
        cliente_id: 99, cliente_documento: '901000123', cliente_nombre: 'Empresa de Café Ltda',
        cliente_tipo_documento: 'NIT', cliente_telefono: '6015554433',
        cliente_email: 'compras@cafe.test', cliente_direccion: 'Cra 7 #12-34'
      },
      config: { dian_adquirente_consumidor: '1' }
    });
    check(adquirenteNit.tipo_documento === '31', 'cliente NIT → código DIAN 31');
    check(
      adquirenteNit.telefono === '6015554433' && adquirenteNit.email === 'compras@cafe.test',
      'teléfono y correo del cliente viajan en el adquirente'
    );

    error = null;
    try {
      ubl.resolverAdquirente({
        factura: { cliente_id: 99, cliente_nombre: 'Pepe', cliente_documento: '123', cliente_tipo_documento: 'Otro' },
        config: { dian_adquirente_consumidor: '1' }
      });
    } catch (e) { error = e.message; }
    check(Boolean(error) && /Otro/.test(error), 'tipo "Otro" sin código DIAN → rechaza');

    error = null;
    try {
      ubl.resolverAdquirente({
        factura: { cliente_id: 99, cliente_nombre: 'Pepe', cliente_documento: null, cliente_tipo_documento: 'CC' },
        config: { dian_adquirente_consumidor: '1' }
      });
    } catch (e) { error = e.message; }
    check(Boolean(error) && /documento/.test(error), 'cliente registrado sin documento → rechaza');

    // 8) Emisión con cliente registrado: sus datos viajan al documento DIAN.
    console.log('\n8) Emisión con cliente registrado');
    const documentoUnico = `901000${String(Date.now()).slice(-6)}`;
    const [resCliente] = await pool.query(
      `INSERT INTO clientes (nombre, tipo_documento, documento, telefono, email, direccion, activo)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      ['Empresa de Café Test', 'NIT', documentoUnico, '6015554433', 'compras@cafe.test', 'Cra 7 #12-34']
    );
    clienteTempId = resCliente.insertId;
    const facturaCliente = await facturaModel.crear({
      cliente_id: clienteTempId,
      tipo_pago: 'efectivo',
      descuento: 0,
      items: [{ producto_id: producto.id, cantidad: 1 }]
    }, usuarios[0].id);
    facturaClienteId = facturaCliente.id;
    const estadoCliente = await dianService.procesarFactura(facturaCliente.id);
    check(estadoCliente === 'aprobada', `factura con cliente aprobada (${estadoCliente})`);
    const facturaClienteProcesada = await facturaModel.buscarPorId(facturaCliente.id);
    check(
      facturaClienteProcesada.cliente_tipo_documento === 'NIT',
      `tipo de documento leído desde el catálogo: ${facturaClienteProcesada.cliente_tipo_documento}`
    );
    if (facturaClienteProcesada.xml_dian) {
      check(facturaClienteProcesada.xml_dian.includes('schemeName="31"'), 'XML del adquirente usa código DIAN 31 (NIT)');
      check(facturaClienteProcesada.xml_dian.includes(documentoUnico), 'XML contiene el NIT del cliente');
      check(facturaClienteProcesada.xml_dian.includes('Empresa de Café Test'), 'XML contiene el nombre del cliente');
    }

    // 9) Limpieza del cliente temporal de la prueba.
    console.log('\n9) Limpieza');
    if (facturaClienteId) {
      await pool.query('UPDATE facturas SET cliente_id = NULL WHERE id = ?', [facturaClienteId]).catch(() => {});
      check(true, 'factura de prueba desvinculada del cliente');
    }
    if (clienteTempId) {
      await pool.query('DELETE FROM clientes WHERE id = ?', [clienteTempId]).catch(() => {});
      check(true, 'cliente de prueba eliminado');
    }
  } catch (err) {
    console.error('\nError durante la prueba:', err);
    fail(err.message);
  } finally {
    // Restaura la configuración previa.
    console.log('\n10) Restauración de configuración');
    for (const [clave, valor] of Object.entries(configPrevia)) {
      await configModel.actualizar(clave, valor).catch(() => {});
    }
    await pool.end();
  }

  console.log(`\nRESULTADO: ${pasos} pasos, ${fallos} fallos.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
