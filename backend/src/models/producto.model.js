// src/models/producto.model.js
// Consultas a la tabla de productos (mysql2 con consultas preparadas).
const pool = require('../config/db');

// Lista productos con el nombre de su categoría e impuesto.
// Acepta un término de búsqueda opcional por código, nombre o categoría.
const listar = async (termino = '') => {
  const consulta = `
    SELECT p.id, p.codigo, p.nombre, p.descripcion,
           p.categoria_id, c.nombre AS categoria_nombre,
           p.impuesto_id, i.nombre AS impuesto_nombre, i.porcentaje AS impuesto_porcentaje,
           p.precio_compra, p.precio_venta, p.stock_actual, p.stock_minimo,
           p.unidad_medida, p.activo, p.creado_en, p.actualizado_en
    FROM productos p
    LEFT JOIN categorias c ON c.id = p.categoria_id
    LEFT JOIN impuestos i ON i.id = p.impuesto_id
    WHERE (p.codigo LIKE ? OR p.nombre LIKE ? OR c.nombre LIKE ?)
    ORDER BY p.nombre`;

  const patron = `%${termino}%`;
  const [filas] = await pool.query(consulta, [patron, patron, patron]);
  return filas;
};

// Busca un producto por su id con datos de categoría e impuesto.
const buscarPorId = async (id) => {
  const consulta = `
    SELECT p.id, p.codigo, p.nombre, p.descripcion,
           p.categoria_id, c.nombre AS categoria_nombre,
           p.impuesto_id, i.nombre AS impuesto_nombre, i.porcentaje AS impuesto_porcentaje,
           p.precio_compra, p.precio_venta, p.stock_actual, p.stock_minimo,
           p.unidad_medida, p.activo, p.creado_en, p.actualizado_en
    FROM productos p
    LEFT JOIN categorias c ON c.id = p.categoria_id
    LEFT JOIN impuestos i ON i.id = p.impuesto_id
    WHERE p.id = ?`;

  const [filas] = await pool.query(consulta, [id]);
  return filas[0] || null;
};

// Crea un nuevo producto y devuelve el registro creado.
const crear = async (datos) => {
  const {
    codigo, nombre, descripcion = null, categoria_id = null, impuesto_id = null,
    precio_compra = 0, precio_venta = 0, stock_actual = 0, stock_minimo = 0,
    unidad_medida = 'unidad', activo = 1
  } = datos;

  const [resultado] = await pool.query(
    `INSERT INTO productos
       (codigo, nombre, descripcion, categoria_id, impuesto_id, precio_compra,
        precio_venta, stock_actual, stock_minimo, unidad_medida, activo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [codigo, nombre, descripcion, categoria_id, impuesto_id, precio_compra,
     precio_venta, stock_actual, stock_minimo, unidad_medida, activo]
  );

  return buscarPorId(resultado.insertId);
};

// Actualiza los datos de un producto existente.
const actualizar = async (id, datos) => {
  const {
    codigo, nombre, descripcion, categoria_id, impuesto_id,
    precio_compra, precio_venta, stock_actual, stock_minimo, unidad_medida, activo
  } = datos;

  await pool.query(
    `UPDATE productos SET
       codigo = ?, nombre = ?, descripcion = ?, categoria_id = ?, impuesto_id = ?,
       precio_compra = ?, precio_venta = ?, stock_actual = ?, stock_minimo = ?,
       unidad_medida = ?, activo = ?
     WHERE id = ?`,
    [codigo, nombre, descripcion, categoria_id, impuesto_id, precio_compra,
     precio_venta, stock_actual, stock_minimo, unidad_medida, activo, id]
  );

  return buscarPorId(id);
};

// Elimina un producto.
const eliminar = async (id) => {
  const [resultado] = await pool.query('DELETE FROM productos WHERE id = ?', [id]);
  return resultado.affectedRows > 0;
};

module.exports = { listar, buscarPorId, crear, actualizar, eliminar };
