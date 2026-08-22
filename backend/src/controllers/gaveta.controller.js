// src/controllers/gaveta.controller.js
// Apertura de la gaveta de dinero (Fase 3).
const configModel = require('../models/config.model');
const gavetaService = require('../services/gaveta.service');
const { jsonExito, jsonError } = require('../utils/response');

// POST /api/v1/gaveta/abrir
// Cualquier usuario autenticado (cajero/admin) puede abrirla: es parte del flujo
// de caja. Solo se permite si el flag gaveta_habilitada está activo.
const abrir = async (req, res, next) => {
  try {
    const config = await configModel.listarMapa();
    if ((config.gaveta_habilitada || '0') !== '1') {
      return jsonError(res, 'La gaveta está deshabilitada en Configuración', 409);
    }

    const resultado = await gavetaService.abrir();
    const mensaje = resultado.simulado
      ? 'Gaveta abierta (modo simulación)'
      : 'Gaveta abierta';
    return jsonExito(res, resultado, mensaje);
  } catch (err) {
    return next(err);
  }
};

module.exports = { abrir };
