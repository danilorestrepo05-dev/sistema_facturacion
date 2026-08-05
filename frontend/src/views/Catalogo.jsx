// src/views/Catalogo.jsx
// Administración del catálogo: categorías e impuestos con CRUD en modal.
import { useEffect, useState } from 'react';
import {
  Row, Col, Card, Form, Button, Table, Badge, Spinner, Alert, Modal, Nav, Tab
} from 'react-bootstrap';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const Catalogo = () => (
  <div>
    <div className="d-flex justify-content-between align-items-center mb-3">
      <h4 className="mb-0">Catálogo</h4>
    </div>
    <Tab.Container defaultActiveKey="categorias">
      <Nav variant="tabs" className="mb-3">
        <Nav.Item><Nav.Link eventKey="categorias"><i className="bi bi-tags me-1"></i>Categorías</Nav.Link></Nav.Item>
        <Nav.Item><Nav.Link eventKey="impuestos"><i className="bi bi-percent me-1"></i>Impuestos</Nav.Link></Nav.Item>
      </Nav>
      <Tab.Content>
        <Tab.Pane eventKey="categorias"><PanelCategorias /></Tab.Pane>
        <Tab.Pane eventKey="impuestos"><PanelImpuestos /></Tab.Pane>
      </Tab.Content>
    </Tab.Container>
  </div>
);

