// src/views/Compras.jsx
// Compras / ingreso de mercancía: permite al administrador registrar entradas
// de stock con su costo unitario y el proveedor. Cada línea suma inventario,
// puede actualizar el precio de compra del producto y queda como movimiento
// con motivo 'compra'. Incluye escáner de código de barras como en Caja.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  Row, Col, Card, Form, Button, Spinner, Alert, InputGroup, Modal
} from 'react-bootstrap';
import api from '../services/api';
import { formatoMoneda } from '../utils/format';
import { useConfig } from '../context/ConfigContext';

// Fila vacía del formulario de líneas.
const filaVacia = () => ({ producto_id: '', cantidad: '', costo_unitario: '' });

const Compras = () => {
  // El escáner de códigos de barras solo se muestra si el flag está activo,
  // igual que en Caja.
  const { estaHabilitado } = useConfig();
  const escaneoActivo = estaHabilitado('codigo_barras_habilitado');

  const [productos, setProductos] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [proveedorId, setProveedorId] = useState('');
  const [lineas, setLineas] = useState([filaVacia()]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState(null); // Resumen de la última compra registrada

  // Escáner de código de barras (pistola USB o cámara del móvil/PC).
  const [codigoEscaneado, setCodigoEscaneado] = useState('');
  const [avisoEscaneo, setAvisoEscaneo] = useState('');
  const escaneoRef = useRef(null);
  const videoRef = useRef(null);
  const [camaraAbierta, setCamaraAbierta] = useState(false);

  // Carga el catálogo de productos y proveedores activos.
  useEffect(() => {
    const cargar = async () => {
      setCargando(true);
      try {
        const [respProductos, respProveedores] = await Promise.all([
          api.get('/productos'),
          api.get('/proveedores')
        ]);
        setProductos(respProductos.data.datos.filter((p) => p.activo === 1));
        setProveedores(respProveedores.data.datos.filter((p) => p.activo === 1));
      } catch (err) {
        setError(err.response?.data?.mensaje || 'Error al cargar datos');
      } finally {
        setCargando(false);
      }
    };
    cargar();
  }, []);

  // Actualiza un campo de una línea del formulario.
  const cambiarLinea = (indice, campo, valor) => {
    setLineas((prev) => prev.map((l, i) => (i === indice ? { ...l, [campo]: valor } : l)));
  };

  const agregarLinea = () => setLineas((prev) => [...prev, filaVacia()]);

  const quitarLinea = (indice) =>
    setLineas((prev) => (prev.length === 1 ? [filaVacia()] : prev.filter((_, i) => i !== indice)));

  // Busca el producto por código de barras y lo agrega (o suma uno) a las líneas.
  const procesarCodigo = async (valor) => {
    const codigo = String(valor || '').trim();
    if (!codigo) return;
    setAvisoEscaneo('');
    try {
      const respuesta = await api.get(`/productos/codigo-barras/${encodeURIComponent(codigo)}`);
      const producto = respuesta.data.datos;

      setLineas((prev) => {
        // Si el producto ya está en una línea, suma una unidad a esa línea.
        const indice = prev.findIndex((l) => Number(l.producto_id) === producto.id);
        if (indice >= 0) {
          return prev.map((l, i) =>
            i === indice ? { ...l, cantidad: String(Number(l.cantidad || 0) + 1) } : l
          );
        }
        // Si hay una línea vacía, úsala; si no, agrega una nueva.
        const vacia = prev.findIndex((l) => !l.producto_id);
        const nueva = { producto_id: String(producto.id), cantidad: '1', costo_unitario: '' };
        if (vacia >= 0) return prev.map((l, i) => (i === vacia ? nueva : l));
        return [...prev, nueva];
      });

      setCodigoEscaneado('');
      escaneoRef.current?.focus(); // listo para el siguiente escaneo
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
  // Permite escanear con la cámara del móvil o del PC sin pistola USB.
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

  // Validaciones en pantalla: líneas completas (costo obligatorio >= 0)
  // y sin productos repetidos.
  const lineasValidas = lineas.every((l) => {
    const costo = l.costo_unitario;
    return (
      l.producto_id &&
      Number(l.cantidad) > 0 &&
      Number.isInteger(Number(l.cantidad)) &&
      costo !== '' &&
      Number.isFinite(Number(costo)) &&
      Number(costo) >= 0
    );
  });
  const hayRepetidos = (() => {
    const ids = lineas.filter((l) => l.producto_id).map((l) => Number(l.producto_id));
    return new Set(ids).size !== ids.length;
  })();

  // Totales en vivo del formulario.
  const totales = useMemo(() => {
    let unidades = 0;
    let costoTotal = 0;
    for (const linea of lineas) {
      if (!linea.producto_id || !Number(linea.cantidad)) continue;
      unidades += Number(linea.cantidad);
      costoTotal += Number(linea.cantidad) * Number(linea.costo_unitario || 0);
    }
    return { unidades, costoTotal };
  }, [lineas]);

  // Envía la compra al backend y muestra el resumen devuelto.
  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    setExito(null);

    if (!lineasValidas || hayRepetidos) return;

    setGuardando(true);
    try {
      const items = lineas.map((l) => ({
        producto_id: Number(l.producto_id),
        cantidad: Number(l.cantidad),
        costo_unitario: Number(l.costo_unitario)
      }));
      const resp = await api.post('/compras', {
        proveedor_id: proveedorId || null,
        items
      });
      setExito(resp.data.datos);
      setLineas([filaVacia()]);
      setProveedorId('');
      // Refresca el catálogo porque cambiaron stock y costos.
      const respProductos = await api.get('/productos');
      setProductos(respProductos.data.datos.filter((p) => p.activo === 1));
    } catch (err) {
      setError(err.response?.data?.mensaje || 'No se pudo registrar la compra');
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" />
      </div>
    );
  }

  return (
    <Row className="g-3">
      <Col>
        <Card className="shadow-sm">
          <Card.Header as="h1" className="h5 fw-semibold mb-0">
            <i className="bi bi-basket-fill me-2"></i>Compras
          </Card.Header>
          <Card.Body>
            <p className="text-secondary small mb-4">
              Registra la mercancía que llega del proveedor: suma stock, actualiza el precio
              de compra y deja el movimiento en el reporte de inventario. ¿El producto aún no
              existe? Créalo primero en{' '}
              <Link to="/productos">Productos</Link>.
            </p>

            {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}

            {/* Escáner de código de barras (pistola USB o cámara) */}
            {escaneoActivo && (
              <Form.Group className="mb-3" controlId="escaneo-compra">
                <Form.Label className="small mb-1">Escanear código de barras</Form.Label>
                <InputGroup>
                  <InputGroup.Text><i className="bi bi-upc-scan"></i></InputGroup.Text>
                  <Form.Control
                    ref={escaneoRef}
                    autoComplete="off"
                    placeholder="Dispara la pistola o digita el código y presiona Enter"
                    value={codigoEscaneado}
                    onChange={(e) => setCodigoEscaneado(e.target.value)}
                    onKeyDown={teclaEscaneo}
                  />
                  <Button variant="outline-primary" title="Escanear con la cámara"
                    onClick={() => setCamaraAbierta(true)}>
                    <i className="bi bi-camera"></i>
                  </Button>
                </InputGroup>
                <Form.Text muted>
                  Si el producto ya está en la lista, suma una unidad; si no, agrega una línea nueva.
                </Form.Text>
                {avisoEscaneo && <Alert variant="warning" className="py-2 small mt-2 mb-0">{avisoEscaneo}</Alert>}
              </Form.Group>
            )}

            {exito && (
              <Alert variant="success" dismissible onClose={() => setExito(null)}>
                <div className="fw-semibold">Compra #{exito.compra_id} registrada</div>
                {exito.items.map((i) => (
                  <div key={i.producto_id} className="small">
                    +{i.cantidad} × {i.nombre} ({formatoMoneda(i.costo_unitario)} c/u)
                  </div>
                ))}
                <div className="small mt-1">
                  Unidades: <strong>{exito.unidades}</strong> · Costo total:{' '}
                  <strong>{formatoMoneda(exito.costo_total)}</strong>
                </div>
              </Alert>
            )}

            <Form onSubmit={enviar}>
              {/* Proveedor opcional de la compra */}
              <Row className="g-2 mb-3">
                <Col md={6} sm={12}>
                  <Form.Label className="small mb-1">Proveedor</Form.Label>
                  <Form.Select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
                    <option value="">Sin proveedor / varios</option>
                    {proveedores.map((p) => (
                      <option key={p.id} value={p.id}>{p.nombre}</option>
                    ))}
                  </Form.Select>
                </Col>
              </Row>

              {lineas.map((linea, indice) => (
                <Row key={indice} className="align-items-end g-2 mb-2">
                  <Col md={5} sm={12}>
                    <Form.Label className="small mb-1">Producto</Form.Label>
                    <Form.Select
                      value={linea.producto_id}
                      onChange={(e) => cambiarLinea(indice, 'producto_id', e.target.value)}
                      required
                    >
                      <option value="">Selecciona un producto…</option>
                      {productos.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre} — stock: {p.stock_actual}
                        </option>
                      ))}
                    </Form.Select>
                  </Col>
                  <Col md={2} xs={4}>
                    <Form.Label className="small mb-1">Cantidad</Form.Label>
                    <Form.Control
                      type="number"
                      min={1}
                      step={1}
                      placeholder="0"
                      value={linea.cantidad}
                      onChange={(e) => cambiarLinea(indice, 'cantidad', e.target.value)}
                      required
                    />
                  </Col>
                  <Col md={4} xs={5}>
                    <Form.Label className="small mb-1">Costo unitario ($) *</Form.Label>
                    <Form.Control
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="0.00"
                      value={linea.costo_unitario}
                      onChange={(e) => cambiarLinea(indice, 'costo_unitario', e.target.value)}
                      required
                    />
                  </Col>
                  <Col md={1} xs={3} className="d-flex gap-1 pb-1">
                    <Button
                      variant="outline-danger"
                      size="sm"
                      title="Quitar línea"
                      onClick={() => quitarLinea(indice)}
                    >
                      <i className="bi bi-x-lg"></i>
                    </Button>
                  </Col>
                </Row>
              ))}

              <Form.Text muted className="d-block mb-2">
                * El costo es obligatorio para valorar el inventario. Usa 0 solo para
                bonificaciones sin costo.
              </Form.Text>

              {hayRepetidos && (
                <Alert variant="warning" className="py-2 small">
                  Hay productos repetidos en las líneas. Cada producto solo puede aparecer una vez.
                </Alert>
              )}

              <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-3">
                <Button variant="outline-secondary" size="sm" onClick={agregarLinea}>
                  <i className="bi bi-plus-lg me-1"></i>Agregar producto
                </Button>
                <div className="text-end">
                  <span className="text-secondary small me-3">
                    Unidades: <strong>{totales.unidades}</strong>
                  </span>
                  <span className="me-3">
                    Costo total: <strong>{formatoMoneda(totales.costoTotal)}</strong>
                  </span>
                  <Button type="submit" variant="primary" disabled={!lineasValidas || hayRepetidos || guardando}>
                    {guardando ? (
                      <span className="spinner-border spinner-border-sm me-1"></span>
                    ) : (
                      <i className="bi bi-check-lg me-1"></i>
                    )}
                    Registrar compra
                  </Button>
                </div>
              </div>
            </Form>
          </Card.Body>
        </Card>

        {/* Ayuda: dónde revisar lo registrado */}
        <Card className="shadow-sm mt-3">
          <Card.Body className="py-3 small text-secondary">
            <i className="bi bi-info-circle me-1"></i>
            Los ingresos quedan en <strong>Reportes → Movimientos</strong> filtrando por motivo{' '}
            <strong>Compra</strong>, junto con su costo unitario.
          </Card.Body>
        </Card>
      </Col>

      {/* Modal de escaneo con cámara (móvil o PC) */}
      <Modal show={camaraAbierta} onHide={() => setCamaraAbierta(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title className="fs-6">Apunta la cámara al código de barras</Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-0">
          <video ref={videoRef} style={{ width: '100%', display: 'block', borderRadius: '0 0 6px 6px' }} muted />
        </Modal.Body>
      </Modal>
    </Row>
  );
};

export default Compras;

