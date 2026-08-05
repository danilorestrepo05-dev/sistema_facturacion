// src/routes/factura.routes.js
// Rutas de facturación bajo el prefijo /api/v1/facturas.
const { Router } = require('express');
const facturaController = require('../controllers/factura.controller');
const { verificarToken } = require('../middleware/auth');
const { verificarAdmin } = require('../middleware/rol');

const router = Router();

// Lectura y creación de facturas: cualquier usuario autenticado (el cajero es quien vende).
router.get('/', verificarToken, facturaController.listar);
router.get('/:id', verificarToken, facturaController.obtener);
router.post('/', verificarToken, facturaController.crear);

// Impresión: PDF (carta/media carta) y ticket POS.
router.get('/:id/pdf', verificarToken, facturaController.descargarPdf);
router.get('/:id/ticket', verificarToken, facturaController.descargarTicket);

// Anulación: solo administrador (acción sensible que repone inventario).
router.post('/:id/anular', verificarToken, verificarAdmin, facturaController.anular);

module.exports = router;