// Panel de categorías: nombre, descripción y estado.
const PanelCategorias = () => {
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === 'admin';

  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState({ nombre: '', descripcion: '', activo: 1 });

  useEffect(() => { cargar(); }, []);

  const cargar = async () => {
    setCargando(true);
    setError('');
    try {
      const respuesta = await api.get('/categorias');
      setItems(respuesta.data.datos);
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al cargar categorías');
    } finally {
      setCargando(false);
    }
  };

  const abrirNuevo = () => { setEditando(null); setForm({ nombre: '', descripcion: '', activo: 1 }); setModal(true); };

  const abrirEditar = (c) => {
    setEditando(c);
    setForm({ nombre: c.nombre, descripcion: c.descripcion || '', activo: c.activo });
    setModal(true);
  };

  const guardar = async (e) => {
    e.preventDefault();
    setError('');
    const cuerpo = { ...form, descripcion: form.descripcion || null, activo: form.activo ? 1 : 0 };
    try {
      if (editando) {
        await api.put(`/categorias/${editando.id}`, cuerpo);
      } else {
        await api.post('/categorias', cuerpo);
      }
      setModal(false);
      await cargar();
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al guardar la categoría');
    }
  };

  const eliminar = async (c) => {
    if (!window.confirm(`¿Eliminar la categoría "${c.nombre}"?`)) return;
    try {
      await api.delete(`/categorias/${c.id}`);
      await cargar();
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al eliminar la categoría');
    }
  };

  return (
    <>
      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}
      <div className="d-flex justify-content-end mb-3">
        {esAdmin && (
          <Button variant="primary" onClick={abrirNuevo}>
            <i className="bi bi-plus-lg me-1"></i>Nueva categoría
          </Button>
        )}
      </div>

      {cargando ? (
        <div className="text-center py-5"><Spinner animation="border" /></div>
      ) : (
        <Card className="card-kpi">
          <Card.Body>
            <Table responsive hover size="sm" className="mb-0">
              <thead>
                <tr><th>Nombre</th><th>Descripción</th><th>Estado</th><th className="text-end">Acciones</th></tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr><td colSpan={4} className="text-center text-secondary">Sin categorías</td></tr>
                )}
                {items.map((c) => (
                  <tr key={c.id}>
                    <td>{c.nombre}</td>
                    <td className="small text-secondary">{c.descripcion || '—'}</td>
                    <td><Badge bg={c.activo === 1 ? 'success' : 'secondary'}>{c.activo === 1 ? 'Activo' : 'Inactivo'}</Badge></td>
                    <td className="text-end tabla-acciones">
                      <Button size="sm" variant="outline-primary" onClick={() => abrirEditar(c)}>
                        <i className="bi bi-pencil"></i>
                      </Button>{' '}
                      {esAdmin && (
                        <Button size="sm" variant="outline-danger" onClick={() => eliminar(c)}>
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

      <Modal show={modal} onHide={() => setModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>{editando ? 'Editar categoría' : 'Nueva categoría'}</Modal.Title>
        </Modal.Header>
        <Form onSubmit={guardar}>
          <Modal.Body>
            <Row className="g-3">
              <Col md={12}>
                <Form.Label>Nombre *</Form.Label>
                <Form.Control required value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
              </Col>
              <Col md={12}>
                <Form.Label>Descripción</Form.Label>
                <Form.Control as="textarea" rows={2} value={form.descripcion}
                  onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
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
    </>
  );
};

// Panel de impuestos: nombre y porcentaje.
const PanelImpuestos = () => {
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === 'admin';

  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState({ nombre: '', porcentaje: '', activo: 1 });

  useEffect(() => { cargar(); }, []);

  const cargar = async () => {
    setCargando(true);
    setError('');
    try {
      const respuesta = await api.get('/impuestos');
      setItems(respuesta.data.datos);
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al cargar impuestos');
    } finally {
      setCargando(false);
    }
  };

  const abrirNuevo = () => { setEditando(null); setForm({ nombre: '', porcentaje: '', activo: 1 }); setModal(true); };

  const abrirEditar = (i) => {
    setEditando(i);
    setForm({ nombre: i.nombre, porcentaje: i.porcentaje, activo: i.activo });
    setModal(true);
  };

  const guardar = async (e) => {
    e.preventDefault();
    setError('');
    const cuerpo = { ...form, porcentaje: Number(form.porcentaje), activo: form.activo ? 1 : 0 };
    try {
      if (editando) {
        await api.put(`/impuestos/${editando.id}`, cuerpo);
      } else {
        await api.post('/impuestos', cuerpo);
      }
      setModal(false);
      await cargar();
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al guardar el impuesto');
    }
  };

  const eliminar = async (i) => {
    if (!window.confirm(`¿Eliminar el impuesto "${i.nombre}"?`)) return;
    try {
      await api.delete(`/impuestos/${i.id}`);
      await cargar();
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al eliminar el impuesto');
    }
  };

  return (
    <>
      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}
      <div className="d-flex justify-content-end mb-3">
        {esAdmin && (
          <Button variant="primary" onClick={abrirNuevo}>
            <i className="bi bi-plus-lg me-1"></i>Nuevo impuesto
          </Button>
        )}
      </div>

      {cargando ? (
        <div className="text-center py-5"><Spinner animation="border" /></div>
      ) : (
        <Card className="card-kpi">
          <Card.Body>
            <Table responsive hover size="sm" className="mb-0">
              <thead>
                <tr><th>Nombre</th><th>Porcentaje</th><th>Estado</th><th className="text-end">Acciones</th></tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr><td colSpan={4} className="text-center text-secondary">Sin impuestos</td></tr>
                )}
                {items.map((i) => (
                  <tr key={i.id}>
                    <td>{i.nombre}</td>
                    <td><Badge bg="info">{i.porcentaje}%</Badge></td>
                    <td><Badge bg={i.activo === 1 ? 'success' : 'secondary'}>{i.activo === 1 ? 'Activo' : 'Inactivo'}</Badge></td>
                    <td className="text-end tabla-acciones">
                      <Button size="sm" variant="outline-primary" onClick={() => abrirEditar(i)}>
                        <i className="bi bi-pencil"></i>
                      </Button>{' '}
                      {esAdmin && (
                        <Button size="sm" variant="outline-danger" onClick={() => eliminar(i)}>
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

      <Modal show={modal} onHide={() => setModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>{editando ? 'Editar impuesto' : 'Nuevo impuesto'}</Modal.Title>
        </Modal.Header>
        <Form onSubmit={guardar}>
          <Modal.Body>
            <Row className="g-3">
              <Col md={8}>
                <Form.Label>Nombre *</Form.Label>
                <Form.Control required value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
              </Col>
              <Col md={4}>
                <Form.Label>Porcentaje *</Form.Label>
                <Form.Control type="number" step="0.01" min="0" required value={form.porcentaje}
                  onChange={(e) => setForm({ ...form, porcentaje: e.target.value })} />
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
    </>
  );
};

export default Catalogo;
