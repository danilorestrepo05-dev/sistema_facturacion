// src/models/compra.model.js
// Compras / ingreso de mercancía: registra entradas de stock con su costo.
// Cada compra tiene una cabecera (proveedor, usuario y total) y genera un
// movimiento de inventario por línea con motivo 'compra' apuntando a ella.
const pool = require('../config/db');

// Crea una compra dentro de una transacción: valida las líneas y el proveedor,
// bloquea los productos, actualiza stock/costos e inserta los movimientos.
async function crear({ items, proveedor_id }, usuarioId) {
  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();

    // Normaliza y valida cada línea antes de tocar la base de datos.
    // El costo unitario es obligatorio (>= 0) para valorar el inventario.
    const lineas = [];
    for (const item of items) {
      const productoId = Number(item.producto_id);
      const cantidad = Number(item.cantidad);
      const costoBruto = item.costo_unitario;

      if (!Number.isInteger(productoId) || productoId <= 0) {
        const error = new Error('Cada línea necesita un producto válido');
        error.status = 400;
        throw error;
      }
      if (!Number.isInteger(cantidad) || cantidad <= 0) {
        const error = new Error('La cantidad debe ser un número entero mayor a 0');
        error.status = 400;
        throw error;
      }
      if (
        costoBruto === undefined || costoBruto === null || costoBruto === '' ||
        !Number.isFinite(Number(costoBruto)) || Number(costoBruto) < 0
      ) {
        const error = new Error('El costo unitario es obligatorio y debe ser numérico mayor o igual a 0');
        error.status = 400;
        throw error;
      }
      // No se permite el mismo producto dos veces en la misma compra.
      if (lineas.some((l) => l.producto_id === productoId)) {
        const error = new Error(`El producto ${productoId} está repetido en la compra`);
        error.status = 400;
        throw error;
      }

      lineas.push({ producto_id: productoId, cantidad, costo: Number(costoBruto) });
    }

    if (lineas.length === 0) {
      const error = new Error('La compra debe tener al menos un producto');
      error.status = 400;
      throw error;
    }

    // El proveedor es opcional; si viene debe existir y estar activo.
    let idProveedor = null;
    if (proveedor_id !== undefined && proveedor_id !== null && proveedor_id !== '') {
      const [proveedores] = await conexion.query(
        'SELECT id FROM proveedores WHERE id = ? AND activo = 1',
        [Number(proveedor_id)]
      );
      if (proveedores.length === 0) {
        const error = new Error('Proveedor no encontrado o inactivo');
        error.status = 404;
        throw error;
      }
      idProveedor = proveedores[0].id;
    }

    // Bloquea y valida cada producto: debe existir y estar activo.
    const productos = {};
    for (const linea of lineas) {
      const [filas] = await conexion.query(
        'SELECT id, nombre, precio_compra FROM productos WHERE id = ? AND activo = 1 FOR UPDATE',
        [linea.producto_id]
      );
      if (filas.length === 0) {
        const error = new Error(`Producto ${linea.producto_id} no encontrado o inactivo`);
        error.status = 404;
        throw error;
      }
      productos[linea.producto_id] = filas[0];
    }

    // Total de la compra para la cabecera.
    const total = lineas.reduce((suma, l) => suma + l.cantidad * l.costo, 0);

    // Cabecera de la compra: quién compró, a qué proveedor y por cuánto.
    const [cabecera] = await conexion.query(
      'INSERT INTO compras (proveedor_id, usuario_id, total) VALUES (?, ?, ?)',
      [idProveedor, usuarioId, Number(total.toFixed(2))]
    );
    const compraId = cabecera.insertId;

    let unidadesTotales = 0;
    const detalle = [];

    for (const linea of lineas) {
      const producto = productos[linea.producto_id];

      // Suma el stock recibido al stock actual del producto.
      await conexion.query(
        'UPDATE productos SET stock_actual = stock_actual + ? WHERE id = ?',
        [linea.cantidad, linea.producto_id]
      );

      // Si la línea trae un costo mayor a 0 se actualiza el precio de compra.
      if (linea.costo > 0 && linea.costo !== Number(producto.precio_compra)) {
        await conexion.query(
          'UPDATE productos SET precio_compra = ? WHERE id = ?',
          [linea.costo, linea.producto_id]
        );
      }

      // Movimiento de entrada ligado a la cabecera con su costo unitario.
      await conexion.query(
        `INSERT INTO movimientos_inventario
           (producto_id, tipo, cantidad, costo_unitario, motivo, referencia_id)
         VALUES (?, 'entrada', ?, ?, 'compra', ?)`,
        [linea.producto_id, linea.cantidad, linea.costo, compraId]
      );

      unidadesTotales += linea.cantidad;
      detalle.push({
        producto_id: linea.producto_id,
        nombre: producto.nombre,
        cantidad: linea.cantidad,
        costo_unitario: linea.costo
      });
    }

    await conexion.commit();

    return {
      compra_id: compraId,
      proveedor_id: idProveedor,
      items: detalle,
      unidades: unidadesTotales,
      costo_total: Number(total.toFixed(2))
    };
  } catch (err) {
    await conexion.rollback();
    throw err;
  } finally {
    conexion.release();
  }
}

module.exports = { crear };
