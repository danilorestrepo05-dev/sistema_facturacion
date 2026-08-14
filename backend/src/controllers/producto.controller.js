// src/controllers/producto.controller.js
// Lógica de CRUD para productos.
const productoModel = require('../models/producto.model');
const { jsonExito, jsonError } = require('../utils/response');

// GET /api/v1/productos?termino=...
const listar = async (req, res, next) => {
  try {
    const termino = String(req.query.termino || '').trim();
    const productos = await productoModel.listar(termino);
    return jsonExito(res, productos, 'Productos obtenidos');
  } catch (err) {
    return next(err);
  }
};

// GET /api/v1/productos/siguiente-codigo
const siguienteCodigo = async (req, res, next) => {
  try {
    const codigo = await productoModel.siguienteCodigo();
    return jsonExito(res, { codigo }, 'Código generado');
  } catch (err) {
    return next(err);
  }
};

// GET /api/v1/productos/:id
const obtener = async (req, res, next) => {
  try {
    const producto = await productoModel.buscarPorId(req.params.id);

    if (!producto) {
      return jsonError(res, 'Producto no encontrado', 404);
    }

    return jsonExito(res, producto, 'Producto obtenido');
  } catch (err) {
    return next(err);
  }
};

// POST /api/v1/productos
const crear = async (req, res, next) => {
  try {
    const datos = req.body || {};

    // Si no se envía un código, se autogenera el siguiente correlativo (PRO-001, ...).
    if (!datos.codigo || !String(datos.codigo).trim()) {
      datos.codigo = await productoModel.siguienteCodigo();
    }

    const errorValidacion = validarProducto(datos);
    if (errorValidacion) {
      return jsonError(res, errorValidacion, 400);
    }

    const producto = await productoModel.crear(normalizar(datos));
    return jsonExito(res, producto, 'Producto creado', 201);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return jsonError(res, 'Ya existe un producto con ese código', 409);
    }
    return next(err);
  }
};

// PUT /api/v1/productos/:id
const actualizar = async (req, res, next) => {
  try {
    const datos = req.body || {};

    const errorValidacion = validarProducto(datos);
    if (errorValidacion) {
      return jsonError(res, errorValidacion, 400);
    }

    const existe = await productoModel.buscarPorId(req.params.id);
    if (!existe) {
      return jsonError(res, 'Producto no encontrado', 404);
    }

    const producto = await productoModel.actualizar(req.params.id, normalizar(datos));
    return jsonExito(res, producto, 'Producto actualizado');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return jsonError(res, 'Ya existe un producto con ese código', 409);
    }
    return next(err);
  }
};

// DELETE /api/v1/productos/:id
const eliminar = async (req, res, next) => {
  try {
    const eliminado = await productoModel.eliminar(req.params.id);

    if (!eliminado) {
      return jsonError(res, 'Producto no encontrado', 404);
    }

    return jsonExito(res, null, 'Producto eliminado');
  } catch (err) {
    return next(err);
  }
};

// Valida los campos obligatorios de un producto.
function validarProducto(datos) {
  if (!datos.codigo || !String(datos.codigo).trim()) {
    return 'El código es obligatorio';
  }
  if (!datos.nombre || !String(datos.nombre).trim()) {
    return 'El nombre es obligatorio';
  }
  if (datos.precio_venta === undefined || Number.isNaN(Number(datos.precio_venta))) {
    return 'El precio de venta es obligatorio y numérico';
  }
  return null;
}

// Normaliza tipos y valores por defecto antes de guardar.
function normalizar(datos) {
  return {
    codigo: String(datos.codigo).trim(),
    nombre: String(datos.nombre).trim(),
    descripcion: datos.descripcion || null,
    categoria_id: datos.categoria_id || null,
    impuesto_id: datos.impuesto_id || null,
    precio_compra: Number(datos.precio_compra || 0),
    precio_venta: Number(datos.precio_venta),
    stock_actual: Number(datos.stock_actual || 0),
    stock_minimo: Number(datos.stock_minimo || 0),
    unidad_medida: datos.unidad_medida || 'unidad',
    activo: datos.activo !== undefined ? datos.activo : 1
  };
}

module.exports = { listar, siguienteCodigo, obtener, crear, actualizar, eliminar };
