// src/views/Productos.jsx
// Gestión de productos: listado, búsqueda y CRUD con modal.
import { useEffect, useState } from 'react';
import {
  Row, Col, Card, Form, Button, Table, Badge, Spinner, Alert, Modal
} from 'react-bootstrap';
import api from '../services/api';
import { formatoMoneda } from '../utils/format';
import { useAuth } from '../context/AuthContext';

const Productos = () => {
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === 'admin';

  const [productos, setProductos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [impuestos, setImpuestos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [termino, setTermino] = useState('');

  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState(null); // null = crear
  const [form, setForm] = useState(vacio());

  useEffect(() => {
    cargar();
  }, []);

  const cargar = async () => {
    setCargando(true);
    setError('');
    try {
      const [respProductos, respCategorias, respImpuestos] = await Promise.all([
        api.get('/productos', { params: { termino } }),
        api.get('/categorias'),
        api.get('/impuestos')
      ]);
      setProductos(respProductos.data.datos);
      setCategorias(respCategorias.data.datos);
      setImpuestos(respImpuestos.data.datos);
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al cargar productos');
    } finally {
      setCargando(false);
    }
  };

  // Devuelve el id del impuesto por defecto para un producto nuevo:
  // el primer impuesto activo; si no hay activos, el "Exento"; si tampoco existe, vacío.
  const impuestoPorDefecto = () =>
    impuestos.find((i) => i.activo === 1)?.id ??
    impuestos.find((i) => String(i.nombre).toLowerCase() === 'exento')?.id ??
    '';

  // Categorías visibles en el select: solo las activas. Si se está editando y la
  // categoría actual quedó inactiva, se conserva (marcada) para no perder la referencia.
  const categoriasVisibles = () => {
    const activas = categorias.filter((c) => c.activo === 1);
    if (editando && form.categoria_id) {
      const actual = categorias.find((c) => c.id === Number(form.categoria_id));
      if (actual && actual.activo !== 1 && !activas.some((c) => c.id === actual.id)) {
        return [...activas, actual];
      }
    }
    return activas;
  };

  // Impuestos visibles en el select: solo los activos, más el seleccionado si quedó inactivo.
  const impuestosVisibles = () => {
    const activos = impuestos.filter((i) => i.activo === 1);
    if (editando && form.impuesto_id) {
      const actual = impuestos.find((i) => i.id === Number(form.impuesto_id));
      if (actual && actual.activo !== 1 && !activos.some((i) => i.id === actual.id)) {
        return [...activos, actual];
      }
    }
    return activos;
  };

  const abrirNuevo = async () => {
    setEditando(null);
    setForm(vacio());
    setModal(true);
    // Precarga el impuesto por defecto (Exento) y el siguiente código correlativo (editable).
    setForm((f) => ({ ...f, impuesto_id: impuestoPorDefecto() }));
    try {
      const resp = await api.get('/productos/siguiente-codigo');
      setForm((f) => ({ ...f, codigo: resp.data.datos.codigo }));
    } catch {
      // Si falla, se deja vacío y el backend lo genera al guardar.
    }
  };

  const abrirEditar = (p) => {
    setEditando(p);
    setForm({
      codigo: p.codigo, nombre: p.nombre, descripcion: p.descripcion || '',
      categoria_id: p.categoria_id || '',
      impuesto_id: p.impuesto_id || impuestoPorDefecto(),
      precio_compra: p.precio_compra, precio_venta: p.precio_venta,
      stock_actual: p.stock_actual, stock_minimo: p.stock_minimo,
      unidad_medida: p.unidad_medida, activo: p.activo
    });
    setModal(true);
  };

  const guardar = async (e) => {
    e.preventDefault();
    setError('');
    const cuerpo = {
      ...form,
      categoria_id: form.categoria_id || null,
      impuesto_id: form.impuesto_id || null,
      activo: form.activo ? 1 : 0
    };
    try {
      if (editando) {
        await api.put(`/productos/${editando.id}`, cuerpo);
      } else {
        await api.post('/productos', cuerpo);
      }
      setModal(false);
      await cargar();
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al guardar el producto');
    }
  };

  const eliminar = async (p) => {
    if (!window.confirm(`¿Eliminar el producto "${p.nombre}"?`)) return;
    try {
      await api.delete(`/productos/${p.id}`);
      await cargar();
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al eliminar el producto');
    }
  };

  const busqueda = (e) => {
    e.preventDefault();
    cargar();
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4 className="mb-0">Productos</h4>
        {esAdmin && (
          <Button variant="primary" onClick={abrirNuevo}>
            <i className="bi bi-plus-lg me-1"></i>Nuevo producto
          </Button>
        )}
      </div>

      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}

      <Card className="card-kpi mb-3">
        <Card.Body>
          <Form onSubmit={busqueda} className="d-flex gap-2">
            <Form.Control style={{ maxWidth: 320 }} placeholder="Buscar por código, nombre o categoría…"
              value={termino} onChange={(e) => setTermino(e.target.value)} />
            <Button type="submit" variant="outline-primary"><i className="bi bi-search"></i></Button>
          </Form>
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
                  <th>Código</th><th>Nombre</th><th>Categoría</th><th>Impuesto</th>
                  <th className="text-end">P. compra</th><th className="text-end">P. venta</th>
                  <th className="text-end">Stock</th><th>Estado</th>
                  <th className="text-end">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {productos.length === 0 && (
                  <tr><td colSpan={9} className="text-center text-secondary">Sin productos</td></tr>
                )}
                {productos.map((p) => (
                  <tr key={p.id}>
                    <td className="small">{p.codigo}</td>
                    <td>{p.nombre}</td>
                    <td className="small">{p.categoria_nombre || '—'}</td>
                    <td className="small">{p.impuesto_nombre || '—'}</td>
                    <td className="text-end">{formatoMoneda(p.precio_compra)}</td>
                    <td className="text-end">{formatoMoneda(p.precio_venta)}</td>
                    <td className="text-end">
                      <Badge bg={(p.stock_actual ?? 0) <= (p.stock_minimo ?? 0) ? 'warning' : 'light'} text="dark"
                        title={`Stock actual: ${p.stock_actual ?? 0}`}>
                        {p.stock_actual ?? 0}
                      </Badge>
                    </td>
                    <td><Badge bg={p.activo === 1 ? 'success' : 'secondary'}>{p.activo === 1 ? 'Activo' : 'Inactivo'}</Badge></td>
                    <td className="text-end tabla-acciones">
                      <Button size="sm" variant="outline-primary" onClick={() => abrirEditar(p)}>
                        <i className="bi bi-pencil"></i>
                      </Button>{' '}
                      {esAdmin && (
                        <Button size="sm" variant="outline-danger" onClick={() => eliminar(p)}>
                          <i className="bi bi-trash"></i>
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card.Body>
        </Card>
      )}

      {/* Modal de crear/editar */}
      <Modal show={modal} onHide={() => setModal(false)} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title>{editando ? 'Editar producto' : 'Nuevo producto'}</Modal.Title>
        </Modal.Header>
        <Form onSubmit={guardar}>
          <Modal.Body>
            <Row className="g-3">
              <Col md={4}>
                <Form.Label>Código</Form.Label>
                <Form.Control value={form.codigo}
                  onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
                <Form.Text className="text-muted">Autogenerado, puedes editarlo.</Form.Text>
              </Col>
              <Col md={8}>
                <Form.Label>Nombre *</Form.Label>
                <Form.Control required value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
              </Col>
              <Col md={12}>
                <Form.Label>Descripción</Form.Label>
                <Form.Control value={form.descripcion}
                  onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
              </Col>
              <Col md={6}>
                <Form.Label>Categoría</Form.Label>
                <Form.Select value={form.categoria_id}
                  onChange={(e) => setForm({ ...form, categoria_id: e.target.value })}>
                  <option value="">Sin categoría</option>
                  {categoriasVisibles().map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}{c.activo !== 1 ? ' (inactivo)' : ''}
                    </option>
                  ))}
                </Form.Select>
              </Col>
              <Col md={6}>
                <Form.Label>Impuesto</Form.Label>
                <Form.Select value={form.impuesto_id}
                  onChange={(e) => setForm({ ...form, impuesto_id: e.target.value })}>
                  {impuestosVisibles().map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.nombre} ({i.porcentaje}%){i.activo !== 1 ? ' (inactivo)' : ''}
                    </option>
                  ))}
                </Form.Select>
              </Col>
              <Col md={3}>
                <Form.Label>Precio compra</Form.Label>
                <Form.Control type="number" min={0} step="0.01" required value={form.precio_compra}
                  onChange={(e) => setForm({ ...form, precio_compra: e.target.value })} />
              </Col>
              <Col md={3}>
                <Form.Label>Precio venta *</Form.Label>
                <Form.Control type="number" min={0} step="0.01" required value={form.precio_venta}
                  onChange={(e) => setForm({ ...form, precio_venta: e.target.value })} />
              </Col>
              <Col md={2}>
                <Form.Label>Stock</Form.Label>
                <Form.Control type="number" min={0} value={form.stock_actual}
                  onChange={(e) => setForm({ ...form, stock_actual: e.target.value })} />
              </Col>
              <Col md={2}>
                <Form.Label>Stock mín.</Form.Label>
                <Form.Control type="number" min={0} value={form.stock_minimo}
                  onChange={(e) => setForm({ ...form, stock_minimo: e.target.value })} />
              </Col>
              <Col md={2}>
                <Form.Label>Unidad</Form.Label>
                <Form.Control value={form.unidad_medida} placeholder="Ej. unidad, kg, lb…"
                  onChange={(e) => setForm({ ...form, unidad_medida: e.target.value })} />
              </Col>
              <Col md={12}>
                <Form.Check type="switch" label="Activo" checked={form.activo === 1}
                  onChange={(e) => setForm({ ...form, activo: e.target.checked ? 1 : 0 })} />
              </Col>
            </Row>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setModal(false)}>Cancelar</Button>
            <Button type="submit" variant="primary">Guardar</Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
};

const vacio = () => ({
  codigo: '', nombre: '', descripcion: '', categoria_id: '', impuesto_id: '',
  precio_compra: '', precio_venta: '', stock_actual: 0, stock_minimo: 0,
  unidad_medida: 'unidad', activo: 1
});

export default Productos;
