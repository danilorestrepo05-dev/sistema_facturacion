// src/controllers/usuario.controller.js
// Lógica de CRUD para usuarios del sistema (solo administradores).
const bcrypt = require('bcryptjs');
const usuarioModel = require('../models/usuario.model');
const { jsonExito, jsonError } = require('../utils/response');

const ROLES = ['admin', 'cajero', 'invitado'];

// GET /api/v1/usuarios?termino=...
const listar = async (req, res, next) => {
  try {
    const termino = String(req.query.termino || '').trim();
    const usuarios = await usuarioModel.listar(termino);
    return jsonExito(res, usuarios, 'Usuarios obtenidos');
  } catch (err) {
    return next(err);
  }
};

// GET /api/v1/usuarios/:id
const obtener = async (req, res, next) => {
  try {
    const usuario = await usuarioModel.buscarPorId(req.params.id);

    if (!usuario) {
      return jsonError(res, 'Usuario no encontrado', 404);
    }

    return jsonExito(res, usuario, 'Usuario obtenido');
  } catch (err) {
    return next(err);
  }
};

// POST /api/v1/usuarios
const crear = async (req, res, next) => {
  try {
    const datos = req.body || {};

    const errorValidacion = validar(datos, true);
    if (errorValidacion) {
      return jsonError(res, errorValidacion, 400);
    }

    const password_hash = await bcrypt.hash(datos.contrasena, 10);

    const usuario = await usuarioModel.crear({
      nombre_usuario: String(datos.nombre_usuario).trim().toLowerCase(),
      nombre_completo: String(datos.nombre_completo).trim(),
      password_hash,
      rol: datos.rol || 'cajero',
      activo: datos.activo !== undefined ? datos.activo : 1
    });

    return jsonExito(res, usuario, 'Usuario creado', 201);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return jsonError(res, 'Ya existe un usuario con ese nombre de usuario', 409);
    }
    return next(err);
  }
};

// PUT /api/v1/usuarios/:id
const actualizar = async (req, res, next) => {
  try {
    const datos = req.body || {};

    const existe = await usuarioModel.buscarPorId(req.params.id);
    if (!existe) {
      return jsonError(res, 'Usuario no encontrado', 404);
    }

    const errorValidacion = validar(datos, false);
    if (errorValidacion) {
      return jsonError(res, errorValidacion, 400);
    }

    // Impide desactivar al propio usuario que está logueado.
    if (existe.id === req.usuario.id && datos.activo === 0) {
      return jsonError(res, 'No puede desactivar su propio usuario', 400);
    }

    // Evita dejar el sistema sin ningún administrador activo.
    if (existe.rol === 'admin' && existe.activo === 1 &&
        (datos.activo === 0 || (datos.rol && datos.rol !== 'admin'))) {
      const admins = await usuarioModel.contarAdminsActivos();
      if (admins <= 1) {
        return jsonError(res, 'El sistema debe tener al menos un administrador activo', 400);
      }
    }

    let password_hash;
    if (datos.contrasena) {
      password_hash = await bcrypt.hash(datos.contrasena, 10);
    }

    const usuario = await usuarioModel.actualizar(req.params.id, {
      nombre_usuario: String(datos.nombre_usuario || existe.nombre_usuario).trim().toLowerCase(),
      nombre_completo: String(datos.nombre_completo || existe.nombre_completo).trim(),
      rol: datos.rol || existe.rol,
      activo: datos.activo !== undefined ? datos.activo : existe.activo,
      password_hash
    });

    return jsonExito(res, usuario, 'Usuario actualizado');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return jsonError(res, 'Ya existe un usuario con ese nombre de usuario', 409);
    }
    return next(err);
  }
};

// DELETE /api/v1/usuarios/:id — desactiva (baja lógica) para no romper facturas previas.
const eliminar = async (req, res, next) => {
  try {
    if (Number(req.params.id) === Number(req.usuario.id)) {
      return jsonError(res, 'No puede desactivar su propio usuario', 400);
    }

    const existe = await usuarioModel.buscarPorId(req.params.id);
    if (!existe) {
      return jsonError(res, 'Usuario no encontrado', 404);
    }

    if (existe.rol === 'admin' && existe.activo === 1) {
      const admins = await usuarioModel.contarAdminsActivos();
      if (admins <= 1) {
        return jsonError(res, 'El sistema debe tener al menos un administrador activo', 400);
      }
    }

    const desactivado = await usuarioModel.desactivar(req.params.id);
    if (!desactivado) {
      return jsonError(res, 'Usuario no encontrado', 404);
    }

    return jsonExito(res, null, 'Usuario desactivado');
  } catch (err) {
    return next(err);
  }
};

// Valida los campos de un usuario. esCrear=true exige la contraseña.
function validar(datos, esCrear) {
  if (esCrear || datos.nombre_usuario !== undefined) {
    const nombre = String(datos.nombre_usuario || '').trim();
    if (nombre.length < 3) {
      return 'El nombre de usuario debe tener al menos 3 caracteres';
    }
    if (!/^[a-zA-Z0-9_.]+$/.test(nombre)) {
      return 'El nombre de usuario solo admite letras, números, punto y guion bajo';
    }
  }

  if (esCrear || datos.nombre_completo !== undefined) {
    if (!datos.nombre_completo || !String(datos.nombre_completo).trim()) {
      return 'El nombre completo es obligatorio';
    }
  }

  if (esCrear && (!datos.contrasena || String(datos.contrasena).length < 6)) {
    return 'La contraseña debe tener al menos 6 caracteres';
  }

  if (datos.contrasena !== undefined && String(datos.contrasena) &&
      String(datos.contrasena).length < 6) {
    return 'La contraseña debe tener al menos 6 caracteres';
  }

  if (datos.rol && !ROLES.includes(datos.rol)) {
    return `El rol debe ser uno de: ${ROLES.join(', ')}`;
  }

  return null;
}

module.exports = { listar, obtener, crear, actualizar, eliminar };
