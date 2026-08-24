// src/views/Caja.jsx
// Punto de venta: busca productos, arma la venta y emite la factura.
import { useEffect, useState, useMemo, useRef } from 'react';
import {
  Row, Col, Card, Form, Button, InputGroup, ListGroup, Badge,
  Spinner, Alert, Modal, Offcanvas
} from 'react-bootstrap';
import api from '../services/api';
import { abrirTicketFactura, abrirPdfFactura } from '../services/impresion';
import { useCarrito } from '../context/CarritoContext';
import { useConfig } from '../context/ConfigContext';
import { formatoMoneda } from '../utils/format';

const TIPOS_PAGO = ['efectivo', 'tarjeta', 'transferencia', 'otro'];

const Caja = () => {
  // La venta en curso vive en CarritoContext: sobrevive la navegación entre
  // módulos y un refresco de página, y se vacía al cerrar sesión.
  const {
    carrito, clienteId, tipoPago, descuento, totales,
    setClienteId, setTipoPago, setDescuento,
    agregar, cambiarCantidad, cambiarDescuento, quitar, vaciar,
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
  const [categorias, setCategorias] = useState([]);
  // Categoría seleccionada en los chips ('' = todas).
  const [categoriaFiltro, setCategoriaFiltro] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [termino, setTermino] = useState('');
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
      const [respProductos, respClientes, respCategorias] = await Promise.all([
        api.get('/productos', { params: { termino: '' } }),
        api.get('/clientes'),
        api.get('/categorias')
      ]);
      setProductos(respProductos.data.datos);
      setClientes(respClientes.data.datos);
      setCategorias(respCategorias.data.datos);
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al cargar los datos de la caja');
    } finally {
      setCargando(false);
    }
  };

  // Productos visibles según la categoría elegida (chips) y el término de búsqueda.
  const productosFiltrados = useMemo(() => {
    const t = termino.trim().toLowerCase();
    const cat = categoriaFiltro ? Number(categoriaFiltro) : null;
    return productos.filter(
      (p) => p.activo === 1 &&
        (cat === null || p.categoria_id === cat) &&
        (!t ||
          p.nombre.toLowerCase().includes(t) ||
          p.codigo.toLowerCase().includes(t) ||
          (p.categoria_nombre || '').toLowerCase().includes(t))
    );
  }, [productos, termino, categoriaFiltro]);

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
          descuento: Number(i.descuento) || 0
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

  // Tarjeta "Venta actual": se reutiliza en el panel derecho (escritorio)
  // y dentro del panel deslizante del carrito (móvil).
  const tarjetaVenta = (
    <Card className="card-kpi">
      <Card.Body>
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
                    {formatoMoneda(item.precio)} × {item.cantidad} (IVA {item.impuesto_porcentaje}%)
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

        <Row className="g-2 mb-3">
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
          <Alert variant="danger" className="py-2 small mb-3">
            El descuento no puede superar ni igualar el valor de la venta.
          </Alert>
        )}

        <div className="border-top pt-2">
          <FilaTotal etiqueta="Subtotal" valor={formatoMoneda(totales.subtotal)} />
          <FilaTotal etiqueta="Impuestos" valor={formatoMoneda(totales.impuesto)} />
          {totales.descuento > 0 &&
            <FilaTotal etiqueta="Descuento" valor={`- ${formatoMoneda(totales.descuento)}`} />}
          <div className="d-flex justify-content-between align-items-center mt-2">
            <span className="fw-bold fs-5">TOTAL</span>
            <span className="fw-bold fs-5 text-primary">{formatoMoneda(totales.total)}</span>
          </div>
        </div>

        <Button variant="success" className="w-100 mt-3" size="lg"
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
      </Card.Body>
    </Card>
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

      {/* Fila POS: en escritorio cada columna hace scroll por separado */}
      <Row className="g-3 caja-fila">
        {/* Columna izquierda: escáner, búsqueda y productos */}
        <Col lg={7} className="d-flex flex-column caja-col">
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

          {/* Buscador + filtro de categoría en una sola fila: el select escala
              sin importar cuántas categorías existan. */}
          <InputGroup className="pos-busqueda mb-3">
            {categorias.length > 0 && (
              <Form.Select
                className="caja-select-categoria"
                aria-label="Filtrar por categoría"
                value={categoriaFiltro}
                onChange={(e) => setCategoriaFiltro(e.target.value)}>
                <option value="">Todas las categorías</option>
                {categorias.filter((c) => c.activo === 1).map((c) => (
                  <option key={c.id} value={String(c.id)}>{c.nombre}</option>
                ))}
              </Form.Select>
            )}
            <Form.Control
              placeholder="Buscar por código, nombre o categoría…"
              value={termino}
              onChange={(e) => setTermino(e.target.value)}
            />
            <Button variant="outline-secondary" onClick={() => setTermino('')}>
              <i className="bi bi-x-lg"></i>
            </Button>
          </InputGroup>

          <div className="row g-2 caja-listado">
            {productosFiltrados.length === 0 && (
              <p className="text-secondary">Sin productos disponibles.</p>
            )}
            {productosFiltrados.map((p) => (
              <div key={p.id} className="col-6 col-md-4 col-xl-3">
                <Card className="pos-tarjeta-producto" onClick={() => agregar(p)}>
                  <Card.Body className="p-2 text-center">
                    <div className="small text-truncate fw-semibold">{p.nombre}</div>
                    <div className="text-primary fw-bold">{formatoMoneda(p.precio_venta)}</div>
                    <Badge pill bg={p.stock_actual > 0 ? 'success' : 'danger'}>
                      {p.stock_actual} uds
                    </Badge>
                  </Card.Body>
                </Card>
              </div>
            ))}
          </div>
        </Col>

        {/* Columna derecha: carrito y emisión (solo escritorio; en móvil hay botón flotante) */}
        <Col lg={5} className="d-none d-lg-flex flex-column caja-col">
          <div className="caja-panel">
            {tarjetaVenta}
          </div>
        </Col>
      </Row>

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
          <Button variant="outline-secondary" onClick={() => imprimir('pdf', 'media_carta')}>
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

const FilaTotal = ({ etiqueta, valor }) => (
  <div className="d-flex justify-content-between small text-secondary py-1">
    <span>{etiqueta}</span>
    <span>{valor}</span>
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
