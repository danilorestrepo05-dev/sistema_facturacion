// scripts/test-dian-notas.js
// Prueba end-to-end vía HTTP (fetch + servidor efectímero) del módulo de
// NOTAS CORRECTIVAS: creación, emisión DIAN, PDF y ticket.
const http = require('http');
const app = require('../src/app');
const pool = require('../src/config/db');
const configModel = require('../src/models/config.model');
const facturaModel = require('../src/models/factura.model');

const BASE = 'http://127.0.0.1:4601/api/v1';
let fallos = 0;
let pasos = 0;
const ok = (c, n, e = '') => { pasos++; if (c) console.log(`  OK  ${n}${e ? ` (${e})` : ''}`); else { fallos++; console.log(`[ERROR] ${n} ${e}`); } };

const pedir = async (ruta, opciones = {}, token = null) => {
  const headers = { 'Content-Type': 'application/json', ...(opciones.headers || {}) };
  if (token) headers.Authorization = 'Bearer ' + token;
  const respuesta = await fetch(BASE + ruta, { ...opciones, headers });
  const ct = respuesta.headers.get('content-type') || '';
  const cuerpo = ct.includes('pdf') || ct.includes('text/plain')
    ? Buffer.from(await respuesta.arrayBuffer())
    : await respuesta.json().catch(() => ({}));
  return { status: respuesta.status, ct, cuerpo };
};

(async () => {
  const server = http.createServer(app);
  await new Promise((r) => server.listen(4601, '127.0.0.1', r));

  const prev = await configModel.listarMapa();
  await configModel.actualizar('facturacion_electronica_habilitado', '0');
  await pool.query('UPDATE productos SET stock_actual = 50 WHERE id = 1');

  const login = await pedir('/auth/login', { method: 'POST', body: JSON.stringify({ nombre_usuario: 'admin', contrasena: 'admin123' }) });
  const token = login.cuerpo.token || login.cuerpo.datos?.token;
  ok(Boolean(token), 'Login admin obtenido');

  // Factura base sobre la que emitiremos notas (sin DIAN aún).
  const f = await facturaModel.crear({ cliente_id: null, tipo_pago: 'efectivo', items: [{ producto_id: 1, cantidad: 2 }] }, 1);
  ok(f.id, 'Factura base creada', `id=${f.id}`);

  // 1) CRUD de notas crédito y débito vía API.
  const nc = await pedir('/notas', { method: 'POST', body: JSON.stringify({ tipo: 'credito', factura_original_id: f.id, motivo: 'Anulación total' }) }, token);
  ok(nc.status === 201, 'Crear nota crédito vía API', nc.cuerpo?.datos?.prefijo + '-' + nc.cuerpo?.datos?.numero_nota);
  const ncId = nc.cuerpo?.datos?.id;
  ok(Number(nc.cuerpo?.datos?.total) === Number(f.total), 'Nota crédito total = factura original');

  const nd = await pedir('/notas', { method: 'POST', body: JSON.stringify({ tipo: 'debito', factura_original_id: f.id, monto: 3000, motivo: 'Ajuste' }) }, token);
  ok(nd.status === 201, 'Crear nota débito vía API', nd.cuerpo?.datos?.prefijo + '-' + nd.cuerpo?.datos?.numero_nota);
  const ndId = nd.cuerpo?.datos?.id;

  const lista = await pedir('/notas?tipo=credito', { method: 'GET' }, token);
  ok(lista.status === 200 && Array.isArray(lista.cuerpo?.datos) && lista.cuerpo.datos.length >= 1, 'Listar notas crédito');

  // 2) Emisión DIAN explícita de cada nota (se habilita la facturación).
  await configModel.actualizar('facturacion_electronica_habilitado', '1');
  const dianNC = await pedir(`/notas/${ncId}/dian`, { method: 'POST' }, token);
  ok(dianNC.status === 200 && dianNC.cuerpo?.datos?.estado === 'aprobada', 'Nota crédito aprobada DIAN', dianNC.cuerpo?.datos?.estado);

  const dianND = await pedir(`/notas/${ndId}/dian`, { method: 'POST' }, token);
  ok(dianND.status === 200 && dianND.cuerpo?.datos?.estado === 'aprobada', 'Nota débito aprobada DIAN', dianND.cuerpo?.datos?.estado);

  const detNC = await pedir(`/notas/${ncId}`, { method: 'GET' }, token);
  ok(Boolean(detNC.cuerpo?.datos?.cufe) && detNC.cuerpo.datos.cufe.length === 96, 'CUDE de la nota crédito (96 hex)');
  ok(Boolean(detNC.cuerpo?.datos?.xml_dian) && detNC.cuerpo.datos.xml_dian.includes('<CreditNote'), 'XML de la nota crédito');

  // 3) PDF y ticket de la nota.
  const pdf = await pedir(`/notas/${ncId}/pdf?formato=carta`, { method: 'GET' }, token);
  ok(pdf.status === 200 && pdf.ct.includes('pdf') && pdf.cuerpo.length > 1000, 'PDF de la nota descargado', `bytes=${pdf.cuerpo.length}`);

  const ticket = await pedir(`/notas/${ncId}/ticket?ancho=80`, { method: 'GET' }, token);
  const ticketTexto = ticket.cuerpo.toString('utf8');
  ok(ticket.status === 200 && ticketTexto.includes('NOTA CRÉDITO'), 'Ticket de la nota descargado');

  // 4) Anulación.
  const anul = await pedir(`/notas/${ndId}/anular`, { method: 'POST' }, token);
  ok(anul.status === 200 && anul.cuerpo?.datos?.estado === 'anulada', 'Nota débito anulada vía API');

  // 5) Autenticación y validación.
  const sinToken = await pedir('/notas', { method: 'GET' }, null);
  ok(sinToken.status === 401 || sinToken.status === 403, 'Sin token rechazado en /notas');

  const invalida = await pedir('/notas', { method: 'POST', body: JSON.stringify({ tipo: 'debito', factura_original_id: f.id }) }, token);
  ok(invalida.status === 400, 'Nota débito sin monto rechazada (400)');

  // Limpieza.
  await notaAnular(ncId).catch(() => {});
  await facturaModel.anular(f.id, 1).catch(() => {});
  for (const [k, v] of Object.entries(prev)) await configModel.actualizar(k, v).catch(() => {});
  await new Promise((r) => server.close(r));
  await pool.end();

  console.log(`\nRESULTADO: ${pasos} pasos, ${fallos} fallos.`);
  process.exit(fallos ? 1 : 0);

  async function notaAnular(id) {
    await pedir(`/notas/${id}/anular`, { method: 'POST' }, token);
  }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
