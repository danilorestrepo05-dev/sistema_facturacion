// src/controllers/impuesto.controller.js
// Lógica de CRUD para impuestos.
const impuestoModel = require('../models/impuesto.model');
const { jsonExito, jsonError } = require('../utils/response');

// GET /api/v1/impuestos
const listar = async (req, res, next) => {
  try {
    const impuestos = await impuestoModel.listar();
    return jsonExito(res, impuestos, 'Impuestos obtenidos');
  } catch (err) {
    return next(err);
  }
};

// GET /api/v1/impuestos/:id
const obtener = async (req, res, next) => {
  try {
    const impuesto = await impuestoModel.buscarPorId(req.params.id);

    if (!impuesto) {
      return jsonError(res, 'Impuesto no encontrado', 404);
    }

    return jsonExito(res, impuesto, 'Impuesto obtenido');
  } catch (err) {
    return next(err);
  }
};

// POST /api/v1/impuestos
const crear = async (req, res, next) => {
  try {
    const { nombre, porcentaje, activo } = req.body || {};

    if (!nombre || !String(nombre).trim()) {
      return jsonError(res, 'El nombre es obligatorio', 400);
    }

    if (porcentaje === undefined || Number.isNaN(Number(porcentaje))) {
      return jsonError(res, 'El porcentaje es obligatorio y numérico', 400);
    }

    const impuesto = await impuestoModel.crear({
      nombre: String(nombre).trim(),
      porcentaje: Number(porcentaje),
      activo: activo !== undefined ? activo : 1
    });

    return jsonExito(res, impuesto, 'Impuesto creado', 201);
  } catch (err) {
    return next(err);
  }
};

// PUT /api/v1/impuestos/:id
const actualizar = async (req, res, next) => {
  try {
    const { nombre, porcentaje, activo } = req.body || {};

    if (!nombre || !String(nombre).trim()) {
      return jsonError(res, 'El nombre es obligatorio', 400);
    }

    if (porcentaje === undefined || Number.isNaN(Number(porcentaje))) {
      return jsonError(res, 'El porcentaje es obligatorio y numérico', 400);
    }

    const existe = await impuestoModel.buscarPorId(req.params.id);
    if (!existe) {
      return jsonError(res, 'Impuesto no encontrado', 404);
    }

    const impuesto = await impuestoModel.actualizar(req.params.id, {
      nombre: String(nombre).trim(),
      porcentaje: Number(porcentaje),
      activo: activo !== undefined ? activo : existe.activo
    });

    return jsonExito(res, impuesto, 'Impuesto actualizado');
  } catch (err) {
    return next(err);
  }
};

// DELETE /api/v1/impuestos/:id
const eliminar = async (req, res, next) => {
  try {
    const eliminado = await impuestoModel.eliminar(req.params.id);

    if (!eliminado) {
      return jsonError(res, 'Impuesto no encontrado', 404);
    }

    return jsonExito(res, null, 'Impuesto eliminado');
  } catch (err) {
    return next(err);
  }
};

module.exports = { listar, obtener, crear, actualizar, eliminar };
