// src/models/factura.model.js
// Consultas y transacciones de facturación (mysql2 con consultas preparadas).
const pool = require('../config/db');

const TIPOS_PAGO = ['efectivo', 'tarjeta', 'transferencia', 'otro'];

// Lista facturas con cliente y usuario; filtros opcionales por número, cliente, estado y rango de fecha.
const listar = async ({ numero, cliente, estado, fecha_desde, fecha_hasta } = {}) => {
  const condiciones = [];
  const parametros = [];

  if (numero) {
    condiciones.push('f.numero_factura = ?');
    parametros.push(Number(numero));
  }
  if (cliente) {
    condiciones.push('c.nombre LIKE ?');
    parametros.push(`%${cliente}%`);
  }
  if (estado) {
    condiciones.push('f.estado = ?');
    parametros.push(estado);
  }
  if (fecha_desde) {
    condiciones.push('DATE(f.creado_en) >= ?');
    parametros.push(fecha_desde);
  }
  if (fecha_hasta) {
    condiciones.push('DATE(f.creado_en) <= ?');
    parametros.push(fecha_hasta);
  }

  const donde = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  const consulta = `
    SELECT f.id, f.numero_factura, f.prefijo, f.cliente_id, c.nombre AS cliente_nombre,
           f.usuario_id, u.nombre_completo AS usuario_nombre, f.tipo_pago,
           f.subtotal, f.impuesto_total, f.descuento, f.total, f.estado, f.creado_en
    FROM facturas f
    LEFT JOIN clientes c ON c.id = f.cliente_id
    LEFT JOIN usuarios u ON u.id = f.usuario_id
    ${donde}
    ORDER BY f.numero_factura DESC`;

  const [filas] = await pool.query(consulta, parametros);
  return filas;
};

// Obtiene una factura con sus líneas de detalle.
const buscarPorId = async (id) => {
  const [factura] = await pool.query(
    `SELECT f.id, f.numero_factura, f.prefijo, f.cliente_id, c.nombre AS cliente_nombre,
            c.documento AS cliente_documento, f.usuario_id, u.nombre_completo AS usuario_nombre,
            f.tipo_pago, f.subtotal, f.impuesto_total, f.descuento, f.total, f.estado, f.creado_en
     FROM facturas f
     LEFT JOIN clientes c ON c.id = f.cliente_id
     LEFT JOIN usuarios u ON u.id = f.usuario_id
     WHERE f.id = ?`,
    [id]
  );

  if (!factura[0]) return null;

  const [detalles] = await pool.query(
    `SELECT id, producto_id, producto_nombre, cantidad, precio_unitario,
            impuesto_porcentaje, impuesto, subtotal
     FROM detalles_factura WHERE factura_id = ? ORDER BY id`,
    [id]
  );

  return { ...factura[0], detalles };
};

