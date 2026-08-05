// src/routes/cliente.routes.js
// Rutas de clientes bajo el prefijo /api/v1/clientes.
const { Router } = require('express');
const clienteController = require('../controllers/cliente.controller');
const { verificarToken } = require('../middleware/auth');
const { verificarAdmin } = require('../middleware/rol');

const router = Router();

// Lectura: cualquier usuario autenticado.
router.get('/', verificarToken, clienteController.listar);
router.get('/:id', verificarToken, clienteController.obtener);

// Escritura: solo administrador.
router.post('/', verificarToken, verificarAdmin, clienteController.crear);
router.put('/:id', verificarToken, verificarAdmin, clienteController.actualizar);
router.delete('/:id', verificarToken, verificarAdmin, clienteController.eliminar);

module.exports = router;
