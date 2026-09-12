// src/views/Notas.jsx
// Consulta y creación de NOTAS CORRECTIVAS (crédito y débito): documentos
// electrónicos que corrigen una factura original ante la DIAN.
import { useEffect, useState } from 'react';
import {
  Row, Col, Card, Form, Button, Table, Badge, Spinner, Modal
} from 'react-bootstrap';
import api from '../services/api';
import { abrirTicketNota, abrirPdfNota } from '../services/impresion';
import { formatoMoneda, formatoFechaHora } from '../utils/format';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/ConfigContext';
import AlertaAuto from '../components/AlertaAuto';
import Paginacion from '../components/Paginacion';
import BadgeEstadoDian from '../components/BadgeEstadoDian';

const POR_PAGINA = 10;

const Notas = () => {
  const { usuario } = useAuth();
  const { estaHabilitado } = useConfig();
  const esAdmin = usuario?.rol === 'admin';
  const dianActivo = estaHabilitado('facturacion_electronica_habilitado');

  const [notas, setNotas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  const [tipo, setTipo] = useState('');
  const [estadoDian, setEstadoDian] = useState('');
  const [formatoPdf, setFormatoPdf] = useState('media_carta');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  const [pagina, setPagina] = useState(1);
  const [paginas, setPaginas] = useState(0);
  const [detalle, setDetalle] = useState(null);
  const [mostrarCrear, setMostrarCrear] = useState(false);
  const [creando, setCreando] = useState(false);

  useEffect(() => { cargar(); }, [pagina]);

  const cargar = async (conFiltros = false) => {
    if (conFiltros) setPagina(1);
    setCargando(true);
    setError('');
    try {
      const respuesta = await api.get('/notas', {
        params: {
          tipo: tipo || undefined,
          estado_dian: estadoDian || undefined,
          fecha_desde: fechaDesde || undefined,
          fecha_hasta: fechaHasta || undefined,
          pagina,
          por_pagina: POR_PAGINA
        }
      });
      setNotas(respuesta.data.datos);
      const total = Number(respuesta.headers['x-total-registros'] || 0);
      setPaginas(Math.ceil(total / POR_PAGINA));
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al cargar notas');
    } finally {
      setCargando(false);
    }
  };

  const verDetalle = async (id) => {
    try {
      const respuesta = await api.get(`/notas/${id}`);
      setDetalle(respuesta.data.datos);
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al cargar la nota');
    }
  };

  const anular = async (id) => {
    if (!window.confirm('¿Anular esta nota correctiva?')) return;
    try {
      await api.post(`/notas/${id}/anular`);
      await cargar();
      if (detalle?.id === id) await verDetalle(id);
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al anular la nota');
    }
  };

  const reintentarDian = async (id) => {
    setError('');
    try {
      const respuesta = await api.post(`/notas/${id}/dian`);
      await cargar();
      if (detalle?.id === id) await verDetalle(id);
      setMensaje(respuesta.data?.mensaje || 'Documento electrónico de la nota procesado');
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al procesar el documento DIAN');
    }
  };

  const imprimir = async (tipoArchivo, id, valor = 'carta') => {
    setError('');
    try {
      if (tipoArchivo === 'ticket') await abrirTicketNota(id, valor);
      else await abrirPdfNota(id, valor);
    } catch (err) {
      setError(err.mensaje || err.response?.data?.mensaje || 'Error al generar la impresión');
    }
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4 className="mb-0">Notas correctivas</h4>
        {esAdmin && (
          <Button variant="primary" size="sm" onClick={() => setMostrarCrear(true)}>
            <i className="bi bi-plus-lg me-1"></i>Nueva nota
          </Button>
        )}
      </div>

      <AlertaAuto variante="danger" mensaje={error} onCerrar={() => setError('')} />
      <AlertaAuto variante="success" mensaje={mensaje} onCerrar={() => setMensaje('')} />

      {/* Filtros */}
      <Card className="card-kpi mb-3">
        <Card.Body>
          <Row className="g-2 align-items-end">
            <Col md={3}>
              <Form.Select size="sm" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                <option value="">Tipo: todos</option>
                <option value="credito">Crédito</option>
                <option value="debito">Débito</option>
              </Form.Select>
            </Col>
            <Col md={3}>
              <Form.Select size="sm" value={estadoDian} onChange={(e) => setEstadoDian(e.target.value)}>
                <option value="">DIAN: todos</option>
                <option value="aprobada">Aprobada</option>
                <option value="local">Local</option>
                <option value="pendiente">Pendiente</option>
                <option value="rechazada">Rechazada</option>
              </Form.Select>
            </Col>
            <Col md={2}><Form.Control size="sm" type="date" value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)} /></Col>
            <Col md={2}><Form.Control size="sm" type="date" value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)} /></Col>
            <Col md={2}>
              <Form.Select size="sm" aria-label="Formato del PDF"
                value={formatoPdf} onChange={(e) => setFormatoPdf(e.target.value)}>
                <option value="media_carta">PDF: media carta</option>
                <option value="carta">PDF: carta</option>
              </Form.Select>
            </Col>
            <Col md={1}>
              <Button size="sm" variant="primary" className="mt-2" onClick={() => cargar(true)}>
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
                  <th>Nota</th>
                  <th>Tipo</th>
                  <th>Factura orig.</th>
                  <th>Cliente</th>
                  <th>Motivo</th>
                  <th className="text-end">Total</th>
                  <th>Estado</th>
                  {dianActivo && <th>DIAN</th>}
                  <th className="text-end">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {notas.length === 0 && (
                  <tr><td colSpan={dianActivo ? 9 : 8} className="text-center text-secondary">Sin notas</td></tr>
                )}
                {notas.map((n) => (
                  <tr key={n.id}>
                    <td>{n.prefijo}-{n.numero_nota}</td>
                    <td>
                      <Badge bg={n.tipo === 'credito' ? 'primary' : 'dark'}>
                        {n.tipo === 'credito' ? 'Crédito' : 'Débito'}
                      </Badge>
                    </td>
                    <td className="small">#{n.factura_numero}</td>
                    <td className="small">{n.cliente_nombre || 'Consumidor final'}</td>
                    <td className="small">{n.motivo || '—'}</td>
                    <td className="text-end">{formatoMoneda(n.total)}</td>
                    <td>
                      <Badge bg={n.estado === 'emitida' ? 'success' : 'secondary'}>
                        {n.estado}
                      </Badge>
                    </td>
                    {dianActivo && (
                      <td><BadgeEstadoDian estado={n.estado_dian} /></td>
                    )}
                    <td className="text-end tabla-acciones">
                      <Button size="sm" variant="outline-primary" onClick={() => verDetalle(n.id)}>
                        <i className="bi bi-eye"></i>
                      </Button>{' '}
                      <Button size="sm" variant="outline-dark" onClick={() => imprimir('ticket', n.id, 80)}>
                        <i className="bi bi-printer"></i>
                      </Button>{' '}
                      <Button size="sm" variant="outline-danger" onClick={() => imprimir('pdf', n.id, formatoPdf)}>
                        <i className="bi bi-file-earmark-pdf"></i>
                      </Button>{' '}
                      {dianActivo && (n.estado_dian === 'local' || n.estado_dian === 'rechazada') && (
                        <Button size="sm" variant="outline-warning" title="Reintentar envío DIAN"
                          onClick={() => reintentarDian(n.id)}>
                          <i className="bi bi-arrow-repeat"></i>
                        </Button>
                      )}{' '}
                      {esAdmin && n.estado === 'emitida' && (
                        <Button size="sm" variant="outline-danger" onClick={() => anular(n.id)}>
                          <i className="bi bi-x-circle"></i>
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>

            <Paginacion pagina={pagina} paginas={paginas} onChange={setPagina} />
          </Card.Body>
        </Card>
      )}

      {/* Modal de detalle */}
      <Modal show={!!detalle} onHide={() => setDetalle(null)} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title>{detalle?.tipo === 'credito' ? 'Nota Crédito' : 'Nota Débito'} {detalle?.prefijo}-{detalle?.numero_nota}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {detalle && (
            <>
              <Row className="small mb-3">
                <Col sm={6}>
                  <div><strong>Cliente:</strong> {detalle.cliente_nombre || 'Consumidor final'}</div>
                  <div><strong>Factura original:</strong> #{detalle.factura_numero}</div>
                  <div><strong>Motivo:</strong> {detalle.motivo || '—'}</div>
                </Col>
                <Col sm={6}>
                  <div><strong>Fecha:</strong> {formatoFechaHora(detalle.creado_en)}</div>
                  <div><strong>Estado:</strong> <Badge bg={detalle.estado === 'emitida' ? 'success' : 'secondary'}>{detalle.estado}</Badge></div>
                </Col>
              </Row>
              {dianActivo && (
                <div className="small mb-3 p-2 border rounded bg-light">
                  <div className="d-flex align-items-center gap-2">
                    <strong>Facturación electrónica:</strong>
                    <BadgeEstadoDian estado={detalle.estado_dian} />
                  </div>
                  {detalle.cufe && (
                    <div className="mt-1">
                      <strong>CUDE:</strong>
                      <code className="d-inline-block ms-1" style={{ overflowWrap: 'anywhere' }}>{detalle.cufe}</code>
                    </div>
                  )}
                  {detalle.estado_dian === 'local' || detalle.estado_dian === 'rechazada' ? (
                    <Button size="sm" variant="outline-warning" className="mt-2"
                      onClick={() => reintentarDian(detalle.id)}>
                      <i className="bi bi-arrow-repeat me-1"></i>Reintentar envío DIAN
                    </Button>
                  ) : null}
                </div>
              )}
              <Table responsive size="sm">
                <thead>
                  <tr>
                    <th>Cant</th><th>Producto</th>
                    <th className="text-end">Vlr. Unit</th>
                    <th className="text-end">Imp</th>
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
                <div className="fw-bold fs-5">Total: {formatoMoneda(detalle.total)}</div>
              </div>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-dark" onClick={() => imprimir('ticket', detalle?.id, 80)}>
            <i className="bi bi-printer me-1"></i>Ticket
          </Button>
          <Button variant="outline-primary" onClick={() => imprimir('pdf', detalle?.id, formatoPdf)}>
            <i className="bi bi-file-earmark-pdf me-1"></i>PDF
          </Button>
          {esAdmin && detalle?.estado === 'emitida' && (
            <Button variant="danger" onClick={() => anular(detalle.id)}>
              <i className="bi bi-x-circle me-1"></i>Anular
            </Button>
          )}
          <Button variant="secondary" onClick={() => setDetalle(null)}>Cerrar</Button>
        </Modal.Footer>
      </Modal>

      <CrearNota
        show={mostrarCrear}
        onHide={() => setMostrarCrear(false)}
        esAdmin={esAdmin}
        alCrear={(id) => { setMostrarCrear(false); cargar(true); if (id) verDetalle(id); }}
        setError={setError}
      />
    </div>
  );
};

export default Notas;

// Modal para crear una nota correctiva a partir de una factura original.
const CrearNota = ({ show, onHide, esAdmin, alCrear, setError }) => {
  const [tipo, setTipo] = useState('credito');
  const [facturaId, setFacturaId] = useState('');
  const [motivo, setMotivo] = useState('');
  const [monto, setMonto] = useState('');
  const [opciones, setOpciones] = useState([]);
  const [creando, setCreando] = useState(false);

  useEffect(() => {
    if (show) { cargarFacturas(); setTipo('credito'); setMotivo(''); setMonto(''); setFacturaId(''); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  const cargarFacturas = async () => {
    try {
      const respuesta = await api.get('/facturas', { params: { estado: 'emitida', por_pagina: 50 } });
      setOpciones(respuesta.data.datos || []);
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al cargar facturas');
    }
  };

  const crear = async () => {
    if (!facturaId) { setError('Seleccione la factura original'); return; }
    setCreando(true);
    setError('');
    try {
      const cuerpo = { tipo, factura_original_id: facturaId, motivo: motivo || undefined };
      if (tipo === 'debito') cuerpo.monto = Number(monto);
      if (monto !== '') cuerpo.monto = Number(monto);
      const respuesta = await api.post('/notas', cuerpo);
      alCrear(respuesta.data?.datos?.id);
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al crear la nota');
    } finally {
      setCreando(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>Nueva nota correctiva</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form.Group className="mb-3">
          <Form.Label>Tipo de nota</Form.Label>
          <Form.Select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="credito">Nota crédito (compensa la factura)</option>
            <option value="debito">Nota débito (ajuste adicional)</option>
          </Form.Select>
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label>Factura original</Form.Label>
          <Form.Select value={facturaId} onChange={(e) => setFacturaId(e.target.value)}>
            <option value="">Seleccione una factura emitida…</option>
            {opciones.map((f) => (
              <option key={f.id} value={f.id}>
                #{f.numero_factura} — {f.cliente_nombre || 'Consumidor final'} — {formatoMoneda(f.total)}
              </option>
            ))}
          </Form.Select>
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label>Motivo (opcional)</Form.Label>
          <Form.Control size="sm" placeholder="p. ej. Anulación total, Devolución…"
            value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </Form.Group>
        {tipo === 'debito' && (
          <Form.Group className="mb-3">
            <Form.Label>Monto del ajuste ($)</Form.Label>
            <Form.Control size="sm" type="number" min="0" placeholder="Monto del débito"
              value={monto} onChange={(e) => setMonto(e.target.value)} />
          </Form.Group>
        )}
        {tipo === 'credito' && (
          <Form.Text className="text-muted">
            Por defecto la nota crédito compensa el total de la factura (anulación electrónica).
          </Form.Text>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>Cancelar</Button>
        <Button variant="primary" onClick={crear} disabled={creando}>
          {creando && <span className="spinner-border spinner-border-sm me-1"></span>}
          Crear nota
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
