// src/services/impresion.js
// Descarga el ticket o el PDF de una factura usando axios (que adjunta el token JWT)
// y lo abre en una pestaña nueva para imprimir o guardar.
// La ventana se abre de forma síncrona (dentro del gesto del usuario) para evitar
// que el bloqueador de popups impida la impresión.
import api from './api';

// Abre el PDF de una factura en una pestaña nueva.
export const abrirPdfFactura = async (id, formato = 'carta') => {
  const ventana = window.open('', '_blank');
  if (!ventana) return;
  try {
    const respuesta = await api.get(`/facturas/${id}/pdf`, {
      params: { formato },
      responseType: 'blob'
    });
    await verificarErrorBlob(respuesta.data);
    const url = window.URL.createObjectURL(new Blob([respuesta.data], { type: 'application/pdf' }));
    ventana.location.href = url;
    setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    ventana.close();
    throw err;
  }
};

// Abre el ticket de una factura en una ventana nueva lista para imprimir.
// Genera una mini-página HTML con CSS de impresión pensado para térmicas:
// fija el tamaño de papel (58mm u 80mm) y el ancho del contenido, de modo que
// el texto monospace cabe exacto en la tira sin ajustar el tamaño manualmente.
export const abrirTicketFactura = async (id, ancho = 80) => {
  const ventana = window.open('', '_blank');
  if (!ventana) return;
  try {
    const respuesta = await api.get(`/facturas/${id}/ticket`, {
      params: { ancho },
      responseType: 'blob'
    });
    const esError = respuesta.data.type.includes('json');
    const texto = esError
      ? `Error al generar el ticket:\n${await respuesta.data.text()}`
      : await respuesta.data.text();

    const doc = ventana.document;
    doc.open();
    doc.write('<!DOCTYPE html><html><head><meta charset="utf-8">');
    doc.write('<title>Ticket factura</title>');

    if (!esError) {
      // Medidas según el ancho del papel térmico: ancho de contenido = área
      // imprimible real (72mm en papel de 80mm; 48mm en papel de 58mm).
      const mm = ancho === '58' ? 58 : 80;
      const anchoContenido = ancho === '58' ? 48 : 72;
      doc.write(`<style>
        @page { size: ${mm}mm auto; margin: 0; }
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; background: #fff; }
        body { width: ${anchoContenido}mm; margin: 0 auto; padding: 4mm 0;
               font-family: 'Courier New', Courier, monospace;
               font-size: 12px; }
        .ticket { white-space: pre; margin: 0; }
        .barra { text-align: center; margin: 0 0 4mm; }
        .barra button { font-family: inherit; font-size: 14px; padding: 6px 14px;
                        cursor: pointer; }
        @media print {
          .barra { display: none; }
          body { padding: 0; font-size: 9px; }
        }
      </style>`);
    }

    doc.write('</head><body>');
    doc.write('<div class="barra"><button type="button" id="btnImprimir">Imprimir (Ctrl+P)</button></div>');
    doc.write('<pre class="ticket" id="contenidoTicket"></pre>');
    doc.write('</body></html>');
    doc.close();

    const pre = doc.getElementById('contenidoTicket');
    if (esError) {
      pre.textContent = texto;
    } else {
      // Limpia los comandos ESC/POS y demás bytes de control, conservando saltos.
      // El ticket inicia con "ESC @" (comando de inicialización de la impresora);
      // si solo se quita el byte ESC queda un "@" suelto al inicio del texto.
      pre.textContent = texto
        .replace(/\x1b@/g, '')
        .replace(/\x1b/g, '')
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');
    }

    const btn = doc.getElementById('btnImprimir');
    if (btn) btn.addEventListener('click', () => ventana.print());

    ventana.focus();

    if (!esError) {
      // Autodispara el diálogo de impresión justo después del gesto del usuario;
      // si el navegador lo bloquea, queda el botón "Imprimir" como respaldo.
      setTimeout(() => ventana.print(), 300);
    }
  } catch (err) {
    ventana.close();
    throw err;
  }
};

// Si el servidor responde con JSON (error) en lugar del archivo, lanza un Error con su mensaje.
const verificarErrorBlob = async (blob) => {
  if (blob.type.includes('json')) {
    const texto = await blob.text();
    let mensaje = 'Error al generar el archivo';
    try {
      const cuerpo = JSON.parse(texto);
      if (cuerpo.mensaje) mensaje = cuerpo.mensaje;
    } catch {
      // Si no es JSON válido se conserva el mensaje genérico.
    }
    const error = new Error(mensaje);
    error.mensaje = mensaje;
    throw error;
  }
};
