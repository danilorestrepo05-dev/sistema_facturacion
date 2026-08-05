// src/views/Clientes.jsx
// Gestión de clientes: listado, búsqueda y CRUD con modal.
import { useEffect, useState } from 'react';
import {
  Row, Col, Card, Form, Button, Table, Badge, Spinner, Alert, Modal
} from 'react-bootstrap';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const TIPOS_DOCUMENTO = ['CC', 'NIT', 'CE', 'Pasaporte', 'Otro'];

const Clientes = () => {
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === 'admin';

  const [clientes, setClientes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [termino, setTermino] = useState('');

  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(vacio());

  useEffect(() => { cargar(); }, []);

  const cargar = async (conBusqueda = false) => {
    setCargando(true);
    setError('');
    try {
      const respuesta = await api.get('/clientes', { params: { termino } });
      setClientes(respuesta.data.datos);
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al cargar clientes');
    } finally {
      setCargando(false);
    }
    if (conBusqueda) setTermino('');
  };

  const abrirNuevo = () => { setEditando(null); setForm(vacio()); setModal(true); };

  const abrirEditar = (c) => {
    setEditando(c);
    setForm({
      nombre: c.nombre, tipo_documento: c.tipo_documento, documento: c.documento || '',
      telefono: c.telefono || '', email: c.email || '', direccion: c.direccion || '', activo: c.activo
    });
    setModal(true);
  };

  const guardar = async (e) => {
    e.preventDefault();
    setError('');
    const cuerpo = { ...form, activo: form.activo ? 1 : 0, documento: form.documento || null };
    try {
      if (editando) {
        await api.put(`/clientes/${editando.id}`, cuerpo);
      } else {
        await api.post('/clientes', cuerpo);
      }
      setModal(false);
      await cargar();
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al guardar el cliente');
    }
  };

  const eliminar = async (c) => {
    if (!window.confirm(`¿Eliminar al cliente "${c.nombre}"?`)) return;
    try {
      await api.delete(`/clientes/${c.id}`);
      await cargar();
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al eliminar el cliente');
    }
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4 className="mb-0">Clientes</h4>
        {esAdmin && (
          <Button variant="primary" onClick={abrirNuevo}>
            <i className="bi bi-person-plus me-1"></i>Nuevo cliente
          </Button>
        )}
      </div>

      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}

      <Card className="card-kpi mb-3">
        <Card.Body>
          <Form onSubmit={(e) => { e.preventDefault(); cargar(); }} className="d-flex gap-2">
            <Form.Control style={{ maxWidth: 320 }} placeholder="Buscar por nombre, documento o teléfono…"
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
                  <th>Nombre</th><th>Documento</th><th>Teléfono</th>
                  <th>Email</th><th>Dirección</th><th>Estado</th>
                  <th className="text-end">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {clientes.length === 0 && (
                  <tr><td colSpan={7} className="text-center text-secondary">Sin clientes</td></tr>
                )}
                {clientes.map((c) => (
                  <tr key={c.id}>
                    <td>{c.nombre}</td>
                    <td className="small">{c.tipo_documento} {c.documento || '—'}</td>
                    <td className="small">{c.telefono || '—'}</td>
                    <td className="small">{c.email || '—'}</td>
                    <td className="small">{c.direccion || '—'}</td>
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
          <Modal.Title>{editando ? 'Editar cliente' : 'Nuevo cliente'}</Modal.Title>
        </Modal.Header>
        <Form onSubmit={guardar}>
          <Modal.Body>
            <Row className="g-3">
              <Col md={12}>
                <Form.Label>Nombre *</Form.Label>
                <Form.Control required value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
              </Col>
              <Col md={6}>
                <Form.Label>Tipo documento</Form.Label>
                <Form.Select value={form.tipo_documento}
                  onChange={(e) => setForm({ ...form, tipo_documento: e.target.value })}>
                  {TIPOS_DOCUMENTO.map((t) => <option key={t} value={t}>{t}</option>)}
                </Form.Select>
              </Col>
              <Col md={6}>
                <Form.Label>Documento</Form.Label>
                <Form.Control value={form.documento}
                  onChange={(e) => setForm({ ...form, documento: e.target.value })} />
              </Col>
              <Col md={6}>
                <Form.Label>Teléfono</Form.Label>
                <Form.Control value={form.telefono}
                  onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
              </Col>
              <Col md={6}>
                <Form.Label>Email</Form.Label>
                <Form.Control type="email" value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Col>
              <Col md={12}>
                <Form.Label>Dirección</Form.Label>
                <Form.Control value={form.direccion}
                  onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
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
  nombre: '', tipo_documento: 'CC', documento: '', telefono: '', email: '',
  direccion: '', activo: 1
});

export default Clientes;
