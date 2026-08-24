// src/controllers/compra.controller.js
// Compras (Fase 7): registro de ingresos de mercancía al inventario.
// Solo administradores: esta operación afecta stock y costos del catálogo.
const compraModel = require('../models/compra.model');
const { jsonExito, jsonError } = require('../utils/response');

// POST /api/v1/compras  Body: { items: [{ producto_id, cantidad, costo_unitario }] }
const crear = async (req, res, next) => {
  try {
    if (req.usuario.rol !== 'admin') {
      return jsonError(res, 'Solo un administrador puede registrar compras', 403);
    }

    const items = req.body?.items;
    if (!Array.isArray(items) || items.length === 0) {
      return jsonError(res, 'Debes incluir al menos un producto en la compra', 400);
    }

    const resultado = await compraModel.crear({ items });
    return jsonExito(res, resultado, 'Compra registrada', 201);
  } catch (err) {
    return next(err);
  }
};

module.exports = { crear };
