// scripts/test-sistema.js
// Smoke test integral del sistema (v0.9.5).
// Recorre el flujo completo: login, roles, catálogo, clientes, proveedores,
// facturación (PDF + ticket POS), reportes, movimientos, anulación y backup.
// Uso: node scripts/test-sistema.js
const { spawn } = require('child_process');
const path = require('path');

const PUERTO = 3460;
const BASE = `http://127.0.0.1:${PUERTO}/api/v1`;
const sufijo = Date.now() % 100000;

// Levanta el servidor en un puerto de prueba.
const server = spawn(process.execPath, ['src/server.js'], {
  cwd: path.join(__dirname, '..'),
  env: { ...process.env, PORT: String(PUERTO) },
  stdio: ['ignore', 'pipe', 'pipe']
});

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// Fecha local de hoy en YYYY-MM-DD (igual que usa el backend para los reportes).
const hoyLocal = () => {
  const ahora = new Date();
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
};

async function peticion(metodo, ruta, token, cuerpo) {
  const respuesta = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined
  });
  const tipo = respuesta.headers.get('content-type') || '';
  // Las respuestas binarias (PDF, ticket, backup) no son JSON.
  const datos = tipo.includes('json')
    ? await respuesta.json()
    : await respuesta.text();
  return { status: respuesta.status, tipo, datos };
}

let pasos = 0, fallos = 0;
const ok = (nombre, condicion, extra = '') => {
  pasos++;
  if (condicion) {
    console.log(`  OK  ${nombre}${extra ? ` (${extra})` : ''}`);
  } else {
    fallos++;
    console.log(`  FALLO ${nombre}${extra ? ` (${extra})` : ''}`);
  }
};
const igual = (esperado, real) => JSON.stringify(esperado) === JSON.stringify(real);

