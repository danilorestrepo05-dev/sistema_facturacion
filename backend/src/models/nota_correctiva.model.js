// src/models/nota_correctiva.model.js
// Modelo de NOTAS CORRECTIVAS (débito y crédito), documentos electrónicos que
// corrigen una factura original ante la DIAN: la nota crédito compensa/anula
// (total o parcialmente) una factura; la nota débito la incrementa.
//
// Diseño:
//   * Toda nota se vincula SIEMPRE a una factura original (factura_original_id).
//   * El usuario indica el tipo y el monto total de la nota (por defecto, para
//     una nota crédito, el total de la factura original = anulación electrónica).
//   * Los montos de detalle se prorratean por la proporción monto/total_original
//     para que el detalle sume exactamente al total de la nota.
//   * La nota NO toca inventario (es un documento correctivo electrónico; la
//     reposición/ajuste físico de mercancía se maneja por otros módulos).
//   * Guarda cufe (CUDE), estado_dian y xml_dian para la facturación electrónica.

const pool = require('../config/db');
const facturaModel = require('./factura.model');

// Tipos de nota correctiva soportados.
const TIPOS_NOTA = ['credito', 'debito'];

// Preferencia de motivo (opcional, ayuda a clasificar en reportes).
const MOTIVOS = ['correccion', 'anulacion', 'devolucion', 'ajuste'];

// Prorratea un monto por la proporción y lo redondea a 2 decimales.
const prorratear = (valor, proporcion) => Math.round(Number(valor || 0) * proporcion * 100) / 100;

// Lista notas correctivas con datos útiles para la tabla (sin detalles).
const listar = async (filtros = {}, pagina = 1, porPagina = 0) => {
  const condiciones = [];
  const parametros = [];

  if (filtros.tipo) {
    condiciones.push('n.tipo = ?');
    parametros.push(filtros.tipo);
  }
  if (filtros.factura_id) {
    condiciones.push('n.factura_original_id = ?');
    parametros.push(Number(filtros.factura_id));
  }
  if (filtros.estado) {
    condiciones.push('n.estado = ?');
    parametros.push(filtros.estado);
  }
  if (filtros.estado_dian) {
    condiciones.push('n.estado_dian = ?');
    parametros.push(filtros.estado_dian);
  }
  if (filtros.fecha_desde) {
    condiciones.push('DATE(n.creado_en) >= ?');
    parametros.push(filtros.fecha_desde);
  }
  if (filtros.fecha_hasta) {
    condiciones.push('DATE(n.creado_en) <= ?');
    parametros.push(filtros.fecha_hasta);
  }

  const donde = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  let consulta = `
    SELECT n.id, n.tipo, n.factura_original_id, n.preferencia_motivo, n.prefijo,
           n.numero_nota, n.motivo, n.cliente_id,
           c.nombre AS cliente_nombre, f.numero_factura AS factura_numero,
           f.prefijo AS factura_prefijo, u.nombre_completo AS usuario_nombre,
           n.subtotal, n.impuesto_total, n.descuento, n.total,
           n.estado, n.cufe, n.estado_dian, n.creado_en
    FROM notas_correctivas n
    LEFT JOIN clientes c ON c.id = n.cliente_id
    LEFT JOIN facturas f ON f.id = n.factura_original_id
    LEFT JOIN usuarios u ON u.id = n.usuario_id
    ${donde}
    ORDER BY n.numero_nota DESC`;

  if (porPagina > 0) {
    const offset = (pagina - 1) * porPagina;
    consulta += ' LIMIT ? OFFSET ?';
    parametros.push(porPagina, offset);
  }

  const [filas] = await pool.query(consulta, parametros);
  return filas;
};

// Cuenta cuántas notas hay según los mismos filtros (para la paginación).
const contar = async (filtros = {}) => {
  const condiciones = [];
  const parametros = [];

  if (filtros.tipo) { condiciones.push('tipo = ?'); parametros.push(filtros.tipo); }
  if (filtros.factura_id) { condiciones.push('factura_original_id = ?'); parametros.push(Number(filtros.factura_id)); }
  if (filtros.estado) { condiciones.push('estado = ?'); parametros.push(filtros.estado); }
  if (filtros.estado_dian) { condiciones.push('estado_dian = ?'); parametros.push(filtros.estado_dian); }
  if (filtros.fecha_desde) { condiciones.push('DATE(creado_en) >= ?'); parametros.push(filtros.fecha_desde); }
  if (filtros.fecha_hasta) { condiciones.push('DATE(creado_en) <= ?'); parametros.push(filtros.fecha_hasta); }

  const donde = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const [filas] = await pool.query(
    `SELECT COUNT(*) AS total FROM notas_correctivas ${donde}`,
    parametros
  );
  return filas[0].total;
};

