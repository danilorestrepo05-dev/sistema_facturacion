// src/models/compra.model.js
// Compras / ingreso de mercancía: registra entradas de stock con su costo.
// Cada línea suma stock, puede actualizar el precio de compra del producto
// y genera un movimiento de inventario con motivo 'compra'.
const pool = require('../config/db');

// Crea una compra dentro de una transacción: valida las líneas, bloquea los
// productos, actualiza stock/costos e inserta los movimientos de entrada.
async function crear({ items }) {
  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();

    // Normaliza y valida cada línea antes de tocar la base de datos.
    const lineas = [];
    for (const item of items) {
      const productoId = Number(item.producto_id);
      const cantidad = Number(item.cantidad);
      const costo = item.costo_unitario === '' || item.costo_unitario === undefined || item.costo_unitario === null ? 0 : Number(item.costo_unitario);

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
      if (!Number.isFinite(costo) || costo < 0) {
        const error = new Error('El costo unitario debe ser numérico mayor o igual a 0');
        error.status = 400;
        throw error;
      }
      // No se permite el mismo producto dos veces en la misma compra.
      if (lineas.some((l) => l.producto_id === productoId)) {
        const error = new Error(`El producto ${productoId} está repetido en la compra`);
        error.status = 400;
        throw error;
      }

      lineas.push({ producto_id: productoId, cantidad, costo });
    }

    if (lineas.length === 0) {
      const error = new Error('La compra debe tener al menos un producto');
      error.status = 400;
      throw error;
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

    let costoTotal = 0;
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

      // Movimiento de entrada con motivo compra y su costo unitario.
      await conexion.query(
        `INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, costo_unitario, motivo)
         VALUES (?, 'entrada', ?, ?, 'compra')`,
        [linea.producto_id, linea.cantidad, linea.costo]
      );

      costoTotal += linea.cantidad * linea.costo;
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
      items: detalle,
      unidades: unidadesTotales,
      costo_total: Number(costoTotal.toFixed(2))
    };
  } catch (err) {
    await conexion.rollback();
    throw err;
  } finally {
    conexion.release();
  }
}

module.exports = { crear };
