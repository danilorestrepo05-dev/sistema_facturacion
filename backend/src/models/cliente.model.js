// src/models/cliente.model.js
// Consultas a la tabla de clientes (mysql2 con consultas preparadas).
const pool = require('../config/db');

// Lista clientes; acepta un término opcional para buscar por nombre, documento o teléfono.
const listar = async (termino = '') => {
  const consulta = `
    SELECT id, nombre, tipo_documento, documento, telefono, email, direccion,
           activo, creado_en, actualizado_en
    FROM clientes
    WHERE (nombre LIKE ? OR documento LIKE ? OR telefono LIKE ?)
    ORDER BY nombre`;

  const patron = `%${termino}%`;
  const [filas] = await pool.query(consulta, [patron, patron, patron]);
  return filas;
};

// Busca un cliente por su id.
const buscarPorId = async (id) => {
  const [filas] = await pool.query(
    `SELECT id, nombre, tipo_documento, documento, telefono, email, direccion,
            activo, creado_en, actualizado_en
     FROM clientes WHERE id = ?`,
    [id]
  );
  return filas[0] || null;
};

// Crea un nuevo cliente y devuelve el registro creado.
const crear = async ({ nombre, tipo_documento = 'CC', documento = null, telefono = null, email = null, direccion = null, activo = 1 }) => {
  const [resultado] = await pool.query(
    `INSERT INTO clientes (nombre, tipo_documento, documento, telefono, email, direccion, activo)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [nombre, tipo_documento, documento, telefono, email, direccion, activo]
  );
  return buscarPorId(resultado.insertId);
};

// Actualiza los datos de un cliente existente.
const actualizar = async (id, { nombre, tipo_documento, documento, telefono, email, direccion, activo }) => {
  await pool.query(
    `UPDATE clientes SET
       nombre = ?, tipo_documento = ?, documento = ?, telefono = ?, email = ?, direccion = ?, activo = ?
     WHERE id = ?`,
    [nombre, tipo_documento, documento, telefono, email, direccion, activo, id]
  );
  return buscarPorId(id);
};

// Elimina un cliente.
const eliminar = async (id) => {
  const [resultado] = await pool.query('DELETE FROM clientes WHERE id = ?', [id]);
  return resultado.affectedRows > 0;
};

module.exports = { listar, buscarPorId, crear, actualizar, eliminar };
