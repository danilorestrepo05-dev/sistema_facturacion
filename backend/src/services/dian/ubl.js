// src/services/dian/ubl.js
// Generador de documentos electrónicos UBL 2.1 (Factura de Venta) y cálculo
// del Código Único de Factura Electrónica (CUFE) de la DIAN (Colombia).
//
// REFERENCIA TÉCNICA (fuentes oficiales DIAN):
//   - Anexo Técnico de Factura Electrónica de Venta, versiones 1.8 / 1.9 (vigente).
//   - Resolución 000042 de 2020 y sus modificatorias.
//   - El CUFE se calcula con el algoritmo SHA-384 (numeral 10.1.1.1 del anexo 1.8+).
//
// IMPORTANTE sobre la clave técnica (ClTec):
//   La DIAN asigna una clave técnica única a cada software y a cada rango de
//   numeración en el portal de habilitación. En modo test/simulación este módulo
//   usa una clave de prueba configurable (dian_clave_tecnica_test) para poder
//   recorrer todo el flujo sin conexión a la DIAN.
//   Al conectar un proveedor real (p.ej. Factus) en el paso 7, el proveedor
//   normalmente calcula/valida el CUFE por sí mismo, por lo que el algoritmo aquí
//   queda parametrizado (función calcularCufe) para admitir ambos escenarios:
//   calcularlo localmente o recibirlo ya calculado del proveedor.
//
// NOTA DE PRECISIÓN: la cadena exacta de campos del CUFE puede matizarse entre
// anexos o perfiles de emisión. Este generador implementa la forma vigente con
// SHA-384 y separador "~". Antes de pasar a producción contra la DIAN real, la
// cadena debe contrastarse con el anexo técnico vigente y, idealmente, con la
// XSD/entorno de habilitación.

const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Formateadores de valores según las normas DIAN.
// ---------------------------------------------------------------------------

// Monto con dos decimales y punto, sin separadores de miles ni símbolo.
// Ej.: 1296705.20
const formatearMonto = (valor) => Number(valor || 0).toFixed(2);

// Fecha/hora al formato de cadena AAAAMMDDHHMMSS (sin guiones ni separadores).
const formatearFechaCufe = (fecha) => {
  const d = new Date(fecha);
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
};

// Número de documento sin puntos ni guiones (lo exige la DIAN en ciertos campos).
const limpiarDocumento = (valor) => String(valor || '').replace(/[^\d]/g, '');

// ---------------------------------------------------------------------------
// CUFE: Código Único de Factura Electrónica (SHA-384).
// ---------------------------------------------------------------------------

// Construye la cadena semilla que alimenta el SHA-384 del CUFE.
// Fórmula vigente (anexo 1.8+, SHA-384), campos concatenados con separador "~":
//   NumFac ~ FecFac ~ AdqCuenta ~ IvaImp ~ TotalPagar ~ NitFac ~ NoRes ~
//   TipAdq ~ TeleAdq ~ CorreoAdq ~ ClTec
// Donde:
//   NumFac     = número de factura completo (prefijo-número o solo número).
//   FecFac     = fecha de emisión en formato AAAAMMDDHHMMSS.
//   AdqCuenta  = tipo documento + "-" + documento del adquirente.
//   IvaImp     = valor total del impuesto (IVA + otros) con dos decimales.
//   TotalPagar = valor total a pagar con dos decimales.
//   NitFac     = NIT del facturador sin puntos ni guiones.
//   NoRes      = número de resolución de numeración (si aplica).
//   TipAdq     = código del tipo de documento del adquirente (ej. 31, 13).
//   TeleAdq    = teléfono del adquirente.
//   CorreoAdq  = correo del adquirente.
//   ClTec      = clave técnica del software/rango asignada por la DIAN.
const construirCadenaCufe = ({ factura, empresa, adquirente, config, claveTecnica }) => {
  const numFac = factura.prefijo
    ? `${factura.prefijo}-${factura.numero_factura}`
    : String(factura.numero_factura);
  const fecFac = formatearFechaCufe(factura.creado_en || new Date());
  const adqCuenta = `${adquirente.tipo_documento}-${adquirente.documento}`;
  const ivaImp = formatearMonto(factura.impuesto_total);
  const totalPagar = formatearMonto(factura.total);
  const nitFac = limpiarDocumento(empresa.documento);
  const noRes = config.dian_numero_resolucion || '';
  const tipAdq = adquirente.tipo_documento;
  const teleAdq = adquirente.telefono || '';
  const correoAdq = adquirente.email || '';
  const clTec = claveTecnica;

  return [
    numFac, fecFac, adqCuenta, ivaImp, totalPagar,
    nitFac, noRes, tipAdq, teleAdq, correoAdq, clTec
  ].join('~');
};

