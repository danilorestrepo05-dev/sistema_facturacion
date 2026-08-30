// scripts/test-sistema.js
// Smoke test integral del sistema (v0.9.12).
// Recorre el flujo completo: login, roles, catálogo, clientes, proveedores,
// facturación (PDF + ticket POS), reportes, movimientos, backup, configuración,
// anulación y limpieza.
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

// Si el servidor muere al arrancar, muestra su error en vez de colgarse.
// (Tras completar el arranque, el kill() final del test no debe alarmar.)
let servidorListo = false;
server.stderr.on('data', (d) => process.stderr.write(d));
server.on('exit', (code) => {
  if (!servidorListo && code !== null && code !== 0) {
    console.error(`El servidor de prueba terminó con código ${code}`);
    process.exit(1);
  }
});

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// Espera a que el servidor responda /health (hasta 15 s), sondeando cada 250 ms.
async function esperarServidor() {
  const limite = Date.now() + 15000;
  while (Date.now() < limite) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) { servidorListo = true; return; }
    } catch { /* aún no escucha, reintenta */ }
    await espera(250);
  }
  throw new Error('El servidor de prueba no respondió a tiempo');
}

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
  return { status: respuesta.status, tipo, datos, headers: respuesta.headers };
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
  await esperarServidor();

  console.log('\n=== 1. Salud y autenticación ===');

  const salud = await peticion('GET', '/health');
  ok('GET /health', salud.status === 200 && salud.datos.exito === true, salud.datos.mensaje);

  const loginAdmin = await peticion('POST', '/auth/login', null, { nombre_usuario: 'admin', contrasena: 'admin123' });
  ok('Login admin', loginAdmin.status === 200 && !!loginAdmin.datos.datos.token);
  const tokenAdmin = loginAdmin.datos.datos.token;

  // Normaliza los flags que este test asume apagados al comenzar (las pruebas
  // manuales del día a día pueden haberlos dejado activados en la BD).
  for (const clave of ['arqueo_habilitado', 'gaveta_habilitada']) {
    await peticion('PUT', '/configuracion', tokenAdmin, { clave, valor: '0' });
  }

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
    codigo: `P-${sufijo}-1`, nombre: `Producto A Test ${sufijo}`, descripcion: 'Producto 1 del smoke test',
    categoria_id: idCategoria, impuesto_id: idImpuesto,
    precio_compra: 2000, precio_venta: 4000, stock_actual: 50, stock_minimo: 5, unidad_medida: 'kg', activo: 1
  });
  ok('Crear producto 1', producto1.status === 201);
  const idProducto1 = producto1.datos.datos.id;

  const producto2 = await peticion('POST', '/productos', tokenAdmin, {
    codigo: `P-${sufijo}-2`, nombre: `Producto B Test ${sufijo}`, categoria_id: idCategoria,
    impuesto_id: idImpuesto, precio_compra: 1000, precio_venta: 2500, stock_actual: 10,
    stock_minimo: 2, activo: 1, codigo_barras: `EAN-${sufijo}`
  });
  ok('Crear producto 2 (con código de barras)', producto2.status === 201);
  const idProducto2 = producto2.datos.datos.id;

  // Escáner en Caja (v0.9.20): lookup por código de barras.
  const lookupBarras = await peticion('GET', `/productos/codigo-barras/EAN-${sufijo}`, tokenCajero);
  ok('Lookup por código de barras devuelve el producto',
    lookupBarras.status === 200 && lookupBarras.datos.datos.id === idProducto2);

  // Compras (v0.9.31): el lookup también trae precio_compra para precargar el costo.
  ok('Lookup incluye precio_compra para precarga en Compras',
    lookupBarras.status === 200 && Number(lookupBarras.datos.datos.precio_compra) === 1000);

  const barrasDesconocido = await peticion('GET', `/productos/codigo-barras/NOEXISTE-${sufijo}`, tokenCajero);
  ok('Código de barras inexistente rechazado (404)', barrasDesconocido.status === 404);

  const barrasDuplicado = await peticion('POST', '/productos', tokenAdmin, {
    codigo: `P-${sufijo}-dupbar`, nombre: `Duplico Barras ${sufijo}`,
    precio_venta: 100, codigo_barras: `EAN-${sufijo}`
  });
  ok('Código de barras duplicado rechazado (409)', barrasDuplicado.status === 409);

  const auto = await peticion('POST', '/productos', tokenAdmin, { nombre: `AutoCodigo ${sufijo}`, precio_venta: 1200 });
  ok('Producto sin código se autogenera (PRO-xxx)', auto.status === 201 && /^PRO-\d+$/.test(auto.datos.datos.codigo),
    `codigo=${auto.datos.datos.codigo}`);
  const idAuto = auto.datos.datos.id;

  const sinPrecio = await peticion('POST', '/productos', tokenAdmin, { nombre: 'Sin precio' });
  ok('Producto sin precio rechazado (400)', sinPrecio.status === 400);

  // Producto inactivo no se ofrece en venta (v0.9.11).
  const cuerpoProducto1 = {
    codigo: producto1.datos.datos.codigo,
    codigo_barras: producto1.datos.datos.codigo_barras,
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
    telefono: '3200000000', email: `proveedor${sufijo}@test.co`, direccion: 'Carrera 10', tipo_item: 'Bebidas, aseo, papelería', activo: 1
  });
  ok('Crear proveedor con tipo_item', nuevoProveedor.status === 201 && nuevoProveedor.datos.datos.tipo_item === 'Bebidas, aseo, papelería');
  const idProveedor = nuevoProveedor.datos.datos.id;

  const buscaProvTipo = await peticion('GET', `/proveedores?termino=${encodeURIComponent('aseo')}`, tokenAdmin);
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

  // --- Descuento por línea (monto $, tope = valor de la línea) ---
  // p1: 2*4000=8000 con descuento 1000 -> base 7000, impuesto 10% = 700.
  // p2: 1*2500=2500 sin descuento -> impuesto 10% = 250.
  // subtotal=10500, descuentoLineas=1000, impuestoTotal=950, total=10450.
  const facturaDescLinea = await peticion('POST', '/facturas', tokenCajero, {
    items: [
      { producto_id: idProducto1, cantidad: 2, descuento: 1000 },
      { producto_id: idProducto2, cantidad: 1 }
    ]
  });
  ok('Crear factura con descuento por línea', facturaDescLinea.status === 201);
  const fd = facturaDescLinea.datos.datos;
  ok('Totales con descuento por línea',
    igual(Number(fd.subtotal), 10500) && igual(Number(fd.descuento), 1000) &&
    igual(Number(fd.impuesto_total), 950) && igual(Number(fd.total), 10450),
    `subtotal=${fd.subtotal} desc=${fd.descuento} imp=${fd.impuesto_total} total=${fd.total}`);
  ok('Línea guarda descuento e impuesto sobre base reducida',
    igual(Number(fd.detalles[0].descuento), 1000) && igual(Number(fd.detalles[0].impuesto), 700),
    `desc=${fd.detalles[0].descuento} imp=${fd.detalles[0].impuesto}`);

  const descExcesivo = await peticion('POST', '/facturas', tokenCajero, {
    items: [{ producto_id: idProducto1, cantidad: 1, descuento: 99999 }]
  });
  ok('Descuento de línea mayor al valor rechazado (400)', descExcesivo.status === 400,
    descExcesivo.datos?.mensaje || '');

  const descNegativo = await peticion('POST', '/facturas', tokenCajero, {
    items: [{ producto_id: idProducto1, cantidad: 1, descuento: -500 }]
  });
  ok('Descuento de línea negativo rechazado (400)', descNegativo.status === 400);

  // v0.9.24: el descuento TOTAL no puede dejar la venta en $0 ni negativa.
  // p1 x1 = 4000 + 10% = 4400 de valor de venta.
  const descGigante = await peticion('POST', '/facturas', tokenCajero, {
    descuento: 999999,
    items: [{ producto_id: idProducto1, cantidad: 1 }]
  });
  ok('Descuento total mayor al valor de la venta rechazado (400)',
    descGigante.status === 400, descGigante.datos?.mensaje || '');

  const descExacto = await peticion('POST', '/facturas', tokenCajero, {
    descuento: 4400,
    items: [{ producto_id: idProducto1, cantidad: 1 }]
  });
  ok('Descuento que deja la venta en $0 rechazado (400)', descExacto.status === 400);

  // Anti-regresión: línea ($500) + adicional ($300) se suman UNA sola vez.
  // p1: 4000 - 500 = 3500 -> IVA 10% = 350; descuento total 800; total 3550.
  const facturaAmbos = await peticion('POST', '/facturas', tokenCajero, {
    descuento: 300,
    items: [{ producto_id: idProducto1, cantidad: 1, descuento: 500 }]
  });
  ok('Descuentos de línea y adicional se suman una sola vez',
    facturaAmbos.status === 201 &&
    igual(Number(facturaAmbos.datos.datos.descuento), 800) &&
    igual(Number(facturaAmbos.datos.datos.impuesto_total), 350) &&
    igual(Number(facturaAmbos.datos.datos.total), 3550),
    `desc=${facturaAmbos.datos.datos?.descuento} imp=${facturaAmbos.datos.datos?.impuesto_total} total=${facturaAmbos.datos.datos?.total}`);

  // El ticket de esa factura debe desglosar líneas vs adicional.
  const ticketDesglose = await peticion('GET', `/facturas/${facturaAmbos.datos.datos.id}/ticket?ancho=80`, tokenAdmin);
  ok('Ticket desglosa descuento de líneas y adicional',
    ticketDesglose.status === 200 && String(ticketDesglose.datos).includes('Descuento') && String(ticketDesglose.datos).includes('adicional'));

  // --- Impuestos combinados por línea (multi-impuesto v0.9.44) ---
  const listaImpuestos = await peticion('GET', '/impuestos', tokenAdmin);
  const impuestosActivos = (listaImpuestos.datos.datos || []).filter((i) => i.activo === 1);
  // Exento (porcentaje 0) es mutuamente exclusivo: solo se combinan gravados (> 0).
  const gravados = impuestosActivos.filter((i) => Number(i.porcentaje) > 0);
  if (gravados.length >= 2) {
    const impA = gravados[0];
    const impB = gravados[1];
    // idProducto1 cuesta 4000; 1 unidad = base 4000.
    // Impuesto combinado = base * (%A + %B) / 100.
    const esperadoImp = 4000 * (Number(impA.porcentaje) + Number(impB.porcentaje)) / 100;
    const facturaMulti = await peticion('POST', '/facturas', tokenCajero, {
      items: [{ producto_id: idProducto1, cantidad: 1, impuestos: [impA.id, impB.id] }]
    });
    ok('Factura multi-impuesto emitida (201)', facturaMulti.status === 201);
    const fm = facturaMulti.datos.datos;
    ok('Impuestos combinados calculados correctamente',
      Math.abs(Number(fm.impuesto_total) - esperadoImp) < 0.01,
      `imp=${fm.impuesto_total} esperado=${esperadoImp}`);
    const detMulti = await peticion('GET', `/facturas/${fm.id}`, tokenAdmin);
    ok('Desglose de impuestos guardado en detalle',
      detMulti.datos.datos.detalles[0]?.impuestos?.length === 2);
  } else if (impuestosActivos.length >= 1) {
    const impUnico = impuestosActivos[0];
    const esperadoImp = 4000 * Number(impUnico.porcentaje) / 100;
    const facturaDefault = await peticion('POST', '/facturas', tokenCajero, {
      items: [{ producto_id: idProducto1, cantidad: 1 }]
    });
    ok('Factura con impuesto por defecto del producto (201)', facturaDefault.status === 201);
    ok('Detalle trae impuestos (fallback)',
      Array.isArray(facturaDefault.datos.datos.detalles?.[0]?.impuestos));
  } else {
    ok('Catálogo de impuestos vacío; se omite prueba multi-impuesto', true);
  }

  const impInvalido = await peticion('POST', '/facturas', tokenCajero, {
    items: [{ producto_id: idProducto1, cantidad: 1, impuestos: [99999] }]
  });
    ok('Impuesto inexistente rechazado (400)', impInvalido.status === 400,
      impInvalido.datos?.mensaje || '');

    // Validar que Exento + gravado es rechazado (400)
    const exento = impuestosActivos.find((i) => Number(i.porcentaje) === 0);
    const gravUno = gravados[0];
    if (exento && gravUno) {
      const mezclaInvalida = await peticion('POST', '/facturas', tokenCajero, {
        items: [{ producto_id: idProducto1, cantidad: 1, impuestos: [exento.id, gravUno.id] }]
      });
      ok('Mezcla Exento + gravado rechazada (400)', mezclaInvalida.status === 400,
        mezclaInvalida.datos?.mensaje || '');
    }

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

  console.log('\n=== 9. Configuración del sistema ===');

  const configSinToken = await peticion('GET', '/configuracion', null);
  ok('Configuración sin token rechazada (401)', configSinToken.status === 401);

  const configCajero = await peticion('GET', '/configuracion', tokenCajero);
  ok('Cajero puede leer configuración',
    configCajero.status === 200 && Array.isArray(configCajero.datos.datos) &&
    configCajero.datos.datos.some((c) => c.clave === 'codigo_barras_habilitado'));

  const configPutCajero = await peticion('PUT', '/configuracion', tokenCajero, { clave: 'codigo_barras_habilitado', valor: '1' });
  ok('Cajero NO puede cambiar configuración (403)', configPutCajero.status === 403);

  const configPutInvalida = await peticion('PUT', '/configuracion', tokenAdmin, { clave: 'clave_inexistente', valor: '1' });
  ok('Actualizar clave inexistente rechazado (404)', configPutInvalida.status === 404);

  const configActivar = await peticion('PUT', '/configuracion', tokenAdmin, { clave: 'codigo_barras_habilitado', valor: '1' });
  ok('Admin activa flag de código de barras',
    configActivar.status === 200 && configActivar.datos.datos.some((c) => c.clave === 'codigo_barras_habilitado' && c.valor === '1'));

  const configRestaurar = await peticion('PUT', '/configuracion', tokenAdmin, { clave: 'codigo_barras_habilitado', valor: '0' });
  ok('Admin restaura flag a desactivado',
    configRestaurar.status === 200 && configRestaurar.datos.datos.some((c) => c.clave === 'codigo_barras_habilitado' && c.valor === '0'));

  // Visador (pantalla cliente, Fase 5): el flag se activa y se restaura.
  const visadorActivar = await peticion('PUT', '/configuracion', tokenAdmin, { clave: 'visador_habilitado', valor: '1' });
  ok('Admin activa flag de visador',
    visadorActivar.status === 200 && visadorActivar.datos.datos.some((c) => c.clave === 'visador_habilitado' && c.valor === '1'));

  const visadorRestaurar = await peticion('PUT', '/configuracion', tokenAdmin, { clave: 'visador_habilitado', valor: '0' });
  ok('Admin restaura flag de visador',
    visadorRestaurar.status === 200 && visadorRestaurar.datos.datos.some((c) => c.clave === 'visador_habilitado' && c.valor === '0'));

  console.log('\n=== 10. Gaveta de dinero (Fase 3) ===');

  // El flag gaveta_habilitada está en '0': la apertura debe rechazarse.
  const gavetaApagada = await peticion('POST', '/gaveta/abrir', tokenCajero);
  ok('Gaveta deshabilitada rechaza apertura (409)', gavetaApagada.status === 409);

  const gavetaHabilitar = await peticion('PUT', '/configuracion', tokenAdmin, { clave: 'gaveta_habilitada', valor: '1' });
  ok('Admin habilita la gaveta', gavetaHabilitar.status === 200);

  // Modo simulacion (sin hardware): responde 200 con simulado=true y no envía nada.
  const gavetaSimulada = await peticion('POST', '/gaveta/abrir', tokenCajero);
  ok('Abrir gaveta en modo simulación',
    gavetaSimulada.status === 200 && gavetaSimulada.datos.datos.simulado === true &&
    gavetaSimulada.datos.datos.bytes === 5,
    `bytes=${gavetaSimulada.datos.datos?.bytes}`);

  const gavetaRestaurar = await peticion('PUT', '/configuracion', tokenAdmin, { clave: 'gaveta_habilitada', valor: '0' });
  ok('Gaveta queda restaurada a desactivado',
    gavetaRestaurar.status === 200 && gavetaRestaurar.datos.datos.some((c) => c.clave === 'gaveta_habilitada' && c.valor === '0'));

  console.log('\n=== 11. Arqueo de caja (Fase 4) ===');

  // Flag apagado: las operaciones de turno se rechazan.
  const turnoApagado = await peticion('POST', '/turnos/abrir', tokenCajero, { monto_apertura: 10000 });
  ok('Arqueo deshabilitado rechaza apertura (409)', turnoApagado.status === 409);

  const arqueoActivar = await peticion('PUT', '/configuracion', tokenAdmin, { clave: 'arqueo_habilitado', valor: '1' });
  ok('Admin habilita el arqueo', arqueoActivar.status === 200);

  // v0.9.24: con el arqueo activo no se puede vender sin turno abierto.
  const ventaSinTurno = await peticion('POST', '/facturas', tokenCajero, {
    items: [{ producto_id: idProducto1, cantidad: 1 }]
  });
  ok('Venta sin turno abierto rechazada con arqueo activo (409)',
    ventaSinTurno.status === 409, ventaSinTurno.datos?.mensaje || '');

  const turnoMontoMalo = await peticion('POST', '/turnos/abrir', tokenCajero, { monto_apertura: -5 });
  ok('Apertura con monto negativo rechazada (400)', turnoMontoMalo.status === 400);

  const fondo = 10000;
  const turnoAbierto = await peticion('POST', '/turnos/abrir', tokenCajero, { monto_apertura: fondo });
  ok('Abrir turno con fondo inicial', turnoAbierto.status === 201 && turnoAbierto.datos.datos.estado === 'abierto');

  const turnoDuplicado = await peticion('POST', '/turnos/abrir', tokenCajero, { monto_apertura: 5000 });
  ok('Segundo turno simultáneo rechazado (409)', turnoDuplicado.status === 409);

  // Venta en efectivo dentro del turno: producto 1 x1 → total 4000 + 10% = 4400.
  const ventaTurno = await peticion('POST', '/facturas', tokenCajero, {
    items: [{ producto_id: idProducto1, cantidad: 1 }]
  });
  const totalVentaTurno = Number(ventaTurno.datos.datos.total);
  ok('Venta en efectivo durante el turno (total=4400)',
    ventaTurno.status === 201 && igual(totalVentaTurno, 4400), `total=${totalVentaTurno}`);

  const turnoActual = await peticion('GET', '/turnos/actual', tokenCajero);
  ok('Efectivo esperado en vivo (fondo + ventas)',
    turnoActual.status === 200 && turnoActual.datos.datos.turno_abierto === true &&
    igual(Number(turnoActual.datos.datos.efectivo_esperado), fondo + totalVentaTurno),
    `esperado=${turnoActual.datos.datos.efectivo_esperado}`);

  const turnoCerrar = await peticion('POST', '/turnos/cerrar', tokenCajero, {
    monto_real: fondo + totalVentaTurno, observaciones: 'Cuadre perfecto del smoke test'
  });
  ok('Cerrar turno cuadrado (diferencia 0)',
    turnoCerrar.status === 200 && igual(Number(turnoCerrar.datos.datos.diferencia), 0) &&
    turnoCerrar.datos.datos.estado === 'cerrado');

  const turnoRecierre = await peticion('POST', '/turnos/cerrar', tokenCajero, { monto_real: 100 });
  ok('Cerrar sin turno abierto rechazado (409)', turnoRecierre.status === 409);

  // v0.9.24: cerrado el turno, la venta vuelve a bloquearse (flag sigue activo).
  const ventaTrasCierre = await peticion('POST', '/facturas', tokenCajero, {
    items: [{ producto_id: idProducto1, cantidad: 1 }]
  });
  ok('Venta tras cerrar el turno también rechazada (409)', ventaTrasCierre.status === 409);

  const turnosLista = await peticion('GET', '/turnos', tokenCajero);
  ok('Historial lista el turno del cajero',
    turnosLista.status === 200 && turnosLista.datos.datos.some((t) => t.id === turnoAbierto.datos.datos.id));

  const arqueoRestaurar = await peticion('PUT', '/configuracion', tokenAdmin, { clave: 'arqueo_habilitado', valor: '0' });
  ok('Arqueo queda restaurado a desactivado',
    arqueoRestaurar.status === 200 && arqueoRestaurar.datos.datos.some((c) => c.clave === 'arqueo_habilitado' && c.valor === '0'));

  console.log('\n=== 12. Anulación y consistencia ===');

  const anularCajero = await peticion('POST', `/facturas/${idFactura}/anular`, tokenCajero);
  ok('Cajero NO puede anular factura (403)', anularCajero.status === 403);

  const anular = await peticion('POST', `/facturas/${idFactura}/anular`, tokenAdmin);
  ok('Anular factura', anular.status === 200 && anular.datos.datos.estado === 'anulada');

  const stockRestaurado = await peticion('GET', `/productos/${idProducto1}`, tokenAdmin);
  const stockRestaurado2 = await peticion('GET', `/productos/${idProducto2}`, tokenAdmin);
  // La factura anulada vendió 3 y 2 unidades; las facturas de descuento por
  // línea y de descuentos combinados (que NO se anulan) vendieron 2+1 y 1 del
  // producto 1, la venta del turno de arqueo vendió 1 del producto 1
  // (tampoco se anula), y la factura multi-impuesto vendió 1 del producto 1
  // (no se anula): el stock queda en el inicial menos 5 y menos 1.
  ok('Stock restaurado tras anulación',
    igual(stockRestaurado.datos.datos.stock_actual, stockAntes1 - 5) && igual(stockRestaurado2.datos.datos.stock_actual, stockAntes2 - 1),
    `${stockAntes1}/${stockRestaurado.datos.datos.stock_actual} y ${stockAntes2}/${stockRestaurado2.datos.datos.stock_actual}`);

  const repMovAnul = await peticion('GET', `/reportes/movimientos?${rango}&motivo=anulacion`, tokenAdmin);
  ok('Movimientos de anulación registrados', repMovAnul.status === 200 && repMovAnul.datos.datos.detalle.length >= 2);

  const dobleAnulacion = await peticion('POST', `/facturas/${idFactura}/anular`, tokenAdmin);
  ok('Anular factura ya anulada rechazado (409)', dobleAnulacion.status === 409);

  console.log('\n=== 13. Compras / ingreso de mercancía (Fase 7) ===');

  const compraSinToken = await peticion('POST', '/compras', null, { items: [] });
  ok('Compra sin token rechazada (401)', compraSinToken.status === 401);

  const compraCajero = await peticion('POST', '/compras', tokenCajero, {
    items: [{ producto_id: idProducto1, cantidad: 1, costo_unitario: 2000 }]
  });
  ok('Cajero NO puede registrar compras (403)', compraCajero.status === 403);

  const compraVacia = await peticion('POST', '/compras', tokenAdmin, { items: [] });
  ok('Compra sin productos rechazada (400)', compraVacia.status === 400);

  const compraCantidadCero = await peticion('POST', '/compras', tokenAdmin, {
    items: [{ producto_id: idProducto1, cantidad: 0, costo_unitario: 2000 }]
  });
  ok('Cantidad en 0 rechazada (400)', compraCantidadCero.status === 400);

  const compraSinCosto = await peticion('POST', '/compras', tokenAdmin, {
    items: [{ producto_id: idProducto1, cantidad: 1 }]
  });
  ok('Línea sin costo unitario rechazada (400)', compraSinCosto.status === 400);

  const compraProvFantasma = await peticion('POST', '/compras', tokenAdmin, {
    proveedor_id: 999999, items: [{ producto_id: idProducto1, cantidad: 1, costo_unitario: 2000 }]
  });
  ok('Proveedor inexistente rechazado (404)', compraProvFantasma.status === 404);

  // Stock y costos vigentes antes de la compra.
  const preCompra1 = await peticion('GET', `/productos/${idProducto1}`, tokenAdmin);
  const preCompra2 = await peticion('GET', `/productos/${idProducto2}`, tokenAdmin);
  const stockPre1 = preCompra1.datos.datos.stock_actual;
  const stockPre2 = preCompra2.datos.datos.stock_actual;

  const compra = await peticion('POST', '/compras', tokenAdmin, {
    proveedor_id: idProveedor,
    items: [
      { producto_id: idProducto1, cantidad: 10, costo_unitario: 2000 },
      { producto_id: idProducto2, cantidad: 5, costo_unitario: 2500 }
    ]
  });
  ok('Registrar compra con dos productos y proveedor (201)',
    compra.status === 201 && igual(compra.datos.datos.costo_total, 10 * 2000 + 5 * 2500) &&
    compra.datos.datos.unidades === 15 && compra.datos.datos.proveedor_id === idProveedor &&
    Number.isInteger(compra.datos.datos.compra_id),
    `costo_total=${compra.status === 201 ? compra.datos.datos.costo_total : 'n/a'}`);

  const postCompra1 = await peticion('GET', `/productos/${idProducto1}`, tokenAdmin);
  const postCompra2 = await peticion('GET', `/productos/${idProducto2}`, tokenAdmin);
  ok('Stock incrementado tras la compra',
    igual(postCompra1.datos.datos.stock_actual, stockPre1 + 10) &&
    igual(postCompra2.datos.datos.stock_actual, stockPre2 + 5),
    `${stockPre1}->${postCompra1.datos.datos.stock_actual} y ${stockPre2}->${postCompra2.datos.datos.stock_actual}`);

  ok('Precio de compra actualizado por la línea con costo nuevo',
    igual(postCompra1.datos.datos.precio_compra, 2000) && igual(postCompra2.datos.datos.precio_compra, 2500));

  const repMovCompra = await peticion('GET', `/reportes/movimientos?${rango}&motivo=compra`, tokenAdmin);
  ok('Reporte lista los movimientos de compra', repMovCompra.status === 200 && repMovCompra.datos.datos.detalle.length >= 2);
  ok('Los movimientos de compra ya no muestran número de factura (bug F-/C-)',
    repMovCompra.datos.datos.detalle.every((m) => m.numero_factura === null || m.numero_factura === undefined));

  console.log('\n=== 14. Paginación ===');

  const pagProductos = await peticion('GET', '/productos?por_pagina=2&pagina=1', tokenAdmin);
  ok('Paginación de productos: solo 2 filas y total en cabecera',
    pagProductos.status === 200 && pagProductos.datos.datos.length === 2 &&
    Number(pagProductos.headers.get('x-total-registros')) >= 3,
    `total=${pagProductos.headers.get('x-total-registros')}`);

  const pagProductos2 = await peticion('GET', '/productos?por_pagina=2&pagina=2', tokenAdmin);
  ok('Página 2 de productos no repite la página 1',
    pagProductos2.status === 200 && pagProductos2.datos.datos.length > 0 &&
    !pagProductos2.datos.datos.some((p) => pagProductos.datos.datos.some((q) => q.id === p.id)));

  const pagClientes = await peticion('GET', '/clientes?por_pagina=1&pagina=1', tokenAdmin);
  ok('Paginación de clientes',
    pagClientes.status === 200 && pagClientes.datos.datos.length === 1 &&
    Number(pagClientes.headers.get('x-total-registros')) >= 1);

  const pagProveedores = await peticion('GET', '/proveedores?por_pagina=10&pagina=1', tokenAdmin);
  ok('Paginación de proveedores',
    pagProveedores.status === 200 && pagProveedores.datos.datos.length <= 10 &&
    Number(pagProveedores.headers.get('x-total-registros')) >= 1);

  const pagFacturas = await peticion('GET', '/facturas?por_pagina=5&pagina=1', tokenCajero);
  ok('Paginación de facturas (cajero)',
    pagFacturas.status === 200 && pagFacturas.datos.datos.length <= 5 &&
    Number(pagFacturas.headers.get('x-total-registros')) >= 1);

  const pagMov = await peticion('GET', `/reportes/movimientos?${rango}&motivo=compra&por_pagina=1&pagina=1`, tokenAdmin);
  ok('Paginación del detalle de movimientos',
    pagMov.status === 200 && pagMov.datos.datos.detalle.length === 1 &&
    Number(pagMov.headers.get('x-total-registros')) >= 2,
    `total=${pagMov.headers.get('x-total-registros')}`);

  const pagUsuarios = await peticion('GET', '/usuarios?por_pagina=1&pagina=1', tokenAdmin);
  ok('Paginación de usuarios: solo 1 fila y total en cabecera',
    pagUsuarios.status === 200 && pagUsuarios.datos.datos.length === 1 &&
    Number(pagUsuarios.headers.get('x-total-registros')) >= 2,
    `total=${pagUsuarios.headers.get('x-total-registros')}`);

  const pagUsuarios2 = await peticion('GET', '/usuarios?por_pagina=1&pagina=2', tokenAdmin);
  ok('Página 2 de usuarios no repite la página 1',
    pagUsuarios2.status === 200 && pagUsuarios2.datos.datos.length > 0 &&
    !pagUsuarios2.datos.datos.some((u) => pagUsuarios.datos.datos.some((v) => v.id === u.id)));

  const usuariosSinPaginar = await peticion('GET', '/usuarios', tokenAdmin);
  ok('Usuarios sin por_pagina se conservan completos',
    usuariosSinPaginar.status === 200 && !usuariosSinPaginar.headers.get('x-paginas'));

  const sinPaginar = await peticion('GET', '/productos', tokenAdmin);
  ok('Sin por_pagina se conserva el listado completo (selectores)',
    sinPaginar.status === 200 && sinPaginar.datos.datos.length >= 3 && !sinPaginar.headers.get('x-paginas'));

  console.log('\n=== 15. Limpieza ===');

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
