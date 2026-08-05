// src/models/categoria.model.js
// Consultas a la tabla de categorías (mysql2 con consultas preparadas).
const pool = require('../config/db');

// Lista todas las categorías ordenadas por nombre.
const listar = async () => {
  const [filas] = await pool.query(
    'SELECT id, nombre, descripcion, activo, creado_en, actualizado_en FROM categorias ORDER BY nombre'
  );
  return filas;
};

// Busca una categoría por su id.
const buscarPorId = async (id) => {
  const [filas] = await pool.query(
    'SELECT id, nombre, descripcion, activo, creado_en, actualizado_en FROM categorias WHERE id = ?',
    [id]
  );
  return filas[0] || null;
};

// Crea una nueva categoría y devuelve el registro creado.
const crear = async ({ nombre, descripcion = null, activo = 1 }) => {
  const [resultado] = await pool.query(
    'INSERT INTO categorias (nombre, descripcion, activo) VALUES (?, ?, ?)',
    [nombre, descripcion, activo]
  );
  return buscarPorId(resultado.insertId);
};

// Actualiza los datos de una categoría existente.
const actualizar = async (id, { nombre, descripcion, activo }) => {
  await pool.query(
    'UPDATE categorias SET nombre = ?, descripcion = ?, activo = ? WHERE id = ?',
    [nombre, descripcion, activo, id]
  );
  return buscarPorId(id);
};

// Elimina una categoría (si tiene productos, la FK la pondrá en NULL).
const eliminar = async (id) => {
  const [resultado] = await pool.query('DELETE FROM categorias WHERE id = ?', [id]);
  return resultado.affectedRows > 0;
};

module.exports = { listar, buscarPorId, crear, actualizar, eliminar };
