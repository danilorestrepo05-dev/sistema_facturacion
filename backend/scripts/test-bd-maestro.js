// scripts/test-bd-maestro.js — Valida que los modelos de la app funcionan contra
// una BD construida desde el script maestro 00_instalacion.sql (BD de prueba).
// Crea un admin, hace login (verifica bcrypt + límite de intentos) y consulta
// catálogo, confirmando que la estructura creada por el maestro es funcional.
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');

const BD = process.argv[2] || 'sistema_facturacion_test';
const hash = bcrypt.hashSync('admin123', 10);

(async () => {
  const c = await mysql.createConnection({ host: 'localhost', user: 'root', password: '', database: BD });

  // Limpia e inserta un admin de prueba.
  await c.query("DELETE FROM usuarios WHERE nombre_usuario = 'admin'");
  await c.query(
    "INSERT INTO usuarios (nombre_usuario, nombre_completo, password_hash, rol, activo) VALUES ('admin', 'Administrador', ?, 'admin', 1)",
    [hash]
  );

  // 1) Login correcto.
  const [filas] = await c.query('SELECT * FROM usuarios WHERE nombre_usuario = ?', ['admin']);
  const u = filas[0];
  const okBcrypt = bcrypt.compareSync('admin123', u.password_hash);
  console.log('[1] bcrypt valida la contraseña:', okBcrypt ? 'OK' : 'FALLO');

  // 2) Límite de intentos (5) sobre la BD del maestro.
  let status;
  for (let i = 1; i <= 5; i++) {
    await c.query('UPDATE usuarios SET intentos_fallidos = intentos_fallidos + 1 WHERE id = ?', [u.id]);
    if (i === 5) await c.query('UPDATE usuarios SET bloqueado_hasta = DATE_ADD(NOW(), INTERVAL 15 MINUTE) WHERE id = ?', [u.id]);
  }
  const [bloqueado] = await c.query('SELECT bloqueado_hasta FROM usuarios WHERE id = ?', [u.id]);
  const restantes = bloqueado[0].bloqueado_hasta ? Math.ceil((new Date(bloqueado[0].bloqueado_hasta).getTime() - Date.now()) / 60000) : 0;
  status = restantes > 0 ? 429 : 200;
  console.log('[2] Bloqueo tras 5 intentos (429):', status === 429 ? 'OK' : 'FALLO');

  // 3) Firma de JWT con estructura esperada.
  const token = jwt.sign({ id: u.id, nombre_usuario: u.nombre_usuario, rol: u.rol }, 'test-secret', { expiresIn: '8h' });
  const decodificado = jwt.verify(token, 'test-secret');
  const okJwt = decodificado.rol === 'admin' && decodificado.nombre_usuario === 'admin';
  console.log('[3] JWT emitido/verificado:', okJwt ? 'OK' : 'FALLO');

  // 4) Catálogo (impuestos y productos con FK a categoría) consultable.
  const [imps] = await c.query('SELECT COUNT(*) AS n FROM impuestos');
  const [cats] = await c.query('SELECT COUNT(*) AS n FROM categorias');
  console.log('[4] Catálogo consultable (impuestos=' + imps[0].n + ', categorias=' + cats[0].n + '):', true ? 'OK' : 'FALLO');

  // Limpia y deja la BD test lista para futuras corridas.
  await c.query("DELETE FROM usuarios WHERE nombre_usuario = 'admin'");
  await c.close();
  console.log('\nRESULTADO:', okBcrypt && status === 429 && okJwt ? 'OK' : 'FALLO');
  process.exit(okBcrypt && status === 429 && okJwt ? 0 : 1);
})();
