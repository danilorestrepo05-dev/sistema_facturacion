// src/routes/config.routes.js
// Rutas de configuración bajo el prefijo /api/v1/configuracion.
// Lectura: cualquier usuario autenticado (la UI usa los flags).
// Escritura: solo administrador.
const { Router } = require('express');
const configController = require('../controllers/config.controller');
const { verificarToken } = require('../middleware/auth');
const { verificarAdmin } = require('../middleware/rol');

const router = Router();

router.get('/', verificarToken, configController.obtener);
router.put('/', verificarToken, verificarAdmin, configController.actualizar);

module.exports = router;
