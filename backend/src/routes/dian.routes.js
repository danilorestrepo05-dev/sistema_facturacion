// src/routes/dian.routes.js
// Rutas de utilidades de facturación electrónica bajo el prefijo /api/v1/dian.
const { Router } = require('express');
const dianController = require('../controllers/dian.controller');
const { verificarToken } = require('../middleware/auth');

const router = Router();

// Procesamiento manual de la cola de reintentos (permite force-jobs desde UI).
router.post('/procesar-cola', verificarToken, dianController.procesarCola);

// Consulta cuántos documentos quedan pendientes de envío a la DIAN.
router.get('/pendientes', verificarToken, dianController.contarPendientes);

module.exports = router;
