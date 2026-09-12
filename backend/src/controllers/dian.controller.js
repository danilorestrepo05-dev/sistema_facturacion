// src/controllers/dian.controller.js
// Controlador de utilidades de facturación electrónica DIAN: permite forzar,
// manualmente y desde la interfaz, el procesamiento de la cola de envíos
// pendientes (reintentos offline) además del job programado del servidor.

const dianService = require('../services/dian/dian.service');
const { jsonExito, jsonError } = require('../utils/response');

// POST /api/v1/dian/procesar-cola
// Ejecuta una pasada de la cola de reintentos. Pensado para el cajero/admin
// cuando se restablece la conexión/proveedor de la DIAN sin esperar al job.
const procesarCola = async (req, res, next) => {
  try {
    const limite = Math.min(Number(req.query.limite) || 20, 100);
    const resultado = await dianService.procesarColaPendiente({ limite });
    return jsonExito(res, resultado, 'Cola de envíos DIAN procesada');
  } catch (err) {
    return next(err);
  }
};

// GET /api/v1/dian/pendientes
// Devuelve el número de documentos pendientes de enviar a la DIAN (cola offline).
const contarPendientes = async (req, res, next) => {
  try {
    const pendientes = await require('../services/dian/envio.model').listarPendientes(100000);
    return jsonExito(res, { pendientes: pendientes.length }, 'Pendientes de envío DIAN');
  } catch (err) {
    return next(err);
  }
};

module.exports = { procesarCola, contarPendientes };