// Calcula el CUFE aplicando SHA-384 sobre la cadena semilla.
const calcularCufe = ({ factura, empresa, adquirente, config, claveTecnica }) => {
  const cadena = construirCadenaCufe({ factura, empresa, adquirente, config, claveTecnica });
  const hash = crypto.createHash('sha384').update(cadena, 'utf8').digest('hex');
  return { cufe: hash, cadena, algoritmo: 'sha384' };
};

// ---------------------------------------------------------------------------
// Lógica del adquirente (comprador).
// ---------------------------------------------------------------------------

// Resuelve los datos del adquirente para el documento electrónico.
// soporta tres casos:
//   1) consumidor (genérico): "Consumidor Final", documento 222222222222, tipo 31.
//   2) efímero:      datos del cliente presentes en la caja pero SIN ficha.
//   3) registrado:   cliente con ficha en el catálogo.
const resolverAdquirente = ({ factura, config }) => {
  // Códigos de tipo de documento de identidad de la DIAN (Anexo 001 / Anexo Técnico).
  const TIPOS = {
    '31': 31, // NIT
    '13': 13, // Cédula de ciudadanía
    '22': 22, // Cédula de extranjería
    '12': 12, // Tarjeta de identidad
    '11': 11, // Registro civil
    '41': 41, // Pasaporte
  };

  // Mapa del tipo de documento interno (catálogo clientes) al código DIAN.
  // "Otro" NO tiene código oficial en el Anexo DIAN: se rechaza explícitamente.
  const MAPA_TIPO_INTERNO = { CC: '13', NIT: '31', CE: '22', Pasaporte: '41' };

  // Adquirente genérico "Consumidor Final" cuando la configuración lo permite y
  // NO se seleccionó un cliente real. Si el modo estricto está activo
  // (dian_adquirente_consumidor = 0), se rechaza: facturación electrónica exige
  // un cliente real con documento.
  if (!factura.cliente_id && !factura.cliente_documento) {
    if (Number(config.dian_adquirente_consumidor) === 1) {
      return {
        tipo: 'consumidor',
        tipo_documento: '31',
        documento: '222222222222',
        nombre: 'Consumidor Final',
        direccion: '',
        telefono: '',
        email: '',
        ciudad: ''
      };
    }
    throw new Error(
      'Facturación electrónica con adquirente "Consumidor Final" deshabilitado: debe seleccionar un cliente real'
    );
  }

  // Tipo de documento del adquirente: primero el enum interno del catálogo
  // (CC/NIT/CE/Pasaporte), luego un código DIAN legado y por defecto CC (13).
  let codigo;
  if (factura.cliente_tipo_documento) {
    codigo = MAPA_TIPO_INTERNO[String(factura.cliente_tipo_documento)];
    if (!codigo) {
      throw new Error(
        `Tipo de documento "${factura.cliente_tipo_documento}" no es válido para facturación electrónica; use CC, NIT, CE o Pasaporte`
      );
    }
  } else {
    codigo = String(factura.tipo_documento || '13');
  }
  codigo = TIPOS[codigo] ? codigo : '13';

  // Un cliente registrado sin número de documento no puede facturarse
  // electrónicamente: el documento es un dato obligatorio del adquirente.
  if (factura.cliente_id && !factura.cliente_documento) {
    throw new Error(
      `El cliente "${factura.cliente_nombre || 'seleccionado'}" no tiene documento registrado: ingrese su número de documento para facturar electrónicamente`
    );
  }

  return {
    tipo: factura.cliente_id ? 'registrado' : 'efimero',
    tipo_documento: String(codigo),
    documento: limpiarDocumento(factura.cliente_documento) || '222222222222',
    nombre: factura.cliente_nombre || 'Cliente',
    direccion: factura.cliente_direccion || '',
    telefono: factura.cliente_telefono || '',
    email: factura.cliente_email || '',
    ciudad: factura.cliente_ciudad || ''
  };
};

