// src/views/Facturas.jsx
// Consulta de facturas: filtros, detalle, impresión y anulación.
import { useEffect, useState } from 'react';
import {
  Row, Col, Card, Form, Button, Table, Badge, Spinner, Alert, Modal, Pagination
} from 'react-bootstrap';
import api from '../services/api';
import { abrirTicketFactura, abrirPdfFactura } from '../services/impresion';
import { formatoMoneda, formatoFechaHora } from '../utils/format';
import { useAuth } from '../context/AuthContext';

const POR_PAGINA = 10;

const Facturas = () => {
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === 'admin';

  const [facturas, setFacturas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [numero, setNumero] = useState('');
  const [cliente, setCliente] = useState('');
  const [estado, setEstado] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  const [pagina, setPagina] = useState(1);
  const [detalle, setDetalle] = useState(null); // factura a mostrar en modal

  useEffect(() => {
    cargar();
  }, [pagina]);

  const cargar = async (conFiltros = false) => {
    if (conFiltros) setPagina(1);
    setCargando(true);
    setError('');
    try {
      const respuesta = await api.get('/facturas', {
        params: {
          numero: numero || undefined,
          cliente: cliente || undefined,
          estado: estado || undefined,
          fecha_desde: fechaDesde || undefined,
          fecha_hasta: fechaHasta || undefined
        }
      });
      setFacturas(respuesta.data.datos);
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al cargar facturas');
    } finally {
      setCargando(false);
    }
  };

  const verDetalle = async (id) => {
    try {
      const respuesta = await api.get(`/facturas/${id}`);
      setDetalle(respuesta.data.datos);
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al cargar la factura');
    }
  };

  const anular = async (id) => {
    if (!window.confirm('¿Anular esta factura? Se repondrá el stock.')) return;
    try {
      await api.post(`/facturas/${id}/anular`);
      await cargar();
      if (detalle?.id === id) await verDetalle(id);
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al anular la factura');
    }
  };

  // Abre el ticket o el PDF de una factura (el token lo adjunta el interceptor).
  const imprimir = async (tipo, id, valor = 'carta') => {
    setError('');
    try {
      if (tipo === 'ticket') await abrirTicketFactura(id, valor);
      else await abrirPdfFactura(id, valor);
    } catch (err) {
      setError(err.mensaje || err.response?.data?.mensaje || 'Error al generar la impresión');
    }
  };

  const totalPaginas = Math.max(1, Math.ceil(facturas.length / POR_PAGINA));
  const visibles = facturas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4 className="mb-0">Facturas</h4>
      </div>

      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}

      {/* Filtros */}
      <Card className="card-kpi mb-3">
        <Card.Body>
          <Row className="g-2 align-items-end">
            <Col md={2}><Form.Control size="sm" placeholder="N° factura" value={numero}
              onChange={(e) => setNumero(e.target.value)} /></Col>
            <Col md={3}><Form.Control size="sm" placeholder="Cliente" value={cliente}
              onChange={(e) => setCliente(e.target.value)} /></Col>
            <Col md={2}>
              <Form.Select size="sm" value={estado} onChange={(e) => setEstado(e.target.value)}>
                <option value="">Estado: todos</option>
                <option value="emitida">Emitida</option>
                <option value="anulada">Anulada</option>
              </Form.Select>
            </Col>
            <Col md={2}><Form.Control size="sm" type="date" value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)} /></Col>
            <Col md={2}><Form.Control size="sm" type="date" value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)} /></Col>
            <Col md={1}>
              <Button size="sm" variant="primary" className="w-100" onClick={() => cargar(true)}>
                <i className="bi bi-search"></i>
              </Button>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {cargando ? (
        <div className="text-center py-5"><Spinner animation="border" /></div>
      ) : (
        <Card className="card-kpi">
          <Card.Body>
            <Table responsive hover size="sm" className="mb-0">
              <thead>
                <tr>
                  <th>No.</th>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Vendedor</th>
                  <th>Pago</th>
                  <th className="text-end">Total</th>
                  <th>Estado</th>
                  <th className="text-end">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibles.length === 0 && (
                  <tr><td colSpan={8} className="text-center text-secondary">Sin facturas</td></tr>
                )}
                {visibles.map((f) => (
                  <tr key={f.id}>
                    <td>#{f.numero_factura}</td>
                    <td className="small">{formatoFechaHora(f.creado_en)}</td>
                    <td className="small">{f.cliente_nombre || 'Consumidor final'}</td>
                    <td className="small">{f.usuario_nombre}</td>
                    <td className="text-capitalize small">{f.tipo_pago}</td>
                    <td className="text-end">{formatoMoneda(f.total)}</td>
                    <td>
                      <Badge bg={f.estado === 'emitida' ? 'success' : 'secondary'}>
                        {f.estado}
                      </Badge>
                    </td>
                    <td className="text-end tabla-acciones">
                      <Button size="sm" variant="outline-primary" onClick={() => verDetalle(f.id)}>
                        <i className="bi bi-eye"></i>
                      </Button>{' '}
                      <Button size="sm" variant="outline-dark" onClick={() => imprimir('ticket', f.id, 80)}>
                        <i className="bi bi-printer"></i>
                      </Button>{' '}
                      <Button size="sm" variant="outline-danger" onClick={() => imprimir('pdf', f.id, 'carta')}>
                        <i className="bi bi-file-earmark-pdf"></i>
                      </Button>{' '}
                      {esAdmin && f.estado === 'emitida' && (
                        <Button size="sm" variant="outline-danger" onClick={() => anular(f.id)}>
                          <i className="bi bi-x-circle"></i>
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>

            {facturas.length > POR_PAGINA && (
              <div className="d-flex justify-content-center mt-3">
                <Pagination size="sm">
                  {Array.from({ length: totalPaginas }, (_, i) => i + 1).map((p) => (
                    <Pagination.Item key={p} active={p === pagina} onClick={() => setPagina(p)}>
                      {p}
                    </Pagination.Item>
                  ))}
                </Pagination>
              </div>
            )}
          </Card.Body>
        </Card>
      )}

      {/* Modal de detalle */}
      <Modal show={!!detalle} onHide={() => setDetalle(null)} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title>Factura No. {detalle?.numero_factura}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {detalle && (
            <>
              <Row className="small mb-3">
                <Col sm={6}>
                  <div><strong>Cliente:</strong> {detalle.cliente_nombre || 'Consumidor final'}</div>
                  <div><strong>Documento:</strong> {detalle.cliente_documento || '—'}</div>
                  <div><strong>Vendedor:</strong> {detalle.usuario_nombre}</div>
                </Col>
                <Col sm={6}>
                  <div><strong>Fecha:</strong> {formatoFechaHora(detalle.creado_en)}</div>
                  <div><strong>Pago:</strong> <span className="text-capitalize">{detalle.tipo_pago}</span></div>
                  <div><strong>Estado:</strong> <Badge bg={detalle.estado === 'emitida' ? 'success' : 'secondary'}>{detalle.estado}</Badge></div>
                </Col>
              </Row>
              <Table responsive size="sm">
                <thead>
                  <tr>
                    <th>Cant</th><th>Producto</th>
                    <th className="text-end">Vlr. Unit</th>
                    <th className="text-end">IVA %</th>
                    <th className="text-end">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {detalle.detalles.map((d) => (
                    <tr key={d.id}>
                      <td>{d.cantidad}</td>
                      <td>{d.producto_nombre}</td>
                      <td className="text-end">{formatoMoneda(d.precio_unitario)}</td>
                      <td className="text-end">{d.impuesto_porcentaje}%</td>
                      <td className="text-end">{formatoMoneda(d.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <div className="text-end small">
                <div>Subtotal: {formatoMoneda(detalle.subtotal)}</div>
                <div>Impuestos: {formatoMoneda(detalle.impuesto_total)}</div>
                {Number(detalle.descuento) > 0 && <div>Descuento: - {formatoMoneda(detalle.descuento)}</div>}
                <div className="fw-bold fs-5">Total: {formatoMoneda(detalle.total)}</div>
              </div>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-dark" onClick={() => imprimir('ticket', detalle?.id, 80)}>
            <i className="bi bi-printer me-1"></i>Ticket
          </Button>
          <Button variant="outline-primary" onClick={() => imprimir('pdf', detalle?.id, 'carta')}>
            <i className="bi bi-file-earmark-pdf me-1"></i>PDF carta
          </Button>
          {esAdmin && detalle?.estado === 'emitida' && (
            <Button variant="danger" onClick={() => anular(detalle.id)}>
              <i className="bi bi-x-circle me-1"></i>Anular
            </Button>
          )}
          <Button variant="secondary" onClick={() => setDetalle(null)}>Cerrar</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default Facturas;
