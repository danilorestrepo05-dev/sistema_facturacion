// src/controllers/auth.controller.js
// Lógica de autenticación: login y consulta del perfil del usuario autenticado.
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const usuarioModel = require('../models/usuario.model');
const { jsonExito, jsonError } = require('../utils/response');

dotenv.config();

// Parámetros de seguridad del login (anti fuerza bruta). Se pueden sobrescribir
// con variables de entorno; por defecto 5 intentos y 15 minutos de bloqueo.
const MAX_INTENTOS = Number(process.env.LOGIN_MAX_INTENTOS || 5);
const MINUTOS_BLOQUEO = Number(process.env.LOGIN_BLOQUEO_MINUTOS || 5);

// Retorna la ventana de bloqueo aún por cumplir (minutos), o 0 si ya terminó.
const minutosRestantesBloqueo = (bloqueadoHasta) => {
  if (!bloqueadoHasta) return 0;
  const ms = new Date(bloqueadoHasta).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 60000) : 0;
};

// POST /api/v1/auth/login
// Recibe { nombre_usuario, contrasena } y devuelve un token JWT si las credenciales son válidas.
const login = async (req, res, next) => {
  try {
    const { nombre_usuario, contrasena } = req.body || {};

    if (!nombre_usuario || !contrasena) {
      return jsonError(res, 'Debe enviar nombre_usuario y contrasena', 400);
    }

    const usuario = await usuarioModel.buscarPorNombreUsuario(nombre_usuario.trim());

    // Si el usuario está bloqueado por intentos fallidos, se rechaza antes de
    // validar la contraseña (incluso para contraseñas correctas) hasta que
    // pase la ventana de bloqueo.
    if (usuario) {
      const restantes = minutosRestantesBloqueo(usuario.bloqueado_hasta);
      if (restantes > 0) {
        return jsonError(res, `Demasiados intentos fallidos. Intente de nuevo en ${restantes} min.`, 429);
      }
      // Si la ventana de bloqueo ya terminó, se limpia el contador de fallos
      // para permitir un nuevo ciclo completo de intentos.
      if (usuario.bloqueado_hasta && restantes === 0) {
        await usuarioModel.reiniciarIntentos(usuario.id);
      }
    }

    // Usuario inexistente o contraseña incorrecta: misma respuesta para no filtrar información.
    if (!usuario) {
      return jsonError(res, 'Credenciales inválidas', 401);
    }

    const contrasenaValida = await bcrypt.compare(contrasena, usuario.password_hash);
    if (!contrasenaValida) {
      // Incrementa el contador de fallos; al llegar al tope se bloquea temporalmente.
      const nuevosFallos = Number(usuario.intentos_fallidos) + 1;
      await usuarioModel.registrarIntentoFallido(usuario.id);
      if (nuevosFallos >= MAX_INTENTOS) {
        await usuarioModel.bloquearLogin(usuario.id, MINUTOS_BLOQUEO);
        return jsonError(res, `Demasiados intentos fallidos. Intente de nuevo en ${MINUTOS_BLOQUEO} min.`, 429);
      }
      return jsonError(res, 'Credenciales inválidas', 401);
    }

    if (usuario.activo !== 1) {
      return jsonError(res, 'Usuario inactivo, contacte al administrador', 403);
    }

    // Login exitoso: se limpian intentos fallidos y bloqueo.
    await usuarioModel.reiniciarIntentos(usuario.id);

    // Firma del token con datos mínimos del usuario.
    const token = jwt.sign(
      { id: usuario.id, nombre_usuario: usuario.nombre_usuario, rol: usuario.rol },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    // No se devuelve el hash de la contraseña.
    const { password_hash, intentos_fallidos, bloqueado_hasta, ...usuarioPublico } = usuario;

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
