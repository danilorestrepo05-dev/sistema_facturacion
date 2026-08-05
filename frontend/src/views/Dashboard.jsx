// src/views/Dashboard.jsx
// Vista de inicio: indicadores clave (KPIs) y gráficos fáciles de leer.
import { useEffect, useState } from 'react';
import { Row, Col, Card, ListGroup, Badge, Spinner, Alert } from 'react-bootstrap';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, BarChart, Bar, Legend
} from 'recharts';
import api from '../services/api';
import { formatoMoneda, ultimosDias, formatoCorto } from '../utils/format';

// Paleta de colores para los gráficos.
const PALETA = ['#0d6efd', '#20c997', '#ffc107', '#dc3545', '#6f42c1', '#0dcaf0'];

const Dashboard = () => {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [ventas, setVentas] = useState(null);
  const [inventario, setInventario] = useState(null);
  const [tendencia, setTendencia] = useState([]);
  const [facturasRecientes, setFacturasRecientes] = useState([]);

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    setCargando(true);
    setError('');
    try {
      // Fechas de los últimos 7 días para la tendencia.
      const dias = ultimosDias(7);
      const fechaDesde = dias[0];
      const fechaHasta = dias[dias.length - 1];

      const [respVentas, respInventario, respDiarias, respFacturas] = await Promise.all([
        api.get('/reportes/ventas'),
        api.get('/reportes/inventario'),
        api.get('/reportes/ventas/diarias', { params: { fecha_desde: fechaDesde, fecha_hasta: fechaHasta } }),
        api.get('/facturas', { params: { estado: 'emitida' } })
      ]);

      setVentas(respVentas.data.datos);
      setInventario(respInventario.data.datos);
      setFacturasRecientes(respFacturas.data.datos.slice(0, 6));

      // Completa los días sin ventas con 0 para que el gráfico se vea completo.
      const mapa = new Map(respDiarias.data.datos.map((d) => [d.fecha, d.total]));
      setTendencia(
        dias.map((fecha) => ({
          fecha: formatoCorto(fecha),
          total: mapa.get(fecha) || 0
        }))
      );
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al cargar el dashboard');
    } finally {
      setCargando(false);
    }
  };

  if (cargando) {
    return <div className="text-center py-5"><Spinner animation="border" /></div>;
  }

  if (error) {
    return <Alert variant="danger">{error}</Alert>;
  }

  const resumen = ventas?.resumen || {};
  const resumenInv = inventario?.resumen || {};
  const tipoPago = ventas?.por_tipo_pago || [];
  const topProductos = ventas?.productos_mas_vendidos || [];
  const bajoStock = inventario?.bajo_stock || [];
  const porCategoria = inventario?.por_categoria || [];

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h4 className="mb-0">Dashboard</h4>
        <ButtonRefrescar alCargar={cargarDatos} />
      </div>

      {/* Indicadores clave (KPIs) */}
      <Row className="g-3 mb-4">
        <TarjetaKpi icono="bi-cash-stack" color="#0d6efd" etiqueta="Ventas de hoy"
          valor={formatoMoneda(resumen.total_emitidas)} />
        <TarjetaKpi icono="bi-receipt" color="#20c997" etiqueta="Facturas de hoy"
          valor={resumen.cantidad_facturas} />
        <TarjetaKpi icono="bi-arrow-down-up" color="#6f42c1" etiqueta="Ticket promedio"
          valor={formatoMoneda(resumen.promedio_emitidas)} />
        <TarjetaKpi icono="bi-x-circle" color="#dc3545" etiqueta="Anuladas hoy"
          valor={resumen.total_anuladas} />
        <TarjetaKpi icono="bi-exclamation-triangle" color="#fd7e14" etiqueta="Bajo stock"
          valor={bajoStock.length} />
        <TarjetaKpi icono="bi-box-seam" color="#0dcaf0" etiqueta="Valor inventario"
          valor={formatoMoneda(resumenInv.valor_inventario)} />
      </Row>

      {/* Gráficos principales */}
      <Row className="g-3">
        <Col lg={8}>
          <Card className="card-kpi h-100">
            <Card.Body>
              <Card.Title className="fs-6">Ventas de los últimos 7 días</Card.Title>
              <div className="contenedor-grafico">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={tendencia}>
                    <defs>
                      <linearGradient id="gradVentas" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0d6efd" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#0d6efd" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="fecha" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} width={70}
                      tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
                    <Tooltip formatter={(v) => [formatoMoneda(v), 'Ventas']} />
                    <Area type="monotone" dataKey="total" stroke="#0d6efd" strokeWidth={2}
                      fill="url(#gradVentas)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col lg={4}>
          <Card className="card-kpi h-100">
            <Card.Body>
              <Card.Title className="fs-6">Ventas por tipo de pago</Card.Title>
              {tipoPago.length === 0 ? (
                <p className="text-secondary small mt-4 text-center">Sin ventas registradas hoy</p>
              ) : (
                <div className="contenedor-grafico-sm">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={tipoPago} dataKey="total" nameKey="tipo_pago" innerRadius={45}
                        outerRadius={80} paddingAngle={3}>
                        {tipoPago.map((_, i) => (
                          <Cell key={i} fill={PALETA[i % PALETA.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => formatoMoneda(v)} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>

        <Col lg={5}>
          <Card className="card-kpi h-100">
            <Card.Body>
              <Card.Title className="fs-6">Productos más vendidos</Card.Title>
              {topProductos.length === 0 ? (
                <p className="text-secondary small mt-4 text-center">Sin ventas registradas hoy</p>
              ) : (
                <div className="contenedor-grafico">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topProductos} layout="vertical" margin={{ left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
                      <YAxis type="category" dataKey="producto_nombre" width={130}
                        tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => [v, 'Unidades vendidas']} />
                      <Bar dataKey="cantidad_vendida" fill="#20c997" radius={[0, 6, 6, 0]} barSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>

        <Col lg={4}>
          <Card className="card-kpi h-100">
            <Card.Body>
              <Card.Title className="fs-6">
                Alertas de stock
                <Badge bg="danger" className="ms-2">{bajoStock.length}</Badge>
              </Card.Title>
              {bajoStock.length === 0 ? (
                <p className="text-secondary small mt-4 text-center">
                  <i className="bi bi-check-circle text-success me-1"></i>
                  Todo el inventario está en buen nivel
                </p>
              ) : (
                <ListGroup variant="flush">
                  {bajoStock.slice(0, 6).map((p) => (
                    <ListGroup.Item key={p.id} className="d-flex justify-content-between align-items-center px-0">
                      <div>
                        <div className="fw-semibold small">{p.nombre}</div>
                        <div className="text-secondary small">{p.codigo}</div>
                      </div>
                      <Badge bg={p.stock_actual <= 0 ? 'danger' : 'warning'}>
                        {p.stock_actual} / mín {p.stock_minimo}
                      </Badge>
                    </ListGroup.Item>
                  ))}
                </ListGroup>
              )}
            </Card.Body>
          </Card>
        </Col>

        <Col lg={3}>
          <Card className="card-kpi h-100">
            <Card.Body>
              <Card.Title className="fs-6">Inventario por categoría</Card.Title>
              {porCategoria.length === 0 ? (
                <p className="text-secondary small mt-4 text-center">Sin categorías</p>
              ) : (
                <ListGroup variant="flush">
                  {porCategoria.map((c) => (
                    <ListGroup.Item key={c.id} className="d-flex justify-content-between align-items-center px-0">
                      <span className="small">{c.nombre}</span>
                      <span className="badge text-bg-light">{c.unidades} uds</span>
                    </ListGroup.Item>
                  ))}
                </ListGroup>
              )}
              <hr />
              <div className="small text-secondary">Últimas facturas</div>
              {facturasRecientes.map((f) => (
                <div key={f.id} className="d-flex justify-content-between small py-1">
                  <span>#{f.numero_factura} · {f.cliente_nombre || 'Consumidor'}</span>
                  <span className="fw-semibold">{formatoMoneda(f.total)}</span>
                </div>
              ))}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

// Botón para refrescar los datos del dashboard.
const ButtonRefrescar = ({ alCargar }) => (
  <button className="btn btn-outline-secondary btn-sm" onClick={alCargar}>
    <i className="bi bi-arrow-clockwise me-1"></i>Actualizar
  </button>
);

// Tarjeta de indicador clave (KPI).
const TarjetaKpi = ({ icono, color, etiqueta, valor }) => (
  <Col md={4} xl={2}>
    <Card className="card-kpi h-100">
      <Card.Body className="d-flex align-items-center gap-3">
        <div className="kpi-icono" style={{ backgroundColor: `${color}1a`, color }}>
          <i className={`bi ${icono}`}></i>
        </div>
        <div className="min-w-0">
          <div className="kpi-valor">{valor}</div>
          <div className="kpi-etiqueta">{etiqueta}</div>
        </div>
      </Card.Body>
    </Card>
  </Col>
);

export default Dashboard;
