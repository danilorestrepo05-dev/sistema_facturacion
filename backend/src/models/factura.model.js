// src/models/factura.model.js
// Consultas y transacciones de facturación (mysql2 con consultas preparadas).
const pool = require('../config/db');

const TIPOS_PAGO = ['efectivo', 'tarjeta', 'transferencia', 'otro'];

// Lista facturas con cliente y usuario; filtros opcionales por número, cliente, estado y rango de fecha.
const listar = async ({ numero, cliente, estado, fecha_desde, fecha_hasta } = {}, pagina = 1, porPagina = 0) => {
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
           c.documento AS cliente_documento, c.tipo_documento AS cliente_tipo_documento,
           c.telefono AS cliente_telefono, c.email AS cliente_email,
           c.direccion AS cliente_direccion,
           f.usuario_id, u.nombre_completo AS usuario_nombre, f.tipo_pago,
           f.subtotal, f.impuesto_total, f.descuento, f.total, f.estado, f.creado_en,
           f.cufe, f.estado_dian
    FROM facturas f
    LEFT JOIN clientes c ON c.id = f.cliente_id
    LEFT JOIN usuarios u ON u.id = f.usuario_id
    ${donde}
    ORDER BY f.numero_factura DESC`;

  const parametrosListado = [...parametros];

  // Paginación opt-in: solo se aplica cuando la vista pide por_pagina.
  let sql = consulta;
  if (porPagina > 0) {
    sql += ' LIMIT ? OFFSET ?';
    parametrosListado.push(porPagina, (pagina - 1) * porPagina);
  }

  const [filas] = await pool.query(sql, parametrosListado);
  return filas;
};

// Cuenta las facturas que cumplen los filtros (para la paginación).
const contar = async ({ numero, cliente, estado, fecha_desde, fecha_hasta } = {}) => {
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

  const [filas] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM facturas f
     LEFT JOIN clientes c ON c.id = f.cliente_id
     ${donde}`,
    parametros
  );
  return filas[0].total;
};

// Obtiene una factura con sus líneas de detalle.
const buscarPorId = async (id) => {
  const [factura] = await pool.query(
    `SELECT f.id, f.numero_factura, f.prefijo, f.cliente_id, c.nombre AS cliente_nombre,
            c.documento AS cliente_documento, c.tipo_documento AS cliente_tipo_documento,
            c.telefono AS cliente_telefono, c.email AS cliente_email,
            c.direccion AS cliente_direccion,
            f.usuario_id, u.nombre_completo AS usuario_nombre,
            f.tipo_pago, f.subtotal, f.impuesto_total, f.descuento, f.total, f.estado, f.creado_en,
            f.cufe, f.estado_dian, f.xml_dian, f.resolucion_id
     FROM facturas f
     LEFT JOIN clientes c ON c.id = f.cliente_id
     LEFT JOIN usuarios u ON u.id = f.usuario_id
     WHERE f.id = ?`,
    [id]
  );

  if (!factura[0]) return null;

  const [detalles] = await pool.query(
    `SELECT id, producto_id, producto_nombre, cantidad, precio_unitario, descuento,
            impuesto_porcentaje, impuesto, subtotal
     FROM detalles_factura WHERE factura_id = ? ORDER BY id`,
    [id]
  );

  // Adjunta el desglose de impuestos de cada línea (uno o varios por ítem).
  if (detalles.length > 0) {
    const [impuestosFilas] = await pool.query(
      `SELECT detalle_id, impuesto_id AS id, nombre, porcentaje, base, valor
       FROM detalle_impuestos WHERE detalle_id IN (?) ORDER BY id`,
      [detalles.map((d) => d.id)]
    );
    const mapaImpuestos = {};
    impuestosFilas.forEach((f) => {
      (mapaImpuestos[f.detalle_id] ??= []).push(f);
    });
    detalles.forEach((d) => { d.impuestos = mapaImpuestos[d.id] || []; });
  }

  return { ...factura[0], detalles };
};

