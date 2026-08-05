// src/routes/proveedor.routes.js
// Rutas de proveedores bajo el prefijo /api/v1/proveedores.
const { Router } = require('express');
const proveedorController = require('../controllers/proveedor.controller');
const { verificarToken } = require('../middleware/auth');
const { verificarAdmin } = require('../middleware/rol');

const router = Router();

// Lectura: cualquier usuario autenticado.
router.get('/', verificarToken, proveedorController.listar);
router.get('/:id', verificarToken, proveedorController.obtener);

// Escritura: solo administrador.
router.post('/', verificarToken, verificarAdmin, proveedorController.crear);
router.put('/:id', verificarToken, verificarAdmin, proveedorController.actualizar);
router.delete('/:id', verificarToken, verificarAdmin, proveedorController.eliminar);

module.exports = router;