// Obtiene una nota con su detalle (líneas) y datos de la factura original.
const buscarPorId = async (id) => {
  const [nota] = await pool.query(
    `SELECT n.id, n.tipo, n.factura_original_id, n.preferencia_motivo, n.prefijo,
            n.numero_nota, n.motivo, n.cliente_id, c.nombre AS cliente_nombre,
            c.documento AS cliente_documento, c.direccion AS cliente_direccion,
            c.telefono AS cliente_telefono, c.email AS cliente_email,
            c.tipo_documento AS cliente_tipo_documento, u.nombre_completo AS usuario_nombre,
            n.subtotal, n.impuesto_total, n.descuento, n.total,
            n.estado, n.cufe, n.estado_dian, n.xml_dian, n.creado_en,
            f.numero_factura AS factura_numero, f.prefijo AS factura_prefijo,
            f.total AS factura_total
     FROM notas_correctivas n
     LEFT JOIN clientes c ON c.id = n.cliente_id
     LEFT JOIN usuarios u ON u.id = n.usuario_id
     LEFT JOIN facturas f ON f.id = n.factura_original_id
     WHERE n.id = ?`,
    [id]
  );

  if (!nota[0]) return null;

  const [detalles] = await pool.query(
    `SELECT id, producto_id, producto_nombre, cantidad, precio_unitario, descuento,
            impuesto_porcentaje, impuesto, subtotal
     FROM notas_correctivas_detalle WHERE nota_id = ? ORDER BY id`,
    [id]
  );

  return { ...nota[0], detalles };
};

// Calcula el siguiente número de nota consecutivo para un prefijo (bloquea la
// última nota de ese prefijo para evitar duplicados en concurrencia).
const siguienteNumero = async (conexion, prefijo) => {
  const [ultima] = await conexion.query(
    'SELECT numero_nota FROM notas_correctivas WHERE prefijo = ? ORDER BY numero_nota DESC LIMIT 1 FOR UPDATE',
    [prefijo]
  );
  return (ultima[0] ? ultima[0].numero_nota : 0) + 1;
};

