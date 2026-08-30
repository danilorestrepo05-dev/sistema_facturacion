// test-exento.js — Verifica que impuestos:[] genera factura exenta.
const http = require('http');

function peticion(method, path, token, body) {
  return new Promise((ok) => {
    const opts = {
      hostname: '127.0.0.1', port: 3000, path: '/api/v1' + path, method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }
    };
    const r = http.request(opts, (s) => {
      let d = '';
      s.on('data', (c) => (d += c));
      s.on('end', () => ok({ status: s.statusCode, body: JSON.parse(d) }));
    });
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

(async () => {
  const login = await peticion('POST', '/auth/login', null, { nombre_usuario: 'admin', contrasena: 'admin123' });
  const tk = login.body.datos.token;

  const prods = await peticion('GET', '/productos?termino=', tk);
  const prod = prods.body.datos.find((p) => p.activo === 1 && p.stock_actual > 0);
  console.log('Producto:', prod.nombre, 'precio:', prod.precio_venta);

  // Crear factura con impuestos: [] (exento)
  const f = await peticion('POST', '/facturas', tk, {
    items: [{ producto_id: prod.id, cantidad: 1, impuestos: [] }]
  });
  console.log('Crear factura:', f.status, f.body.mensaje);
  console.log('  impuesto_total:', f.body.datos?.impuesto_total, 'total:', f.body.datos?.total);

  // Verificar detalle
  const det = await peticion('GET', '/facturas/' + f.body.datos?.id, tk);
  const d = det.body.datos?.detalles?.[0];
  console.log('Detalle impuestos:', JSON.stringify(d?.impuestos), 'impuesto_porcentaje:', d?.impuesto_porcentaje);

  const ok1 = f.status === 201;
  const ok2 = Number(f.body.datos?.impuesto_total) === 0;
  const ok3 = d?.impuestos?.length === 0;

  console.log('\nRESULTADO:', ok1 && ok2 && ok3
    ? 'OK — Factura exenta correcta (impuesto_total=0, impuestos=[])'
    : 'FALLO — status=' + f.status + ' impuesto_total=' + f.body.datos?.impuesto_total + ' impuestos=' + JSON.stringify(d?.impuestos));
  process.exit(ok1 && ok2 && ok3 ? 0 : 1);
})();
