// src/services/dian/adapters/factus.adapter.js
// Adaptador del PROVEEDOR REAL de facturación electrónica DIAN: Factus.
//
// Implementa la MISMA interfaz que el adaptador de simulación:
//   emitir({ factura, empresa, config, claveTecnica }) => { ok, trackId, cufe, xml }
// de modo que el factory y la cola de envíos no distinguen entre uno y otro.
//
// Se apoya en el SKILL "facturas-crear-y-validar" del proyecto:
//   POST /v2/bills/validate  (factura estándar, document="01", operation_type="10")
//   Auth: Bearer <access_token>  (obtenido en POST /oauth/token)
//
// Diseño según el modelo híbrido local-con-cola: si no hay credenciales o el
// proveedor falla, LANZAMOS un error para que dian.service lo capture, deje la
// factura en estado 'local' y la encuele para reintentar cuando vuelva la red.
//
// NOTA: usamos el fetch nativo de Node 22 (sin dependencias nuevas), en línea
// con el filtro antimunition (evita paquetes de terceros innecesarios).

const factusConfig = require('../factusConfig');

// Número de peticiones para el que toleramos un endpoint abajo sin invalidar.
// (No aplica a esta integración; se mantiene por claridad de backoff del token.)

// Cache en memoria del token OAuth (expira ~3600s en Factus).
let cacheToken = { valor: null, expiraEn: 0 };

// ---------------------------------------------------------------------------
// Autenticación: POST /oauth/token (grant_type client_credentials)
// ---------------------------------------------------------------------------

