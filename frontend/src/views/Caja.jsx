// src/views/Caja.jsx
// Punto de venta: busca productos, arma la venta y emite la factura.
import { useEffect, useState, useMemo } from 'react';
import {
  Row, Col, Card, Form, Button, InputGroup, ListGroup, Badge,
  Spinner, Alert, Modal
} from 'react-bootstrap';
import api from '../services/api';
import { abrirTicketFactura, abrirPdfFactura } from '../services/impresion';
import { formatoMoneda } from '../utils/format';

const TIPOS_PAGO = ['efectivo', 'tarjeta', 'transferencia', 'otro'];

const Caja = () => {
  const [productos, setProductos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [termino, setTermino] = useState('');
  const [carrito, setCarrito] = useState([]); // [{ producto_id, nombre, precio, impuesto_porcentaje, cantidad, stock }]
  const [clienteId, setClienteId] = useState('');
  const [tipoPago, setTipoPago] = useState('efectivo');
  const [descuento, setDescuento] = useState(0);
  const [emitido, setEmitido] = useState(null); // factura emitida (modal)
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    setCargando(true);
    setError('');
    try {
      const [respProductos, respClientes] = await Promise.all([
        api.get('/productos', { params: { termino: '' } }),
        api.get('/clientes')
      ]);
      setProductos(respProductos.data.datos);
      setClientes(respClientes.data.datos);
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al cargar los datos de la caja');
    } finally {
      setCargando(false);
    }
  };

  // Productos visibles según el término de búsqueda.
  const productosFiltrados = useMemo(() => {
    const t = termino.trim().toLowerCase();
    if (!t) return productos.filter((p) => p.activo === 1);
    return productos.filter(
      (p) => p.activo === 1 &&
        (p.nombre.toLowerCase().includes(t) ||
         p.codigo.toLowerCase().includes(t) ||
         (p.categoria_nombre || '').toLowerCase().includes(t))
    );
  }, [productos, termino]);

  const agregar = (producto) => {
    setCarrito((prev) => {
      const existente = prev.find((i) => i.producto_id === producto.id);
      if (existente) {
        if (existente.cantidad >= producto.stock_actual) return prev;
        return prev.map((i) =>
          i.producto_id === producto.id ? { ...i, cantidad: i.cantidad + 1 } : i
        );
      }
      if (producto.stock_actual <= 0) return prev;
      return [...prev, {
        producto_id: producto.id,
        nombre: producto.nombre,
        precio: Number(producto.precio_venta),
        impuesto_porcentaje: Number(producto.impuesto_porcentaje || 0),
        cantidad: 1,
        stock: producto.stock_actual
      }];
    });
  };

  const cambiarCantidad = (id, cantidad) => {
    const n = Math.max(0, Math.min(Number(cantidad) || 0, carrito.find((i) => i.producto_id === id)?.stock || 9999));
    setCarrito((prev) =>
      n === 0
        ? prev.filter((i) => i.producto_id !== id)
        : prev.map((i) => (i.producto_id === id ? { ...i, cantidad: n } : i))
    );
  };

  const quitar = (id) => setCarrito((prev) => prev.filter((i) => i.producto_id !== id));

  // Cálculo de totales.
  const totales = useMemo(() => {
    const subtotal = carrito.reduce((acc, i) => acc + i.precio * i.cantidad, 0);
    const impuesto = carrito.reduce(
      (acc, i) => acc + i.precio * i.cantidad * (i.impuesto_porcentaje / 100), 0
    );
    const desc = Math.max(0, Number(descuento) || 0);
    return { subtotal, impuesto, descuento: desc, total: Math.max(0, subtotal + impuesto - desc) };
  }, [carrito, descuento]);

  const emitir = async () => {
    setGuardando(true);
    setError('');
    try {
      const respuesta = await api.post('/facturas', {
        cliente_id: clienteId || null,
        tipo_pago: tipoPago,
        descuento: totales.descuento,
        items: carrito.map((i) => ({ producto_id: i.producto_id, cantidad: i.cantidad }))
      });
      setEmitido(respuesta.data.datos);
      setCarrito([]);
      setClienteId('');
      setDescuento(0);
      await cargarDatos();
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al emitir la factura');
    } finally {
      setGuardando(false);
    }
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

  if (cargando) {
    return <div className="text-center py-5"><Spinner animation="border" /></div>;
  }

  return (
    <div>
      <h4 className="mb-3">Caja</h4>
      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}

      <Row className="g-3">
        {/* Columna izquierda: búsqueda y productos */}
        <Col lg={7}>
          <InputGroup className="pos-busqueda mb-3">
            <Form.Control
              placeholder="Buscar por código, nombre o categoría…"
              value={termino}
              onChange={(e) => setTermino(e.target.value)}
            />
            <Button variant="outline-secondary" onClick={() => setTermino('')}>
              <i className="bi bi-x-lg"></i>
            </Button>
          </InputGroup>

          <div className="row g-2">
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

        {/* Columna derecha: carrito y emisión */}
        <Col lg={5}>
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
                        <strong className="small">{formatoMoneda(item.precio * item.cantidad)}</strong>
                        <Button size="sm" variant="outline-danger" onClick={() => quitar(item.producto_id)}>
                          <i className="bi bi-trash"></i>
                        </Button>
                      </div>
                    </div>
                    <div className="d-flex align-items-center gap-2 mt-1">
                      <span className="small text-secondary">Cantidad:</span>
                      <Form.Control
                        type="number" size="sm" min={1} style={{ width: 90 }}
                        value={item.cantidad}
                        onChange={(e) => cambiarCantidad(item.producto_id, e.target.value)}
                      />
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

              <InputGroup size="sm" className="mb-3">
                <InputGroup.Text>Descuento $</InputGroup.Text>
                <Form.Control type="number" min={0} value={descuento}
                  onChange={(e) => setDescuento(e.target.value)} />
              </InputGroup>

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
                disabled={carrito.length === 0 || guardando} onClick={emitir}>
                {guardando ? 'Emitiendo…' : <><i className="bi bi-receipt me-2"></i>Cobrar y emitir factura</>}
              </Button>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Modal de factura emitida con opciones de impresión */}
      <Modal show={!!emitido} onHide={() => setEmitido(null)} centered>
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
          <Button variant="success" onClick={() => setEmitido(null)}>Nueva venta</Button>
        </Modal.Footer>
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

export default Caja;
