// src/controllers/reporte.controller.js
// Lógica de reportes: ventas e inventario.
const reporteModel = require('../models/reporte.model');
const { jsonExito, jsonError } = require('../utils/response');

// Fecha local del servidor en formato YYYY-MM-DD (la BD guarda hora local).
const fechaHoyLocal = () => {
  const ahora = new Date();
  return [
    ahora.getFullYear(),
    String(ahora.getMonth() + 1).padStart(2, '0'),
    String(ahora.getDate()).padStart(2, '0')
  ].join('-');
};

// GET /api/v1/reportes/ventas?fecha_desde=YYYY-MM-DD&fecha_hasta=YYYY-MM-DD
const ventas = async (req, res, next) => {
  try {
    const hoy = fechaHoyLocal();
    const { fecha_desde = hoy, fecha_hasta = hoy } = req.query;

    if (fecha_desde > fecha_hasta) {
      return jsonError(res, 'fecha_desde no puede ser mayor que fecha_hasta', 400);
    }

    const rangos = { fecha_desde, fecha_hasta };

    const [resumen, por_tipo_pago, por_usuario, productos_mas_vendidos] = await Promise.all([
      reporteModel.resumenVentas(rangos),
      reporteModel.ventasPorTipoPago(rangos),
      reporteModel.ventasPorUsuario(rangos),
      reporteModel.productosMasVendidos(rangos)
    ]);

    return jsonExito(res, {
      resumen,
      por_tipo_pago,
      por_usuario,
      productos_mas_vendidos
    }, 'Reporte de ventas generado');
  } catch (err) {
    return next(err);
  }
};

// GET /api/v1/reportes/ventas/diarias?fecha_desde=YYYY-MM-DD&fecha_hasta=YYYY-MM-DD
const ventasDiarias = async (req, res, next) => {
  try {
    const hoy = fechaHoyLocal();
    const { fecha_desde = hoy, fecha_hasta = hoy } = req.query;

    if (fecha_desde > fecha_hasta) {
      return jsonError(res, 'fecha_desde no puede ser mayor que fecha_hasta', 400);
    }

    const datos = await reporteModel.ventasDiarias({ fecha_desde, fecha_hasta });
    return jsonExito(res, datos, 'Ventas diarias generadas');
  } catch (err) {
    return next(err);
  }
};

// GET /api/v1/reportes/inventario
const inventario = async (req, res, next) => {
  try {
    const [resumen, bajo_stock, por_categoria] = await Promise.all([
      reporteModel.resumenInventario(),
      reporteModel.productosBajoStock(),
      reporteModel.productosPorCategoria()
    ]);

    return jsonExito(res, {
      resumen,
      bajo_stock,
      por_categoria
    }, 'Reporte de inventario generado');
  } catch (err) {
    return next(err);
  }
};

// GET /api/v1/reportes/movimientos?fecha_desde=YYYY-MM-DD&fecha_hasta=YYYY-MM-DD&tipo=entrada|salida&motivo=venta|compra|ajuste|anulacion
const movimientos = async (req, res, next) => {
  try {
    const hoy = fechaHoyLocal();
    const { fecha_desde = hoy, fecha_hasta = hoy } = req.query;
    const { tipo, motivo } = req.query;

    const TIPOS = ['entrada', 'salida'];
    const MOTIVOS = ['venta', 'compra', 'ajuste', 'anulacion'];

    if (fecha_desde > fecha_hasta) {
      return jsonError(res, 'fecha_desde no puede ser mayor que fecha_hasta', 400);
    }
    if (tipo && !TIPOS.includes(tipo)) {
      return jsonError(res, `El tipo debe ser uno de: ${TIPOS.join(', ')}`, 400);
    }
    if (motivo && !MOTIVOS.includes(motivo)) {
      return jsonError(res, `El motivo debe ser uno de: ${MOTIVOS.join(', ')}`, 400);
    }

    const filtros = { fecha_desde, fecha_hasta, tipo, motivo };

    const [resumen, detalle] = await Promise.all([
      reporteModel.resumenMovimientos(filtros),
      reporteModel.movimientosDetalle(filtros)
    ]);

    return jsonExito(res, { resumen, detalle }, 'Reporte de movimientos generado');
  } catch (err) {
    return next(err);
  }
};

module.exports = { ventas, ventasDiarias, inventario, movimientos };
