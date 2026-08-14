// src/views/Usuarios.jsx
// Gestión de usuarios del sistema (solo administradores): listado y CRUD con modal.
import { useEffect, useState } from 'react';
import {
  Row, Col, Card, Form, Button, Table, Badge, Spinner, Alert, Modal
} from 'react-bootstrap';
import api from '../services/api';
import { formatoFechaHora } from '../utils/format';

const ROLES = ['admin', 'cajero'];

const Usuarios = () => {
  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [termino, setTermino] = useState('');

  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState(null); // null = crear
  const [form, setForm] = useState(vacio());

  useEffect(() => { cargar(); }, []);

  const cargar = async (conBusqueda = false) => {
    setCargando(true);
    setError('');
    try {
      const respuesta = await api.get('/usuarios', { params: { termino } });
      setUsuarios(respuesta.data.datos);
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al cargar usuarios');
    } finally {
      setCargando(false);
    }
    if (conBusqueda) setTermino('');
  };

  const abrirNuevo = () => { setEditando(null); setForm(vacio()); setModal(true); };

  const abrirEditar = (u) => {
    setEditando(u);
    setForm({
      nombre_usuario: u.nombre_usuario, nombre_completo: u.nombre_completo,
      rol: u.rol, activo: u.activo, contrasena: ''
    });
    setModal(true);
  };

  const guardar = async (e) => {
    e.preventDefault();
    setError('');
    const cuerpo = {
      nombre_usuario: form.nombre_usuario,
      nombre_completo: form.nombre_completo,
      rol: form.rol,
      activo: form.activo ? 1 : 0,
      contrasena: form.contrasena || undefined
    };
    try {
      if (editando) {
        await api.put(`/usuarios/${editando.id}`, cuerpo);
      } else {
        await api.post('/usuarios', cuerpo);
      }
      setModal(false);
      await cargar();
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al guardar el usuario');
    }
  };

  const desactivar = async (u) => {
    if (!window.confirm(`¿Desactivar el usuario "${u.nombre_completo}"? No podrá iniciar sesión.`)) return;
    try {
      await api.delete(`/usuarios/${u.id}`);
      await cargar();
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al desactivar el usuario');
    }
  };

  const badgeRol = (rol) => {
    const variantes = { admin: 'danger', cajero: 'primary' };
    return <Badge bg={variantes[rol] || 'secondary'} className="text-capitalize">{rol}</Badge>;
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4 className="mb-0">Usuarios</h4>
        <Button variant="primary" onClick={abrirNuevo}>
          <i className="bi bi-person-plus me-1"></i>Nuevo usuario
        </Button>
      </div>

      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}

      <Card className="card-kpi mb-3">
        <Card.Body>
          <Form onSubmit={(e) => { e.preventDefault(); cargar(); }} className="d-flex gap-2">
            <Form.Control style={{ maxWidth: 320 }} placeholder="Buscar por nombre de usuario o completo…"
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
                  <th>Usuario</th><th>Nombre completo</th><th>Rol</th>
                  <th>Estado</th><th>Creado</th><th className="text-end">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-secondary">Sin usuarios</td></tr>
                )}
                {usuarios.map((u) => (
                  <tr key={u.id}>
                    <td className="small">@{u.nombre_usuario}</td>
                    <td>{u.nombre_completo}</td>
                    <td>{badgeRol(u.rol)}</td>
                    <td><Badge bg={u.activo === 1 ? 'success' : 'secondary'}>{u.activo === 1 ? 'Activo' : 'Inactivo'}</Badge></td>
                    <td className="small">{formatoFechaHora(u.creado_en)}</td>
                    <td className="text-end tabla-acciones">
                      <Button size="sm" variant="outline-primary" onClick={() => abrirEditar(u)}>
                        <i className="bi bi-pencil"></i>
                      </Button>{' '}
                      {u.activo === 1 && (
                        <Button size="sm" variant="outline-danger" onClick={() => desactivar(u)}>
                          <i className="bi bi-person-x"></i>
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

      {/* Modal de crear/editar usuario */}
      <Modal show={modal} onHide={() => setModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>{editando ? 'Editar usuario' : 'Nuevo usuario'}</Modal.Title>
        </Modal.Header>
        <Form onSubmit={guardar}>
          <Modal.Body>
            <Row className="g-3">
              <Col md={6}>
                <Form.Label>Nombre de usuario *</Form.Label>
                <Form.Control required value={form.nombre_usuario}
                  onChange={(e) => setForm({ ...form, nombre_usuario: e.target.value })} />
              </Col>
              <Col md={6}>
                <Form.Label>Rol</Form.Label>
                <Form.Select value={form.rol}
                  onChange={(e) => setForm({ ...form, rol: e.target.value })}>
                  {ROLES.map((r) => <option key={r} value={r} className="text-capitalize">{r}</option>)}
                </Form.Select>
              </Col>
              <Col md={12}>
                <Form.Label>Nombre completo *</Form.Label>
                <Form.Control required value={form.nombre_completo}
                  onChange={(e) => setForm({ ...form, nombre_completo: e.target.value })} />
              </Col>
              <Col md={12}>
                <Form.Label>{editando ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña *'}</Form.Label>
                <Form.Control type="password" required={!editando}
                  placeholder={editando ? '••••••' : 'Mínimo 6 caracteres'}
                  value={form.contrasena}
                  onChange={(e) => setForm({ ...form, contrasena: e.target.value })} />
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
  nombre_usuario: '', nombre_completo: '', rol: 'cajero', activo: 1, contrasena: ''
});

export default Usuarios;