// Crea una nota correctiva a partir de una factura original.
// datos: { tipo, factura_original_id, motivo?, preferencia_motivo?, monto?, prefijo? }
// Por defecto (crédito) el monto es el total de la factura original = anulación.
const crear = async (datos, usuarioId) => {
  const { tipo = 'credito', factura_original_id, motivo = null, preferencia_motivo = null } = datos;

  if (!TIPOS_NOTA.includes(tipo)) {
    throw Object.assign(new Error(`El tipo de nota debe ser uno de: ${TIPOS_NOTA.join(', ')}`), { status: 400 });
  }
  if (!factura_original_id) {
    throw Object.assign(new Error('Debe indicar la factura original de la nota'), { status: 400 });
  }
  if (preferencia_motivo && !MOTIVOS.includes(preferencia_motivo)) {
    throw Object.assign(new Error(`Preferencia de motivo inválida: ${MOTIVOS.join(', ')}`), { status: 400 });
  }

  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();

    // La factura original debe existir y estar emitida (no anulada).
    const factura = await facturaModel.buscarPorId(factura_original_id);
    if (!factura) {
      throw Object.assign(new Error('Factura original no encontrada'), { status: 404 });
    }
    if (factura.estado !== 'emitida') {
      throw Object.assign(new Error('Solo se pueden emitir notas sobre facturas emitidas'), { status: 400 });
    }

    // Determina el prefijo de numeración (según el tipo) y el monto de la nota.
    const [cfg] = await conexion.query(
      `SELECT clave, valor FROM configuraciones
        WHERE clave IN ('notas_prefijo_credito', 'notas_prefijo_debito')`
    );
    const mapaPrefijos = {};
    cfg.forEach((c) => { mapaPrefijos[c.clave] = c.valor; });

    const prefijo = tipo === 'credito'
      ? (mapaPrefijos.notas_prefijo_credito || 'NC')
      : (mapaPrefijos.notas_prefijo_debito || 'ND');

    const totalOriginal = Number(factura.total) || 0;
    // Para la nota crédito, el monto por defecto es el total de la factura
    // (anulación electrónica). Para la débito se exige un monto de ajuste > 0.
    const monto = Number(datos.monto);
    const montoEfectivo = Number.isFinite(monto) && monto > 0 ? monto : totalOriginal;

    // Validaciones según el tipo de nota.
    if (tipo === 'credito') {
      if (montoEfectivo > totalOriginal) {
        throw Object.assign(
          new Error(`La nota crédito no puede superar el total de la factura original ($ ${totalOriginal.toFixed(2)})`),
          { status: 400 }
        );
      }
    } else if (tipo === 'debito') {
      if (!Number.isFinite(monto) || monto <= 0) {
        throw Object.assign(new Error('La nota débito requiere un monto de ajuste mayor a 0'), { status: 400 });
      }
    }

    // Proporción de la nota respecto al total original (prorratea el detalle).
    const proporcion = totalOriginal > 0 ? Math.min(montoEfectivo / totalOriginal, 1) : 0;

    const subtotalNota = prorratear(factura.subtotal, proporcion);
    const impuestoNota = prorratear(factura.impuesto_total, proporcion);
    const descuentoNota = prorratear(factura.descuento, proporcion);

    // El número consecutivo según el prefijo.
    const numeroNota = await siguienteNumero(conexion, prefijo);

    const [resultado] = await conexion.query(
      `INSERT INTO notas_correctivas
         (tipo, factura_original_id, preferencia_motivo, prefijo, numero_nota, motivo,
          cliente_id, usuario_id, subtotal, impuesto_total, descuento, total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tipo, factura_original_id, preferencia_motivo, prefijo, numeroNota, motivo,
       factura.cliente_id || null, usuarioId,
       subtotalNota, impuestoNota, descuentoNota, montoEfectivo]
    );

    const notaId = resultado.insertId;

    // Copia el detalle de la factura original, prorrateando los montos de cada
    // línea para que sumen exactamente a los totales de la nota.
    for (const linea of factura.detalles || []) {
      await conexion.query(
        `INSERT INTO notas_correctivas_detalle
           (nota_id, producto_id, producto_nombre, cantidad, precio_unitario, descuento,
            impuesto_porcentaje, impuesto, subtotal)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [notaId, linea.producto_id, linea.producto_nombre, linea.cantidad,
         prorratear(linea.precio_unitario, proporcion), prorratear(linea.descuento, proporcion),
         Number(linea.impuesto_porcentaje || 0), prorratear(linea.impuesto, proporcion),
         prorratear(linea.subtotal, proporcion)]
      );
    }

    await conexion.commit();
    return buscarPorId(notaId);
  } catch (err) {
    await conexion.rollback();
    throw err;
  } finally {
    conexion.release();
  }
};

// Anula una nota correctiva (no borra el documento electrónico histórico).
// La anulación física del stock NUNCA ocurre aquí; la nota es un documento
// correctivo, no un movimiento de inventario.
const anular = async (id) => {
  const nota = await buscarPorId(id);
  if (!nota) {
    throw Object.assign(new Error('Nota no encontrada'), { status: 404 });
  }
  if (nota.estado === 'anulada') {
    throw Object.assign(new Error('La nota ya está anulada'), { status: 409 });
  }

  await pool.query("UPDATE notas_correctivas SET estado = 'anulada' WHERE id = ?", [id]);
  return buscarPorId(id);
};

// Expone los datos de una factura original en el formato que espera la nota
// para resolver el adquirente (reutiliza la misma lógica de la factura).
const resolverDatosNota = (nota) => {
  return {
    cliente_id: nota.cliente_id,
    cliente_documento: nota.cliente_documento,
    cliente_nombre: nota.cliente_nombre,
    cliente_direccion: nota.cliente_direccion,
    cliente_telefono: nota.cliente_telefono,
    cliente_email: nota.cliente_email,
    tipo_documento: nota.tipo_documento,
    numero_factura: nota.numero_nota,
    prefijo: nota.prefijo,
    subtotal: nota.subtotal,
    impuesto_total: nota.impuesto_total,
    descuento: nota.descuento,
    total: nota.total,
    creado_en: nota.creado_en,
    detalles: nota.detalles
  };
};

module.exports = { listar, contar, buscarPorId, crear, anular, resolverDatosNota, TIPOS_NOTA, MOTIVOS };
