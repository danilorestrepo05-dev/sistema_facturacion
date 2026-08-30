// src/views/Caja.jsx
// Punto de venta: busca productos, arma la venta y emite la factura.
import { useEffect, useState, useMemo, useRef } from 'react';
import {
  Row, Col, Card, Form, Button, InputGroup, ListGroup, Table, Badge,
  Spinner, Alert, Modal, Offcanvas
} from 'react-bootstrap';
import api from '../services/api';
import { abrirTicketFactura, abrirPdfFactura } from '../services/impresion';
import { useCarrito } from '../context/CarritoContext';
import { useConfig } from '../context/ConfigContext';
import { formatoMoneda } from '../utils/format';

const TIPOS_PAGO = ['efectivo', 'tarjeta', 'transferencia', 'otro'];

// Selector de impuestos por línea de venta: botón que despliega un menú con
// checkboxes de los impuestos activos del catálogo. Cualquier cambio se aplica
// de inmediato sin necesidad de botón "Aplicar" (UX tipo Odoo).
const SelectorImpuestos = ({ impuestos, catalogo, onChange }) => {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setAbierto(false);
    };
    document.addEventListener('mousedown', cerrar);
    return () => document.removeEventListener('mousedown', cerrar);
  }, [abierto]);

  const idsActuales = impuestos.map((t) => t.id);
  const hayExento = impuestos.some((t) => Number(t.porcentaje) === 0);
  const hayGravado = impuestos.some((t) => Number(t.porcentaje) > 0);

  const toggle = (id) => {
    const imp = catalogo.find((c) => c.id === id);
    if (!imp) return;
    const esExento = Number(imp.porcentaje) === 0;

    let nueva;
    if (idsActuales.includes(id)) {
      nueva = idsActuales.filter((x) => x !== id);
    } else if (esExento) {
      nueva = [id];
    } else {
      nueva = [...idsActuales.filter((x) => {
        const c = catalogo.find((cat) => cat.id === x);
        return c && Number(c.porcentaje) > 0;
      }), id];
    }

    onChange(nueva.map((i) => catalogo.find((c) => c.id === i)).filter(Boolean)
      .map((c) => ({ id: c.id, nombre: c.nombre, porcentaje: Number(c.porcentaje) })));
  };

  const etiqueta = impuestos.length === 0
    ? 'Sin impuesto'
    : impuestos.map((t) => `${t.nombre} ${Number(t.porcentaje)}%`).join(' + ');

  return (
    <div className="selector-impuestos" ref={ref}>
      <Button size="sm" variant="outline-secondary" className="text-truncate"
        style={{ minWidth: 90, maxWidth: 180 }} onClick={() => setAbierto((a) => !a)}>
        {etiqueta}
      </Button>
      {abierto && (
        <div className="menu-impuestos"
          onMouseDown={(e) => e.preventDefault()}>
          <div className="small fw-semibold mb-2">Seleccionar impuestos</div>
          {catalogo.map((imp) => {
            const esExento = Number(imp.porcentaje) === 0;
            const deshabilitado = esExento ? hayGravado : hayExento;
            return (
              <Form.Check key={imp.id} type="checkbox" size="sm"
                label={`${imp.nombre} ${Number(imp.porcentaje)}%`}
                checked={idsActuales.includes(imp.id)}
                disabled={deshabilitado}
                onChange={() => toggle(imp.id)} />
            );
          })}
          <div className="pt-2 mt-2 border-top">
            <Button size="sm" variant="outline-secondary" className="w-100"
              onClick={() => { onChange([]); setAbierto(false); }}>
              Sin impuestos (exento)
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

const Caja = () => {
  // La venta en curso vive en CarritoContext: sobrevive la navegación entre
  // módulos y un refresco de página, y se vacía al cerrar sesión.
  const {
    carrito, clienteId, tipoPago, descuento, totales,
    setClienteId, setTipoPago, setDescuento,
    agregar, cambiarCantidad, cambiarDescuento, cambiarImpuestos, quitar, vaciar,
    anunciarVentaEmitida, anunciarNuevaVenta
  } = useCarrito();

  // El escáner de códigos de barras solo se muestra si el flag está activo.
  const { estaHabilitado } = useConfig();
  const escaneoActivo = estaHabilitado('codigo_barras_habilitado');
  // La gaveta de dinero se maneja con el mismo mecanismo de flags.
  const gavetaActiva = estaHabilitado('gaveta_habilitada');
  // Visador: pantalla que ve el cliente (segunda ventana/monitor).
  const visadorActivo = estaHabilitado('visador_habilitado');
  // Con el arqueo activo se exige un turno abierto para vender (v0.9.24).
  const arqueoActivo = estaHabilitado('arqueo_habilitado');

  const [productos, setProductos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [impuestos, setImpuestos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [formatoPdf, setFormatoPdf] = useState('media_carta');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('');

  // Autocomplete del buscador de productos.
  const [terminoBusqueda, setTerminoBusqueda] = useState('');
  const [indiceActivo, setIndiceActivo] = useState(0);
  const [abierto, setAbierto] = useState(false);
  const refBuscador = useRef(null);

  const [emitido, setEmitido] = useState(null); // factura emitida (modal)
  const [guardando, setGuardando] = useState(false);

  // Estado del turno de caja del usuario (solo se consulta si hay arqueo):
  // { turno_abierto: false } o { turno_abierto: true, turno, efectivo_esperado }.
  const [turnoInfo, setTurnoInfo] = useState(null);

  // Escáner de códigos de barras (pistola USB o cámara).
  const inputEscaneoRef = useRef(null);
  const videoRef = useRef(null);
  const [codigoEscaneado, setCodigoEscaneado] = useState('');
  const [avisoEscaneo, setAvisoEscaneo] = useState('');
  const [camaraAbierta, setCamaraAbierta] = useState(false);

  // Aviso del último intento de apertura de la gaveta (éxito o error).
  const [mensajeGaveta, setMensajeGaveta] = useState('');

  // Panel deslizante del carrito en pantallas pequeñas (móvil/tablet).
  const [carritoMovil, setCarritoMovil] = useState(false);

  useEffect(() => {
    cargarDatos();
  }, []);

  // En escritorio el POS acota el layout global (clase pos-activo en <html>)
  // para que los paneles internos hagan scroll por separado; al salir de la
  // vista se retira la clase y las demás pantallas conservan su scroll normal.
  useEffect(() => {
    document.documentElement.classList.add('pos-activo');
    return () => document.documentElement.classList.remove('pos-activo');
  }, []);

  // Consulta el turno abierto del usuario cuando el arqueo está activo.
  // Sin turno la venta se bloquea en la pantalla y también lo valida el backend.
  const consultarTurno = async () => {
    if (!estaHabilitado('arqueo_habilitado')) {
      setTurnoInfo(null);
      return;
    }
    try {
      const respuesta = await api.get('/turnos/actual');
      setTurnoInfo(respuesta.data.datos);
    } catch {
      setTurnoInfo({ turno_abierto: false });
    }
  };

  useEffect(() => {
    consultarTurno();
  }, [arqueoActivo]);

  const cargarDatos = async () => {
    setCargando(true);
    setError('');
    try {
      const [respProductos, respClientes, respImp, respCat] = await Promise.all([
        api.get('/productos', { params: { termino: '' } }),
        api.get('/clientes'),
        api.get('/impuestos'),
        api.get('/categorias')
      ]);
      setProductos(respProductos.data.datos);
      setClientes(respClientes.data.datos);
      setImpuestos(respImp.data.datos.filter((i) => i.activo === 1));
      setCategorias(respCat.data.datos);
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al cargar los datos de la caja');
    } finally {
      setCargando(false);
    }
  };

  // Resultados del autocomplete: filtra productos por nombre/código/código de
  // barras/categoría y por la categoría seleccionada (si hay). Solo activos con
  // stock > 0, máximo 8 opciones.
  const resultadosBusqueda = useMemo(() => {
    const t = terminoBusqueda.trim().toLowerCase();
    if (!t && !categoriaFiltro) return [];
    const cat = categoriaFiltro ? Number(categoriaFiltro) : null;
    return productos
      .filter((p) =>
        p.activo === 1 &&
        p.stock_actual > 0 &&
        (cat === null || p.categoria_id === cat) &&
        (!t ||
          (p.nombre || '').toLowerCase().includes(t) ||
          (p.codigo || '').toLowerCase().includes(t) ||
          (p.codigo_barras || '').toLowerCase().includes(t) ||
          (p.categoria_nombre || '').toLowerCase().includes(t))
      )
      .slice(0, 8);
  }, [productos, terminoBusqueda, categoriaFiltro]);

  // El descuento total (líneas + adicional) no puede dejar la venta en $0
  // ni en negativo; el backend lo rechaza con 400 como segunda barrera.
  const ventaSinSaldo = carrito.length > 0 && totales.total <= 0;

  // Con arqueo activo y sin turno abierto no se puede vender.
  const ventaBloqueadaPorTurno = arqueoActivo && !!turnoInfo && !turnoInfo.turno_abierto;

  // Busca el producto por código de barras y lo agrega a la venta.
  const procesarCodigo = async (valor) => {
    const codigo = String(valor || '').trim();
    if (!codigo) return;
    setAvisoEscaneo('');
    try {
      const respuesta = await api.get(`/productos/codigo-barras/${encodeURIComponent(codigo)}`);
      agregar(respuesta.data.datos);
      setCodigoEscaneado('');
      inputEscaneoRef.current?.focus(); // listo para el siguiente escaneo
    } catch (err) {
      setAvisoEscaneo(err.response?.data?.mensaje || 'Error al buscar el código de barras');
      setCodigoEscaneado('');
    }
  };

  // La pistola USB escribe el código y envía Enter, como un teclado.
  const teclaEscaneo = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      procesarCodigo(codigoEscaneado);
    }
  };

  // Cámara: abre el lector de ZXing sobre el video del modal (importación
  // perezosa, solo se carga si se usa). Se detiene tras el primer código leído.
  useEffect(() => {
    if (!camaraAbierta) return;
    let cancelado = false;
    let controles = null;

    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const lector = new BrowserMultiFormatReader();
        controles = await lector.decodeFromVideoDevice(undefined, videoRef.current, (resultado, err, ctrl) => {
          if (resultado && !cancelado) {
            procesarCodigo(resultado.getText());
            setCamaraAbierta(false);
            ctrl?.stop();
          }
        });
      } catch {
        setAvisoEscaneo('No se pudo abrir la cámara. Recuerda que exige HTTPS o localhost.');
        setCamaraAbierta(false);
      }
    })();

    return () => {
      cancelado = true;
      try { controles?.stop(); } catch { /* ya detenido */ }
    };
  }, [camaraAbierta]);

  // Abre la gaveta de dinero: el backend envía el comando ESC/POS kick a la
  // térmica (o lo simula si no hay hardware configurado).
  const abrirGaveta = async () => {
    try {
      const respuesta = await api.post('/gaveta/abrir');
      setMensajeGaveta(respuesta.data.mensaje || 'Comando de gaveta enviado');
    } catch (err) {
      setMensajeGaveta(err.response?.data?.mensaje || 'No se pudo abrir la gaveta');
    }
  };

  // Abre la pantalla del cliente (visador) en una ventana nueva: se puede
  // arrastrar a un segundo monitor conectado al mismo PC de caja.
  const abrirVisador = () => {
    window.open(`${window.location.origin}/visador`, 'visadorCliente', 'width=900,height=1200');
  };

  const emitir = async () => {
    setGuardando(true);
    setError('');
    try {
      const respuesta = await api.post('/facturas', {
        cliente_id: clienteId || null,
        tipo_pago: tipoPago,
        // Solo el descuento adicional de factura: los descuentos de línea viajan
        // dentro de cada item y el backend los suma una sola vez.
        descuento: Math.max(0, Number(descuento) || 0),
        items: carrito.map((i) => ({
          producto_id: i.producto_id,
          cantidad: i.cantidad,
          descuento: Number(i.descuento) || 0,
          // Envía los ids de los impuestos seleccionados para esta línea;
          // [] = exento a propósito; undefined = fallback al impuesto del producto.
          ...(Array.isArray(i.impuestos)
            ? { impuestos: i.impuestos.map((t) => t.id) }
            : {})
        }))
      });
      setEmitido(respuesta.data.datos);
      // Si el carrito móvil estaba abierto, se cierra al emitir la factura.
      setCarritoMovil(false);
      // La pantalla del cliente muestra el total final y el agradecimiento.
      anunciarVentaEmitida(respuesta.data.datos.numero_factura, respuesta.data.datos.total);
      vaciar();
      await cargarDatos();
      consultarTurno(); // refresca el estado del turno tras la venta
      // Venta en efectivo: la gaveta se abre sola (sin bloquear la emisión).
      if (tipoPago === 'efectivo' && gavetaActiva) abrirGaveta();
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al emitir la factura');
    } finally {
      setGuardando(false);
    }
  };

  // Cierra el modal de venta emitida y devuelve el visador al estado de espera.
  const cerrarModalEmitido = () => {
    setEmitido(null);
    anunciarNuevaVenta();
  };

  // Abre el ticket o el PDF de la factura recién emitida (token vía interceptor).
  const imprimir = async (tipo, valor) => {
    setError('');
    try {
      if (tipo === 'ticket') await abrirTicketFactura(emitido.id, valor);
      else await abrirPdfFactura(emitido.id, valor);
    } catch (err) {
      setError(err.mensaje || err.response?.data?.mensaje || 'Error al generar la impresión');
    }
  };

  // Carrito "Venta actual" dividido en dos zonas reutilizables:
  // - contenidoVenta: título y lista de ítems.
  // - pieVenta: cliente, pago, descuento, totales y Cobrar.
  // Ambas zonas componen la tarjeta que usa SOLO el panel deslizante del
  // móvil; el escritorio muestra la venta como tabla (tablaVenta) con sus
  // controles en la barra inferior fija (barraInferior).
  const contenidoVenta = (
    <>
      <Card.Title className="fs-6">Venta actual</Card.Title>

      <ListGroup variant="flush" className="mb-3">
        {carrito.length === 0 && (
          <ListGroup.Item className="text-secondary small border-0">
            Agrega productos para iniciar la venta.
          </ListGroup.Item>
        )}
        {carrito.map((item) => (
          <ListGroup.Item key={item.producto_id} className="px-0">
            <div className="d-flex justify-content-between align-items-start">
              <div className="me-2">
                <div className="fw-semibold small">{item.nombre}</div>
                <div className="text-secondary small">
                  {formatoMoneda(item.precio)} × {item.cantidad} · {
                    Array.isArray(item.impuestos) && item.impuestos.length > 0
                      ? item.impuestos.map((t) => `${t.nombre} ${Number(t.porcentaje)}%`).join(' + ')
                      : 'Sin impuesto'
                  }
                </div>
              </div>
              <div className="d-flex align-items-center gap-2">
                <strong className="small">{formatoMoneda(item.precio * item.cantidad - (Number(item.descuento) || 0))}</strong>
                <Button size="sm" variant="outline-danger" onClick={() => quitar(item.producto_id)}>
                  <i className="bi bi-trash"></i>
                </Button>
              </div>
            </div>
            <div className="d-flex align-items-center gap-2 mt-1 flex-wrap">
              <span className="small text-secondary">Cantidad:</span>
              <Form.Control
                type="number" size="sm" min={1} style={{ width: 90 }}
                value={item.cantidad}
                onChange={(e) => cambiarCantidad(item.producto_id, e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
              />
              <span className="small text-secondary ms-2">Descuento $:</span>
              <CampoDescuento item={item} onCambiar={cambiarDescuento} />
            </div>
          </ListGroup.Item>
        ))}
      </ListGroup>
    </>
  );

  // Pie fijo de la venta, compactado para robar poco espacio vertical:
  // los totales van resumidos en una sola línea en lugar de tres filas.
  const pieVenta = (
    <>
      <Row className="g-2 mb-2">
        <Col sm={6}>
          <Form.Label className="small">Cliente</Form.Label>
          <Form.Select size="sm" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
            <option value="">Consumidor final</option>
            {clientes.filter((c) => c.activo === 1).map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </Form.Select>
        </Col>
        <Col sm={6}>
          <Form.Label className="small">Tipo de pago</Form.Label>
          <Form.Select size="sm" value={tipoPago} onChange={(e) => setTipoPago(e.target.value)}>
            {TIPOS_PAGO.map((t) => <option key={t} value={t}>{t}</option>)}
          </Form.Select>
        </Col>
      </Row>

      <InputGroup size="sm" className="mb-2">
        <InputGroup.Text>Descuento adicional $</InputGroup.Text>
        <Form.Control type="number" min={0} value={descuento}
          onChange={(e) => setDescuento(e.target.value)}
          onWheel={(e) => e.currentTarget.blur()} />
      </InputGroup>
      {ventaSinSaldo && (
        <Alert variant="danger" className="py-2 small mb-2">
          El descuento no puede superar ni igualar el valor de la venta.
        </Alert>
      )}

      {/* Totales en filas separadas, con fuente algo menor para ahorrar alto */}
      <div className="border-top pt-2">
        <FilaTotal etiqueta="Subtotal" valor={formatoMoneda(totales.subtotal)} />
        <FilaTotal etiqueta="Impuestos" valor={formatoMoneda(totales.impuesto)} />
        {totales.descuento > 0 &&
          <FilaTotal etiqueta="Descuento" valor={`- ${formatoMoneda(totales.descuento)}`} />}
        <div className="d-flex justify-content-between align-items-center mt-1">
          <span className="fw-bold" style={{ fontSize: '1.1rem' }}>TOTAL</span>
          <span className="fw-bold text-primary" style={{ fontSize: '1.1rem' }}>
            {formatoMoneda(totales.total)}
          </span>
        </div>
      </div>

      <Button variant="success" className="w-100 mt-2"
        disabled={carrito.length === 0 || guardando || ventaSinSaldo || ventaBloqueadaPorTurno}
        onClick={emitir}>
        {guardando ? 'Emitiendo…' : <><i className="bi bi-receipt me-2"></i>Cobrar y emitir factura</>}
      </Button>

      {/* Apertura manual de la gaveta (solo si el flag está activo) */}
      {gavetaActiva && (
        <>
          {mensajeGaveta && (
            <Alert variant="info" className="py-2 small mt-2 mb-0"
              dismissible onClose={() => setMensajeGaveta('')}>
              <i className="bi bi-cash-stack me-1"></i>{mensajeGaveta}
            </Alert>
          )}
          <Button variant="outline-secondary" className="w-100 mt-2"
            title="Envía el pulso a la gaveta a través de la impresora térmica"
            onClick={abrirGaveta}>
            <i className="bi bi-box-arrow-in-up me-2"></i>Abrir gaveta
          </Button>
        </>
      )}
    </>
  );

  // Tarjeta compuesta: SOLO la usa el panel deslizante del móvil. En
  // escritorio el CSS parte estas dos zonas (la lista scrollea con su propio
  // scroll y el pie queda clavado abajo); en móvil ambas fluyen de forma
  // natural dentro del panel deslizante.
  const tarjetaVenta = (
    <Card className="card-kpi caja-tarjeta-venta">
      <div className="caja-panel-lista p-3 pb-2">{contenidoVenta}</div>
      <div className="caja-panel-pie px-3 pt-3 pb-3">{pieVenta}</div>
    </Card>
  );

  // Tabla de la venta estilo módulo Ventas de Odoo: cada producto agregado es
  // una fila (Producto | Cant | P. unitario | Impuestos | Dto $ | Total | ✕) y solo esta
  // zona scrollea dentro de su columna.
  const tablaVenta = (
    <Card className="card-kpi caja-tarjeta-venta">
      <Card.Header className="d-flex justify-content-between align-items-center py-2">
        <span className="fw-semibold">Venta actual</span>
        <Badge bg="secondary" pill>{carrito.length} ítem(s)</Badge>
      </Card.Header>
      <div className="caja-panel-lista">
        <Table hover size="sm" className="align-middle mb-0 tabla-venta">
          <thead className="table-light">
            <tr>
              <th>Producto</th>
              <th>Cant.</th>
              <th className="text-end">P. unitario</th>
              <th style={{ minWidth: 120 }}>Impuestos</th>
              <th>Dto $</th>
              <th className="text-end">Total</th>
              <th aria-label="Eliminar"></th>
            </tr>
          </thead>
          <tbody>
            {carrito.length === 0 && (
              <tr>
                <td colSpan={7} className="text-secondary small py-4 text-center">
                  Busca un producto o escanea el código de barras para iniciar la venta.
                </td>
              </tr>
            )}
            {carrito.map((item) => (
              <tr key={item.producto_id}>
                <td>
                  <div className="fw-semibold small">{item.nombre}</div>
                </td>
                <td>
                  <Form.Control
                    type="number" size="sm" min={1} style={{ width: 64 }}
                    value={item.cantidad}
                    onChange={(e) => cambiarCantidad(item.producto_id, e.target.value)}
                    onWheel={(e) => e.currentTarget.blur()}
                  />
                </td>
                <td className="text-end small">{formatoMoneda(item.precio)}</td>
                <td>
                  <SelectorImpuestos
                    impuestos={item.impuestos || []}
                    catalogo={impuestos}
                    onChange={(nuevaLista) => cambiarImpuestos(item.producto_id, nuevaLista)}
                  />
                </td>
                <td><CampoDescuento item={item} onCambiar={cambiarDescuento} /></td>
                <td className="text-end">
                  <strong className="small">
                    {formatoMoneda(item.precio * item.cantidad - (Number(item.descuento) || 0))}
                  </strong>
                </td>
                <td>
                  <Button size="sm" variant="outline-danger"
                    title={`Quitar ${item.nombre}`}
                    onClick={() => quitar(item.producto_id)}>
                    <i className="bi bi-trash"></i>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </Card>
  );

  // Barra inferior fija de toda la pantalla (estilo Odoo): controles de la
  // venta a la izquierda, totales y Cobrar a la derecha. Se actualiza al
  // agregar cada producto y nunca se pierde de vista.
  const barraInferior = (
    <div className="pos-barra-inferior d-none d-lg-flex">
      {ventaSinSaldo && (
        <Alert variant="danger" className="py-1 px-2 small mb-0 w-100 order-first">
          El descuento no puede superar ni igualar el valor de la venta.
        </Alert>
      )}

      <div className="pos-barra-filtros">
        <div>
          <Form.Label className="small mb-0 text-secondary">Cliente</Form.Label>
          <Form.Select size="sm" style={{ minWidth: 180 }}
            value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
            <option value="">Consumidor final</option>
            {clientes.filter((c) => c.activo === 1).map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </Form.Select>
        </div>
        <div>
          <Form.Label className="small mb-0 text-secondary">Tipo de pago</Form.Label>
          <Form.Select size="sm" value={tipoPago} onChange={(e) => setTipoPago(e.target.value)}>
            {TIPOS_PAGO.map((t) => <option key={t} value={t}>{t}</option>)}
          </Form.Select>
        </div>
        <div>
          <Form.Label className="small mb-0 text-secondary">Descuento adicional $</Form.Label>
          <Form.Control size="sm" type="number" min={0} style={{ width: 110 }}
            value={descuento}
            onChange={(e) => setDescuento(e.target.value)}
            onWheel={(e) => e.currentTarget.blur()} />
        </div>
      </div>

      <div className="pos-barra-totales">
        <div className="text-end small lh-sm">
          <div>Subtotal <strong>{formatoMoneda(totales.subtotal)}</strong></div>
          <div>Impuestos <strong>{formatoMoneda(totales.impuesto)}</strong></div>
          {totales.descuento > 0 &&
            <div>Descuento <strong>- {formatoMoneda(totales.descuento)}</strong></div>}
        </div>
        <div className="text-end border-start ps-3">
          <div className="small text-secondary">TOTAL</div>
          <div className="fw-bold text-primary" style={{ fontSize: '1.35rem', lineHeight: 1 }}>
            {formatoMoneda(totales.total)}
          </div>
        </div>
        <Button variant="success"
          disabled={carrito.length === 0 || guardando || ventaSinSaldo || ventaBloqueadaPorTurno}
          onClick={emitir}>
          {guardando ? 'Emitiendo…' : <><i className="bi bi-receipt me-2"></i>Cobrar y emitir factura</>}
        </Button>

        {/* Apertura manual de la gaveta (solo si el flag está activo) */}
        {gavetaActiva && (
          <>
            <Button variant="outline-secondary" title="Envía el pulso a la gaveta a través de la impresora térmica"
              onClick={abrirGaveta}>
              <i className="bi bi-box-arrow-in-up"></i>
            </Button>
            {mensajeGaveta && (
              <Alert variant="info" className="py-1 px-2 small mb-0 w-100 order-first"
                dismissible onClose={() => setMensajeGaveta('')}>
                <i className="bi bi-cash-stack me-1"></i>{mensajeGaveta}
              </Alert>
            )}
          </>
        )}
      </div>
    </div>
  );

  if (cargando) {
    return <div className="text-center py-5"><Spinner animation="border" /></div>;
  }

  return (
    <div className="vista-caja">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4 className="mb-0">Caja</h4>
        {visadorActivo && (
          <Button variant="outline-secondary" size="sm" onClick={abrirVisador}
            title="Abre la pantalla que ve el cliente (se puede mover a un segundo monitor)">
            <i className="bi bi-person-video3 me-1"></i>Pantalla cliente
          </Button>
        )}
      </div>
      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}

      {/* Estado del turno de caja (solo con arqueo activo, v0.9.24) */}
      {arqueoActivo && turnoInfo && (
        !turnoInfo.turno_abierto ? (
          <Alert variant="warning" className="py-2">
            <i className="bi bi-exclamation-triangle-fill me-2"></i>
            El arqueo está activo y no tienes turno abierto: ábrelo en el módulo <strong>Arqueo</strong> para poder vender.
          </Alert>
        ) : (
          <Alert variant="info" className="py-2 small">
            <i className="bi bi-calculator me-2"></i>
            Turno abierto desde {new Date(turnoInfo.turno.fecha_apertura).toLocaleTimeString()} · fondo inicial {formatoMoneda(turnoInfo.turno.monto_apertura)}
          </Alert>
        )
      )}

      {/* Zona de agregación: escáner + autocomplete estilo Odoo */}
      <div className="zona-agregar mb-3">
        {escaneoActivo && (
          <>
            <InputGroup className="pos-busqueda mb-2">
              <InputGroup.Text><i className="bi bi-upc-scan"></i></InputGroup.Text>
              <Form.Control
                ref={inputEscaneoRef}
                placeholder="Escanear código de barras…"
                value={codigoEscaneado}
                onChange={(e) => setCodigoEscaneado(e.target.value)}
                onKeyDown={teclaEscaneo}
              />
              <Button variant="outline-primary" title="Escanear con la cámara"
                onClick={() => setCamaraAbierta(true)}>
                <i className="bi bi-camera"></i>
              </Button>
            </InputGroup>
            {avisoEscaneo && (
              <Alert variant="warning" className="py-2 small"
                dismissible onClose={() => setAvisoEscaneo('')}>
                {avisoEscaneo}
              </Alert>
            )}
          </>
        )}

        <div className="pos-buscador-productos d-flex gap-2 align-items-start">
          <InputGroup className="flex-grow-1">
            <InputGroup.Text><i className="bi bi-search"></i></InputGroup.Text>
            <Form.Control
              ref={refBuscador}
              placeholder="Buscar producto por nombre, código o categoría…"
              value={terminoBusqueda}
              onChange={(e) => { setTerminoBusqueda(e.target.value); setIndiceActivo(0); setAbierto(true); }}
              onFocus={() => terminoBusqueda && setAbierto(true)}
              onBlur={() => { setTimeout(() => setAbierto(false), 150); }}
              onKeyDown={(e) => {
                if (!abierto || resultadosBusqueda.length === 0) return;
                if (e.key === 'ArrowDown') { e.preventDefault(); setIndiceActivo((i) => Math.min(i + 1, resultadosBusqueda.length - 1)); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setIndiceActivo((i) => Math.max(i - 1, 0)); }
                else if (e.key === 'Enter' && resultadosBusqueda[indiceActivo]) {
                  e.preventDefault();
                  agregar(resultadosBusqueda[indiceActivo]);
                  setTerminoBusqueda(''); setAbierto(false);
                  refBuscador.current?.focus();
                } else if (e.key === 'Escape') { setAbierto(false); }
              }}
            />
            {terminoBusqueda && (
              <Button variant="outline-secondary"
                onClick={() => { setTerminoBusqueda(''); refBuscador.current?.focus(); }}>
                <i className="bi bi-x-lg"></i>
              </Button>
            )}
          </InputGroup>

          {categorias.length > 0 && (
            <Form.Select size="sm" style={{ width: 'auto', minWidth: 140, flex: '0 0 auto' }}
              aria-label="Filtrar por categoría" value={categoriaFiltro}
              onChange={(e) => setCategoriaFiltro(e.target.value)}>
              <option value="">Todas</option>
              {categorias.filter((c) => c.activo === 1).map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </Form.Select>
          )}

          {abierto && resultadosBusqueda.length > 0 && (
            <div className="lista-autocompleta">
              {resultadosBusqueda.map((p, idx) => (
                <button key={p.id} type="button"
                  className={`opcion-autocompleta${idx === indiceActivo ? ' activa' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    agregar(p);
                    setTerminoBusqueda(''); setAbierto(false);
                    refBuscador.current?.focus();
                  }}>
                  <div className="fw-semibold small">{p.nombre}</div>
                  <div className="d-flex justify-content-between align-items-center">
                    <span className="text-secondary" style={{ fontSize: '0.75rem' }}>
                      {p.codigo}{p.categoria_nombre ? ` · ${p.categoria_nombre}` : ''}
                    </span>
                    <span className="text-primary fw-bold small">{formatoMoneda(p.precio_venta)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tabla de la venta: scrollea solo su contenido en escritorio */}
      <div className="caja-zona-tabla">
        {tablaVenta}
      </div>

      {/* Barra inferior fija con los controles y totales de la venta */}
      {barraInferior}

      {/* Botón flotante del carrito para pantallas pequeñas */}
      {carrito.length > 0 && (
        <button type="button" className="btn btn-primary caja-boton-carrito d-lg-none shadow"
          onClick={() => setCarritoMovil(true)}>
          <i className="bi bi-cart-fill me-2"></i>
          {carrito.length} ítem(s) · {formatoMoneda(totales.total)}
          <i className="bi bi-chevron-up ms-2"></i>
        </button>
      )}

      {/* Panel deslizante con el carrito en pantallas pequeñas */}
      <Offcanvas show={carritoMovil} onHide={() => setCarritoMovil(false)}
        placement="end" style={{ width: '22rem', maxWidth: '94vw' }}>
        <Offcanvas.Header closeButton>
          <Offcanvas.Title>Venta actual</Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body className="pt-0">
          {tarjetaVenta}
        </Offcanvas.Body>
      </Offcanvas>

      {/* Modal de factura emitida con opciones de impresión */}
      <Modal show={!!emitido} onHide={cerrarModalEmitido} centered>
        <Modal.Header closeButton>
          <Modal.Title>Factura emitida</Modal.Title>
        </Modal.Header>
        <Modal.Body className="text-center">
          <div className="display-6 text-success mb-2"><i className="bi bi-check-circle-fill"></i></div>
          <h5>Factura No. {emitido?.numero_factura}</h5>
          <p className="text-secondary mb-0">Total: <strong>{formatoMoneda(emitido?.total)}</strong></p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-primary" onClick={() => imprimir('ticket', 80)}>
            <i className="bi bi-printer me-1"></i>Ticket POS
          </Button>
          {/* El PDF puede salir en media carta (rápida, mitad de hoja) o carta */}
          <Form.Select size="sm" style={{ width: 'auto' }} aria-label="Formato del PDF"
            value={formatoPdf} onChange={(e) => setFormatoPdf(e.target.value)}>
            <option value="media_carta">Media carta</option>
            <option value="carta">Carta</option>
          </Form.Select>
          <Button variant="outline-secondary" onClick={() => imprimir('pdf', formatoPdf)}>
            <i className="bi bi-file-earmark-pdf me-1"></i>PDF
          </Button>
          <Button variant="success" onClick={cerrarModalEmitido}>Nueva venta</Button>
        </Modal.Footer>
      </Modal>

      {/* Modal de escaneo con cámara (solo si el flag de códigos está activo) */}
      <Modal show={camaraAbierta} onHide={() => setCamaraAbierta(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title className="fs-6">Apunta la cámara al código de barras</Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-0">
          <video ref={videoRef} style={{ width: '100%', display: 'block', borderRadius: '0 0 6px 6px' }} muted />
        </Modal.Body>
      </Modal>
    </div>
  );
};

// Fila compacta de los totales del carrito (fuente algo menor y en negrita).
const FilaTotal = ({ etiqueta, valor }) => (
  <div className="d-flex justify-content-between text-secondary"
    style={{ fontSize: '0.8125rem', lineHeight: 1.5 }}>
    <span className="fw-bold">{etiqueta}</span>
    <span className="fw-bold">{valor}</span>
  </div>
);

// Input de descuento por línea con borrador local: mientras el usuario teclea
// el valor vive aquí (permite borrar y escribir sin que se reescriba un "0");
// al salir del campo (blur) se normaliza entre 0 y el valor de la línea.
const CampoDescuento = ({ item, onCambiar }) => {
  const [texto, setTexto] = useState(String(item.descuento ?? 0));

  const alSalir = () => {
    const maximo = item.precio * item.cantidad;
    const n = Math.max(0, Math.min(Number(texto) || 0, maximo));
    setTexto(String(n));
    onCambiar(item.producto_id, String(n));
  };

  return (
    <Form.Control
      type="number" size="sm" min={0} style={{ width: 100 }}
      value={texto}
      onChange={(e) => {
        setTexto(e.target.value);
        onCambiar(item.producto_id, e.target.value); // totales en vivo (sin tope superior)
      }}
      onBlur={alSalir}
      // La rueda del mouse sobre un input numérico enfocado cambia el valor
      // (paso por defecto: 1) y corrompe lo tecleado; al soltar el foco la
      // rueda vuelve a desplazar la página normalmente.
      onWheel={(e) => e.currentTarget.blur()}
    />
  );
};

export default Caja;
