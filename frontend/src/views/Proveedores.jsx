// src/views/Proveedores.jsx
// Gestión de proveedores: listado, búsqueda y CRUD con modal.
import { useEffect, useState } from 'react';
import {
  Row, Col, Card, Form, Button, Table, Badge, Spinner, Modal
} from 'react-bootstrap';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import Paginacion from '../components/Paginacion';
import AlertaAuto from '../components/AlertaAuto';

const TIPOS_DOCUMENTO = ['CC', 'NIT', 'CE', 'Pasaporte', 'Otro'];
const POR_PAGINA = 20;

const Proveedores = () => {
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === 'admin';

  const [proveedores, setProveedores] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [termino, setTermino] = useState('');
  const [pagina, setPagina] = useState(1);
  const [paginas, setPaginas] = useState(0);

  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(vacio());

  useEffect(() => { cargar(); }, [pagina]);

  const cargar = async (conBusqueda = false) => {
    setCargando(true);
    setError('');
    try {
      const respuesta = await api.get('/proveedores', {
        params: { termino, pagina, por_pagina: POR_PAGINA }
      });
      setProveedores(respuesta.data.datos);
      // El total de registros llega en cabeceras (la paginación es del backend).
      const total = Number(respuesta.headers['x-total-registros'] || 0);
      setPaginas(Math.ceil(total / POR_PAGINA));
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al cargar proveedores');
    } finally {
      setCargando(false);
    }
    if (conBusqueda) {
      setTermino('');
      setPagina(1); // nueva búsqueda vuelve a la primera página
    }
  };

  const abrirNuevo = () => { setEditando(null); setForm(vacio()); setModal(true); };

  const abrirEditar = (p) => {
    setEditando(p);
    setForm({
      nombre: p.nombre, tipo_documento: p.tipo_documento, documento: p.documento || '',
      telefono: p.telefono || '', email: p.email || '', direccion: p.direccion || '',
      tipo_item: p.tipo_item || '', activo: p.activo
    });
    setModal(true);
  };

  const guardar = async (e) => {
    e.preventDefault();
    setError('');
    const cuerpo = { ...form, activo: form.activo ? 1 : 0, documento: form.documento || null };
    try {
      if (editando) {
        await api.put(`/proveedores/${editando.id}`, cuerpo);
      } else {
        await api.post('/proveedores', cuerpo);
      }
      setModal(false);
      await cargar();
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al guardar el proveedor');
    }
  };

  const eliminar = async (p) => {
    if (!window.confirm(`¿Eliminar al proveedor "${p.nombre}"?`)) return;
    try {
      await api.delete(`/proveedores/${p.id}`);
      await cargar();
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al eliminar el proveedor');
    }
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4 className="mb-0">Proveedores</h4>
        {esAdmin && (
          <Button variant="primary" onClick={abrirNuevo}>
            <i className="bi bi-truck me-1"></i>Nuevo proveedor
          </Button>
        )}
      </div>

      <AlertaAuto variante="danger" mensaje={error} onCerrar={() => setError('')} />

      <Card className="card-kpi mb-3">
        <Card.Body>
          <Form onSubmit={(e) => { e.preventDefault(); cargar(); }} className="d-flex gap-2">
            <Form.Control style={{ maxWidth: 320 }} placeholder="Buscar por nombre, documento, teléfono o tipo de item…"
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
                  <th>Nombre</th><th>Tipo de item</th><th>Documento</th><th>Teléfono</th>
                  <th>Email</th><th>Dirección</th><th>Estado</th>
                  <th className="text-end">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {proveedores.length === 0 && (
                  <tr><td colSpan={8} className="text-center text-secondary">Sin proveedores</td></tr>
                )}
                {proveedores.map((p) => (
                  <tr key={p.id}>
                    <td>{p.nombre}</td>
                    <td className="small">{p.tipo_item || '—'}</td>
                    <td className="small">{p.tipo_documento} {p.documento || '—'}</td>
                    <td className="small">{p.telefono || '—'}</td>
                    <td className="small">{p.email || '—'}</td>
                    <td className="small">{p.direccion || '—'}</td>
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
            <Paginacion pagina={pagina} paginas={paginas} onChange={setPagina} />
          </Card.Body>
        </Card>
      )}

      <Modal show={modal} onHide={() => setModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>{editando ? 'Editar proveedor' : 'Nuevo proveedor'}</Modal.Title>
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
                <Form.Label>Tipo de item</Form.Label>
                <Form.Control placeholder="Ej. bebidas, aseo, papelería" value={form.tipo_item}
                  onChange={(e) => setForm({ ...form, tipo_item: e.target.value })} />
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
  nombre: '', tipo_documento: 'NIT', documento: '', telefono: '', email: '',
  direccion: '', tipo_item: '', activo: 1
});

export default Proveedores;
