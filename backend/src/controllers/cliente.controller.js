// src/controllers/cliente.controller.js
// Lógica de CRUD para clientes.
const clienteModel = require('../models/cliente.model');
const { jsonExito, jsonError } = require('../utils/response');

const TIPOS_DOCUMENTO = ['CC', 'NIT', 'CE', 'Pasaporte', 'Otro'];

// GET /api/v1/clientes?termino=...
const listar = async (req, res, next) => {
  try {
    const termino = String(req.query.termino || '').trim();
    const clientes = await clienteModel.listar(termino);
    return jsonExito(res, clientes, 'Clientes obtenidos');
  } catch (err) {
    return next(err);
  }
};

// GET /api/v1/clientes/:id
const obtener = async (req, res, next) => {
  try {
    const cliente = await clienteModel.buscarPorId(req.params.id);

    if (!cliente) {
      return jsonError(res, 'Cliente no encontrado', 404);
    }

    return jsonExito(res, cliente, 'Cliente obtenido');
  } catch (err) {
    return next(err);
  }
};

// POST /api/v1/clientes
const crear = async (req, res, next) => {
  try {
    const datos = req.body || {};

    const errorValidacion = validarCliente(datos);
    if (errorValidacion) {
      return jsonError(res, errorValidacion, 400);
    }

    const cliente = await clienteModel.crear(normalizar(datos, {}));
    return jsonExito(res, cliente, 'Cliente creado', 201);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return jsonError(res, 'Ya existe un cliente con ese documento', 409);
    }
    return next(err);
  }
};

// PUT /api/v1/clientes/:id
const actualizar = async (req, res, next) => {
  try {
    const datos = req.body || {};

    const errorValidacion = validarCliente(datos);
    if (errorValidacion) {
      return jsonError(res, errorValidacion, 400);
    }

    const existe = await clienteModel.buscarPorId(req.params.id);
    if (!existe) {
      return jsonError(res, 'Cliente no encontrado', 404);
    }

    const cliente = await clienteModel.actualizar(req.params.id, normalizar(datos, existe));
    return jsonExito(res, cliente, 'Cliente actualizado');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return jsonError(res, 'Ya existe un cliente con ese documento', 409);
    }
    return next(err);
  }
};

// DELETE /api/v1/clientes/:id
const eliminar = async (req, res, next) => {
  try {
    const eliminado = await clienteModel.eliminar(req.params.id);

    if (!eliminado) {
      return jsonError(res, 'Cliente no encontrado', 404);
    }

    return jsonExito(res, null, 'Cliente eliminado');
  } catch (err) {
    return next(err);
  }
};

// Valida los campos obligatorios de un cliente.
function validarCliente(datos) {
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
    tipo_documento: datos.tipo_documento || actual.tipo_documento || 'CC',
    documento: datos.documento ?? actual.documento ?? null,
    telefono: datos.telefono ?? actual.telefono ?? null,
    email: datos.email ?? actual.email ?? null,
    direccion: datos.direccion ?? actual.direccion ?? null,
    activo: datos.activo !== undefined ? datos.activo : (actual.activo ?? 1)
  };
}

module.exports = { listar, obtener, crear, actualizar, eliminar };
