// src/services/dian/envio_nota.model.js
// Modelo de la COLA de envíos a la DIAN de las NOTAS correctivas
// (tabla envios_dian_notas), espejo de envio.model.js para las notas.
//
// Persiste el documento electrónico de la nota (CUDE + XML) y su estado, de
// modo que el sistema funcione offline encolando los envíos y reintentándolos
// cuando vuelva la conexión.

const pool = require('../../config/db');

// Registra (o actualiza) el envío del documento de una nota.
// datos: { notaId, proveedor, trackId, estado, xml, cufe }
const registrar = async ({ notaId, proveedor = 'simulacion', trackId = null, estado = 'pendiente', xml = null, cufe = null }) => {
  const [hijo] = await pool.query(
    'SELECT id FROM envios_dian_notas WHERE nota_id = ? LIMIT 1',
    [notaId]
  );

  if (hijo[0]) {
    await pool.query(
      `UPDATE envios_dian_notas
          SET proveedor = ?, track_id = ?, estado = ?, cuerpo_xml = COALESCE(?, cuerpo_xml), actualizado_en = NOW()
        WHERE id = ?`,
      [proveedor, trackId, estado, xml, hijo[0].id]
    );
    if (cufe) await actualizarNota(notaId, { cufe, estado, xml });
    return { id: hijo[0].id, nota_id: notaId, estado };
  }

  const [resultado] = await pool.query(
    `INSERT INTO envios_dian_notas (nota_id, proveedor, track_id, estado, cuerpo_xml)
     VALUES (?, ?, ?, ?, ?)`,
    [notaId, proveedor, trackId, estado, xml]
  );
  if (cufe) await actualizarNota(notaId, { cufe, estado, xml });
  return { id: resultado.insertId, nota_id: notaId, estado };
};

// Refleja el resultado del documento en la propia nota.
const actualizarNota = async (notaId, { cufe, estado, xml }) => {
  const estadoDian = estado === 'aprobada' ? 'aprobada' : estado === 'fallida' ? 'rechazada' : 'local';
  await pool.query(
    `UPDATE notas_correctivas
        SET cufe = COALESCE(?, cufe), xml_dian = COALESCE(?, xml_dian), estado_dian = ?
      WHERE id = ?`,
    [cufe || null, xml || null, estadoDian, notaId]
  );
};

// Lista los envíos de notas pendientes de reintentar (cola de reintentos).
const listarPendientes = async (limite = 50) => {
  const [filas] = await pool.query(
    `SELECT * FROM envios_dian_notas
      WHERE estado = 'pendiente' AND proximo_intento <= NOW()
      ORDER BY id ASC
      LIMIT ?`,
    [limite]
  );
  return filas;
};

// Marca un envío de nota como "enviando" e incrementa el contador de intentos.
const marcarEnviando = async (envioId) => {
  await pool.query(
    `UPDATE envios_dian_notas
        SET estado = 'enviando', intentos = intentos + 1, actualizado_en = NOW()
      WHERE id = ?`,
    [envioId]
  );
  const [filas] = await pool.query('SELECT intentos FROM envios_dian_notas WHERE id = ?', [envioId]);
  return filas[0] ? Number(filas[0].intentos) : 0;
};

// Actualiza el estado final de un envío de nota tras un reintento (con backoff).
const actualizarEstadoIntento = async (envioId, { estado, error = null, proximoIntento = null }) => {
  await pool.query(
    `UPDATE envios_dian_notas
        SET estado = ?, error_ultimo = ?, proximo_intento = COALESCE(?, proximo_intento), actualizado_en = NOW()
      WHERE id = ?`,
    [estado, error, proximoIntento, envioId]
  );
};

module.exports = { registrar, actualizarNota, listarPendientes, marcarEnviando, actualizarEstadoIntento };
