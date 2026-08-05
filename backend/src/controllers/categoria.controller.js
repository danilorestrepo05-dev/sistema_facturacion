// src/controllers/categoria.controller.js
// Lógica de CRUD para categorías.
const categoriaModel = require('../models/categoria.model');
const { jsonExito, jsonError } = require('../utils/response');

// GET /api/v1/categorias
const listar = async (req, res, next) => {
  try {
    const categorias = await categoriaModel.listar();
    return jsonExito(res, categorias, 'Categorías obtenidas');
  } catch (err) {
    return next(err);
  }
};

// GET /api/v1/categorias/:id
const obtener = async (req, res, next) => {
  try {
    const categoria = await categoriaModel.buscarPorId(req.params.id);

    if (!categoria) {
      return jsonError(res, 'Categoría no encontrada', 404);
    }

    return jsonExito(res, categoria, 'Categoría obtenida');
  } catch (err) {
    return next(err);
  }
};

// POST /api/v1/categorias
const crear = async (req, res, next) => {
  try {
    const { nombre, descripcion, activo } = req.body || {};

    if (!nombre || !String(nombre).trim()) {
      return jsonError(res, 'El nombre es obligatorio', 400);
    }

    const categoria = await categoriaModel.crear({
      nombre: String(nombre).trim(),
      descripcion: descripcion || null,
      activo: activo !== undefined ? activo : 1
    });

    return jsonExito(res, categoria, 'Categoría creada', 201);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return jsonError(res, 'Ya existe una categoría con ese nombre', 409);
    }
    return next(err);
  }
};

// PUT /api/v1/categorias/:id
const actualizar = async (req, res, next) => {
  try {
    const { nombre, descripcion, activo } = req.body || {};

    if (!nombre || !String(nombre).trim()) {
      return jsonError(res, 'El nombre es obligatorio', 400);
    }

    const existe = await categoriaModel.buscarPorId(req.params.id);
    if (!existe) {
      return jsonError(res, 'Categoría no encontrada', 404);
    }

    const categoria = await categoriaModel.actualizar(req.params.id, {
      nombre: String(nombre).trim(),
      descripcion: descripcion ?? null,
      activo: activo !== undefined ? activo : existe.activo
    });

    return jsonExito(res, categoria, 'Categoría actualizada');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return jsonError(res, 'Ya existe una categoría con ese nombre', 409);
    }
    return next(err);
  }
};

// DELETE /api/v1/categorias/:id
const eliminar = async (req, res, next) => {
  try {
    const eliminada = await categoriaModel.eliminar(req.params.id);

    if (!eliminada) {
      return jsonError(res, 'Categoría no encontrada', 404);
    }

    return jsonExito(res, null, 'Categoría eliminada');
  } catch (err) {
    return next(err);
  }
};

module.exports = { listar, obtener, crear, actualizar, eliminar };
