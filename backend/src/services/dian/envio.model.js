// src/services/dian/envio.model.js
// Modelo de la COLA de envíos a la DIAN (tabla envios_dian).
//
// Persiste los documentos electrónicos y su estado, de modo que el sistema
// pueda funcionar offline (local) encolando los envíos y procesarlos cuando
// vuelva a haber conexión. También dejamos el CUFE/XML en las columnas de la
// propia factura para consulta rápida.

const pool = require('../../config/db');

// Registra (o actualiza) el envío de un documento electrónico.
// datos: { facturaId, proveedor, trackId, estado, xml, cufe }
const registrar = async ({ facturaId, proveedor = 'simulacion', trackId = null, estado = 'pendiente', xml = null, cufe = null }) => {
  const [hijo] = await pool.query(
    'SELECT id FROM envios_dian WHERE factura_id = ? LIMIT 1',
    [facturaId]
  );

  if (hijo[0]) {
    // Actualiza el envío existente.
    await pool.query(
      `UPDATE envios_dian
         SET proveedor = ?, track_id = ?, estado = ?, cuerpo_xml = COALESCE(?, cuerpo_xml), actualizado_en = NOW()
       WHERE id = ?`,
      [proveedor, trackId, estado, xml, hijo[0].id]
    );
    const envioId = hijo[0].id;
    if (cufe) await actualizarFactura(facturaId, { cufe, estado, xml });
    return { id: envioId, factura_id: facturaId, estado };
  }

  // Inserta un nuevo envío.
  const [resultado] = await pool.query(
    `INSERT INTO envios_dian (factura_id, proveedor, track_id, estado, cuerpo_xml)
     VALUES (?, ?, ?, ?, ?)`,
    [facturaId, proveedor, trackId, estado, xml]
  );

  if (cufe) await actualizarFactura(facturaId, { cufe, estado, xml });
  return { id: resultado.insertId, factura_id: facturaId, estado };
};

// Refleja el resultado del documento en la propia factura.
const actualizarFactura = async (facturaId, { cufe, estado, xml }) => {
  const estadoDian = estado === 'aprobada' ? 'aprobada' : estado === 'fallida' ? 'rechazada' : 'local';
  await pool.query(
    `UPDATE facturas
        SET cufe = COALESCE(?, cufe),
            xml_dian = COALESCE(?, xml_dian),
            estado_dian = ?
      WHERE id = ?`,
    [cufe || null, xml || null, estadoDian, facturaId]
  );
};

// Lista los envíos pendientes de reintentar (cola de reintentos).
const listarPendientes = async (limite = 50) => {
  const [filas] = await pool.query(
    `SELECT * FROM envios_dian
      WHERE estado = 'pendiente' AND proximo_intento <= NOW()
      ORDER BY id ASC
      LIMIT ?`,
    [limite]
  );
  return filas;
};

// Obtiene el último envío registrado para una factura.
const buscarPorFactura = async (facturaId) => {
  const [filas] = await pool.query(
    'SELECT * FROM envios_dian WHERE factura_id = ? ORDER BY id DESC LIMIT 1',
    [facturaId]
  );
  return filas[0] || null;
};

// Marca un envío como "enviando" e incrementa el contador de intentos.
// Devuelve el número de intentos tras el incremento.
const marcarEnviando = async (envioId) => {
  await pool.query(
    `UPDATE envios_dian
        SET estado = 'enviando', intentos = intentos + 1, actualizado_en = NOW()
      WHERE id = ?`,
    [envioId]
  );
  const [filas] = await pool.query('SELECT intentos FROM envios_dian WHERE id = ?', [envioId]);
  return filas[0] ? Number(filas[0].intentos) : 0;
};

// Actualiza el estado final (aprobada/rechazada/pendiente) de un envío tras
// un reintento, guardando el track id y, en caso de fallo, el error y cuándo
// volver a intentar (backoff).
const actualizarEstadoIntento = async (envioId, { estado, trackId = null, error = null, proximoIntento = null }) => {
  await pool.query(
    `UPDATE envios_dian
        SET estado = ?,
            track_id = COALESCE(?, track_id),
            cuerpo_xml = COALESCE(?, cuerpo_xml),
            error_ultimo = ?,
            proximo_intento = COALESCE(?, proximo_intento),
            actualizado_en = NOW()
      WHERE id = ?`,
    [estado, trackId, null, error, proximoIntento, envioId]
  );
};

module.exports = { registrar, actualizarFactura, listarPendientes, buscarPorFactura, marcarEnviando, actualizarEstadoIntento };
