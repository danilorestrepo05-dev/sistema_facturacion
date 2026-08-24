// src/models/cliente.model.js
// Consultas a la tabla de clientes (mysql2 con consultas preparadas).
const pool = require('../config/db');

// Lista clientes; acepta un término opcional para buscar por nombre, documento o teléfono.
const listar = async (termino = '', pagina = 1, porPagina = 0) => {
  const consulta = `
    SELECT id, nombre, tipo_documento, documento, telefono, email, direccion,
           activo, creado_en, actualizado_en
    FROM clientes
    WHERE (nombre LIKE ? OR documento LIKE ? OR telefono LIKE ?)
    ORDER BY nombre`;

  const patron = `%${termino}%`;
  const parametros = [patron, patron, patron];
  let sql = consulta;

  // Paginación opt-in: solo se aplica cuando la vista pide por_pagina.
  if (porPagina > 0) {
    sql += ' LIMIT ? OFFSET ?';
    parametros.push(porPagina, (pagina - 1) * porPagina);
  }

  const [filas] = await pool.query(sql, parametros);
  return filas;
};

// Cuenta los clientes que coinciden con la búsqueda (para la paginación).
const contar = async (termino = '') => {
  const patron = `%${termino}%`;
  const [filas] = await pool.query(
    `SELECT COUNT(*) AS total FROM clientes
     WHERE (nombre LIKE ? OR documento LIKE ? OR telefono LIKE ?)`,
    [patron, patron, patron]
  );
  return filas[0].total;
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

module.exports = { listar, contar, buscarPorId, crear, actualizar, eliminar };
