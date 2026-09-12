// src/services/dian/factory.js
// Fábrica de adaptadores de facturación electrónica.
//
// Selecciona el adaptador según la configuración de la instalación
// (clave "dian_proveedor") manteniendo la MISMA interfaz para todos:
//   emitir({ factura, empresa, config, claveTecnica }) => resultado
//
// Proveedores soportados:
//   - 'simulacion':  modo test/habilitación sin conexión a la DIAN (default).
//   - 'factus':      proveedor real de facturación electrónica DIAN (paso 7).
//
// Este patrón (Strategy/Fabrica) permite clonar el sistema a otros negocios o
// cambiar de proveedor de facturación electrónica sin tocar el resto del código.

const simulacion = require('./adapters/simulacion.adapter');
const factus = require('./adapters/factus.adapter');

const adaptadores = {
  simulacion,
  factus
};

// Devuelve el adaptador correspondiente a la configuración.
// Si el proveedor no está registrado, cae en simulación con una advertencia
// para no romper la operación local en modo test.
const obtenerAdaptador = (config) => {
  const proveedor = String(config.dian_proveedor || 'simulacion').toLowerCase();
  const adaptador = adaptadores[proveedor];

  if (!adaptador) {
    console.warn(`[DIAN] Proveedor "${proveedor}" no implementado. Se usa "simulacion".`);
    return adaptadores.simulacion;
  }
  return adaptador;
};

module.exports = { obtenerAdaptador, adaptadores };
