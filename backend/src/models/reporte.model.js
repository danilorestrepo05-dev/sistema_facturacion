// src/models/reporte.model.js
// Consultas de reportes: ventas e inventario (mysql2 con consultas preparadas).
const pool = require('../config/db');

// Resumen de ventas en un rango de fechas.
const resumenVentas = async ({ fecha_desde, fecha_hasta }) => {
  const [filas] = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN estado = 'emitida' THEN 1 ELSE 0 END), 0) AS cantidad_facturas,
       COALESCE(SUM(CASE WHEN estado = 'emitida' THEN total ELSE 0 END), 0) AS total_emitidas,
       COALESCE(SUM(CASE WHEN estado = 'anulada' THEN total ELSE 0 END), 0) AS total_anuladas,
       COALESCE(ROUND(AVG(CASE WHEN estado = 'emitida' THEN total END), 2), 0) AS promedio_emitidas
     FROM facturas
     WHERE DATE(creado_en) BETWEEN ? AND ?`,
    [fecha_desde, fecha_hasta]
  );
  return filas[0];
};

// Total vendido agrupado por tipo de pago (solo facturas emitidas).
const ventasPorTipoPago = async ({ fecha_desde, fecha_hasta }) => {
  const [filas] = await pool.query(
    `SELECT tipo_pago, COUNT(*) AS cantidad, COALESCE(SUM(total), 0) AS total
     FROM facturas
     WHERE estado = 'emitida' AND DATE(creado_en) BETWEEN ? AND ?
     GROUP BY tipo_pago
     ORDER BY total DESC`,
    [fecha_desde, fecha_hasta]
  );
  return filas;
};

// Ventas emitidas agrupadas por día (para gráficos de tendencia).
const ventasDiarias = async ({ fecha_desde, fecha_hasta }) => {
  const [filas] = await pool.query(
    `SELECT DATE(creado_en) AS fecha,
            COUNT(*) AS facturas,
            COALESCE(SUM(total), 0) AS total
     FROM facturas
     WHERE estado = 'emitida' AND DATE(creado_en) BETWEEN ? AND ?
     GROUP BY DATE(creado_en)
     ORDER BY fecha ASC`,
    [fecha_desde, fecha_hasta]
  );
  return filas;
};

// Total vendido agrupado por usuario vendedor (solo facturas emitidas).
const ventasPorUsuario = async ({ fecha_desde, fecha_hasta }) => {
  const [filas] = await pool.query(
    `SELECT u.nombre_completo, COUNT(*) AS cantidad, COALESCE(SUM(f.total), 0) AS total
     FROM facturas f
     LEFT JOIN usuarios u ON u.id = f.usuario_id
     WHERE f.estado = 'emitida' AND DATE(f.creado_en) BETWEEN ? AND ?
     GROUP BY u.id, u.nombre_completo
     ORDER BY total DESC`,
    [fecha_desde, fecha_hasta]
  );
  return filas;
};

// Productos más vendidos por cantidad (solo facturas emitidas).
const productosMasVendidos = async ({ fecha_desde, fecha_hasta }, limite = 5) => {
  const [filas] = await pool.query(
    `SELECT d.producto_id, d.producto_nombre,
            SUM(d.cantidad) AS cantidad_vendida,
            SUM(d.subtotal) AS total_vendido
     FROM detalles_factura d
     INNER JOIN facturas f ON f.id = d.factura_id
     WHERE f.estado = 'emitida' AND DATE(f.creado_en) BETWEEN ? AND ?
     GROUP BY d.producto_id, d.producto_nombre
     ORDER BY cantidad_vendida DESC
     LIMIT ?`,
    [fecha_desde, fecha_hasta, limite]
  );
  return filas;
};

// Resumen del inventario actual.
const resumenInventario = async () => {
  const [filas] = await pool.query(
    `SELECT COUNT(*) AS cantidad_productos,
            COALESCE(SUM(stock_actual), 0) AS unidades_en_stock,
            COALESCE(SUM(stock_actual * precio_compra), 0) AS valor_inventario
     FROM productos WHERE activo = 1`
  );
  return filas[0];
};

// Productos con stock igual o menor al mínimo.
const productosBajoStock = async () => {
  const [filas] = await pool.query(
    `SELECT id, codigo, nombre, stock_actual, stock_minimo, precio_venta
     FROM productos
     WHERE activo = 1 AND stock_actual <= stock_minimo
     ORDER BY (stock_actual - stock_minimo) ASC`
  );
  return filas;
};

// Resumen de movimientos de inventario en un rango de fechas.
const resumenMovimientos = async ({ fecha_desde, fecha_hasta }) => {
  const [filas] = await pool.query(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN cantidad ELSE 0 END), 0) AS unidades_entrada,
            COALESCE(SUM(CASE WHEN tipo = 'salida' THEN cantidad ELSE 0 END), 0) AS unidades_salida
     FROM movimientos_inventario
     WHERE DATE(creado_en) BETWEEN ? AND ?`,
    [fecha_desde, fecha_hasta]
  );

  const [por_motivo] = await pool.query(
    `SELECT motivo, tipo, COUNT(*) AS cantidad, COALESCE(SUM(m.cantidad), 0) AS unidades
     FROM movimientos_inventario m
     WHERE DATE(m.creado_en) BETWEEN ? AND ?
     GROUP BY motivo, tipo
     ORDER BY cantidad DESC`,
    [fecha_desde, fecha_hasta]
  );

  return { ...filas[0], por_motivo };
};

// Detalle de movimientos con nombre/código de producto y factura asociada.
const movimientosDetalle = async ({ fecha_desde, fecha_hasta, tipo, motivo }, limite = 500) => {
  const condiciones = ['DATE(m.creado_en) BETWEEN ? AND ?'];
  const parametros = [fecha_desde, fecha_hasta];

  if (tipo) {
    condiciones.push('m.tipo = ?');
    parametros.push(tipo);
  }
  if (motivo) {
    condiciones.push('m.motivo = ?');
    parametros.push(motivo);
  }

  parametros.push(limite);

  const [filas] = await pool.query(
    `SELECT m.id, m.tipo, m.cantidad, m.motivo, m.referencia_id, m.creado_en,
            p.codigo AS producto_codigo, p.nombre AS producto_nombre, p.unidad_medida,
            f.numero_factura
     FROM movimientos_inventario m
     LEFT JOIN productos p ON p.id = m.producto_id
     LEFT JOIN facturas f ON f.id = m.referencia_id
     WHERE ${condiciones.join(' AND ')}
     ORDER BY m.creado_en DESC, m.id DESC
     LIMIT ?`,
    parametros
  );
  return filas;
};

// Cantidad de productos y valor por categoría.
const productosPorCategoria = async () => {
  const [filas] = await pool.query(
    `SELECT c.id, c.nombre, COUNT(p.id) AS cantidad,
            COALESCE(SUM(p.stock_actual), 0) AS unidades,
            COALESCE(SUM(p.stock_actual * p.precio_compra), 0) AS valor
     FROM categorias c
     LEFT JOIN productos p ON p.categoria_id = c.id AND p.activo = 1
     GROUP BY c.id, c.nombre
     ORDER BY c.nombre`
  );
  return filas;
};

module.exports = {
  resumenVentas,
  ventasPorTipoPago,
  ventasDiarias,
  ventasPorUsuario,
  productosMasVendidos,
  resumenInventario,
  productosBajoStock,
  productosPorCategoria,
  resumenMovimientos,
  movimientosDetalle
};