// ---------------------------------------------------------------------------
// XML UBL 2.1 (Factura de Venta).
// ---------------------------------------------------------------------------

// Escapa un texto para su uso seguro dentro de un valor XML.
const xmlEscape = (texto) => String(texto ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

// Genera el documento XML UBL 2.1 de la factura de venta.
// Los impuestos se agrupan por tasa (todos los ítems de cada porcentaje).
const generarUBL = ({ factura, empresa, adquirente, config, cufe }) => {
  // Totales por tasa de impuesto, consolidando el desglose por línea.
  const impuestosPorTasa = new Map();
  (factura.detalles || []).forEach((linea) => {
    (linea.impuestos || []).forEach((imp) => {
      const porcentaje = String(imp.porcentaje);
      const actual = impuestosPorTasa.get(porcentaje) || { base: 0, valor: 0, nombre: imp.nombre };
      actual.base += Number(imp.base) || 0;
      actual.valor += Number(imp.valor) || 0;
      impuestosPorTasa.set(porcentaje, actual);
    });
  });

  // Líneas de detalle (se omiten las de impuesto nulo para no ensuciar).
  const lineasXml = (factura.detalles || [])
    .map((linea) => {
      const base = Number(linea.subtotal) - Number(linea.descuento || 0);
      const impuestosLinea = (linea.impuestos || [])
        .map((imp) =>
          `        <cac:TaxTotal>` +
            `<cbc:TaxAmount currencyID="COP">${formatearMonto(imp.valor)}</cbc:TaxAmount>` +
            `<cac:TaxSubtotal><cbc:TaxableAmount currencyID="COP">${formatearMonto(imp.base)}</cbc:TaxableAmount>` +
            `<cbc:TaxAmount currencyID="COP">${formatearMonto(imp.valor)}</cbc:TaxAmount>` +
            `<cac:TaxCategory><cbc:ID schemeAgencyID="195">${Number(imp.porcentaje) > 0 ? 'VAT' : 'Z'}</cbc:ID>` +
            `<cbc:Percent>${formatearMonto(imp.porcentaje)}</cbc:Percent>` +
            `<cac:TaxScheme><cbc:ID>${imp.nombre ? 'IVA' : 'ZZZ'}</cbc:ID><cbc:Name>${xmlEscape(imp.nombre || 'IVA')}</cbc:Name></cac:TaxScheme>` +
            `</cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>`
        )
        .join('\n');

      return (
`      <cac:InvoiceLine>
        <cbc:ID>${linea.id}</cbc:ID>
        <cbc:InvoicedQuantity unitCode="EA" unitCodeListID="UNECERec20">${Number(linea.cantidad)}</cbc:InvoicedQuantity>
        <cbc:LineExtensionAmount currencyID="COP">${formatearMonto(linea.subtotal)}</cbc:LineExtensionAmount>
        <cac:TaxTotal>
          <cbc:TaxAmount currencyID="COP">${formatearMonto(linea.impuesto)}</cbc:TaxAmount>
        </cac:TaxTotal>
        <cac:Item>
          <cbc:Description>${xmlEscape(linea.producto_nombre)}</cbc:Description>
          <cac:SellersItemIdentification><cbc:ID>${linea.producto_id}</cbc:ID></cac:SellersItemIdentification>
        </cac:Item>
        <cac:Price>
          <cbc:PriceAmount currencyID="COP">${formatearMonto(linea.precio_unitario)}</cbc:PriceAmount>
          <cbc:BaseQuantity unitCode="EA">${Number(linea.cantidad)}</cbc:BaseQuantity>
        </cac:Price>
      </cac:InvoiceLine>`
      );
    })
    .join('\n');

  // Impuestos totales por tasa en el encabezado.
  const impuestosHeader = [...impuestosPorTasa.entries()]
    .map(([porcentaje, imp]) =>
`        <cac:TaxTotal>
          <cbc:TaxAmount currencyID="COP">${formatearMonto(imp.valor)}</cbc:TaxAmount>
          <cac:TaxSubtotal>
            <cbc:TaxableAmount currencyID="COP">${formatearMonto(imp.base)}</cbc:TaxableAmount>
            <cbc:TaxAmount currencyID="COP">${formatearMonto(imp.valor)}</cbc:TaxAmount>
            <cac:TaxCategory>
              <cbc:ID schemeAgencyID="195">${Number(porcentaje) > 0 ? 'VAT' : 'Z'}</cbc:ID>
              <cbc:Percent>${formatearMonto(porcentaje)}</cbc:Percent>
              <cac:TaxScheme><cbc:ID>IVA</cbc:ID><cbc:Name>${xmlEscape(imp.nombre || 'IVA')}</cbc:Name></cac:TaxScheme>
            </cac:TaxCategory>
          </cac:TaxSubtotal>
        </cac:TaxTotal>`
    )
    .join('\n');

  const numeroFactura = factura.prefijo
    ? `${xmlEscape(factura.prefijo)}-${factura.numero_factura}`
    : String(factura.numero_factura);
  const fechaEmision = formatearFechaCufe(factura.creado_en || new Date());
  const fechaISO = new Date(factura.creado_en || new Date()).toISOString();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:ProfileID>DIAN 2.1</cbc:ProfileID>
  <cbc:ID>${numeroFactura}</cbc:ID>
  <cbc:IssueDate>${fechaISO.slice(0, 10)}</cbc:IssueDate>
  <cbc:IssueTime>${fechaISO.slice(11, 19)}</cbc:IssueTime>
  <cbc:InvoiceTypeCode listID="${config.dian_regimen === 'responsable_iva' ? '01' : '02'}">01</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>COP</cbc:DocumentCurrencyCode>
  <cac:InvoicePeriod/>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${xmlEscape(empresa.nombre)}</cbc:Name></cac:PartyName>
      <cac:PhysicalLocation>
        <cac:Address><cbc:CityName>${xmlEscape(empresa.ciudad)}</cbc:CityName></cac:Address>
      </cac:PhysicalLocation>
      <cac:PartyTaxScheme><cbc:CompanyID schemeAgencyID="195" schemeName="32">${limpiarDocumento(empresa.documento)}</cbc:CompanyID></cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${xmlEscape(empresa.nombre)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${xmlEscape(adquirente.nombre)}</cbc:Name></cac:PartyName>
      <cac:PartyTaxScheme><cbc:CompanyID schemeAgencyID="195" schemeName="${adquirente.tipo_documento}">${adquirente.documento}</cbc:CompanyID></cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="COP">${formatearMonto(factura.impuesto_total)}</cbc:TaxAmount>
${impuestosHeader}
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="COP">${formatearMonto(factura.subtotal)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="COP">${formatearMonto(Number(factura.subtotal) - Number(factura.descuento || 0))}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="COP">${formatearMonto(Number(factura.subtotal) - Number(factura.descuento || 0) + Number(factura.impuesto_total))}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="COP">${formatearMonto(factura.total)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${lineasXml}
</Invoice>`;

  return xml;
};

// ---------------------------------------------------------------------------
// Notas correctivas (débito y crédito): CUDE y XML UBL 2.1.
// ---------------------------------------------------------------------------

// El Código Único de Documento Electrónico (CUDE) de las notas se calcula con
// la MISMA semilla SHA-384 que el CUFE de la factura, pero sobre los datos de la
// propia nota (número y fecha de la nota, montos de la nota). Reutilizar la
// cadena de la factura es correcto: la DIAN usa el mismo algoritmo y campos
// (NumDoc~FecDoc~AdqCuenta~IvaImp~TotalPagar~NitFac~NoRes~TipAdq~TeleAdq~
// CorreoAdq~ClTec).
const construirCadenaCude = construirCadenaCufe;

// Calcula el CUDE de una nota reutilizando el algoritmo del CUFE.
const calcularCude = ({ nota, empresa, adquirente, config, claveTecnica }) => {
  // Reutilizamos calcularCufe: la nota expone el mismo contrato (numero_nota,
  // prefijo, creado_en, impuesto_total, total y datos del cliente).
  return calcularCufe({
    factura: nota, empresa, adquirente, config, claveTecnica
  });
};

// Genera el XML UBL 2.1 de una nota correctiva (CreditNote o DebitNote).
//   nota            : objeto con las columnas de notas_correctivas + detalles.
//   facturaOriginal : factura vinculada (para el BillingReference y adquirente).
// Raíz y nodos varían según el tipo:
//   crédito -> <CreditNote> con <CreditNoteLine>
//   débito  -> <DebitNote>  con <DebitNoteLine>
const generarUBLNota = ({ nota, empresa, adquirente, config, cude, facturaOriginal }) => {
  const esCredito = nota.tipo === 'credito';
  const raiz = esCredito ? 'CreditNote' : 'DebitNote';
  const lineaRaiz = esCredito ? 'CreditNoteLine' : 'DebitNoteLine';
  const cbcIdNs = esCredito ? 'CreditNoteTypeCode' : 'DebitNoteTypeCode';

  // Agrupa los impuestos por tasa para el encabezado (igual que la factura).
  const impuestosPorTasa = new Map();
  (nota.detalles || []).forEach((linea) => {
    const porcentaje = String(Number(linea.impuesto_porcentaje || 0));
    const actual = impuestosPorTasa.get(porcentaje) || { base: 0, valor: 0 };
    actual.base += Number(linea.subtotal) - Number(linea.descuento || 0);
    actual.valor += Number(linea.impuesto) || 0;
    impuestosPorTasa.set(porcentaje, actual);
  });

  // Líneas de detalle de la nota.
  const lineasXml = (nota.detalles || [])
    .map((linea, indice) =>
`      <cac:${lineaRaiz}>
        <cbc:ID>${indice + 1}</cbc:ID>
        <cbc:${esCredito ? 'CreditedQuantity' : 'DebitedQuantity'} unitCode="EA" unitCodeListID="UNECERec20">${Number(linea.cantidad)}</cbc:${esCredito ? 'CreditedQuantity' : 'DebitedQuantity'}>
        <cbc:LineExtensionAmount currencyID="COP">${formatearMonto(linea.subtotal)}</cbc:LineExtensionAmount>
        <cac:TaxTotal>
          <cbc:TaxAmount currencyID="COP">${formatearMonto(linea.impuesto)}</cbc:TaxAmount>
        </cac:TaxTotal>
        <cac:Item>
          <cbc:Description>${xmlEscape(linea.producto_nombre)}</cbc:Description>
        </cac:Item>
        <cac:Price>
          <cbc:PriceAmount currencyID="COP">${formatearMonto(linea.precio_unitario)}</cbc:PriceAmount>
        </cac:Price>
      </cac:${lineaRaiz}>`
    )
    .join('\n');

  // Impuestos totales por tasa en el encabezado.
  const impuestosHeader = [...impuestosPorTasa.entries()]
    .map(([porcentaje, imp]) =>
`        <cac:TaxTotal>
          <cbc:TaxAmount currencyID="COP">${formatearMonto(imp.valor)}</cbc:TaxAmount>
          <cac:TaxSubtotal>
            <cbc:TaxableAmount currencyID="COP">${formatearMonto(imp.base)}</cbc:TaxableAmount>
            <cbc:TaxAmount currencyID="COP">${formatearMonto(imp.valor)}</cbc:TaxAmount>
            <cac:TaxCategory>
              <cbc:ID schemeAgencyID="195">${Number(porcentaje) > 0 ? 'VAT' : 'Z'}</cbc:ID>
              <cbc:Percent>${formatearMonto(porcentaje)}</cbc:Percent>
              <cac:TaxScheme><cbc:ID>IVA</cbc:ID></cac:TaxScheme>
            </cac:TaxCategory>
          </cac:TaxSubtotal>
        </cac:TaxTotal>`
    )
    .join('\n');

  const numeroNota = nota.prefijo
    ? `${xmlEscape(nota.prefijo)}-${nota.numero_nota}`
    : String(nota.numero_nota);
  // Referencia a la factura original (BillingReference / InvoiceDocumentReference).
  const numeroOriginal = facturaOriginal && facturaOriginal.prefijo
    ? `${xmlEscape(facturaOriginal.prefijo)}-${facturaOriginal.numero_factura}`
    : String(facturaOriginal ? facturaOriginal.numero_factura : '');
  const fechaEmision = formatearFechaCufe(nota.creado_en || new Date());
  const fechaISO = new Date(nota.creado_en || new Date()).toISOString();

  // Código de documento: 91 = Nota Crédito, 92 = Nota Débito (para la DIAN).
  const documentoTypeCode = esCredito ? '91' : '92';

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<${raiz} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${raiz}-2"
       xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
       xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:ProfileID>DIAN 2.1</cbc:ProfileID>
  <cbc:CustomizationID>10</cbc:CustomizationID>
  <cbc:ID>${numeroNota}</cbc:ID>
  <cbc:IssueDate>${fechaISO.slice(0, 10)}</cbc:IssueDate>
  <cbc:IssueTime>${fechaISO.slice(11, 19)}</cbc:IssueTime>
  <cbc:${cbcIdNs} listID="${documentoTypeCode}">${documentoTypeCode}</cbc:${cbcIdNs}>
  <cbc:DocumentCurrencyCode>COP</cbc:DocumentCurrencyCode>
  <cac:DiscrepancyResponse>
    <cbc:ReferenceID>${numeroOriginal}</cbc:ReferenceID>
    <cbc:Description>${xmlEscape(nota.motivo || (esCredito ? 'Nota crédito' : 'Nota débito'))}</cbc:Description>
  </cac:DiscrepancyResponse>
  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${numeroOriginal}</cbc:ID>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${xmlEscape(empresa.nombre)}</cbc:Name></cac:PartyName>
      <cac:PhysicalLocation>
        <cac:Address><cbc:CityName>${xmlEscape(empresa.ciudad)}</cbc:CityName></cac:Address>
      </cac:PhysicalLocation>
      <cac:PartyTaxScheme><cbc:CompanyID schemeAgencyID="195" schemeName="32">${limpiarDocumento(empresa.documento)}</cbc:CompanyID></cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${xmlEscape(empresa.nombre)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${xmlEscape(adquirente.nombre)}</cbc:Name></cac:PartyName>
      <cac:PartyTaxScheme><cbc:CompanyID schemeAgencyID="195" schemeName="${adquirente.tipo_documento}">${adquirente.documento}</cbc:CompanyID></cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="COP">${formatearMonto(nota.impuesto_total)}</cbc:TaxAmount>
${impuestosHeader}
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="COP">${formatearMonto(nota.subtotal)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="COP">${formatearMonto(Number(nota.subtotal) - Number(nota.descuento || 0))}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="COP">${formatearMonto(Number(nota.subtotal) - Number(nota.descuento || 0) + Number(nota.impuesto_total))}</cbc:TaxInclusiveAmount>
    <cbc:${esCredito ? 'PayableAmount' : 'PayableAmount'} currencyID="COP">${formatearMonto(nota.total)}</cbc:${esCredito ? 'PayableAmount' : 'PayableAmount'}>
  </cac:LegalMonetaryTotal>
${lineasXml}
</${raiz}>`;

  return xml;
};

// ---------------------------------------------------------------------------
// API pública del módulo.
// ---------------------------------------------------------------------------
module.exports = {
  formatearMonto,
  formatearFechaCufe,
  calcularCufe,
  construirCadenaCufe,
  resolverAdquirente,
  generarUBL,
  generarUBLNota,
  construirCadenaCude,
  calcularCude
};