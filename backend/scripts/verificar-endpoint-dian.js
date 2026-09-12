// scripts/verificar-endpoint-dian.js
// Verificación de los endpoints de cola DIAN vía HTTP real (fetch + servidor efímero).
const http = require('http');
const app = require('../src/app');
const pool = require('../src/config/db');
const configModel = require('../src/models/config.model');
const facturaModel = require('../src/models/factura.model');

const BASE = 'http://127.0.0.1:4599/api/v1';

const pedir = async (ruta, opciones = {}, token = null) => {
  const headers = { 'Content-Type': 'application/json', ...(opciones.headers || {}) };
  if (token) headers.Authorization = 'Bearer ' + token;
  const respuesta = await fetch(BASE + ruta, { ...opciones, headers });
  const cuerpo = await respuesta.json().catch(() => ({}));
  return { status: respuesta.status, cuerpo };
};

(async () => {
  const server = http.createServer(app);
  await new Promise((r) => server.listen(4599, '127.0.0.1', r));

  const prev = await configModel.listarMapa();
  await configModel.actualizar('facturacion_electronica_habilitado', '1');
  await pool.query('UPDATE productos SET stock_actual = 20 WHERE id = 1');

  const login = await pedir('/auth/login', { method: 'POST', body: JSON.stringify({ nombre_usuario: 'admin', contrasena: 'admin123' }) });
  const token = login.cuerpo.token || login.cuerpo.datos?.token;
  if (!token) { console.log('LOGIN body:', JSON.stringify(login.cuerpo)); process.exit(1); }
  console.log('  OK  Login admin obtenido');

  // Fuerza un envío pendiente con la DIAN deshabilitada para no procesarlo al crear.
  await configModel.actualizar('facturacion_electronica_habilitado', '0');
  const f = await facturaModel.crear({ cliente_id: null, tipo_pago: 'efectivo', items: [{ producto_id: 1, cantidad: 1 }] }, 1);
  await pool.query(
    'INSERT INTO envios_dian (factura_id, proveedor, estado, proximo_intento) VALUES (?, ?, ?, DATE_SUB(NOW(), INTERVAL 5 MINUTE))',
    [f.id, 'simulacion', 'pendiente']
  );
  await configModel.actualizar('facturacion_electronica_habilitado', '1');

  const pend = await pedir('/dian/pendientes', { method: 'GET' }, token);
  console.log('  GET /dian/pendientes ->', pend.status, 'pendientes=', pend.cuerpo?.datos?.pendientes);
  console.log((pend.status === 200 && pend.cuerpo?.datos?.pendientes >= 1) ? '  OK  Pendientes listados' : '  FALLO pendientes');

  const cola = await pedir('/dian/procesar-cola', { method: 'POST' }, token);
  console.log('  POST /dian/procesar-cola ->', cola.status, 'procesados=', cola.cuerpo?.datos?.procesados);
  console.log((cola.status === 200 && cola.cuerpo?.datos?.procesados >= 1) ? '  OK  Cola procesada vía HTTP' : '  FALLO procesar-cola');

  const sinToken = await pedir('/dian/pendientes', { method: 'GET' }, null);
  console.log('  GET /dian/pendientes sin token ->', sinToken.status);
  console.log(sinToken.status === 401 || sinToken.status === 403 ? '  OK  Sin token rechazado' : '  FALLO auth');

  await facturaModel.anular(f.id, 1).catch(() => {});
  for (const [k, v] of Object.entries(prev)) await configModel.actualizar(k, v).catch(() => {});
  await new Promise((r) => server.close(r));
  await pool.end();
  console.log('LISTO');
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
