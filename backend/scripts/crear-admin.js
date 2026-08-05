// scripts/crear-admin.js
// Crea (o actualiza) el usuario administrador inicial.
// Uso: npm run seed
// Credenciales por defecto: usuario "admin", contraseña "admin123".
// Cambia la contraseña por defecto con las variables ADMIN_USUARIO / ADMIN_PASSWORD.
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const pool = require('../src/config/db');

dotenv.config();

async function crearAdmin() {
  const nombreUsuario = process.env.ADMIN_USUARIO || 'admin';
  const nombreCompleto = process.env.ADMIN_NOMBRE || 'Administrador del sistema';
  const contrasena = process.env.ADMIN_PASSWORD || 'admin123';

  if (contrasena.length < 8) {
    console.warn('[AVISO] La contraseña es corta (mínimo recomendado 8 caracteres).');
  }

  // Genera el hash de la contraseña (bcrypt incluye la sal automáticamente).
  const passwordHash = await bcrypt.hash(contrasena, 10);

  // Inserta el usuario o actualiza el hash/rol si ya existe (idempotente).
  await pool.query(
    `INSERT INTO usuarios (nombre_usuario, nombre_completo, password_hash, rol, activo)
     VALUES (?, ?, ?, 'admin', 1)
     ON DUPLICATE KEY UPDATE
       password_hash = VALUES(password_hash),
       nombre_completo = VALUES(nombre_completo),
       rol = 'admin',
       activo = 1`,
    [nombreUsuario, nombreCompleto, passwordHash]
  );

  console.log(`[SEED] Usuario administrador "${nombreUsuario}" listo.`);
  await pool.end();
}

crearAdmin().catch((err) => {
  console.error('[SEED] Error creando el administrador:', err.message);
  process.exit(1);
});
