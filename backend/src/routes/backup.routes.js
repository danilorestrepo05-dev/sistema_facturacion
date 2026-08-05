// src/routes/backup.routes.js
// Rutas de backup bajo el prefijo /api/v1/backup (solo admin).
const { Router } = require('express');
const backupController = require('../controllers/backup.controller');
const { verificarToken } = require('../middleware/auth');
const { verificarAdmin } = require('../middleware/rol');

const router = Router();

router.get('/', verificarToken, verificarAdmin, backupController.generar);

module.exports = router;
