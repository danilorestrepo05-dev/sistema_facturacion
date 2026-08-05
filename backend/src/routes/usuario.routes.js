// src/routes/usuario.routes.js
// Rutas de usuarios bajo el prefijo /api/v1/usuarios.
// Toda la gestión de usuarios es exclusiva del rol administrador.
const { Router } = require('express');
const usuarioController = require('../controllers/usuario.controller');
const { verificarToken } = require('../middleware/auth');
const { verificarAdmin } = require('../middleware/rol');

const router = Router();

// Todas las rutas requieren token y rol admin.
router.use(verificarToken, verificarAdmin);

router.get('/', usuarioController.listar);
router.get('/:id', usuarioController.obtener);
router.post('/', usuarioController.crear);
router.put('/:id', usuarioController.actualizar);
router.delete('/:id', usuarioController.eliminar);

module.exports = router;