// Crea una factura dentro de una transacción:
// valida stock, calcula totales, descuenta inventario y registra los movimientos.
// datos: { cliente_id, tipo_pago, descuento, items: [{ producto_id, cantidad, descuento? }] }
// El descuento por línea es un monto en $ con tope al valor de la línea
// (precio * cantidad); el impuesto de cada línea se calcula sobre la base reducida.
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
    let descuentoLineas = 0;

    // Valida cada línea, calcula precios e impuestos y descuenta el stock.
    const lineas = [];
    for (const item of items) {
      const [productos] = await conexion.query(
        `SELECT p.id, p.nombre, p.precio_venta, p.impuesto_id, i.nombre AS impuesto_nombre,
                p.stock_actual, i.porcentaje AS impuesto_porcentaje
         FROM productos p
         LEFT JOIN impuestos i ON i.id = p.impuesto_id
         WHERE p.id = ? AND p.activo = 1
         FOR UPDATE`,
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

      const importeBase = Number(producto.precio_venta) * item.cantidad;

      // Descuento de la línea: monto en $, no puede superar el valor de la línea.
      const descuentoLinea = Number(item.descuento || 0);
      if (descuentoLinea > importeBase) {
        throw Object.assign(
          new Error(`El descuento de "${producto.nombre}" ($ ${descuentoLinea}) supera el valor de la línea ($ ${importeBase})`),
          { status: 400 }
        );
      }

      // Impuestos de la línea:
      // - Si el cliente envía el arreglo "impuestos" con ids del catálogo se usan
      //   TODOS esos impuestos combinados sobre la misma base (estilo Odoo/DIAN).
      // - Arreglo vacío = línea sin impuestos (exenta a propósito).
      // - Sin arreglo = comportamiento histórico: el impuesto configurado del producto.
      let impuestosLinea;
      if (Array.isArray(item.impuestos)) {
        const ids = [...new Set(item.impuestos.map((x) => Number(x)))].filter(Number.isInteger);
        if (ids.length > 0) {
          const [filas] = await conexion.query(
            'SELECT id, nombre, porcentaje FROM impuestos WHERE id IN (?) AND activo = 1',
            [ids]
          );
          if (filas.length !== ids.length) {
            throw Object.assign(
              new Error('Algún impuesto indicado no existe o está inactivo'),
              { status: 400 }
            );
          }
          impuestosLinea = filas.map((f) => ({ ...f }));
          if (impuestosLinea.length > 1) {
            const tieneExento = impuestosLinea.some((t) => Number(t.porcentaje) === 0);
            const tieneGravado = impuestosLinea.some((t) => Number(t.porcentaje) > 0);
            if (tieneExento && tieneGravado) {
              throw Object.assign(
                new Error('Exento no puede combinarse con impuestos gravados'),
                { status: 400 }
              );
            }
          }
        } else {
          impuestosLinea = [];
        }
      } else if (producto.impuesto_porcentaje !== null && producto.impuesto_porcentaje !== undefined) {
        impuestosLinea = [{
          id: producto.impuesto_id,
          nombre: producto.impuesto_nombre || '',
          porcentaje: Number(producto.impuesto_porcentaje)
        }];
      } else {
        impuestosLinea = [];
      }

      // El impuesto se calcula sobre la base reducida (DIAN-friendly).
      // Con varios impuestos cada uno aplica su porcentaje sobre la MISMA base.
      const baseGravable = importeBase - descuentoLinea;
      let impuestoLinea = 0;
      for (const t of impuestosLinea) {
        t.valor = baseGravable * (Number(t.porcentaje) / 100);
        impuestoLinea += t.valor;
      }

      lineas.push({
        producto_id: producto.id,
        producto_nombre: producto.nombre,
        cantidad: item.cantidad,
        precio_unitario: producto.precio_venta,
        descuento: descuentoLinea,
        // Compatibilidad: en detalles_factura se guarda la suma de los porcentajes
        // (matemáticamente equivale a aplicarlos todos sobre la misma base).
        impuesto_porcentaje: impuestosLinea.reduce((s, t) => s + Number(t.porcentaje), 0),
        impuesto: impuestoLinea,
        subtotal_linea: importeBase,
        base_gravable: baseGravable,
        desglose_impuestos: impuestosLinea
      });

      subtotal += importeBase;
      descuentoLineas += descuentoLinea;
      impuestoTotal += impuestoLinea;

      await conexion.query(
        'UPDATE productos SET stock_actual = stock_actual - ? WHERE id = ?',
        [item.cantidad, producto.id]
      );
    }

    const descuentoNum = Number(descuento || 0);
    // El descuento total de la factura suma los descuentos de línea y el de factura.
    const descuentoTotal = descuentoLineas + descuentoNum;

    // El descuento total no puede dejar la venta en $0 ni en negativo
    // (evita errores del cajero y ventas gratuitas accidentales).
    if (descuentoTotal >= subtotal + impuestoTotal) {
      throw Object.assign(
        new Error('El descuento no puede superar ni igualar el valor de la venta'),
        { status: 400 }
      );
    }

    const total = Math.max(0, subtotal + impuestoTotal - descuentoTotal);

    // Inserta la factura.
    const [factura] = await conexion.query(
      `INSERT INTO facturas (numero_factura, cliente_id, usuario_id, tipo_pago, subtotal, impuesto_total, descuento, total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [numeroFactura, cliente_id, usuarioId, tipo_pago, subtotal, impuestoTotal, descuentoTotal, total]
    );

    const facturaId = factura.insertId;

    // Inserta las líneas de detalle, su desglose de impuestos y los
    // movimientos de salida de inventario.
    for (const linea of lineas) {
      const [detalleNuevo] = await conexion.query(
        `INSERT INTO detalles_factura
           (factura_id, producto_id, producto_nombre, cantidad, precio_unitario, descuento,
            impuesto_porcentaje, impuesto, subtotal)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [facturaId, linea.producto_id, linea.producto_nombre, linea.cantidad,
         linea.precio_unitario, linea.descuento, linea.impuesto_porcentaje,
         linea.impuesto, linea.subtotal_linea]
      );

      // Desglose por impuesto de la línea (uno o varios combinados).
      if (linea.desglose_impuestos.length > 0) {
        await conexion.query(
          `INSERT INTO detalle_impuestos (detalle_id, impuesto_id, nombre, porcentaje, base, valor)
           VALUES ?`,
          [linea.desglose_impuestos.map((t) => [
            detalleNuevo.insertId, t.id, t.nombre || '', Number(t.porcentaje),
            linea.base_gravable, t.valor
          ])]
        );
      }

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

module.exports = { listar, contar, buscarPorId, crear, anular, TIPOS_PAGO };
