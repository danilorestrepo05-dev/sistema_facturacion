// src/models/turno.model.js
// Consultas a la tabla turnos_caja (arqueo de caja, Fase 4).
const pool = require('../config/db');

// Busca el turno abierto de un usuario (solo puede haber uno a la vez).
const buscarAbiertoPorUsuario = async (usuarioId) => {
  const [filas] = await pool.query(
    `SELECT * FROM turnos_caja
     WHERE usuario_id = ? AND estado = 'abierto'
     ORDER BY id DESC LIMIT 1`,
    [usuarioId]
  );
  return filas[0] || null;
};

// Suma las ventas en efectivo del turno: facturas del usuario con id posterior
// al watermark guardado en la apertura (exactas, sin depender de relojes).
const sumarVentasEfectivoTurno = async (turnoId) => {
  const [filas] = await pool.query(
    `SELECT COALESCE(SUM(f.total), 0) AS total
     FROM turnos_caja t
     JOIN facturas f ON f.usuario_id = t.usuario_id AND f.id >= t.factura_desde_id
     WHERE t.id = ? AND f.tipo_pago = 'efectivo'
       AND f.estado = 'emitida'`,
    [turnoId]
  );
  return Number(filas[0].total || 0);
};

// Abre un turno con fondo inicial y devuelve el registro creado.
// Guarda el "watermark" de facturas (último id existente): las ventas del turno
// serán las facturas posteriores a ese id. Es exacto aunque el test o la caja
// emitan varias ventas dentro del mismo segundo, y no depende de zonas horarias.
const abrir = async (usuarioId, montoApertura) => {
  const [[{ siguiente }]] = await pool.query(
    'SELECT COALESCE(MAX(id), 0) + 1 AS siguiente FROM facturas'
  );
  const [resultado] = await pool.query(
    'INSERT INTO turnos_caja (usuario_id, monto_apertura, factura_desde_id) VALUES (?, ?, ?)',
    [usuarioId, montoApertura, siguiente]
  );
  return buscarPorId(resultado.insertId);
};

// Cierra el turno: guarda lo contado, lo esperado y la diferencia.
const cerrar = async (id, { montoEsperado, montoReal, diferencia, observaciones }) => {
  await pool.query(
    `UPDATE turnos_caja SET
       fecha_cierre = CURRENT_TIMESTAMP,
       monto_esperado = ?, monto_real = ?, diferencia = ?,
       observaciones = ?, estado = 'cerrado'
     WHERE id = ?`,
    [montoEsperado, montoReal, diferencia, observaciones || null, id]
  );
  return buscarPorId(id);
};

// Busca un turno por su id.
const buscarPorId = async (id) => {
  const [filas] = await pool.query('SELECT * FROM turnos_caja WHERE id = ?', [id]);
  return filas[0] || null;
};

// Historial de turnos; los cajeros solo ven los suyos (filtro por usuario).
const listar = async (usuarioId = null) => {
  const consulta = `
    SELECT t.*, u.nombre_completo AS usuario_nombre
    FROM turnos_caja t
    JOIN usuarios u ON u.id = t.usuario_id
    ${usuarioId ? 'WHERE t.usuario_id = ?' : ''}
    ORDER BY t.id DESC
    LIMIT 200`;

  const [filas] = await pool.query(consulta, usuarioId ? [usuarioId] : []);
  return filas;
};

module.exports = { abrir, cerrar, buscarPorId, buscarAbiertoPorUsuario, sumarVentasEfectivoTurno, listar };
