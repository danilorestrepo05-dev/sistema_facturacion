// src/views/Configuracion.jsx
// Pantalla de administración (solo admin): activa o desactiva las funciones
// opcionales del sistema (flags de la tabla configuraciones).
import { useEffect, useState } from 'react';
import {
  Row, Col, Card, Form, Button, Table, Spinner, Alert
} from 'react-bootstrap';
import api from '../services/api';
import { useConfig } from '../context/ConfigContext';

const Configuracion = () => {
  const { actualizarLocal } = useConfig();
  const [configuraciones, setConfiguraciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(''); // clave en proceso de guardado

  useEffect(() => { cargar(); }, []);

  const cargar = async () => {
    setCargando(true);
    setError('');
    try {
      const respuesta = await api.get('/configuracion');
      setConfiguraciones(respuesta.data.datos);
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al cargar la configuración');
    } finally {
      setCargando(false);
    }
  };

  // Cambia el valor en el estado local (aún sin guardar en el servidor).
  const cambiarValor = (clave, valor) => {
    setConfiguraciones((prev) =>
      prev.map((c) => (c.clave === clave ? { ...c, valor } : c))
    );
  };

  // Guarda una fila; si es un flag ('0'/'1') refresca también el contexto global.
  const guardar = async (fila) => {
    setGuardando(fila.clave);
    setError('');
    try {
      const respuesta = await api.put('/configuracion', { clave: fila.clave, valor: fila.valor });
      setConfiguraciones(respuesta.data.datos);
      actualizarLocal(fila.clave, fila.valor);
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al guardar la configuración');
    } finally {
      setGuardando('');
    }
  };

  return (
    <div>
      <h4 className="mb-3">Configuración</h4>
      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}

      <Row>
        <Col lg={8}>
          <Card className="card-kpi">
            <Card.Body>
              <Card.Text className="text-secondary small">
                Activa solo las funciones que tu negocio use. Las desactivadas no aparecen
                en ninguna pantalla del sistema.
              </Card.Text>

              {cargando ? (
                <div className="text-center py-5"><Spinner animation="border" /></div>
              ) : (
                <Table responsive hover size="sm" className="mb-0 align-middle">
                  <thead>
                    <tr>
                      <th>Función</th><th>Estado</th><th className="text-end">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {configuraciones.map((c) => (
                      <tr key={c.clave}>
                        <td>
                          <div className="fw-semibold small">{etiqueta(c.clave)}</div>
                          <div className="text-secondary small">{c.descripcion}</div>
                        </td>
                        <td style={{ minWidth: 140 }}>
                          {esFlag(c.valor) ? (
                            <Form.Check type="switch" id={`flag-${c.clave}`}
                              label={c.valor === '1' ? 'Activa' : 'Inactiva'}
                              checked={c.valor === '1'}
                              onChange={(e) => cambiarValor(c.clave, e.target.checked ? '1' : '0')}
                            />
                          ) : (
                            <Form.Control size="sm" value={c.valor}
                              onChange={(e) => cambiarValor(c.clave, e.target.value)} />
                          )}
                        </td>
                        <td className="text-end">
                          <Button size="sm" variant="outline-primary"
                            disabled={guardando === c.clave}
                            onClick={() => guardar(c)}>
                            {guardando === c.clave
                              ? <span className="spinner-border spinner-border-sm"></span>
                              : <i className="bi bi-save"></i>}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

// Los flags booleanos se muestran como interruptor; otros valores, como texto.
const esFlag = (valor) => valor === '0' || valor === '1';

// Etiqueta legible a partir de la clave técnica (codigo_barras_habilitado → "Código barras").
const etiqueta = (clave) => {
  const nombres = {
    codigo_barras_habilitado: 'Códigos de barras',
    gaveta_habilitada: 'Gaveta de dinero',
    gaveta_modo: 'Gaveta: modo (simulacion | red | compartida)',
    gaveta_direccion: 'Gaveta: dirección de la térmica (IP:9100 o ruta)',
    arqueo_habilitado: 'Arqueo de caja',
    visador_habilitado: 'Visador (pantalla cliente)'
  };
  return nombres[clave] || clave;
};

export default Configuracion;
