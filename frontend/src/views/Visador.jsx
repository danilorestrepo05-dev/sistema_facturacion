// src/views/Visador.jsx
// Pantalla para el cliente (visador, Fase 5): muestra en vivo la venta que el
// cajero arma en Caja. Se abre desde Caja en otra ventana (idealmente en un
// segundo monitor) y recibe las actualizaciones por BroadcastChannel.
import { useEffect, useRef, useState } from 'react';
import { formatoMoneda } from '../utils/format';

const Visador = () => {
  const [venta, setVenta] = useState(null);     // { carrito, totales }
  const [gracias, setGracias] = useState(null); // { numeroFactura, total }
  const [hora, setHora] = useState(new Date());
  const graciasVigente = useRef(null);

  useEffect(() => {
    // Reloj de la esquina superior.
    const reloj = setInterval(() => setHora(new Date()), 1000);

    let canal = null;
    if ('BroadcastChannel' in window) {
      canal = new BroadcastChannel('visador-caja');
      // Si la venta ya empezó, pide el estado actual a la ventana de Caja.
      canal.postMessage({ tipo: 'solicitar-estado' });
      canal.onmessage = (evento) => {
        const datos = evento.data || {};
        if (datos.tipo === 'estado') {
          const hayItems = Array.isArray(datos.carrito) && datos.carrito.length > 0;
          // Si ya empezó la siguiente venta, el agradecimiento se corta al
          // instante para mostrarla. El vaciado automático del carrito que
          // hace Caja justo después de emitir (mensaje sin ítems) sigue
          // ignorándose mientras dura el agradecimiento.
          if (hayItems && graciasVigente.current) {
            clearTimeout(graciasVigente.current);
            graciasVigente.current = null;
            setGracias(null);
          }
          if (!graciasVigente.current) {
            setVenta({ carrito: datos.carrito || [], totales: datos.totales });
          }
        }
        // El cajero cerró el modal de venta emitida: volver a esperar ya.
        if (datos.tipo === 'nueva-venta') {
          clearTimeout(graciasVigente.current);
          graciasVigente.current = null;
          setGracias(null);
        }
        if (datos.tipo === 'factura-emitida') {
          setGracias({ numeroFactura: datos.numeroFactura, total: datos.total });
          setVenta(null);
          clearTimeout(graciasVigente.current);
          graciasVigente.current = setTimeout(() => setGracias(null), 10_000);
        }
      };
    }

    return () => {
      clearInterval(reloj);
      clearTimeout(graciasVigente.current);
      canal?.close();
    };
  }, []);

  return (
    <div className="d-flex flex-column vh-100 bg-light p-4">
      {/* Encabezado: marca y hora */}
      <header className="d-flex justify-content-between align-items-center border-bottom pb-3">
        <div className="fs-2 fw-bold text-primary">
          <i className="bi bi-receipt-cutoff me-3"></i>Mi Negocio
        </div>
        <div className="text-secondary fs-3">{hora.toLocaleTimeString()}</div>
      </header>

      {gracias ? (
        /* Factura recién emitida: agradecimiento */
        <main className="flex-grow-1 d-flex flex-column justify-content-center align-items-center text-center">
          <div className="display-1 text-success mb-4"><i className="bi bi-check-circle-fill"></i></div>
          <h1 className="mb-3">¡Gracias por su compra!</h1>
          <div className="fs-2 text-secondary mb-5">Factura No. {gracias.numeroFactura}</div>
          <div className="fs-1 fw-bold text-primary">Total: {formatoMoneda(gracias.total)}</div>
        </main>
      ) : venta?.carrito?.length ? (
        <>
          {/* Detalle de la venta en curso */}
          <main className="flex-grow-1 overflow-auto py-3">
            <table className="table table-borderless align-middle fs-3 mb-0">
              <tbody>
                {venta.carrito.map((item) => (
                  <tr key={item.producto_id}>
                    <td>
                      {item.nombre}
                      <span className="text-secondary ms-2 fs-4">
                        × {item.cantidad} @ {formatoMoneda(item.precio)}
                        {Number(item.descuento) > 0 && ` (desc. ${formatoMoneda(item.descuento)})`}
                      </span>
                    </td>
                    <td className="text-end text-nowrap">
                      {formatoMoneda(item.precio * item.cantidad - (Number(item.descuento) || 0))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </main>

          {/* Totales */}
          <footer className="border-top pt-3">
            <div className="d-flex justify-content-between fs-4 text-secondary">
              <span>Subtotal</span><span>{formatoMoneda(venta.totales.subtotal)}</span>
            </div>
            {venta.totales.descuento > 0 && (
              <div className="d-flex justify-content-between fs-4 text-danger">
                <span>Descuento</span><span>- {formatoMoneda(venta.totales.descuento)}</span>
              </div>
            )}
            <div className="d-flex justify-content-between fs-4 text-secondary">
              <span>Impuestos</span><span>{formatoMoneda(venta.totales.impuesto)}</span>
            </div>
            <div className="d-flex justify-content-between fw-bold display-5 text-primary mt-2">
              <span>TOTAL</span><span>{formatoMoneda(venta.totales.total)}</span>
            </div>
          </footer>
        </>
      ) : (
        /* Sin venta activa */
        <main className="flex-grow-1 d-flex flex-column justify-content-center align-items-center text-secondary">
          <div className="display-1 mb-4"><i className="bi bi-basket2"></i></div>
          <h1>Esperando su compra…</h1>
        </main>
      )}

      <small className="text-secondary mt-3">
        Pantalla del cliente — presiona F11 para pantalla completa
      </small>
    </div>
  );
};

export default Visador;
