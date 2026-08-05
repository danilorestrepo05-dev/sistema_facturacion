// src/routes/categoria.routes.js
// Rutas de categorías bajo el prefijo /api/v1/categorias.
const { Router } = require('express');
const categoriaController = require('../controllers/categoria.controller');
const { verificarToken } = require('../middleware/auth');
const { verificarAdmin } = require('../middleware/rol');

const router = Router();

// Lectura: cualquier usuario autenticado.
router.get('/', verificarToken, categoriaController.listar);
router.get('/:id', verificarToken, categoriaController.obtener);

// Escritura: solo administrador.
router.post('/', verificarToken, verificarAdmin, categoriaController.crear);
router.put('/:id', verificarToken, verificarAdmin, categoriaController.actualizar);
router.delete('/:id', verificarToken, verificarAdmin, categoriaController.eliminar);

module.exports = router;
