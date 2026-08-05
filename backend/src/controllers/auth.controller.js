// src/controllers/auth.controller.js
// Lógica de autenticación: login y consulta del perfil del usuario autenticado.
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const usuarioModel = require('../models/usuario.model');
const { jsonExito, jsonError } = require('../utils/response');

dotenv.config();

// POST /api/v1/auth/login
// Recibe { nombre_usuario, contrasena } y devuelve un token JWT si las credenciales son válidas.
const login = async (req, res, next) => {
  try {
    const { nombre_usuario, contrasena } = req.body || {};

    if (!nombre_usuario || !contrasena) {
      return jsonError(res, 'Debe enviar nombre_usuario y contrasena', 400);
    }

    const usuario = await usuarioModel.buscarPorNombreUsuario(nombre_usuario.trim());

    // Usuario inexistente o contraseña incorrecta: misma respuesta para no filtrar información.
    if (!usuario) {
      return jsonError(res, 'Credenciales inválidas', 401);
    }

    const contrasenaValida = await bcrypt.compare(contrasena, usuario.password_hash);
    if (!contrasenaValida) {
      return jsonError(res, 'Credenciales inválidas', 401);
    }

    if (usuario.activo !== 1) {
      return jsonError(res, 'Usuario inactivo, contacte al administrador', 403);
    }

    // Firma del token con datos mínimos del usuario.
    const token = jwt.sign(
      { id: usuario.id, nombre_usuario: usuario.nombre_usuario, rol: usuario.rol },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    // No se devuelve el hash de la contraseña.
    const { password_hash, ...usuarioPublico } = usuario;

    return jsonExito(res, { token, usuario: usuarioPublico }, 'Inicio de sesión exitoso');
  } catch (err) {
    return next(err);
  }
};

// GET /api/v1/auth/perfil (protegido)
// Devuelve los datos frescos del usuario autenticado mediante el token.
const perfil = async (req, res, next) => {
  try {
    const usuario = await usuarioModel.buscarPorId(req.usuario.id);

    if (!usuario) {
      return jsonError(res, 'Usuario no encontrado', 404);
    }

    return jsonExito(res, usuario, 'Perfil obtenido');
  } catch (err) {
    return next(err);
  }
};

module.exports = { login, perfil };
