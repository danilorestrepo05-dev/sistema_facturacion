// src/services/dian/dian.service.js
// Servicio orquestador de facturación electrónica DIAN.
//
// Se encarga de, tras emitirse una factura en el POS, generar el documento
// electrónico (XML UBL 2.1 + CUFE) usando el adaptador correspondiente y
// persistirlo en la cola envios_dian + en las columnas de la factura.
//
// DISEÑO CLAVE — no bloqueante: este procesamiento ocurre DESPUÉS de que la
// venta ya quedó registrada en BD. Si la facturación electrónica falla (sin
// internet, proveedor caído, ...) la venta NO se pierde: queda "local" con
// estado_dian='local' y un registro pendiente en la cola para reintentar luego.
// Así se cumple el modelo híbrido local-con-cola-offline.

const facturaModel = require('../../models/factura.model');
const configModel = require('../../models/config.model');
const notaModel = require('../../models/nota_correctiva.model');
const empresa = require('../../utils/empresa');
const factory = require('./factory');
const envioModel = require('./envio.model');
const envioNotaModel = require('./envio_nota.model');

// Envía el documento electrónico de una factura usando el adaptador actual.
// Devuelve el resultado del adaptador o lanza el error para que lo maneje el
// flujo de reintentos. Reutilizado por la emisión inicial y por la cola.
const emitirDocumento = async (config, factura) => {
  const adaptador = factory.obtenerAdaptador(config);
  return adaptador.emitir({ factura, empresa, config });
};

// Procesa la facturación electrónica de una factura recién creada.
// Devuelve el estado DIAN resultante ('aprobada' | 'local' | 'deshabilitada').
const procesarFactura = async (facturaId) => {
  // Lee la configuración en caliente (puede cambiar entre ventas).
  const config = await configModel.listarMapa();

  // Si la facturación electrónica está deshabilitada, no hacemos nada.
  if (Number(config.facturacion_electronica_habilitado) !== 1) {
    return 'deshabilitada';
  }

  // Recupera la factura completa (con detalles e impuestos) de la BD.
  const factura = await facturaModel.buscarPorId(facturaId);
  if (!factura) {
    throw new Error(`Factura ${facturaId} no encontrada para facturación electrónica`);
  }

  try {
    // Emite el documento (genera XML + CUFE).
    const resultado = await emitirDocumento(config, factura);

    // Persiste la cola de envío y las columnas de la factura.
    await envioModel.registrar({
      facturaId: factura.id,
      proveedor: String(config.dian_proveedor || 'simulacion'),
      trackId: resultado.trackId,
      estado: resultado.ok ? 'aprobada' : 'fallida',
      xml: resultado.xml,
      cufe: resultado.cufe
    });

    return resultado.ok ? 'aprobada' : 'fallida';
  } catch (err) {
    // Si algo falla (proveedor caído, sin red), la venta queda local y se
    // registra un intento pendiente en la cola para reintento posterior.
    console.error(`[DIAN] Error al procesar factura ${facturaId}:`, err.message);
    await envioModel.registrar({
      facturaId,
      proveedor: String(config.dian_proveedor || 'simulacion'),
      estado: 'pendiente',
      xml: null,
      cufe: null
    }).catch(() => {});
    return 'local';
  }
};

// Tiempos de espera (ms) entre reintentos de la cola offline. Cada fallo
// consecutivo alarga la espera para no saturar al proveedor cuando vuelve.
const BACKOFF = [60_000, 300_000, 900_000, 3_600_000];

// Procesa la facturación electrónica de una NOTA correctiva (débito/crédito).
// Genera el CUDE + XML UBL 2.1 (CreditNote/DebitNote) y persiste el resultado.
// Devuelve el estado DIAN ('aprobada' | 'local' | 'deshabilitada').
const procesarNota = async (notaId) => {
  const config = await configModel.listarMapa();

  // Las notas requieren la facturación electrónica y el módulo habilitados.
  if (Number(config.facturacion_electronica_habilitado) !== 1) {
    return 'deshabilitada';
  }

  const nota = await notaModel.buscarPorId(notaId);
  if (!nota) {
    throw new Error(`Nota ${notaId} no encontrada para facturación electrónica`);
  }

  // La factura original se necesita para el BillingReference del documento.
  const facturaOriginal = await facturaModel.buscarPorId(nota.factura_original_id);
  if (!facturaOriginal) {
    throw new Error(`Factura original de la nota ${notaId} no encontrada`);
  }

  const adaptador = factory.obtenerAdaptador(config);

  try {
    // El adquirente se resuelve dentro del adaptador usando los datos de la nota.
    const resultado = await adaptador.emitirNota({
      nota, facturaOriginal, empresa, config
    });

    await envioNotaModel.registrar({
      notaId: nota.id,
      proveedor: String(config.dian_proveedor || 'simulacion'),
      trackId: resultado.trackId,
      estado: resultado.ok ? 'aprobada' : 'fallida',
      xml: resultado.xml,
      cufe: resultado.cufe
    });

    return resultado.ok ? 'aprobada' : 'fallida';
  } catch (err) {
    // Si falla (sin red/proveedor), la nota queda local y se encola el reintento.
    console.error(`[DIAN] Error al procesar nota ${notaId}:`, err.message);
    await envioNotaModel.registrar({
      notaId,
      proveedor: String(config.dian_proveedor || 'simulacion'),
      estado: 'pendiente',
      xml: null,
      cufe: null
    }).catch(() => {});
    return 'local';
  }
};

