// src/routes/auth.routes.js
// Rutas de autenticación bajo el prefijo /api/v1/auth.
const { Router } = require('express');
const authController = require('../controllers/auth.controller');
const { verificarToken } = require('../middleware/auth');

const router = Router();

// Inicio de sesión (público).
router.post('/login', authController.login);

// Perfil del usuario autenticado (requiere token JWT).
router.get('/perfil', verificarToken, authController.perfil);

module.exports = router;
