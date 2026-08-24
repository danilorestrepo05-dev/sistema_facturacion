// src/routes/compra.routes.js
// Rutas de compras bajo el prefijo /api/v1/compras.
// Requieren autenticación; la restricción de rol admin vive en el controlador.
const { Router } = require('express');
const compraController = require('../controllers/compra.controller');
const { verificarToken } = require('../middleware/auth');

const router = Router();

router.post('/', verificarToken, compraController.crear);

module.exports = router;
