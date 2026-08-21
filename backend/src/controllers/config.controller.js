// src/controllers/config.controller.js
// Lógica de lectura y actualización de las configuraciones del sistema.
const configModel = require('../models/config.model');
const { jsonExito, jsonError } = require('../utils/response');

// GET /api/v1/configuracion
// Cualquier usuario autenticado puede leerla: el frontend oculta o muestra
// funciones opcionales según estos flags.
const obtener = async (req, res, next) => {
  try {
    const configuraciones = await configModel.listar();
    return jsonExito(res, configuraciones, 'Configuración obtenida');
  } catch (err) {
    return next(err);
  }
};

// PUT /api/v1/configuracion (solo admin)
// Body: { clave, valor }
const actualizar = async (req, res, next) => {
  try {
    const { clave, valor } = req.body || {};

    if (!clave || !String(clave).trim()) {
      return jsonError(res, 'La clave es obligatoria', 400);
    }
    if (valor === undefined || String(valor).trim() === '') {
      return jsonError(res, 'El valor es obligatorio', 400);
    }

    const actualizado = await configModel.actualizar(String(clave).trim(), String(valor).trim());
    if (!actualizado) {
      return jsonError(res, 'Configuración no encontrada', 404);
    }

    // Se devuelve la lista completa para que la interfaz refresque de una vez.
    const configuraciones = await configModel.listar();
    return jsonExito(res, configuraciones, 'Configuración actualizada');
  } catch (err) {
    return next(err);
  }
};

module.exports = { obtener, actualizar };
