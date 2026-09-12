// src/controllers/nota.controller.js
// Lógica de NOTAS CORRECTIVAS (crédito y débito): documentos electrónicos que
// corrigen una factura original ante la DIAN. Reutiliza el flujo de facturación
// electrónica (CUDE + XML UBL 2.1 CreditNote/DebitNote) y la impresión PDF/ticket.
const notaModel = require('../models/nota_correctiva.model');
const configModel = require('../models/config.model');
const pdfService = require('../services/pdf.service');
const ticketService = require('../services/ticket.service');
const dianService = require('../services/dian/dian.service');
const { jsonExito, jsonError } = require('../utils/response');
const { leerPaginacion, enviarCabeceras } = require('../utils/paginacion');

// GET /api/v1/notas?tipo=&factura_id=&estado=&estado_dian=&fecha_desde=&fecha_hasta=
const listar = async (req, res, next) => {
  try {
    const filtros = {
      tipo: req.query.tipo,
      factura_id: req.query.factura_id,
      estado: req.query.estado,
      estado_dian: req.query.estado_dian,
      fecha_desde: req.query.fecha_desde,
      fecha_hasta: req.query.fecha_hasta
    };

    const paginacion = leerPaginacion(req);
    const notas = await notaModel.listar(filtros, paginacion?.pagina ?? 1, paginacion?.porPagina ?? 0);
    if (paginacion) {
      const total = await notaModel.contar(filtros);
      enviarCabeceras(res, { ...paginacion, total });
    }
    return jsonExito(res, notas, 'Notas correctivas obtenidas');
  } catch (err) {
    return next(err);
  }
};

// GET /api/v1/notas/:id
const obtener = async (req, res, next) => {
  try {
    const nota = await notaModel.buscarPorId(req.params.id);
    if (!nota) {
      return jsonError(res, 'Nota correctiva no encontrada', 404);
    }
    return jsonExito(res, nota, 'Nota correctiva obtenida');
  } catch (err) {
    return next(err);
  }
};

// POST /api/v1/notas
// Body: { tipo, factura_original_id, motivo?, preferencia_motivo?, monto? }
//   - credito: por defecto el total de la factura original (anulación electrónica).
//   - debito : requiere monto > 0 (ajuste que incrementa la factura).
const crear = async (req, res, next) => {
  try {
    const { tipo, factura_original_id, motivo, preferencia_motivo, monto } = req.body || {};

    const errorValidacion = validarCreacion(req.body);
    if (errorValidacion) {
      return jsonError(res, errorValidacion, 400);
    }

    const nota = await notaModel.crear({
      tipo, factura_original_id, motivo, preferencia_motivo, monto
    }, req.usuario.id);

    // Facturación electrónica DIAN (no bloqueante): emite el documento
    // electrónico de la nota en segundo plano y actualiza estado/CUDE.
    const config = await configModel.listarMapa();
    if ((config.facturacion_electronica_habilitado || '0') === '1') {
      dianService.procesarNota(nota.id).catch((e) => {
        console.error('[DIAN] Error en procesamiento de nota en segundo plano:', e.message);
      });
    }

    return jsonExito(res, nota, 'Nota correctiva emitida correctamente', 201);
  } catch (err) {
    return next(err);
  }
};

// POST /api/v1/notas/:id/anular
const anular = async (req, res, next) => {
  try {
    const nota = await notaModel.anular(req.params.id);
    return jsonExito(res, nota, 'Nota correctiva anulada');
  } catch (err) {
    return next(err);
  }
};

// POST /api/v1/notas/:id/dian
// Emite (o reintenta) el documento electrónico DIAN de una nota existente.
const procesarDian = async (req, res, next) => {
  try {
    const nota = await notaModel.buscarPorId(req.params.id);
    if (!nota) {
      return jsonError(res, 'Nota correctiva no encontrada', 404);
    }

    const estado = await dianService.procesarNota(nota.id);
    return jsonExito(res, { estado }, 'Documento electrónico de la nota procesado');
  } catch (err) {
    return next(err);
  }
};

// GET /api/v1/notas/:id/pdf?formato=carta|media_carta
// Descarga el PDF de la nota correctiva.
const descargarPdf = async (req, res, next) => {
  try {
    const formato = req.query.formato || 'carta';
    if (!['carta', 'media_carta'].includes(formato)) {
      return jsonError(res, 'formato debe ser "carta" o "media_carta"', 400);
    }

    const nota = await notaModel.buscarPorId(req.params.id);
    if (!nota) {
      return jsonError(res, 'Nota correctiva no encontrada', 404);
    }

    const buffer = await pdfService.generarNotaPDF(nota, { formato });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="nota-${nota.tipo}-${nota.numero_nota}.pdf"`);
    return res.send(buffer);
  } catch (err) {
    return next(err);
  }
};

// GET /api/v1/notas/:id/ticket?ancho=58|80
// Devuelve el buffer de texto para impresora térmica POS.
const descargarTicket = async (req, res, next) => {
  try {
    const ancho = req.query.ancho || '80';
    if (!['58', '80'].includes(ancho)) {
      return jsonError(res, 'ancho debe ser "58" o "80"', 400);
    }

    const nota = await notaModel.buscarPorId(req.params.id);
    if (!nota) {
      return jsonError(res, 'Nota correctiva no encontrada', 404);
    }

    const buffer = ticketService.generarNotaTicket(nota, { ancho });

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ticket-nota-${nota.tipo}-${nota.numero_nota}.txt"`);
    return res.send(buffer);
  } catch (err) {
    return next(err);
  }
};

// Valida el cuerpo de una petición para crear una nota correctiva.
function validarCreacion(datos) {
  if (!datos.factura_original_id) {
    return 'Debe indicar la factura original de la nota';
  }
  if (!notaModel.TIPOS_NOTA.includes(datos.tipo)) {
    return `El tipo de nota debe ser uno de: ${notaModel.TIPOS_NOTA.join(', ')}`;
  }
  if (datos.preferencia_motivo && !notaModel.MOTIVOS.includes(datos.preferencia_motivo)) {
    return `La preferencia de motivo debe ser uno de: ${notaModel.MOTIVOS.join(', ')}`;
  }
  if (datos.monto !== undefined && datos.monto !== null &&
      (Number.isNaN(Number(datos.monto)) || Number(datos.monto) < 0)) {
    return 'El monto debe ser un número mayor o igual a 0';
  }
  return null;
}

module.exports = { listar, obtener, crear, anular, procesarDian, descargarPdf, descargarTicket };