// Obtiene (y cachea) el access_token de Factus. Lanza error si falla la auth.
const obtenerToken = async (config) => {
  const fconf = await factusConfig.resolverConfig(config);

  if (!fconf.habilitado) {
    throw new Error(
      'Factus no está configurado: defina FACTUS_CLIENT_ID y FACTUS_CLIENT_SECRET en .env (o factus_client_id/factus_client_secret en Configuración)'
    );
  }

  // Si el cache sigue vigente, lo reutilizamos (3029024000 = despreciable aquí).
  if (cacheToken.valor && Date.now() < cacheToken.expiraEn) {
    return cacheToken.valor;
  }

  const cuerpo = new URLSearchParams();
  cuerpo.set('grant_type', 'client_credentials');
  cuerpo.set('client_id', fconf.clientId);
  cuerpo.set('client_secret', fconf.clientSecret);

  const respuesta = await fetch(`${fconf.urlBase}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: cuerpo
  });

  if (!respuesta.ok) {
    throw new Error(`Factus: error de autenticación (HTTP ${respuesta.status})`);
  }

  const datos = await respuesta.json();
  const token = datos.access_token;
  if (!token) {
    throw new Error('Factus: la respuesta de autenticación no incluyó access_token');
  }

  // Expira en 3600s por defecto; guardamos con margen de seguridad (10 min antes).
  const expires = Number(datos.expires_in) || 3600;
  cacheToken = { valor: token, expiraEn: Date.now() + (expires - 600) * 1000 };

  return token;
};

// ---------------------------------------------------------------------------
// Mapeo del body de la factura (según el SKILL factus)
// ---------------------------------------------------------------------------

// Convierte el tipo de pago interno a la forma (payment_form) y método de
// pago (payment_method_code) usados por Factus / catálogos DIAN.
const mapearPago = (tipoPago) => {
  const pago = String(tipoPago || 'efectivo').toLowerCase();
  // payment_form: "1" = contado, "2" = crédito.
  // payment_method_code (Anexo DIAN): 10=efectivo, 42=consignación, 49=tarjeta.
  const porTarjeta = ['tarjeta', 'tarjeta_credito', 'tarjeta_debito', 'tc', 'td'];
  const porCredito = ['credito', 'fiado'];
  const porTransferencia = ['transferencia', 'consignacion', 'pse'];

  if (porCredito.includes(pago)) {
    return { payment_form: '2', payment_method_code: '12' };
  }
  if (porTarjeta.includes(pago)) {
    return { payment_form: '1', payment_method_code: '49' };
  }
  if (porTransferencia.includes(pago)) {
    return { payment_form: '1', payment_method_code: '42' };
  }
  return { payment_form: '1', payment_method_code: '10' };
};

// Mapea impuestos internos a items[].taxes[] de Factus.
// Nuestro catálogo solo distingue IVA (>0%) y Exento (0%); la DIAN usa el
// código "01" para IVA. Un ítem exento se envía con is_excluded=true.
const mapearImpuestos = (impuestos) => {
  if (!Array.isArray(impuestos) || impuestos.length === 0) {
    // Sin impuestos: se asume ítem excluido (no gravado), evitando que Factus
    // lo trate como IVA por defecto.
    return [{ code: '01', rate: '0.00', is_excluded: true }];
  }
  return impuestos.map((t) => {
    const pct = Number(t.porcentaje) || 0;
    return {
      code: '01',
      rate: pct.toFixed(2),
      is_excluded: pct === 0
    };
  });
};

// Construye el objeto customer a partir del adquirente resuelto (mismo que usa
// el generador UBL), más los catálogos de la empresa.
const construirCustomer = (adquirente) => {
  // Código DIAN del tipo de documento ya viene resuelto ('31' NIT, '13' CC...).
  const esJuridica = adquirente.tipo_documento === '31';

  const customer = {
    identification_document_code: adquirente.tipo_documento,
    identification: String(adquirente.documento || '').replace(/[^\d]/g, ''),
    legal_organization_code: esJuridica ? '1' : '2',
    tribute_code: 'ZZ',
    responsibilities: ['R-99-PN'],
    country_code: 'CO'
  };

  if (esJuridica) {
    customer.company = adquirente.nombre || 'Empresa';
    customer.trade_name = adquirente.nombre || '';
  } else {
    customer.names = adquirente.nombre || 'Consumidor Final';
  }

  if (adquirente.direccion) customer.address = adquirente.direccion;
  if (adquirente.email) customer.email = adquirente.email;
  if (adquirente.telefono) customer.phone = adquirente.telefono;

  return customer;
};

// Arma el array de items desde los detalles de la factura.
const construirItems = (factura) => {
  return (factura.detalles || []).map((linea) => {
    const item = {
      code_reference: String(linea.producto_id),
      name: linea.producto_nombre,
      quantity: Number(linea.cantidad).toFixed(2),
      price: Number(linea.precio_unitario).toFixed(2),
      unit_measure_code: '94', // unidad
      standard_code: '999',   // adopción del contribuyente
      taxes: mapearImpuestos(linea.impuestos)
    };

    // Descuento por línea: prefiere monto fijo (más fiel a nuestro modelo).
    const descuento = Number(linea.descuento) || 0;
    if (descuento > 0) {
      item.discount_amount = descuento.toFixed(2);
    }

    return item;
  });
};

// Ensambla el body completo de la solicitud a POST /v2/bills/validate.
const construirBody = ({ factura, adquirente }) => {
  const pago = mapearPago(factura.tipo_pago);
  const paymentDetails = [{
    payment_form: pago.payment_form,
    payment_method_code: pago.payment_method_code,
    reference_code: `PAGO-${factura.numero_factura}`,
    amount: Number(factura.total).toFixed(2)
  }];

  const body = {
    // reference_code único: evita duplicados en Factus usando nuestra numeración.
    reference_code: factura.prefijo
      ? `${factura.prefijo}-${factura.numero_factura}`
      : String(factura.numero_factura),
    document: '01',
    operation_type: '10',
    send_email: false,
    payment_details: paymentDetails,
    cash_rounding_amount: '0.00',
    customer: construirCustomer(adquirente),
    items: construirItems(factura)
  };

  return body;
};

// ---------------------------------------------------------------------------
// Interfaz pública del adaptador
// ---------------------------------------------------------------------------

// Emite una factura de venta real contra Factus.
// Devuelve { ok, trackId, cufe, xml, respuestaDian }. Lanza error si falla.
const emitir = async ({ factura, empresa, config }) => {
  const fconf = await factusConfig.resolverConfig(config);

  if (!fconf.habilitado) {
    throw new Error(
      'Factus no está configurado: defina FACTUS_CLIENT_ID y FACTUS_CLIENT_SECRET en .env (o en Configuración)'
    );
  }

  // Reutiliza la resolución de adquirente del generador UBL (Consumidor Final,
  // efímero o registrado). Importamos 'ubl' aquí para no cargarlo innecesariamente.
  const ubl = require('../ubl');
  const adquirente = ubl.resolverAdquirente({ factura, config });

  const body = construirBody({ factura, adquirente });
  const token = await obtenerToken(config);

  const respuesta = await fetch(`${fconf.urlBase}/v2/bills/validate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const cuerpo = await respuesta.json().catch(() => ({}));

  // Factus responde 201 Created para documentos validados.
  if (!respuesta.ok) {
    const detalle = cuerpo?.error || cuerpo?.message || `HTTP ${respuesta.status}`;
    throw new Error(`Factus rechazó la factura: ${detalle}`);
  }

  const data = cuerpo.data || cuerpo;
  if (!data) {
    throw new Error('Factus: respuesta sin datos del documento');
  }

  return {
    ok: true,
    trackId: data.reference_code || data.number || `FACT-${factura.numero_factura}`,
    cufe: data.cufe || null,
    xml: JSON.stringify(cuerpo), // respuesta completa como histórico
    adquirente,
    respuestaDian: {
      estado: data.is_validated ? 'aprobada' : 'pendiente',
      numero: data.number || null,
      mensaje: cuerpo.message || 'Documento validado por Factus',
      links: data.links || null,
      errores: data.errors || {}
    }
  };
};

// NOTA: la emisión de NOTAS (crédito/débito) contra Factus requiere el endpoint
// de documentos correctivos (se añade en una fase posterior). Mientras tanto, si
// el proveedor es Factus y se intenta una nota, emitirNota lanza un error claro
// para que quede en cola sin romper el flujo.
const emitirNota = async () => {
  throw new Error(
    'La emisión de notas correctivas contra Factus aún no está implementada (use "simulacion" o contáctese para habilitar documentos correctivos)'
  );
};

module.exports = { emitir, emitirNota, construirBody, mapearPago };