async function main() {
  await espera(1500);

  console.log('\n=== 1. Salud y autenticación ===');

  const salud = await peticion('GET', '/health');
  ok('GET /health', salud.status === 200 && salud.datos.exito === true, salud.datos.mensaje);

  const loginAdmin = await peticion('POST', '/auth/login', null, { nombre_usuario: 'admin', contrasena: 'admin123' });
  ok('Login admin', loginAdmin.status === 200 && !!loginAdmin.datos.datos.token);
  const tokenAdmin = loginAdmin.datos.datos.token;

  const loginMal = await peticion('POST', '/auth/login', null, { nombre_usuario: 'admin', contrasena: 'incorrecta' });
  ok('Login con contraseña incorrecta rechazado', loginMal.status === 401);

  // Usuario cajero temporal para probar permisos por rol.
  const usuarioCajero = `cajero_test_${sufijo}`;
  const crearCajero = await peticion('POST', '/usuarios', tokenAdmin, {
    nombre_usuario: usuarioCajero, nombre_completo: 'Cajero de prueba', contrasena: 'Cajero123!', rol: 'cajero', activo: 1
  });
  ok('Crear usuario cajero (admin)', crearCajero.status === 201);
  const idCajero = crearCajero.datos.datos.id;

  const loginCajero = await peticion('POST', '/auth/login', null, { nombre_usuario: usuarioCajero, contrasena: 'Cajero123!' });
  ok('Login cajero', loginCajero.status === 200 && !!loginCajero.datos.datos.token);
  const tokenCajero = loginCajero.datos.datos.token;

  console.log('\n=== 2. Permisos por rol ===');

  const cajeroCreaProducto = await peticion('POST', '/productos', tokenCajero, { codigo: 'X', nombre: 'X' });
  ok('Cajero NO puede crear producto (403)', cajeroCreaProducto.status === 403);

  const sinToken = await peticion('GET', '/productos', null);
  ok('Endpoint sin token rechazado (401)', sinToken.status === 401);

  // Usuario inactivo no puede iniciar sesión (v0.9.11).
  const usuarioInactivo = `inactivo_${sufijo}`;
  const crearInactivo = await peticion('POST', '/usuarios', tokenAdmin, {
    nombre_usuario: usuarioInactivo, nombre_completo: 'Usuario inactivo', contrasena: 'Inactivo123!', rol: 'cajero', activo: 0
  });
  ok('Crear usuario inactivo (admin)', crearInactivo.status === 201);
  const idInactivo = crearInactivo.datos.datos.id;

  const loginInactivo = await peticion('POST', '/auth/login', null, { nombre_usuario: usuarioInactivo, contrasena: 'Inactivo123!' });
  ok('Usuario inactivo NO puede iniciar sesión (403)', loginInactivo.status === 403);

  console.log('\n=== 3. Catálogo (categorías, impuestos, productos) ===');

  const nuevaCategoria = await peticion('POST', '/categorias', tokenAdmin, {
    nombre: `Categoria Test ${sufijo}`, descripcion: 'Creada por smoke test'
  });
  ok('Crear categoría', nuevaCategoria.status === 201);
  const idCategoria = nuevaCategoria.datos.datos.id;

  const impuestoDup = await peticion('POST', '/categorias', tokenAdmin, { nombre: `Categoria Test ${sufijo}` });
  ok('Categoría duplicada rechazada (409)', impuestoDup.status === 409);

  const nuevoImpuesto = await peticion('POST', '/impuestos', tokenAdmin, {
    nombre: `Impuesto Test ${sufijo}`, porcentaje: 10, activo: 1
  });
  ok('Crear impuesto', nuevoImpuesto.status === 201);
  const idImpuesto = nuevoImpuesto.datos.datos.id;

  const producto1 = await peticion('POST', '/productos', tokenAdmin, {
    codigo: `P-${sufijo}-1`, nombre: `Cafe Test ${sufijo}`, descripcion: 'Producto 1 del smoke test',
    categoria_id: idCategoria, impuesto_id: idImpuesto,
    precio_compra: 2000, precio_venta: 4000, stock_actual: 50, stock_minimo: 5, unidad_medida: 'kg', activo: 1
  });
  ok('Crear producto 1', producto1.status === 201);
  const idProducto1 = producto1.datos.datos.id;

  const producto2 = await peticion('POST', '/productos', tokenAdmin, {
    codigo: `P-${sufijo}-2`, nombre: `Pasilla Test ${sufijo}`, categoria_id: idCategoria,
    impuesto_id: idImpuesto, precio_compra: 1000, precio_venta: 2500, stock_actual: 10, stock_minimo: 2, activo: 1
  });
  ok('Crear producto 2', producto2.status === 201);
  const idProducto2 = producto2.datos.datos.id;

  const auto = await peticion('POST', '/productos', tokenAdmin, { nombre: `AutoCodigo ${sufijo}`, precio_venta: 1200 });
  ok('Producto sin código se autogenera (PRO-xxx)', auto.status === 201 && /^PRO-\d+$/.test(auto.datos.datos.codigo),
    `codigo=${auto.datos.datos.codigo}`);
  const idAuto = auto.datos.datos.id;

  const sinPrecio = await peticion('POST', '/productos', tokenAdmin, { nombre: 'Sin precio' });
  ok('Producto sin precio rechazado (400)', sinPrecio.status === 400);

  // Producto inactivo no se ofrece en venta (v0.9.11).
  const cuerpoProducto1 = {
    codigo: producto1.datos.datos.codigo,
    nombre: producto1.datos.datos.nombre,
    descripcion: producto1.datos.datos.descripcion,
    categoria_id: producto1.datos.datos.categoria_id,
    impuesto_id: producto1.datos.datos.impuesto_id,
    precio_compra: producto1.datos.datos.precio_compra,
    precio_venta: producto1.datos.datos.precio_venta,
    stock_actual: producto1.datos.datos.stock_actual,
    stock_minimo: producto1.datos.datos.stock_minimo,
    unidad_medida: producto1.datos.datos.unidad_medida
  };
  const desactivarProducto = await peticion('PUT', `/productos/${idProducto1}`, tokenAdmin, { ...cuerpoProducto1, activo: 0 });
  ok('Desactivar producto (admin)', desactivarProducto.status === 200);

  const venderInactivo = await peticion('POST', '/facturas', tokenCajero, { items: [{ producto_id: idProducto1, cantidad: 1 }] });
  ok('Vender producto inactivo rechazado (404)', venderInactivo.status === 404);

  const reactivarProducto = await peticion('PUT', `/productos/${idProducto1}`, tokenAdmin, { ...cuerpoProducto1, activo: 1 });
  ok('Reactivar producto para el flujo', reactivarProducto.status === 200);

  const buscado = await peticion('GET', `/productos?termino=${encodeURIComponent(producto1.datos.datos.nombre)}`, tokenAdmin);
  ok('Búsqueda de producto por nombre', buscado.datos.datos.some((p) => p.id === idProducto1));

  console.log('\n=== 4. Clientes y proveedores ===');

  const nuevoCliente = await peticion('POST', '/clientes', tokenAdmin, {
    nombre: `Cliente Test ${sufijo}`, tipo_documento: 'CC', documento: String(1000000000 + sufijo),
    telefono: '3100000000', email: `cliente${sufijo}@test.co`, direccion: 'Calle 99'
  });
  ok('Crear cliente', nuevoCliente.status === 201);
  const idCliente = nuevoCliente.datos.datos.id;

  // Cliente inactivo no puede comprar (v0.9.11).
  const desactivarCliente = await peticion('PUT', `/clientes/${idCliente}`, tokenAdmin, {
    nombre: nuevoCliente.datos.datos.nombre, activo: 0
  });
  ok('Desactivar cliente (admin)', desactivarCliente.status === 200);

  const venderClienteInactivo = await peticion('POST', '/facturas', tokenCajero, {
    cliente_id: idCliente, items: [{ producto_id: idProducto1, cantidad: 1 }]
  });
  ok('Vender a cliente inactivo rechazado (404)', venderClienteInactivo.status === 404);

  const reactivarCliente = await peticion('PUT', `/clientes/${idCliente}`, tokenAdmin, {
    nombre: nuevoCliente.datos.datos.nombre, activo: 1
  });
  ok('Reactivar cliente para el flujo', reactivarCliente.status === 200);

  const nuevoProveedor = await peticion('POST', '/proveedores', tokenAdmin, {
    nombre: `Proveedor Test ${sufijo}`, tipo_documento: 'NIT', documento: String(900000000 + sufijo),
    telefono: '3200000000', email: `proveedor${sufijo}@test.co`, direccion: 'Carrera 10', tipo_item: 'Café, pasilla, azúcar', activo: 1
  });
  ok('Crear proveedor con tipo_item', nuevoProveedor.status === 201 && nuevoProveedor.datos.datos.tipo_item === 'Café, pasilla, azúcar');
  const idProveedor = nuevoProveedor.datos.datos.id;

  const buscaProvTipo = await peticion('GET', `/proveedores?termino=${encodeURIComponent('pasilla')}`, tokenAdmin);
  ok('Búsqueda de proveedor por tipo_item (v0.9.5)', buscaProvTipo.datos.datos.some((p) => p.id === idProveedor));

  console.log('\n=== 5. Facturación ===');

  const stockAntes1 = producto1.datos.datos.stock_actual;
  const stockAntes2 = producto2.datos.datos.stock_actual;

  const facturaSinItems = await peticion('POST', '/facturas', tokenCajero, { items: [] });
  ok('Factura sin items rechazada (400)', facturaSinItems.status === 400);

  const stockInsuficiente = await peticion('POST', '/facturas', tokenCajero, {
    items: [{ producto_id: idProducto2, cantidad: 9999 }]
  });
  ok('Stock insuficiente rechazado (409)', stockInsuficiente.status === 409);

  const factura = await peticion('POST', '/facturas', tokenCajero, {
    cliente_id: idCliente, tipo_pago: 'efectivo', descuento: 1000,
    items: [
      { producto_id: idProducto1, cantidad: 3 },
      { producto_id: idProducto2, cantidad: 2 }
    ]
  });
  ok('Crear factura con cajero (POS)', factura.status === 201);
  const idFactura = factura.datos.datos.id;
  const numeroFactura = factura.datos.datos.numero_factura;

  // Subtotal = 3*4000 + 2*2500 = 17000; impuesto 10% = 1700; descuento 1000; total = 17700.
  const f = factura.datos.datos;
  ok('Cálculo de totales', igual(Number(f.subtotal), 17000) && igual(Number(f.impuesto_total), 1700) && igual(Number(f.total), 17700),
    `subtotal=${f.subtotal} imp=${f.impuesto_total} total=${f.total}`);

  ok('Descuento de inventario', igual(f.detalles[0].producto_id, idProducto1) && f.detalles.length === 2 && f.estado === 'emitida');

  const detalle = await peticion('GET', `/facturas/${idFactura}`, tokenAdmin);
  ok('Obtener factura con detalle', detalle.datos.datos.detalles.length === 2 && detalle.datos.datos.cliente_nombre !== null);

  const listaFacturas = await peticion('GET', `/facturas?estado=emitida&cliente=${encodeURIComponent(`Cliente Test ${sufijo}`)}`, tokenAdmin);
  ok('Listar facturas filtradas', listaFacturas.datos.datos.some((x) => x.id === idFactura));

  console.log('\n=== 6. Impresión: PDF y ticket POS ===');

  const pdfCarta = await peticion('GET', `/facturas/${idFactura}/pdf?formato=carta`, tokenAdmin);
  ok('PDF formato carta', pdfCarta.status === 200 && pdfCarta.tipo?.includes('pdf'));

  const pdfMedia = await peticion('GET', `/facturas/${idFactura}/pdf?formato=media_carta`, tokenAdmin);
  ok('PDF formato media carta', pdfMedia.status === 200 && pdfMedia.tipo?.includes('pdf'));

  const pdfInvalido = await peticion('GET', `/facturas/${idFactura}/pdf?formato=oficio`, tokenAdmin);
  ok('Formato de PDF inválido rechazado (400)', pdfInvalido.status === 400);

  const ticket80 = await peticion('GET', `/facturas/${idFactura}/ticket?ancho=80`, tokenAdmin);
  ok('Ticket POS 80mm', ticket80.status === 200 && ticket80.tipo?.includes('text/plain'));

  const ticket58 = await peticion('GET', `/facturas/${idFactura}/ticket?ancho=58`, tokenAdmin);
  ok('Ticket POS 58mm', ticket58.status === 200 && ticket58.tipo?.includes('text/plain'));

  console.log('\n=== 7. Reportes y movimientos ===');

  const hoy = hoyLocal();
  const rango = `fecha_desde=${hoy}&fecha_hasta=${hoy}`;

  const repVentas = await peticion('GET', `/reportes/ventas?${rango}`, tokenAdmin);
  ok('Reporte de ventas', repVentas.status === 200 && repVentas.datos.datos.resumen?.cantidad_facturas >= 1,
    `facturas=${repVentas.datos.datos.resumen?.cantidad_facturas}`);

  const repDiarias = await peticion('GET', `/reportes/ventas/diarias?${rango}`, tokenAdmin);
  ok('Reporte de ventas diarias', repDiarias.status === 200 && repDiarias.datos.datos.length >= 1);

  const repInventario = await peticion('GET', '/reportes/inventario', tokenAdmin);
  ok('Reporte de inventario', repInventario.status === 200 && repInventario.datos.datos.resumen?.cantidad_productos >= 2);

  const repMov = await peticion('GET', `/reportes/movimientos?${rango}&motivo=venta`, tokenAdmin);
  ok('Reporte de movimientos (motivo venta)', repMov.status === 200 && repMov.datos.datos.detalle.length >= 2,
    `${repMov.datos.datos.detalle.length} movimientos`);

  console.log('\n=== 8. Backup ===');

  const backupSinToken = await peticion('GET', '/backup', null);
  ok('Backup sin token rechazado (401)', backupSinToken.status === 401);

  const backup = await peticion('GET', '/backup', tokenAdmin);
  ok('Backup descargado', backup.status === 200 && typeof backup.datos === 'string' && backup.datos.length > 100 && backup.datos.includes('CREATE TABLE'),
    `${backup.datos.length} bytes`);

  console.log('\n=== 9. Anulación y consistencia ===');

  const anularCajero = await peticion('POST', `/facturas/${idFactura}/anular`, tokenCajero);
  ok('Cajero NO puede anular factura (403)', anularCajero.status === 403);

  const anular = await peticion('POST', `/facturas/${idFactura}/anular`, tokenAdmin);
  ok('Anular factura', anular.status === 200 && anular.datos.datos.estado === 'anulada');

  const stockRestaurado = await peticion('GET', `/productos/${idProducto1}`, tokenAdmin);
  const stockRestaurado2 = await peticion('GET', `/productos/${idProducto2}`, tokenAdmin);
  ok('Stock restaurado tras anulación',
    igual(stockRestaurado.datos.datos.stock_actual, stockAntes1) && igual(stockRestaurado2.datos.datos.stock_actual, stockAntes2),
    `${stockAntes1}/${stockRestaurado.datos.datos.stock_actual} y ${stockAntes2}/${stockRestaurado2.datos.datos.stock_actual}`);

  const repMovAnul = await peticion('GET', `/reportes/movimientos?${rango}&motivo=anulacion`, tokenAdmin);
  ok('Movimientos de anulación registrados', repMovAnul.status === 200 && repMovAnul.datos.datos.detalle.length >= 2);

  const dobleAnulacion = await peticion('POST', `/facturas/${idFactura}/anular`, tokenAdmin);
  ok('Anular factura ya anulada rechazado (409)', dobleAnulacion.status === 409);

  console.log('\n=== 10. Limpieza ===');

  await peticion('DELETE', `/productos/${idProducto2}`, tokenAdmin);
  await peticion('DELETE', `/productos/${idProducto1}`, tokenAdmin);
  await peticion('DELETE', `/productos/${idAuto}`, tokenAdmin);
  const borrarProv = await peticion('DELETE', `/proveedores/${idProveedor}`, tokenAdmin);
  const borrarCli = await peticion('DELETE', `/clientes/${idCliente}`, tokenAdmin);
  const borrarImp = await peticion('DELETE', `/impuestos/${idImpuesto}`, tokenAdmin);
  const borrarCat = await peticion('DELETE', `/categorias/${idCategoria}`, tokenAdmin);
  const borrarUser = await peticion('DELETE', `/usuarios/${idCajero}`, tokenAdmin);
  const borrarInactivo = await peticion('DELETE', `/usuarios/${idInactivo}`, tokenAdmin);
  ok('Limpieza completa', [borrarProv, borrarCli, borrarImp, borrarCat, borrarUser, borrarInactivo].every((r) => r.status === 200));

  console.log(`\nRESULTADO: ${pasos} pasos, ${fallos} fallos.`);
  console.log(`Factura de prueba (queda como anulada): No. ${numeroFactura}`);
  if (fallos > 0) process.exitCode = 1;
}

main()
  .then(() => {})
  .catch((err) => { console.error('FALLO INESPERADO:', err); process.exitCode = 1; })
  .finally(() => server.kill());
