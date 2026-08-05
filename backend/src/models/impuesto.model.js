// src/models/impuesto.model.js
// Consultas a la tabla de impuestos (mysql2 con consultas preparadas).
const pool = require('../config/db');

// Lista todos los impuestos ordenados por nombre.
const listar = async () => {
  const [filas] = await pool.query(
    'SELECT id, nombre, porcentaje, activo, creado_en, actualizado_en FROM impuestos ORDER BY nombre'
  );
  return filas;
};

// Busca un impuesto por su id.
const buscarPorId = async (id) => {
  const [filas] = await pool.query(
    'SELECT id, nombre, porcentaje, activo, creado_en, actualizado_en FROM impuestos WHERE id = ?',
    [id]
  );
  return filas[0] || null;
};

// Crea un nuevo impuesto y devuelve el registro creado.
const crear = async ({ nombre, porcentaje = 0, activo = 1 }) => {
  const [resultado] = await pool.query(
    'INSERT INTO impuestos (nombre, porcentaje, activo) VALUES (?, ?, ?)',
    [nombre, porcentaje, activo]
  );
  return buscarPorId(resultado.insertId);
};

// Actualiza los datos de un impuesto existente.
const actualizar = async (id, { nombre, porcentaje, activo }) => {
  await pool.query(
    'UPDATE impuestos SET nombre = ?, porcentaje = ?, activo = ? WHERE id = ?',
    [nombre, porcentaje, activo, id]
  );
  return buscarPorId(id);
};

// Elimina un impuesto (si tiene productos, la FK la pondrá en NULL).
const eliminar = async (id) => {
  const [resultado] = await pool.query('DELETE FROM impuestos WHERE id = ?', [id]);
  return resultado.affectedRows > 0;
};

module.exports = { listar, buscarPorId, crear, actualizar, eliminar };
