// src/services/dian/adapters/simulacion.adapter.js
// Adaptador de SIMULACIÓN (modo test). No contacta a la DIAN ni a ningún
// proveedor real: genera el documento electrónico (XML UBL 2.1 + CUFE) y
// responde como si la factura hubiera sido "aprobada".
//
// Propósito: permitir recorrer todo el flujo de facturación electrónica
// (generar XML, calcular CUFE, encolar, marcar estados, QR, PDF frontend)
// SIN conexión a internet ni credenciales de habilitación. Es el proveedor
// por defecto (dian_proveedor = 'simulacion') mientras el sistema está en
// modo test/habilitación.
//
// Este adaptador expone la MISMA interfaz que el adaptador real (Factus):
//   emitir({ factura, empresa, config, claveTecnica }) => { ok, trackId, cufe, xml }
// de modo que el factory y la cola de envíos no distinguen entre uno y otro.

const ubl = require('../ubl');

// Clave técnica de prueba usada en modo simulación. En producción cada rango
// de numeración usa la clave real asignada en el portal de habilitación DIAN.
const CLAVE_TECNICA_TEST = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

// Simula el envío de la factura a la DIAN. Recibe la factura ya creada en BD
// (con sus detalles e impuestos) y la configuración de la instalación.
// Devuelve siempre un resultado "aprobado" para poder probar el flujo completo.
const emitir = async ({ factura, empresa, config, claveTecnica }) => {
  // En modo test se usa la clave de prueba configurable si existe, sino la local.
  const clTec = claveTecnica || config.dian_clave_tecnica_test || CLAVE_TECNICA_TEST;

  // 1) Resuelve el adquirente (consumidor genérico, efímero o registrado).
  const adquirente = ubl.resolverAdquirente({ factura, config });

  // 2) Calcula el CUFE con el algoritmo SHA-384 (anexo 1.8+ vigente).
  const { cufe, cadena, algoritmo } = ubl.calcularCufe({
    factura, empresa, adquirente, config, claveTecnica: clTec
  });

  // 3) Genera el documento XML UBL 2.1.
  const xml = ubl.generarUBL({ factura, empresa, adquirente, config, cufe });

  // 4) Simula la aprobación de la DIAN (retraso breve para visualizar estados).
  await new Promise((resolver) => setTimeout(resolver, 50));

  return {
    ok: true,
    trackId: `SIM-${factura.numero_factura}-${Date.now()}`,
    cufe,
    cadena,
    algoritmo,
    xml,
    adquirente,
    respuestaDian: {
      estado: 'aprobada',
      mensaje: 'Factura aprobada (simulación local, sin conexión a la DIAN)'
    }
  };
};

// Simula el envío de una NOTA CORRECTIVA (crédito o débito) a la DIAN.
// Genera el CUDE + XML (CreditNote/DebitNote) y responde "aprobada".
// La interfaz es idéntica a la del adaptador real: podrá implementarla Factus.
const emitirNota = async ({ nota, facturaOriginal, empresa, config, claveTecnica }) => {
  const clTec = claveTecnica || config.dian_clave_tecnica_test || CLAVE_TECNICA_TEST;

  // El adquirente se resuelve con los datos de la nota (clientes de la original).
  const adquirente = ubl.resolverAdquirente({ factura: nota, config });

  // CUDE de la nota (mismo algoritmo SHA-384 sobre los datos de la nota).
  const { cufe, cadena, algoritmo } = ubl.calcularCude({
    nota, empresa, adquirente, config, claveTecnica: clTec
  });

  // XML UBL 2.1 de la nota, referenciando la factura original.
  const xml = ubl.generarUBLNota({ nota, empresa, adquirente, config, cude: cufe, facturaOriginal });

  await new Promise((resolver) => setTimeout(resolver, 50));

  return {
    ok: true,
    trackId: `SIM-${nota.prefijo}-${nota.numero_nota}-${Date.now()}`,
    cufe,
    cadena,
    algoritmo,
    xml,
    adquirente,
    respuestaDian: {
      estado: 'aprobada',
      mensaje: `Nota ${nota.tipo} aprobada (simulación local, sin conexión a la DIAN)`
    }
  };
};

module.exports = { emitir, emitirNota, CLAVE_TECNICA_TEST };
