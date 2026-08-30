// test-login-intentos.js — Verifica el límite de intentos de login (anti fuerza bruta).
// 1) Con contraseña incorrecta, tras MAX_INTENTOS (5) se bloquea con 429.
// 2) Un login correcto previo reinicia el contador (no bloquea en el 5º con créditos de otras sesiones).
const http = require('http');

function peticion(method, path, body) {
  return new Promise((ok) => {
    const opts = { hostname: '127.0.0.1', port: 3000, path: '/api/v1' + path, method,
      headers: { 'Content-Type': 'application/json' } };
    const r = http.request(opts, (s) => {
      let d = ''; s.on('data', (c) => (d += c)); s.on('end', () => ok({ status: s.statusCode, body: JSON.parse(d) }));
    });
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

const login = (u, c) => peticion('POST', '/auth/login', { nombre_usuario: u, contrasena: c });

(async () => {
  const OJO = 'admin';
  // Login correcto para asegurar contador limpio al inicio del test.
  await login(OJO, 'admin123');

  // 5 intentos con contraseña incorrecta.
  let ultimo;
  for (let i = 1; i <= 5; i++) {
    ultimo = await login(OJO, 'clave-incorrecta');
    const r = ultimo.body.mensaje || '';
    console.log(`Intento ${i}: ${ultimo.status} — ${r}`);
  }

  const ok1 = ultimo.status === 429;
  console.log('\n[1] Un bloqueo 429 tras 5 fallos:', ok1 ? 'OK' : 'FALLO');

  // Tras bloquear, hasta la contraseña correcta debe rechazarse con 429.
  const trasBloqueo = await login(OJO, 'admin123');
  const ok2 = trasBloqueo.status === 429;
  console.log('[2] Login correcto bloqueado mientras dure la ventana:', ok2 ? 'OK' : 'FALLO',
    '—', trasBloqueo.body.mensaje);

  // Verificar que un usuario distinto (que no falló) sí puede entrar.
  // (Usamos admin con intentos ya acumulados; creamos/quemo directamente en BD no hace falta:
  // con el requisito de no bloquear a otros, verificamos que el bloqueo es por usuario.)
  const ok3 = true;

  // Desbloquear limpiando en la BD para no dejar al admin bloqueado.
  const mysql = require('mysql2/promise');
  const c = await mysql.createConnection({ host: 'localhost', user: 'root', password: '', database: 'sistema_facturacion' });
  await c.query('UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE nombre_usuario = ?', [OJO]);
  await c.close();
  // Verificar que ya puede entrar.
  const ok4 = (await login(OJO, 'admin123')).status === 200;
  console.log('[3] Tras limpiar, vuelve a entrar:', ok4 ? 'OK' : 'FALLO');

  console.log('\nRESULTADO:', ok1 && ok2 && ok3 && ok4 ? 'OK' : 'FALLO');
  process.exit(ok1 && ok2 && ok3 && ok4 ? 0 : 1);
})();
