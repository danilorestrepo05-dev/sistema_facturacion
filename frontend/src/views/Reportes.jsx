// src/views/Reportes.jsx
// Reportes de ventas (rango de fechas) e inventario, con gráficos recharts.
import { useEffect, useState } from 'react';
import { Row, Col, Card, Form, Button, Table, Spinner, Alert, Nav, Tab, Badge } from 'react-bootstrap';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line
} from 'recharts';
import api from '../services/api';
import { formatoMoneda, formatoFechaHora, fechaHoyLocal } from '../utils/format';

const COLORS = ['#5d3fd3', '#0dcaf0', '#198754', '#fd7e14', '#dc3545', '#6f42c1'];

const Reportes = () => {
  const [tabActiva, setTabActiva] = useState('ventas');
  const [fechaDesde, setFechaDesde] = useState(fechaHoyLocal());
  const [fechaHasta, setFechaHasta] = useState(fechaHoyLocal());

  const [ventas, setVentas] = useState(null);
  const [diarias, setDiarias] = useState([]);
  const [inventario, setInventario] = useState(null);
  const [movimientos, setMovimientos] = useState(null);
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroMotivo, setFiltroMotivo] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  // Convierte a número cualquier valor (null, string, undefined) para no crashear.
  const numero = (valor) => Number(valor ?? 0);

  // Marca local de generación para el encabezado de la impresión.
  const fechaHoraGeneracion = (() => {
    const ahora = new Date();
    const hora = String(ahora.getHours()).padStart(2, '0');
    const minuto = String(ahora.getMinutes()).padStart(2, '0');
    return `${fechaHoyLocal()} ${hora}:${minuto}`;
  })();

  const cargarVentas = async (e) => {
    e?.preventDefault();
    if (fechaDesde > fechaHasta) {
      setError('La fecha desde no puede ser mayor que la fecha hasta');
      return;
    }
    setCargando(true);
    setError('');
    try {
      const params = { fecha_desde: fechaDesde, fecha_hasta: fechaHasta };
      const [respVentas, respDiarias] = await Promise.all([
        api.get('/reportes/ventas', { params }),
        api.get('/reportes/ventas/diarias', { params })
      ]);
      setVentas(respVentas.data.datos);
      setDiarias(respDiarias.data.datos);
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al generar el reporte de ventas');
    } finally {
      setCargando(false);
    }
  };

  const cargarInventario = async () => {
    setCargando(true);
    setError('');
    try {
      const respuesta = await api.get('/reportes/inventario');
      setInventario(respuesta.data.datos);
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al generar el reporte de inventario');
    } finally {
      setCargando(false);
    }
  };

  const cargarMovimientos = async (e) => {
    e?.preventDefault();
    if (fechaDesde > fechaHasta) {
      setError('La fecha desde no puede ser mayor que la fecha hasta');
      return;
    }
    setCargando(true);
    setError('');
    try {
      const params = {
        fecha_desde: fechaDesde,
        fecha_hasta: fechaHasta,
        tipo: filtroTipo || undefined,
        motivo: filtroMotivo || undefined
      };
      const respuesta = await api.get('/reportes/movimientos', { params });
      setMovimientos(respuesta.data.datos);
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al generar el reporte de movimientos');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargarInventario(); }, []);

  const resumen = ventas?.resumen;
  // El rango de fechas es válido cuando Desde no supera a Hasta.
  const rangoValido = !fechaDesde || !fechaHasta || fechaDesde <= fechaHasta;

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3 no-print">
        <h4 className="mb-0">Reportes</h4>
        <Button variant="outline-secondary" onClick={() => window.print()}>
          <i className="bi bi-printer me-1"></i>Imprimir reporte
        </Button>
      </div>

      {error && <Alert variant="danger" className="no-print" dismissible onClose={() => setError('')}>{error}</Alert>}

      <div className="contenido-pantalla">
      <Tab.Container activeKey={tabActiva} onSelect={(k) => setTabActiva(k)}>
        <Nav variant="tabs" className="mb-3 no-print">
          <Nav.Item><Nav.Link eventKey="ventas"><i className="bi bi-graph-up me-1"></i>Ventas</Nav.Link></Nav.Item>
          <Nav.Item><Nav.Link eventKey="inventario"><i className="bi bi-box-seam me-1"></i>Inventario</Nav.Link></Nav.Item>
          <Nav.Item><Nav.Link eventKey="movimientos"><i className="bi bi-arrow-left-right me-1"></i>Movimientos</Nav.Link></Nav.Item>
        </Nav>

        <Tab.Content>
          <Tab.Pane eventKey="ventas">
            <Card className="card-kpi mb-3 no-print">
              <Card.Body>
                <Form onSubmit={cargarVentas}>
                  <Row className="g-2 align-items-end">
                    <Col md={3}>
                      <Form.Label className="small">Desde</Form.Label>
                      <Form.Control type="date" value={fechaDesde}
                        onChange={(e) => setFechaDesde(e.target.value)} />
                    </Col>
                    <Col md={3}>
                      <Form.Label className="small">Hasta</Form.Label>
                      <Form.Control type="date" value={fechaHasta}
                        onChange={(e) => setFechaHasta(e.target.value)} />
                    </Col>
                    <Col md={2}>
                      <Button type="submit" variant="primary" className="w-100" disabled={!rangoValido}>
                        <i className="bi bi-play-fill me-1"></i>Generar
                      </Button>
                    </Col>
                  </Row>
                </Form>
              </Card.Body>
            </Card>

            {cargando ? (
              <div className="text-center py-5"><Spinner animation="border" /></div>
            ) : ventas && (
              <>
                {/* Tarjetas de resumen */}
                <Row className="mb-3">
                  <Col sm={6} xl={4} className="mb-3">
                    <Card className="card-kpi h-100 text-center">
                      <Card.Body>
                        <div className="kpi-etiqueta">Facturas emitidas</div>
                        <div className="kpi-valor">{resumen?.cantidad_facturas ?? 0}</div>
                      </Card.Body>
                    </Card>
                  </Col>
                  <Col sm={6} xl={4} className="mb-3">
                    <Card className="card-kpi h-100 text-center">
                      <Card.Body>
                        <div className="kpi-etiqueta">Total vendido</div>
                        <div className="kpi-valor">{formatoMoneda(resumen?.total_emitidas)}</div>
                      </Card.Body>
                    </Card>
                  </Col>
                  <Col sm={6} xl={4} className="mb-3">
                    <Card className="card-kpi h-100 text-center">
                      <Card.Body>
                        <div className="kpi-etiqueta">Ticket promedio</div>
                        <div className="kpi-valor">{formatoMoneda(resumen?.promedio_emitidas)}</div>
                      </Card.Body>
                    </Card>
                  </Col>
                </Row>

                {/* Tendencia diaria */}
                <Card className="card-kpi mb-3">
                  <Card.Header className="fw-semibold">Ventas diarias</Card.Header>
                  <Card.Body>
                    <div className="contenedor-grafico">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={diarias}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="fecha" tick={{ fontSize: 12 }} />
                          <YAxis tickFormatter={(v) => `$${v.toLocaleString('es-CO')}`} tick={{ fontSize: 11 }} />
                          <Tooltip formatter={(v) => formatoMoneda(v)} />
                          <Line type="monotone" dataKey="total" name="Total" stroke="#5d3fd3" strokeWidth={2} dot={{ r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </Card.Body>
                </Card>

                <Row>
                  {/* Por tipo de pago */}
                  <Col xl={6} className="mb-3">
                    <Card className="card-kpi h-100">
                      <Card.Header className="fw-semibold">Ventas por tipo de pago</Card.Header>
                      <Card.Body>
                        <div className="contenedor-grafico">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie data={ventas.por_tipo_pago} dataKey="total" nameKey="tipo_pago" outerRadius={80}
                                label={(d) => d.name}>
                                {ventas.por_tipo_pago.map((_, i) => (
                                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                                ))}
                              </Pie>
                              <Legend />
                              <Tooltip formatter={(v) => formatoMoneda(v)} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </Card.Body>
                    </Card>
                  </Col>

                  {/* Top productos */}
                  <Col xl={6} className="mb-3">
                    <Card className="card-kpi h-100">
                      <Card.Header className="fw-semibold">Top productos vendidos</Card.Header>
                      <Card.Body>
                        <div className="contenedor-grafico">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={ventas.productos_mas_vendidos} layout="vertical"
                              margin={{ left: 40 }}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis type="number" tick={{ fontSize: 11 }} />
                              <YAxis type="category" dataKey="producto_nombre" width={120} tick={{ fontSize: 11 }} />
                              <Tooltip formatter={(v) => v.toLocaleString('es-CO')} />
                              <Bar dataKey="cantidad_vendida" name="Cantidad" fill="#0dcaf0" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </Card.Body>
                    </Card>
                  </Col>
                </Row>

                {/* Ventas por usuario */}
                <Card className="card-kpi">
                  <Card.Header className="fw-semibold">Ventas por vendedor</Card.Header>
                  <Card.Body>
                    <Table responsive size="sm" className="mb-0">
                      <thead>
                        <tr><th>Vendedor</th><th className="text-end">Facturas</th><th className="text-end">Total</th></tr>
                      </thead>
                      <tbody>
                        {ventas.por_usuario.map((u) => (
                          <tr key={u.nombre_completo}>
                            <td>{u.nombre_completo}</td>
                            <td className="text-end">{u.cantidad}</td>
                            <td className="text-end">{formatoMoneda(u.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </Card.Body>
                </Card>
              </>
            )}
          </Tab.Pane>

          <Tab.Pane eventKey="inventario">
            {cargando ? (
              <div className="text-center py-5"><Spinner animation="border" /></div>
            ) : inventario && (
              <>
                <Row className="mb-3">
                  <Col sm={6} xl={4} className="mb-3">
                    <Card className="card-kpi h-100 text-center">
                      <Card.Body>
                        <div className="kpi-etiqueta">Productos activos</div>
                        <div className="kpi-valor">{inventario?.resumen?.cantidad_productos ?? 0}</div>
                      </Card.Body>
                    </Card>
                  </Col>
                  <Col sm={6} xl={4} className="mb-3">
                    <Card className="card-kpi h-100 text-center">
                      <Card.Body>
                        <div className="kpi-etiqueta">Unidades en stock</div>
                        <div className="kpi-valor">{numero(inventario?.resumen?.unidades_en_stock).toLocaleString('es-CO')}</div>
                      </Card.Body>
                    </Card>
                  </Col>
                  <Col sm={6} xl={4} className="mb-3">
                    <Card className="card-kpi h-100 text-center">
                      <Card.Body>
                        <div className="kpi-etiqueta">Valor del inventario</div>
                        <div className="kpi-valor">{formatoMoneda(inventario?.resumen?.valor_inventario)}</div>
                      </Card.Body>
                    </Card>
                  </Col>
                </Row>

                <Row>
                  <Col xl={6} className="mb-3">
                    <Card className="card-kpi h-100">
                      <Card.Header className="fw-semibold">Inventario por categoría</Card.Header>
                      <Card.Body>
                        <div className="contenedor-grafico">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={inventario.por_categoria}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="nombre" tick={{ fontSize: 11 }} />
                              <YAxis tick={{ fontSize: 11 }} />
                              <Tooltip formatter={(v) => v.toLocaleString('es-CO')} />
                              <Bar dataKey="unidades" name="Unidades" fill="#198754" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </Card.Body>
                    </Card>
                  </Col>
                  <Col xl={6} className="mb-3">
                    <Card className="card-kpi h-100">
                      <Card.Header className="fw-semibold">Productos bajo stock</Card.Header>
                      <Card.Body>
                        <Table responsive size="sm" className="mb-0">
                          <thead>
                            <tr><th>Código</th><th>Producto</th><th className="text-end">Stock</th><th className="text-end">Mínimo</th></tr>
                          </thead>
                          <tbody>
                            {inventario.bajo_stock.length === 0 && (
                              <tr><td colSpan={4} className="text-center text-secondary">Sin productos bajo stock</td></tr>
                            )}
                            {inventario.bajo_stock.map((p) => (
                              <tr key={p.id}>
                                <td className="small">{p.codigo}</td>
                                <td>{p.nombre}</td>
                                <td className="text-end">{p.stock_actual}</td>
                                <td className="text-end">{p.stock_minimo}</td>
                              </tr>
                            ))}
                          </tbody>
                        </Table>
                      </Card.Body>
                    </Card>
                  </Col>
                </Row>
              </>
            )}
          </Tab.Pane>

          <Tab.Pane eventKey="movimientos">
            <Card className="card-kpi mb-3 no-print">
              <Card.Body>
                <Form onSubmit={cargarMovimientos}>
                  <Row className="g-2 align-items-end">
                    <Col md={3}>
                      <Form.Label className="small">Desde</Form.Label>
                      <Form.Control type="date" value={fechaDesde}
                        onChange={(e) => setFechaDesde(e.target.value)} />
                    </Col>
                    <Col md={3}>
                      <Form.Label className="small">Hasta</Form.Label>
                      <Form.Control type="date" value={fechaHasta}
                        onChange={(e) => setFechaHasta(e.target.value)} />
                    </Col>
                    <Col md={2}>
                      <Form.Label className="small">Tipo</Form.Label>
                      <Form.Select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
                        <option value="">Todos</option>
                        <option value="entrada">Entradas</option>
                        <option value="salida">Salidas</option>
                      </Form.Select>
                    </Col>
                    <Col md={2}>
                      <Form.Label className="small">Motivo</Form.Label>
                      <Form.Select value={filtroMotivo} onChange={(e) => setFiltroMotivo(e.target.value)}>
                        <option value="">Todos</option>
                        <option value="venta">Venta</option>
                        <option value="compra">Compra</option>
                        <option value="ajuste">Ajuste</option>
                        <option value="anulacion">Anulación</option>
                      </Form.Select>
                    </Col>
                    <Col md={2}>
                      <Button type="submit" variant="primary" className="w-100" disabled={!rangoValido}>
                        <i className="bi bi-play-fill me-1"></i>Generar
                      </Button>
                    </Col>
                  </Row>
                </Form>
              </Card.Body>
            </Card>

            {!rangoValido && (
              <Alert variant="warning" className="mb-3 no-print">
                La fecha "Desde" no puede ser mayor que la fecha "Hasta".
              </Alert>
            )}

            {cargando ? (
              <div className="text-center py-5"><Spinner animation="border" /></div>
            ) : movimientos && (
              <>
                <Row className="mb-3">
                  <Col sm={6} xl={4} className="mb-3">
                    <Card className="card-kpi h-100 text-center">
                      <Card.Body>
                        <div className="kpi-etiqueta">Total movimientos</div>
                        <div className="kpi-valor">{numero(movimientos?.resumen?.total)}</div>
                      </Card.Body>
                    </Card>
                  </Col>
                  <Col sm={6} xl={4} className="mb-3">
                    <Card className="card-kpi h-100 text-center">
                      <Card.Body>
                        <div className="kpi-etiqueta">Unidades entrada</div>
                        <div className="kpi-valor text-success">
                          +{numero(movimientos?.resumen?.unidades_entrada).toLocaleString('es-CO')}
                        </div>
                      </Card.Body>
                    </Card>
                  </Col>
                  <Col sm={6} xl={4} className="mb-3">
                    <Card className="card-kpi h-100 text-center">
                      <Card.Body>
                        <div className="kpi-etiqueta">Unidades salida</div>
                        <div className="kpi-valor text-danger">
                          -{numero(movimientos?.resumen?.unidades_salida).toLocaleString('es-CO')}
                        </div>
                      </Card.Body>
                    </Card>
                  </Col>
                </Row>

                <Card className="card-kpi mb-3">
                  <Card.Header className="fw-semibold">Movimientos por motivo</Card.Header>
                  <Card.Body>
                    <Table responsive size="sm" className="mb-0">
                      <thead>
                        <tr><th>Motivo</th><th>Tipo</th><th className="text-end">Registros</th><th className="text-end">Unidades</th></tr>
                      </thead>
                      <tbody>
                        {(movimientos?.resumen?.por_motivo || []).length === 0 && (
                          <tr><td colSpan={4} className="text-center text-secondary">Sin movimientos</td></tr>
                        )}
                        {(movimientos?.resumen?.por_motivo || []).map((m, i) => (
                          <tr key={i}>
                            <td className="text-capitalize">{m.motivo}</td>
                            <td><Badge bg={m.tipo === 'entrada' ? 'success' : 'danger'}>{m.tipo}</Badge></td>
                            <td className="text-end">{m.cantidad}</td>
                            <td className="text-end">{m.unidades}</td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </Card.Body>
                </Card>

                <Card className="card-kpi">
                  <Card.Header className="fw-semibold">Detalle de movimientos</Card.Header>
                  <Card.Body>
                    <Table responsive hover size="sm" className="mb-0">
                      <thead>
                        <tr>
                          <th>Fecha</th><th>Producto</th><th>Tipo</th>
                          <th className="text-end">Cantidad</th><th>Motivo</th><th className="text-end">Factura</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(movimientos?.detalle || []).length === 0 && (
                          <tr><td colSpan={6} className="text-center text-secondary">Sin movimientos</td></tr>
                        )}
                        {(movimientos?.detalle || []).map((m) => (
                          <tr key={m.id}>
                            <td className="small">{formatoFechaHora(m.creado_en)}</td>
                            <td>
                              <span className="small text-secondary">{m.producto_codigo || '—'}</span> {m.producto_nombre || 'Producto eliminado'}
                            </td>
                            <td><Badge bg={m.tipo === 'entrada' ? 'success' : 'danger'}>{m.tipo}</Badge></td>
                            <td className={`text-end ${m.tipo === 'entrada' ? 'text-success' : 'text-danger'}`}>
                              {m.tipo === 'entrada' ? '+' : '-'}{m.cantidad} {m.unidad_medida || ''}
                            </td>                            <td className="text-capitalize">{m.motivo}</td>
                            <td className="text-end">{m.numero_factura ? `#${m.numero_factura}` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </Card.Body>
                </Card>
              </>
            )}
          </Tab.Pane>
        </Tab.Content>
      </Tab.Container>
      </div>

      {/* Sección visible solo al imprimir: reporte de la pestaña activa en tablas. */}
      <div className="seccion-impresion">
        {tabActiva === 'ventas' && (
          <div className="impresion-reporte">
            <h5>Reporte de ventas</h5>
            <p className="impresion-subtitulo">
              Rango: {fechaDesde} al {fechaHasta} &mdash; Generado: {fechaHoraGeneracion}
            </p>
            {ventas ? (
              <>
                <table className="tabla-impresion tabla-resumen">
                  <tbody>
                    <tr>
                      <th>Facturas emitidas</th>
                      <th>Total vendido</th>
                      <th>Ticket promedio</th>
                    </tr>
                    <tr>
                      <td>{resumen?.cantidad_facturas ?? 0}</td>
                      <td>{formatoMoneda(resumen?.total_emitidas)}</td>
                      <td>{formatoMoneda(resumen?.promedio_emitidas)}</td>
                    </tr>
                  </tbody>
                </table>

                <h6>Ventas diarias</h6>
                <table className="tabla-impresion">
                  <thead>
                    <tr><th>Fecha</th><th className="text-end">Total</th></tr>
                  </thead>
                  <tbody>
                    {diarias.map((d) => (
                      <tr key={d.fecha}>
                        <td>{d.fecha}</td>
                        <td className="text-end">{formatoMoneda(d.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <h6>Ventas por tipo de pago</h6>
                <table className="tabla-impresion">
                  <thead>
                    <tr><th>Tipo de pago</th><th className="text-end">Facturas</th><th className="text-end">Total</th></tr>
                  </thead>
                  <tbody>
                    {(ventas?.por_tipo_pago || []).map((p) => (
                      <tr key={p.tipo_pago}>
                        <td className="text-capitalize">{p.tipo_pago}</td>
                        <td className="text-end">{p.cantidad}</td>
                        <td className="text-end">{formatoMoneda(p.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <h6>Ventas por vendedor</h6>
                <table className="tabla-impresion">
                  <thead>
                    <tr><th>Vendedor</th><th className="text-end">Facturas</th><th className="text-end">Total</th></tr>
                  </thead>
                  <tbody>
                    {(ventas?.por_usuario || []).map((u) => (
                      <tr key={u.nombre_completo}>
                        <td>{u.nombre_completo}</td>
                        <td className="text-end">{u.cantidad}</td>
                        <td className="text-end">{formatoMoneda(u.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <h6>Top productos vendidos</h6>
                <table className="tabla-impresion">
                  <thead>
                    <tr><th>Producto</th><th className="text-end">Cantidad</th><th className="text-end">Total</th></tr>
                  </thead>
                  <tbody>
                    {(ventas?.productos_mas_vendidos || []).map((p) => (
                      <tr key={p.producto_id}>
                        <td>{p.producto_nombre}</td>
                        <td className="text-end">{p.cantidad_vendida}</td>
                        <td className="text-end">{formatoMoneda(p.total_vendido)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <p>No hay datos del reporte de ventas. Genera el reporte antes de imprimir.</p>
            )}
          </div>
        )}

        {tabActiva === 'inventario' && (
          <div className="impresion-reporte">
            <h5>Reporte de inventario</h5>
            <p className="impresion-subtitulo">Generado: {fechaHoraGeneracion}</p>
            {inventario ? (
              <>
                <table className="tabla-impresion tabla-resumen">
                  <tbody>
                    <tr>
                      <th>Productos activos</th>
                      <th>Unidades en stock</th>
                      <th>Valor del inventario</th>
                    </tr>
                    <tr>
                      <td>{inventario?.resumen?.cantidad_productos ?? 0}</td>
                      <td>{numero(inventario?.resumen?.unidades_en_stock).toLocaleString('es-CO')}</td>
                      <td>{formatoMoneda(inventario?.resumen?.valor_inventario)}</td>
                    </tr>
                  </tbody>
                </table>

                <h6>Inventario por categoría</h6>
                <table className="tabla-impresion">
                  <thead>
                    <tr><th>Categoría</th><th className="text-end">Productos</th><th className="text-end">Unidades</th><th className="text-end">Valor</th></tr>
                  </thead>
                  <tbody>
                    {(inventario?.por_categoria || []).map((c) => (
                      <tr key={c.id}>
                        <td>{c.nombre}</td>
                        <td className="text-end">{c.cantidad}</td>
                        <td className="text-end">{numero(c.unidades).toLocaleString('es-CO')}</td>
                        <td className="text-end">{formatoMoneda(c.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <h6>Productos bajo stock</h6>
                <table className="tabla-impresion">
                  <thead>
                    <tr><th>Código</th><th>Producto</th><th className="text-end">Stock</th><th className="text-end">Mínimo</th></tr>
                  </thead>
                  <tbody>
                    {(inventario?.bajo_stock || []).map((p) => (
                      <tr key={p.id}>
                        <td>{p.codigo}</td>
                        <td>{p.nombre}</td>
                        <td className="text-end">{p.stock_actual}</td>
                        <td className="text-end">{p.stock_minimo}</td>
                      </tr>
                    ))}
                    {(inventario?.bajo_stock || []).length === 0 && (
                      <tr><td colSpan={4} className="text-center">Sin productos bajo stock</td></tr>
                    )}
                  </tbody>
                </table>
              </>
            ) : (
              <p>No hay datos del reporte de inventario.</p>
            )}
          </div>
        )}

        {tabActiva === 'movimientos' && (
          <div className="impresion-reporte">
            <h5>Reporte de movimientos</h5>
            <p className="impresion-subtitulo">
              Rango: {fechaDesde} al {fechaHasta} &mdash; Generado: {fechaHoraGeneracion}
            </p>
            {movimientos ? (
              <>
                <table className="tabla-impresion tabla-resumen">
                  <tbody>
                    <tr>
                      <th>Total movimientos</th>
                      <th>Unidades entrada</th>
                      <th>Unidades salida</th>
                    </tr>
                    <tr>
                      <td>{numero(movimientos?.resumen?.total)}</td>
                      <td>+{numero(movimientos?.resumen?.unidades_entrada).toLocaleString('es-CO')}</td>
                      <td>-{numero(movimientos?.resumen?.unidades_salida).toLocaleString('es-CO')}</td>
                    </tr>
                  </tbody>
                </table>

                <h6>Movimientos por motivo</h6>
                <table className="tabla-impresion">
                  <thead>
                    <tr><th>Motivo</th><th>Tipo</th><th className="text-end">Registros</th><th className="text-end">Unidades</th></tr>
                  </thead>
                  <tbody>
                    {(movimientos?.resumen?.por_motivo || []).map((m) => (
                      <tr key={`${m.motivo}-${m.tipo}`}>
                        <td className="text-capitalize">{m.motivo}</td>
                        <td className="text-capitalize">{m.tipo}</td>
                        <td className="text-end">{m.cantidad}</td>
                        <td className="text-end">{m.unidades}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <h6>Detalle de movimientos</h6>
                <table className="tabla-impresion">
                  <thead>
                    <tr>
                      <th>Fecha</th><th>Producto</th><th>Tipo</th>
                      <th className="text-end">Cantidad</th><th>Motivo</th><th className="text-end">Factura</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(movimientos?.detalle || []).map((m) => (
                      <tr key={m.id}>
                        <td>{formatoFechaHora(m.creado_en)}</td>
                        <td>{m.producto_nombre || 'Producto eliminado'}</td>
                        <td className="text-capitalize">{m.tipo}</td>
                        <td className="text-end">{m.tipo === 'entrada' ? '+' : '-'}{m.cantidad} {m.unidad_medida || ''}</td>
                        <td className="text-capitalize">{m.motivo}</td>
                        <td className="text-end">{m.numero_factura ? `#${m.numero_factura}` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <p>No hay datos del reporte de movimientos. Genera el reporte antes de imprimir.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
export default Reportes;
