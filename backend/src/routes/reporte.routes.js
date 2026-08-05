// src/routes/reporte.routes.js
// Rutas de reportes bajo el prefijo /api/v1/reportes.
const { Router } = require('express');
const reporteController = require('../controllers/reporte.controller');
const { verificarToken } = require('../middleware/auth');

const router = Router();

// Cualquier usuario autenticado puede consultar reportes.
router.get('/ventas', verificarToken, reporteController.ventas);
router.get('/ventas/diarias', verificarToken, reporteController.ventasDiarias);
router.get('/inventario', verificarToken, reporteController.inventario);
router.get('/movimientos', verificarToken, reporteController.movimientos);

module.exports = router;
