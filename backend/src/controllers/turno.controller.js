// src/controllers/turno.controller.js
// Arqueo de caja (Fase 4): turnos con fondo inicial y cuadre al cierre.
// El módulo completo queda gated por el flag arqueo_habilitado.
const configModel = require('../models/config.model');
const turnoModel = require('../models/turno.model');
const { jsonExito, jsonError } = require('../utils/response');

// Verifica que el arqueo esté habilitado; lanza error 409 si no.
const exigirArqueoHabilitado = async () => {
  const config = await configModel.listarMapa();
  if ((config.arqueo_habilitado || '0') !== '1') {
    const error = new Error('El arqueo de caja está deshabilitado en Configuración');
    error.status = 409;
    throw error;
  }
};

// Valida un monto numérico >= 0. Devuelve el número o null si es inválido.
const montoValido = (valor) => {
  if (valor === undefined || valor === null || valor === '') return null;
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
};

// POST /api/v1/turnos/abrir  Body: { monto_apertura }
const abrir = async (req, res, next) => {
  try {
    await exigirArqueoHabilitado();

    const montoApertura = montoValido(req.body?.monto_apertura);
    if (montoApertura === null) {
      return jsonError(res, 'El monto de apertura es obligatorio, numérico y mayor o igual a 0', 400);
    }

    const turnoAbierto = await turnoModel.buscarAbiertoPorUsuario(req.usuario.id);
    if (turnoAbierto) {
      return jsonError(res, 'Ya tienes un turno abierto. Ciérralo antes de abrir otro.', 409);
    }

    const turno = await turnoModel.abrir(req.usuario.id, montoApertura);
    return jsonExito(res, turno, 'Turno abierto', 201);
  } catch (err) {
    return next(err);
  }
};

// GET /api/v1/turnos/actual
// Estado del turno abierto del usuario + efectivo esperado en vivo.
const actual = async (req, res, next) => {
  try {
    await exigirArqueoHabilitado();

    const turno = await turnoModel.buscarAbiertoPorUsuario(req.usuario.id);
    if (!turno) {
      return jsonExito(res, { turno_abierto: false });
    }

    const ventasEfectivo = await turnoModel.sumarVentasEfectivoTurno(turno.id);
    return jsonExito(res, {
      turno_abierto: true,
      turno,
      ventas_efectivo: ventasEfectivo,
      // Esperado ahora: fondo inicial + ventas en efectivo hasta este momento.
      efectivo_esperado: Number(turno.monto_apertura) + ventasEfectivo
    }, 'Turno en curso');
  } catch (err) {
    return next(err);
  }
};

// POST /api/v1/turnos/cerrar  Body: { monto_real, observaciones }
const cerrar = async (req, res, next) => {
  try {
    await exigirArqueoHabilitado();

    const montoReal = montoValido(req.body?.monto_real);
    if (montoReal === null) {
      return jsonError(res, 'El monto contado es obligatorio, numérico y mayor o igual a 0', 400);
    }

    const turno = await turnoModel.buscarAbiertoPorUsuario(req.usuario.id);
    if (!turno) {
      return jsonError(res, 'No tienes un turno abierto', 409);
    }

    const observaciones = String(req.body?.observaciones || '').trim().slice(0, 255);

    // Cuadre: esperado = fondo + ventas en efectivo del período del turno.
    const ventasEfectivo = await turnoModel.sumarVentasEfectivoTurno(turno.id);
    const montoEsperado = Number(turno.monto_apertura) + ventasEfectivo;
    const diferencia = Number((montoReal - montoEsperado).toFixed(2));

    const cerrado = await turnoModel.cerrar(turno.id, {
      montoEsperado, montoReal, diferencia, observaciones
    });

    return jsonExito(res, { ...cerrado, ventas_efectivo: ventasEfectivo },
      diferencia === 0 ? 'Turno cerrado sin diferencias' : 'Turno cerrado con diferencia');
  } catch (err) {
    return next(err);
  }
};

// GET /api/v1/turnos — historial (admin: todos; cajero: solo los suyos).
const listar = async (req, res, next) => {
  try {
    await exigirArqueoHabilitado();

    const filtroUsuario = req.usuario.rol === 'admin' ? null : req.usuario.id;
    const turnos = await turnoModel.listar(filtroUsuario);
    return jsonExito(res, turnos, 'Historial de turnos');
  } catch (err) {
    return next(err);
  }
};

module.exports = { abrir, actual, cerrar, listar };
