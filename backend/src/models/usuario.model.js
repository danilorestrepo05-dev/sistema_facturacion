// src/models/usuario.model.js
// Consultas a la tabla de usuarios (mysql2 con consultas preparadas).
const pool = require('../config/db');

// Lista usuarios; acepta un término opcional para buscar por nombre de usuario o completo.
const listar = async (termino = '') => {
  const patron = `%${termino}%`;
  const [filas] = await pool.query(
    `SELECT id, nombre_usuario, nombre_completo, rol, activo, creado_en, actualizado_en
     FROM usuarios
     WHERE nombre_usuario LIKE ? OR nombre_completo LIKE ?
     ORDER BY nombre_completo`,
    [patron, patron]
  );
  return filas;
};

// Busca un usuario por su id (nunca devuelve el hash de la contraseña).
const buscarPorId = async (id) => {
  const [filas] = await pool.query(
    `SELECT id, nombre_usuario, nombre_completo, rol, activo, creado_en
     FROM usuarios WHERE id = ?`,
    [id]
  );
  return filas[0] || null;
};

// Busca un usuario por su nombre de usuario (para el login, incluye el hash).
const buscarPorNombreUsuario = async (nombreUsuario) => {
  const [filas] = await pool.query(
    'SELECT id, nombre_usuario, nombre_completo, password_hash, rol, activo FROM usuarios WHERE nombre_usuario = ?',
    [nombreUsuario]
  );
  return filas[0] || null;
};

// Crea un nuevo usuario y devuelve el registro creado.
const crear = async ({ nombre_usuario, nombre_completo, password_hash, rol, activo }) => {
  const [resultado] = await pool.query(
    `INSERT INTO usuarios (nombre_usuario, nombre_completo, password_hash, rol, activo)
     VALUES (?, ?, ?, ?, ?)`,
    [nombre_usuario, nombre_completo, password_hash, rol, activo]
  );
  return buscarPorId(resultado.insertId);
};

// Actualiza un usuario; si se envía password_hash se cambia la contraseña.
const actualizar = async (id, { nombre_usuario, nombre_completo, rol, activo, password_hash }) => {
  if (password_hash) {
    await pool.query(
      `UPDATE usuarios SET nombre_usuario = ?, nombre_completo = ?, rol = ?, activo = ?, password_hash = ?
       WHERE id = ?`,
      [nombre_usuario, nombre_completo, rol, activo, password_hash, id]
    );
  } else {
    await pool.query(
      `UPDATE usuarios SET nombre_usuario = ?, nombre_completo = ?, rol = ?, activo = ?
       WHERE id = ?`,
      [nombre_usuario, nombre_completo, rol, activo, id]
    );
  }
  return buscarPorId(id);
};

// Desactiva un usuario (baja lógica para no romper las facturas existentes).
const desactivar = async (id) => {
  const [resultado] = await pool.query('UPDATE usuarios SET activo = 0 WHERE id = ?', [id]);
  return resultado.affectedRows > 0;
};

// Cuenta los administradores activos (para evitar dejar el sistema sin admin).
const contarAdminsActivos = async () => {
  const [filas] = await pool.query(
    "SELECT COUNT(*) AS total FROM usuarios WHERE rol = 'admin' AND activo = 1"
  );
  return filas[0].total;
};

module.exports = {
  listar,
  buscarPorId,
  buscarPorNombreUsuario,
  crear,
  actualizar,
  desactivar,
  contarAdminsActivos
};