// Procesa la cola de envíos pendientes de reintento. Recorre los envíos que
// están listos (proximo_intento vencido), intenta emitir de nuevo el documento
// y actualiza el estado. Si vuelve a fallar, programa otro reintento con backoff.
// Devuelve cuántos envíos se procesaron en esta pasada (éxitos y fallos).
const procesarColaPendiente = async ({ limite = 20 } = {}) => {
  // En plena corrida evitamos reejecuciones concurrentes del mismo job.
  if (procesarColaPendiente._corriendo) return { procesados: 0, omitidos: 'ejecucion_anterior_en_curso' };
  procesarColaPendiente._corriendo = true;

  try {
    const config = await configModel.listarMapa();

    // Sin facturación electrónica activa no hay nada que reintentar.
    if (Number(config.facturacion_electronica_habilitado) !== 1) {
      return { procesados: 0, motivo: 'deshabilitada' };
    }

    const pendientes = await envioModel.listarPendientes(limite);
    const pendientesNotas = await envioNotaModel.listarPendientes(limite);
    if (pendientes.length === 0 && pendientesNotas.length === 0) {
      return { procesados: 0, motivo: 'sin_pendientes' };
    }

    let procesados = 0;

    // Cola de FACTURAS.
    for (const envio of pendientes) {
      try {
        // Incrementa intentos y marca el envío como "enviando".
        const intentos = await envioModel.marcarEnviando(envio.id);

        // Regenera el documento para esta factura.
        const factura = await facturaModel.buscarPorId(envio.factura_id);
        if (!factura) {
          await envioModel.actualizarEstadoIntento(envio.id, {
            estado: 'fallida',
            error: 'Factura asociada no encontrada'
          });
          continue;
        }

        const resultado = await emitirDocumento(config, factura);

        if (resultado.ok) {
          // Éxito: la factura queda aprobada y el envío se cierra.
          await envioModel.registrar({
            facturaId: envio.factura_id,
            proveedor: String(config.dian_proveedor || 'simulacion'),
            trackId: resultado.trackId,
            estado: 'aprobada',
            xml: resultado.xml,
            cufe: resultado.cufe
          });
        } else {
          // El proveedor respondió pero rechazó el documento.
          await envioModel.registrar({
            facturaId: envio.factura_id,
            proveedor: String(config.dian_proveedor || 'simulacion'),
            trackId: resultado.trackId,
            estado: 'fallida',
            xml: resultado.xml,
            cufe: resultado.cufe
          });
        }
        procesados++;
      } catch (err) {
        // Fallo de red/proveedor: se vuelve a programar con backoff.
        const indice = Math.min(envio.intentos, BACKOFF.length - 1);
        const proximo = new Date(Date.now() + BACKOFF[indice]);
        await envioModel.actualizarEstadoIntento(envio.id, {
          estado: 'pendiente',
          error: err.message,
          proximoIntento: proximo
        }).catch(() => {});
        console.error(`[DIAN] Reintento envio ${envio.id} (factura ${envio.factura_id}) fallará de nuevo:`, err.message);
        procesados++;
      }
    }

    // Cola de NOTAS correctivas.
    for (const envio of pendientesNotas) {
      try {
        const intentos = await envioNotaModel.marcarEnviando(envio.id);

        const nota = await notaModel.buscarPorId(envio.nota_id);
        if (!nota) {
          await envioNotaModel.actualizarEstadoIntento(envio.id, {
            estado: 'fallida',
            error: 'Nota asociada no encontrada'
          });
          continue;
        }
        const facturaOriginal = await facturaModel.buscarPorId(nota.factura_original_id);
        if (!facturaOriginal) {
          await envioNotaModel.actualizarEstadoIntento(envio.id, {
            estado: 'fallida',
            error: 'Factura original de la nota no encontrada'
          });
          continue;
        }

        const adaptador = factory.obtenerAdaptador(config);
        const resultado = await adaptador.emitirNota({ nota, facturaOriginal, empresa, config });

        await envioNotaModel.registrar({
          notaId: nota.id,
          proveedor: String(config.dian_proveedor || 'simulacion'),
          trackId: resultado.trackId,
          estado: resultado.ok ? 'aprobada' : 'fallida',
          xml: resultado.xml,
          cufe: resultado.cufe
        });
        procesados++;
      } catch (err) {
        const indice = Math.min(envio.intentos, BACKOFF.length - 1);
        const proximo = new Date(Date.now() + BACKOFF[indice]);
        await envioNotaModel.actualizarEstadoIntento(envio.id, {
          estado: 'pendiente',
          error: err.message,
          proximoIntento: proximo
        }).catch(() => {});
        console.error(`[DIAN] Reintento envio nota ${envio.id} fallará de nuevo:`, err.message);
        procesados++;
      }
    }

    return { procesados };
  } finally {
    procesarColaPendiente._corriendo = false;
  }
};

module.exports = { procesarFactura, procesarNota, procesarColaPendiente };
