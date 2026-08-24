// src/models/proveedor.model.js
// Consultas a la tabla de proveedores (mysql2 con consultas preparadas).
const pool = require('../config/db');

// Lista proveedores; acepta un término opcional para buscar por nombre, documento, teléfono o tipo de item.
const listar = async (termino = '', pagina = 1, porPagina = 0) => {
  const consulta = `
    SELECT id, nombre, tipo_documento, documento, telefono, email, direccion,
           tipo_item, activo, creado_en, actualizado_en
    FROM proveedores
    WHERE (nombre LIKE ? OR documento LIKE ? OR telefono LIKE ? OR tipo_item LIKE ?)
    ORDER BY nombre`;

  const patron = `%${termino}%`;
  const parametros = [patron, patron, patron, patron];
  let sql = consulta;

  // Paginación opt-in: solo se aplica cuando la vista pide por_pagina.
  if (porPagina > 0) {
    sql += ' LIMIT ? OFFSET ?';
    parametros.push(porPagina, (pagina - 1) * porPagina);
  }

  const [filas] = await pool.query(sql, parametros);
  return filas;
};

// Cuenta los proveedores que coinciden con la búsqueda (para la paginación).
const contar = async (termino = '') => {
  const patron = `%${termino}%`;
  const [filas] = await pool.query(
    `SELECT COUNT(*) AS total FROM proveedores
     WHERE (nombre LIKE ? OR documento LIKE ? OR telefono LIKE ? OR tipo_item LIKE ?)`,
    [patron, patron, patron, patron]
  );
  return filas[0].total;
};

// Busca un proveedor por su id.
const buscarPorId = async (id) => {
  const [filas] = await pool.query(
    `SELECT id, nombre, tipo_documento, documento, telefono, email, direccion,
            tipo_item, activo, creado_en, actualizado_en
     FROM proveedores WHERE id = ?`,
    [id]
  );
  return filas[0] || null;
};

// Crea un nuevo proveedor y devuelve el registro creado.
const crear = async ({ nombre, tipo_documento = 'NIT', documento = null, telefono = null, email = null, direccion = null, tipo_item = null, activo = 1 }) => {
  const [resultado] = await pool.query(
    `INSERT INTO proveedores (nombre, tipo_documento, documento, telefono, email, direccion, tipo_item, activo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [nombre, tipo_documento, documento, telefono, email, direccion, tipo_item, activo]
  );
  return buscarPorId(resultado.insertId);
};

// Actualiza los datos de un proveedor existente.
const actualizar = async (id, { nombre, tipo_documento, documento, telefono, email, direccion, tipo_item, activo }) => {
  await pool.query(
    `UPDATE proveedores SET
       nombre = ?, tipo_documento = ?, documento = ?, telefono = ?, email = ?, direccion = ?, tipo_item = ?, activo = ?
     WHERE id = ?`,
    [nombre, tipo_documento, documento, telefono, email, direccion, tipo_item, activo, id]
  );
  return buscarPorId(id);
};

// Elimina un proveedor.
const eliminar = async (id) => {
  const [resultado] = await pool.query('DELETE FROM proveedores WHERE id = ?', [id]);
  return resultado.affectedRows > 0;
};

module.exports = { listar, contar, buscarPorId, crear, actualizar, eliminar };
