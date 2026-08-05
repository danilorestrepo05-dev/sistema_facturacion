// src/routes/impuesto.routes.js
// Rutas de impuestos bajo el prefijo /api/v1/impuestos.
const { Router } = require('express');
const impuestoController = require('../controllers/impuesto.controller');
const { verificarToken } = require('../middleware/auth');
const { verificarAdmin } = require('../middleware/rol');

const router = Router();

// Lectura: cualquier usuario autenticado.
router.get('/', verificarToken, impuestoController.listar);
router.get('/:id', verificarToken, impuestoController.obtener);

// Escritura: solo administrador.
router.post('/', verificarToken, verificarAdmin, impuestoController.crear);
router.put('/:id', verificarToken, verificarAdmin, impuestoController.actualizar);
router.delete('/:id', verificarToken, verificarAdmin, impuestoController.eliminar);

module.exports = router;