// Crea una factura dentro de una transacción:
// valida stock, calcula totales, descuenta inventario y registra los movimientos.
// datos: { cliente_id, tipo_pago, descuento, items: [{ producto_id, cantidad }] }
const crear = async (datos, usuarioId) => {
  const { cliente_id = null, tipo_pago = 'efectivo', descuento = 0, items } = datos;

  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();

    // Si se indica cliente, debe existir y estar activo (un cliente inactivo no puede comprar).
    if (cliente_id) {
      const [clientes] = await conexion.query(
        'SELECT id FROM clientes WHERE id = ? AND activo = 1',
        [cliente_id]
      );
      if (!clientes[0]) {
        throw Object.assign(new Error('Cliente no encontrado o inactivo'), { status: 404 });
      }
    }

    // Calcula el siguiente número consecutivo (bloquea la última factura para evitar duplicados).
    const [ultima] = await conexion.query(
      'SELECT numero_factura FROM facturas ORDER BY numero_factura DESC LIMIT 1 FOR UPDATE'
    );
    const numeroFactura = (ultima[0] ? ultima[0].numero_factura : 0) + 1;

    let subtotal = 0;
    let impuestoTotal = 0;

    // Valida cada línea, calcula precios e impuestos y descuenta el stock.
    const lineas = [];
    for (const item of items) {
      const [productos] = await conexion.query(
        `SELECT id, nombre, precio_venta, impuesto_id, stock_actual,
                (SELECT porcentaje FROM impuestos WHERE id = productos.impuesto_id) AS impuesto_porcentaje
         FROM productos WHERE id = ? AND activo = 1 FOR UPDATE`,
        [item.producto_id]
      );

      const producto = productos[0];
      if (!producto) {
        throw Object.assign(new Error(`Producto ${item.producto_id} no encontrado o inactivo`), { status: 404 });
      }
      if (producto.stock_actual < item.cantidad) {
        throw Object.assign(
          new Error(`Stock insuficiente para "${producto.nombre}" (disponible: ${producto.stock_actual})`),
          { status: 409 }
        );
      }

      const porcentaje = Number(producto.impuesto_porcentaje || 0);
      const importeBase = Number(producto.precio_venta) * item.cantidad;
      const impuestoLinea = importeBase * (porcentaje / 100);

      lineas.push({
        producto_id: producto.id,
        producto_nombre: producto.nombre,
        cantidad: item.cantidad,
        precio_unitario: producto.precio_venta,
        impuesto_porcentaje: porcentaje,
        impuesto: impuestoLinea,
        subtotal_linea: importeBase
      });

      subtotal += importeBase;
      impuestoTotal += impuestoLinea;

      await conexion.query(
        'UPDATE productos SET stock_actual = stock_actual - ? WHERE id = ?',
        [item.cantidad, producto.id]
      );
    }

    const descuentoNum = Number(descuento || 0);
    const total = Math.max(0, subtotal + impuestoTotal - descuentoNum);

    // Inserta la factura.
    const [factura] = await conexion.query(
      `INSERT INTO facturas (numero_factura, cliente_id, usuario_id, tipo_pago, subtotal, impuesto_total, descuento, total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [numeroFactura, cliente_id, usuarioId, tipo_pago, subtotal, impuestoTotal, descuentoNum, total]
    );

    const facturaId = factura.insertId;

    // Inserta las líneas de detalle y los movimientos de salida de inventario.
    for (const linea of lineas) {
      await conexion.query(
        `INSERT INTO detalles_factura
           (factura_id, producto_id, producto_nombre, cantidad, precio_unitario,
            impuesto_porcentaje, impuesto, subtotal)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [facturaId, linea.producto_id, linea.producto_nombre, linea.cantidad,
         linea.precio_unitario, linea.impuesto_porcentaje, linea.impuesto, linea.subtotal_linea]
      );

      await conexion.query(
        `INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, motivo, referencia_id)
         VALUES (?, 'salida', ?, 'venta', ?)`,
        [linea.producto_id, linea.cantidad, facturaId]
      );
    }

    await conexion.commit();
    return buscarPorId(facturaId);
  } catch (err) {
    await conexion.rollback();
    throw err;
  } finally {
    conexion.release();
  }
};

// Anula una factura: cambia su estado, repone el stock y registra movimientos de entrada.
const anular = async (id) => {
  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();

    const [facturas] = await conexion.query(
      'SELECT id, estado FROM facturas WHERE id = ? FOR UPDATE',
      [id]
    );

    const factura = facturas[0];
    if (!factura) {
      throw Object.assign(new Error('Factura no encontrada'), { status: 404 });
    }
    if (factura.estado === 'anulada') {
      throw Object.assign(new Error('La factura ya está anulada'), { status: 409 });
    }

    const [detalles] = await conexion.query(
      'SELECT producto_id, cantidad FROM detalles_factura WHERE factura_id = ?',
      [id]
    );

    await conexion.query("UPDATE facturas SET estado = 'anulada' WHERE id = ?", [id]);

    for (const detalle of detalles) {
      if (!detalle.producto_id) continue; // el producto fue eliminado, no hay stock que reponer

      await conexion.query(
        'UPDATE productos SET stock_actual = stock_actual + ? WHERE id = ?',
        [detalle.cantidad, detalle.producto_id]
      );

      await conexion.query(
        `INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, motivo, referencia_id)
         VALUES (?, 'entrada', ?, 'anulacion', ?)`,
        [detalle.producto_id, detalle.cantidad, id]
      );
    }

    await conexion.commit();
    return buscarPorId(id);
  } catch (err) {
    await conexion.rollback();
    throw err;
  } finally {
    conexion.release();
  }
};

module.exports = { listar, buscarPorId, crear, anular, TIPOS_PAGO };
