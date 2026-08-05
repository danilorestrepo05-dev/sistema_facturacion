// src/routes/producto.routes.js
// Rutas de productos bajo el prefijo /api/v1/productos.
const { Router } = require('express');
const productoController = require('../controllers/producto.controller');
const { verificarToken } = require('../middleware/auth');
const { verificarAdmin } = require('../middleware/rol');

const router = Router();

// Lectura: cualquier usuario autenticado.
router.get('/', verificarToken, productoController.listar);
router.get('/:id', verificarToken, productoController.obtener);

// Escritura: solo administrador.
router.post('/', verificarToken, verificarAdmin, productoController.crear);
router.put('/:id', verificarToken, verificarAdmin, productoController.actualizar);
router.delete('/:id', verificarToken, verificarAdmin, productoController.eliminar);

module.exports = router;
