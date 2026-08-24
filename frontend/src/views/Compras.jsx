// src/views/Compras.jsx
// Compras / ingreso de mercancía: permite al administrador registrar entradas
// de stock con su costo unitario. Cada línea suma inventario, puede actualizar
// el precio de compra del producto y queda como movimiento con motivo 'compra'.
import { useEffect, useMemo, useState } from 'react';
import {
  Row, Col, Card, Form, Button, Table, Spinner, Alert
} from 'react-bootstrap';
import api from '../services/api';
import { formatoMoneda } from '../utils/format';

// Fila vacía del formulario de líneas.
const filaVacia = () => ({ producto_id: '', cantidad: '', costo_unitario: '' });

const Compras = () => {
  const [productos, setProductos] = useState([]);
  const [lineas, setLineas] = useState([filaVacia()]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState(null); // Resumen de la última compra registrada

  // Carga el catálogo de productos activos para los selectores.
  useEffect(() => {
    const cargar = async () => {
      setCargando(true);
      try {
        const resp = await api.get('/productos');
        setProductos(resp.data.datos.filter((p) => p.activo === 1));
      } catch (err) {
        setError(err.response?.data?.mensaje || 'Error al cargar productos');
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

  // Validaciones en pantalla: líneas completas y sin productos repetidos.
  const lineasValidas = lineas.every(
    (l) => l.producto_id && Number(l.cantidad) > 0 && Number.isInteger(Number(l.cantidad))
  );
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
        costo_unitario: l.costo_unitario === '' ? 0 : Number(l.costo_unitario)
      }));
      const resp = await api.post('/compras', { items });
      setExito(resp.data.datos);
      setLineas([filaVacia()]);
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
              de compra y deja el movimiento en el reporte de inventario.
            </p>

            {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}

            {exito && (
              <Alert variant="success" dismissible onClose={() => setExito(null)}>
                <div className="fw-semibold">Compra registrada</div>
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
              {lineas.map((linea, indice) => (
                <Row key={indice} className="align-items-end g-2 mb-2">
                  <Col md={6} sm={12}>
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
                  <Col md={3} xs={5}>
                    <Form.Label className="small mb-1">Costo unitario ($)</Form.Label>
                    <Form.Control
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="Opcional"
                      value={linea.costo_unitario}
                      onChange={(e) => cambiarLinea(indice, 'costo_unitario', e.target.value)}
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
    </Row>
  );
};

export default Compras;
