// src/controllers/factura.controller.js
// Lógica de facturación: crear, listar, ver detalle y anular facturas.
const facturaModel = require('../models/factura.model');
const configModel = require('../models/config.model');
const turnoModel = require('../models/turno.model');
const pdfService = require('../services/pdf.service');
const ticketService = require('../services/ticket.service');
const { jsonExito, jsonError } = require('../utils/response');
const { leerPaginacion, enviarCabeceras } = require('../utils/paginacion');

// GET /api/v1/facturas?numero=&cliente=&estado=&fecha_desde=&fecha_hasta=
const listar = async (req, res, next) => {
  try {
    const filtros = {
      numero: req.query.numero,
      cliente: String(req.query.cliente || '').trim() || undefined,
      estado: req.query.estado,
      fecha_desde: req.query.fecha_desde,
      fecha_hasta: req.query.fecha_hasta
    };

    const paginacion = leerPaginacion(req);
    // Sin ?por_pagina devuelve todo el listado (compatibilidad con consumidores actuales).
    const facturas = await facturaModel.listar(filtros, paginacion?.pagina ?? 1, paginacion?.porPagina ?? 0);
    if (paginacion) {
      const total = await facturaModel.contar(filtros);
      enviarCabeceras(res, { ...paginacion, total });
    }
    return jsonExito(res, facturas, 'Facturas obtenidas');
  } catch (err) {
    return next(err);
  }
};

// GET /api/v1/facturas/:id
const obtener = async (req, res, next) => {
  try {
    const factura = await facturaModel.buscarPorId(req.params.id);

    if (!factura) {
      return jsonError(res, 'Factura no encontrada', 404);
    }

    return jsonExito(res, factura, 'Factura obtenida');
  } catch (err) {
    return next(err);
  }
};

// POST /api/v1/facturas
// Body: { cliente_id, tipo_pago, descuento, items: [{ producto_id, cantidad, descuento }] }
const crear = async (req, res, next) => {
  try {
    const { cliente_id, tipo_pago, descuento, items } = req.body || {};

    const errorValidacion = validarCreacion(req.body);
    if (errorValidacion) {
      return jsonError(res, errorValidacion, 400);
    }

    // Si el arqueo está activo, exige un turno abierto del cajero antes de
    // vender: ninguna venta puede quedar por fuera del cuadre de caja.
    const config = await configModel.listarMapa();
    if ((config.arqueo_habilitado || '0') === '1') {
      const turno = await turnoModel.buscarAbiertoPorUsuario(req.usuario.id);
      if (!turno) {
        return jsonError(res, 'Debe abrir un turno de caja antes de vender', 409);
      }
    }

    const factura = await facturaModel.crear({
      cliente_id: cliente_id || null,
      tipo_pago: tipo_pago || 'efectivo',
      descuento,
      items
    }, req.usuario.id);

    return jsonExito(res, factura, 'Factura emitida correctamente', 201);
  } catch (err) {
    return next(err);
  }
};

// POST /api/v1/facturas/:id/anular
const anular = async (req, res, next) => {
  try {
    const factura = await facturaModel.anular(req.params.id);
    return jsonExito(res, factura, 'Factura anulada y stock restaurado');
  } catch (err) {
    return next(err);
  }
};

// GET /api/v1/facturas/:id/pdf?formato=carta|media_carta
// Descarga el PDF de la factura.
const descargarPdf = async (req, res, next) => {
  try {
    const formato = req.query.formato || 'carta';
    if (!['carta', 'media_carta'].includes(formato)) {
      return jsonError(res, 'formato debe ser "carta" o "media_carta"', 400);
    }

    const factura = await facturaModel.buscarPorId(req.params.id);
    if (!factura) {
      return jsonError(res, 'Factura no encontrada', 404);
    }

    const buffer = await pdfService.generarFacturaPDF(factura, { formato });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="factura-${factura.numero_factura}.pdf"`);
    return res.send(buffer);
  } catch (err) {
    return next(err);
  }
};

// GET /api/v1/facturas/:id/ticket?ancho=58|80
// Devuelve el buffer de texto para impresora térmica POS.
const descargarTicket = async (req, res, next) => {
  try {
    const ancho = req.query.ancho || '80';
    if (!['58', '80'].includes(ancho)) {
      return jsonError(res, 'ancho debe ser "58" o "80"', 400);
    }

    const factura = await facturaModel.buscarPorId(req.params.id);
    if (!factura) {
      return jsonError(res, 'Factura no encontrada', 404);
    }

    const buffer = ticketService.generarTicket(factura, { ancho });

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ticket-${factura.numero_factura}.txt"`);
    return res.send(buffer);
  } catch (err) {
    return next(err);
  }
};

// Valida el cuerpo de una petición para crear una factura.
function validarCreacion(datos) {
  if (!Array.isArray(datos.items) || datos.items.length === 0) {
    return 'Debe incluir al menos un producto en items';
  }

  if (datos.tipo_pago && !facturaModel.TIPOS_PAGO.includes(datos.tipo_pago)) {
    return `El tipo de pago debe ser uno de: ${facturaModel.TIPOS_PAGO.join(', ')}`;
  }

  if (datos.descuento !== undefined && (Number.isNaN(Number(datos.descuento)) || Number(datos.descuento) < 0)) {
    return 'El descuento debe ser un número mayor o igual a 0';
  }

  for (const item of datos.items) {
    if (!item.producto_id || Number.isNaN(Number(item.producto_id))) {
      return 'Cada item debe incluir un producto_id válido';
    }
    if (!item.cantidad || !Number.isInteger(Number(item.cantidad)) || Number(item.cantidad) <= 0) {
      return 'Cada item debe incluir una cantidad entera mayor a 0';
    }
    // Descuento por línea opcional: monto en $ mayor o igual a 0.
    if (item.descuento !== undefined && item.descuento !== null &&
        (Number.isNaN(Number(item.descuento)) || Number(item.descuento) < 0)) {
      return 'El descuento de cada item debe ser un número mayor o igual a 0';
    }

    // Impuestos de la línea: opcional; si se envía debe ser un arreglo de ids
    // numéricos positivos (varios impuestos combinados estilo Odoo/DIAN).
    if (item.impuestos !== undefined && item.impuestos !== null) {
      if (!Array.isArray(item.impuestos)) {
        return 'impuestos de cada item debe ser un arreglo de ids';
      }
      if (item.impuestos.some((x) => !Number.isInteger(Number(x)) || Number(x) <= 0)) {
        return 'Cada impuesto debe ser un id numérico válido';
      }
      if (item.impuestos.length > 10) {
        return 'Un mismo producto no puede superar 10 impuestos combinados';
      }
    }
  }

  return null;
}

module.exports = { listar, obtener, crear, anular, descargarPdf, descargarTicket };
