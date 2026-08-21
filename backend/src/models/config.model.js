// src/models/config.model.js
// Consultas a la tabla de configuraciones (mysql2 con consultas preparadas).
const pool = require('../config/db');

// Devuelve todas las configuraciones con su descripción (pantalla de administración).
const listar = async () => {
  const [filas] = await pool.query(
    'SELECT clave, valor, descripcion, actualizado_en FROM configuraciones ORDER BY clave'
  );
  return filas;
};

// Devuelve las configuraciones como un mapa simple { clave: valor }.
const listarMapa = async () => {
  const filas = await listar();
  const mapa = {};
  for (const fila of filas) {
    mapa[fila.clave] = fila.valor;
  }
  return mapa;
};

// Actualiza el valor de una clave. Devuelve true si la clave existía.
const actualizar = async (clave, valor) => {
  const [resultado] = await pool.query(
    'UPDATE configuraciones SET valor = ? WHERE clave = ?',
    [valor, clave]
  );
  return resultado.affectedRows > 0;
};

module.exports = { listar, listarMapa, actualizar };
