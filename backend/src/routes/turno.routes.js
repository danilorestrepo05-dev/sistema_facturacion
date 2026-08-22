// src/routes/turno.routes.js
// Rutas de arqueo de caja bajo el prefijo /api/v1/turnos.
// Todas requieren autenticación; el módulo se activa con el flag arqueo_habilitado.
const { Router } = require('express');
const turnoController = require('../controllers/turno.controller');
const { verificarToken } = require('../middleware/auth');

const router = Router();

router.post('/abrir', verificarToken, turnoController.abrir);
router.post('/cerrar', verificarToken, turnoController.cerrar);
router.get('/actual', verificarToken, turnoController.actual);
router.get('/', verificarToken, turnoController.listar);

module.exports = router;
