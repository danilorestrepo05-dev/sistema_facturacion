// src/routes/gaveta.routes.js
// Rutas de la gaveta de dinero bajo el prefijo /api/v1/gaveta.
// Apertura: cualquier usuario autenticado (flujo diario de caja).
const { Router } = require('express');
const gavetaController = require('../controllers/gaveta.controller');
const { verificarToken } = require('../middleware/auth');

const router = Router();

router.post('/abrir', verificarToken, gavetaController.abrir);

module.exports = router;
