// src/controllers/proveedor.controller.js
// Lógica de CRUD para proveedores.
const proveedorModel = require('../models/proveedor.model');
const { jsonExito, jsonError } = require('../utils/response');

const TIPOS_DOCUMENTO = ['CC', 'NIT', 'CE', 'Pasaporte', 'Otro'];

// GET /api/v1/proveedores?termino=...
const listar = async (req, res, next) => {
  try {
    const termino = String(req.query.termino || '').trim();
    const proveedores = await proveedorModel.listar(termino);
    return jsonExito(res, proveedores, 'Proveedores obtenidos');
  } catch (err) {
    return next(err);
  }
};

// GET /api/v1/proveedores/:id
const obtener = async (req, res, next) => {
  try {
    const proveedor = await proveedorModel.buscarPorId(req.params.id);

    if (!proveedor) {
      return jsonError(res, 'Proveedor no encontrado', 404);
    }

    return jsonExito(res, proveedor, 'Proveedor obtenido');
  } catch (err) {
    return next(err);
  }
};

// POST /api/v1/proveedores
const crear = async (req, res, next) => {
  try {
    const datos = req.body || {};

    const errorValidacion = validarProveedor(datos);
    if (errorValidacion) {
      return jsonError(res, errorValidacion, 400);
    }

    const proveedor = await proveedorModel.crear(normalizar(datos, {}));
    return jsonExito(res, proveedor, 'Proveedor creado', 201);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return jsonError(res, 'Ya existe un proveedor con ese documento', 409);
    }
    return next(err);
  }
};

// PUT /api/v1/proveedores/:id
const actualizar = async (req, res, next) => {
  try {
    const datos = req.body || {};

    const errorValidacion = validarProveedor(datos);
    if (errorValidacion) {
      return jsonError(res, errorValidacion, 400);
    }

    const existe = await proveedorModel.buscarPorId(req.params.id);
    if (!existe) {
      return jsonError(res, 'Proveedor no encontrado', 404);
    }

    const proveedor = await proveedorModel.actualizar(req.params.id, normalizar(datos, existe));
    return jsonExito(res, proveedor, 'Proveedor actualizado');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return jsonError(res, 'Ya existe un proveedor con ese documento', 409);
    }
    return next(err);
  }
};

// DELETE /api/v1/proveedores/:id
const eliminar = async (req, res, next) => {
  try {
    const eliminado = await proveedorModel.eliminar(req.params.id);

    if (!eliminado) {
      return jsonError(res, 'Proveedor no encontrado', 404);
    }

    return jsonExito(res, null, 'Proveedor eliminado');
  } catch (err) {
    return next(err);
  }
};

// Valida los campos obligatorios de un proveedor.
function validarProveedor(datos) {
  if (!datos.nombre || !String(datos.nombre).trim()) {
    return 'El nombre es obligatorio';
  }
  if (datos.tipo_documento && !TIPOS_DOCUMENTO.includes(datos.tipo_documento)) {
    return `El tipo de documento debe ser uno de: ${TIPOS_DOCUMENTO.join(', ')}`;
  }
  if (datos.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(datos.email))) {
    return 'El correo electrónico no es válido';
  }
  return null;
}

// Normaliza tipos y valores por defecto antes de guardar.
function normalizar(datos, actual) {
  return {
    nombre: String(datos.nombre).trim(),
    tipo_documento: datos.tipo_documento || actual.tipo_documento || 'NIT',
    documento: datos.documento ?? actual.documento ?? null,
    telefono: datos.telefono ?? actual.telefono ?? null,
    email: datos.email ?? actual.email ?? null,
    direccion: datos.direccion ?? actual.direccion ?? null,
    // Tipo de item que suministra (opcional); vacío se guarda como NULL.
    tipo_item:
      datos.tipo_item !== undefined
        ? (String(datos.tipo_item).trim() || null)
        : (actual.tipo_item ?? null),
    activo: datos.activo !== undefined ? datos.activo : (actual.activo ?? 1)
  };
}

module.exports = { listar, obtener, crear, actualizar, eliminar };
