// src/views/Arqueo.jsx
// Arqueo de caja (Fase 4): turnos con fondo inicial, control de efectivo en
// vivo y cuadre al cierre. Visible solo si el flag arqueo_habilitado está activo.
import { useEffect, useState } from 'react';
import {
  Row, Col, Card, Form, Button, Alert, Table, Badge, Spinner, InputGroup
} from 'react-bootstrap';
import api from '../services/api';
import { useConfig } from '../context/ConfigContext';
import { formatoMoneda } from '../utils/format';

const Arqueo = () => {
  const { estaHabilitado } = useConfig();
  const activo = estaHabilitado('arqueo_habilitado');

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState(null); // resultado del último cierre
  const [resumen, setResumen] = useState(null);
  const [historial, setHistorial] = useState([]);

  // Formulario de apertura.
  const [montoApertura, setMontoApertura] = useState('');

  // Formulario de cierre.
  const [cerrando, setCerrando] = useState(false);
  const [montoContado, setMontoContado] = useState('');
  const [observaciones, setObservaciones] = useState('');

  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (activo) cargarDatos();
    else setCargando(false);
  }, [activo]);

  const cargarDatos = async () => {
    setCargando(true);
    setError('');
    try {
      const [respActual, respHistorial] = await Promise.all([
        api.get('/turnos/actual'),
        api.get('/turnos')
      ]);
      setResumen(respActual.data.datos);
      setHistorial(respHistorial.data.datos || []);
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al cargar el arqueo');
    } finally {
      setCargando(false);
    }
  };

  const abrirTurno = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setError('');
    try {
      await api.post('/turnos/abrir', { monto_apertura: montoApertura });
      setMontoApertura('');
      await cargarDatos();
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al abrir el turno');
    } finally {
      setGuardando(false);
    }
  };

  const cerrarTurno = async () => {
    if (!window.confirm('¿Cerrar el turno con el efectivo contado indicado?')) return;
    setGuardando(true);
    setError('');
    try {
      const respuesta = await api.post('/turnos/cerrar', {
        monto_real: montoContado,
        observaciones
      });
      setAviso(respuesta.data.datos);
      setCerrando(false);
      setMontoContado('');
      setObservaciones('');
      await cargarDatos();
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al cerrar el turno');
    } finally {
      setGuardando(false);
    }
  };

  // Vista previa de la diferencia mientras se digita el conteo.
  const diferenciaPrevista =
    resumen?.turno_abierto && montoContado !== ''
      ? Number(montoContado) - resumen.efectivo_esperado
      : null;

  if (!activo) {
    return (
      <div>
        <h4 className="mb-3">Arqueo de caja</h4>
        <Alert variant="info">
          El módulo de arqueo está deshabilitado. Un administrador puede activarlo
          en <strong>Configuración</strong>.
        </Alert>
      </div>
    );
  }

  if (cargando) {
    return <div className="text-center py-5"><Spinner animation="border" /></div>;
  }

  return (
    <div>
      <h4 className="mb-3">Arqueo de caja</h4>
      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}

      {/* Resultado del último cierre */}
      {aviso && (
        <Alert variant={Number(aviso.diferencia) === 0 ? 'success' : Number(aviso.diferencia) > 0 ? 'warning' : 'danger'}
          dismissible onClose={() => setAviso(null)}>
          <strong>Turno #{aviso.id} cerrado.</strong>{' '}
          Esperado {formatoMoneda(aviso.monto_esperado)} · Contado {formatoMoneda(aviso.monto_real)} ·{' '}
          Diferencia{' '}
          <strong>
            {formatoMoneda(aviso.diferencia)}
            {Number(aviso.diferencia) === 0 ? ' (cuadrado)' : Number(aviso.diferencia) > 0 ? ' (sobrante)' : ' (faltante)'}
          </strong>
        </Alert>
      )}

      <Row className="g-3">
        <Col lg={6}>
          {resumen?.turno_abierto ? (
            /* Turno en curso */
            <Card className="card-kpi h-100">
              <Card.Body>
                <Card.Title className="fs-6 d-flex justify-content-between align-items-center">
                  Turno #{resumen.turno.id}
                  <Badge bg="success">Abierto</Badge>
                </Card.Title>
                <p className="text-secondary small mb-3">
                  Apertura: {new Date(resumen.turno.fecha_apertura).toLocaleString()}
                </p>

                <div className="border-top pt-2">
                  <FilaMonto etiqueta="Fondo inicial" valor={resumen.turno.monto_apertura} />
                  <FilaMonto etiqueta="Ventas en efectivo" valor={resumen.ventas_efectivo} />
                  <div className="d-flex justify-content-between mt-2 border-top pt-2">
                    <span className="fw-bold">Efectivo esperado</span>
                    <span className="fw-bold text-primary">{formatoMoneda(resumen.efectivo_esperado)}</span>
                  </div>
                </div>

                {!cerrando ? (
                  <Button variant="outline-danger" className="w-100 mt-3"
                    onClick={() => { setCerrando(true); setMontoContado(''); }}>
                    <i className="bi bi-stop-circle me-2"></i>Cerrar turno
                  </Button>
                ) : (
                  <>
                    <InputGroup size="sm" className="mt-3">
                      <InputGroup.Text>Efectivo contado $</InputGroup.Text>
                      <Form.Control type="number" min={0} value={montoContado}
                        onChange={(e) => setMontoContado(e.target.value)}
                        onWheel={(e) => e.currentTarget.blur()} />
                    </InputGroup>
                    <Form.Control size="sm" className="mt-2" placeholder="Observaciones (opcional)"
                      value={observaciones}
                      onChange={(e) => setObservaciones(e.target.value)} />
                    {diferenciaPrevista !== null && Number.isFinite(diferenciaPrevista) && (
                      <Alert variant={
                        diferenciaPrevista === 0 ? 'success' : diferenciaPrevista > 0 ? 'warning' : 'danger'
                      } className="py-2 small mt-2 mb-0">
                        Diferencia prevista: {formatoMoneda(diferenciaPrevista)}
                        {diferenciaPrevista === 0 ? ' (cuadrado)' : diferenciaPrevista > 0 ? ' (sobrante)' : ' (faltante)'}
                      </Alert>
                    )}
                    <div className="d-flex gap-2 mt-3">
                      <Button variant="secondary" onClick={() => setCerrando(false)}>Cancelar</Button>
                      <Button variant="danger" disabled={montoContado === '' || guardando} onClick={cerrarTurno}>
                        {guardando ? 'Cerrando…' : 'Confirmar cierre'}
                      </Button>
                    </div>
                  </>
                )}
              </Card.Body>
            </Card>
          ) : (
            /* Sin turno abierto: formulario de apertura */
            <Card className="card-kpi h-100">
              <Card.Body>
                <Card.Title className="fs-6">Abrir turno</Card.Title>
                <p className="text-secondary small">
                  Indica el fondo inicial de efectivo con el que arranca la caja.
                </p>
                <Form onSubmit={abrirTurno}>
                  <InputGroup size="sm">
                    <InputGroup.Text>Fondo inicial $</InputGroup.Text>
                    <Form.Control type="number" min={0} required value={montoApertura}
                      onChange={(e) => setMontoApertura(e.target.value)}
                      onWheel={(e) => e.currentTarget.blur()} />
                  </InputGroup>
                  <Button variant="primary" type="submit" className="w-100 mt-3"
                    disabled={guardando}>
                    {guardando ? 'Abriendo…' : <><i className="bi bi-play-circle me-2"></i>Abrir turno</>}
                  </Button>
                </Form>
              </Card.Body>
            </Card>
          )}
        </Col>

        <Col lg={6}>
          {/* Historial de turnos */}
          <Card className="card-kpi h-100">
            <Card.Body>
              <Card.Title className="fs-6">Historial de turnos</Card.Title>
              {historial.length === 0 && (
                <p className="text-secondary small mb-0">Aún no hay turnos registrados.</p>
              )}
              {historial.length > 0 && (
                <div className="table-responsive">
                  <Table striped hover size="sm" className="mb-0">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Cajero</th>
                        <th>Apertura</th>
                        <th>Cierre</th>
                        <th className="text-end">Esperado</th>
                        <th className="text-end">Contado</th>
                        <th className="text-end">Dif.</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historial.map((t) => (
                        <tr key={t.id}>
                          <td>{t.id}</td>
                          <td className="small">{t.usuario_nombre}</td>
                          <td className="small">{new Date(t.fecha_apertura).toLocaleString()}</td>
                          <td className="small">{t.fecha_cierre ? new Date(t.fecha_cierre).toLocaleString() : '—'}</td>
                          <td className="text-end small">{t.monto_esperado != null ? formatoMoneda(t.monto_esperado) : '—'}</td>
                          <td className="text-end small">{t.monto_real != null ? formatoMoneda(t.monto_real) : '—'}</td>
                          <td className="text-end small">
                            {t.diferencia == null ? '—' : (
                              <Badge bg={Number(t.diferencia) === 0 ? 'success' : Number(t.diferencia) > 0 ? 'warning' : 'danger'}>
                                {formatoMoneda(t.diferencia)}
                              </Badge>
                            )}
                          </td>
                          <td>
                            <Badge bg={t.estado === 'abierto' ? 'success' : 'secondary'}>{t.estado}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

const FilaMonto = ({ etiqueta, valor }) => (
  <div className="d-flex justify-content-between small text-secondary py-1">
    <span>{etiqueta}</span>
    <span>{formatoMoneda(valor)}</span>
  </div>
);

export default Arqueo;
