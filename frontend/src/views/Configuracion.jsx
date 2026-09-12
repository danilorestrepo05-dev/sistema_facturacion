// src/views/Configuracion.jsx
// Pantalla de administración (solo admin): activa o desactiva las funciones
// opcionales del sistema (flags de la tabla configuraciones).
import { useEffect, useState } from 'react';
import {
  Row, Col, Card, Form, Button, Table, Spinner
} from 'react-bootstrap';
import api from '../services/api';
import { useConfig } from '../context/ConfigContext';
import AlertaAuto from '../components/AlertaAuto';

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

  // Separa las claves de facturación electrónica (y notas, y Factus) del resto.
  const esDian = (clave) =>
    clave === 'facturacion_electronica_habilitado' || clave.startsWith('dian_') ||
    clave === 'notas_correctivas_habilitado' || clave.startsWith('notas_prefijo_') ||
    clave.startsWith('factus_');
  const dian = configuraciones.filter((c) => esDian(c.clave));
  const generales = configuraciones.filter((c) => !esDian(c.clave));

  return (
    <div>
      <h4 className="mb-3">Configuración</h4>
      <AlertaAuto variante="danger" mensaje={error} onCerrar={() => setError('')} />

      {cargando ? (
        <div className="text-center py-5"><Spinner animation="border" /></div>
      ) : (
        <>
          {/* Bloque de facturación electrónica DIAN (Fase 6). */}
          <Card className="card-kpi mb-4">
            <Card.Body>
              <Card.Title className="h6 mb-1">
                <i className="bi bi-receipt me-1"></i> Facturación electrónica DIAN
              </Card.Title>
              <Card.Text className="text-secondary small">
                Controla la emisión de documentos electrónicos ante la DIAN (Colombia).
                En "Simulación (test)" las facturas se aprueban localmente sin conexión;
                al activar Factus se utilizan credenciales reales de habilitación.
              </Card.Text>
              <TablaConfig filas={dian} guardando={guardando}
                guardar={guardar} cambiarValor={cambiarValor} />
            </Card.Body>
          </Card>

          {/* Resto de funciones opcionales del negocio. */}
          <Row>
            <Col lg={8}>
              <Card className="card-kpi">
                <Card.Body>
                  <Card.Text className="text-secondary small">
                    Activa solo las funciones que tu negocio use. Las desactivadas no
                    aparecen en ninguna pantalla del sistema.
                  </Card.Text>
                  <TablaConfig filas={generales} guardando={guardando}
                    guardar={guardar} cambiarValor={cambiarValor} />
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </>
      )}
    </div>
  );
};

// Tabla reutilizable de filas de configuración con su control según el tipo de valor.
const TablaConfig = ({ filas, guardando, guardar, cambiarValor }) => (
  <Table responsive hover size="sm" className="mb-0 align-middle">
    <thead>
      <tr>
        <th>Función</th><th>Estado</th><th className="text-end">Acción</th>
      </tr>
    </thead>
    <tbody>
      {filas.map((c) => (
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
            ) : opciones[c.clave] ? (
              <Form.Select size="sm" value={c.valor}
                onChange={(e) => cambiarValor(c.clave, e.target.value)}>
                {(opciones[c.clave] || []).map((op) => (
                  <option key={op.valor} value={op.valor}>{op.etiqueta}</option>
                ))}
              </Form.Select>
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
      {filas.length === 0 && (
        <tr><td colSpan="3" className="text-secondary small py-3 text-center">Sin opciones en este bloque</td></tr>
      )}
    </tbody>
  </Table>
);

// Los flags booleanos se muestran como interruptor; otros valores, como texto.
const esFlag = (valor) => valor === '0' || valor === '1';

// Opciones cerradas de ciertas claves: se muestran como menú desplegable.
const opciones = {
  dian_regimen: [
    { valor: 'responsable_iva', etiqueta: 'Responsable de IVA' },
    { valor: 'no_responsable', etiqueta: 'No responsable' },
    { valor: 'simplificado', etiqueta: 'Régimen simplificado' },
    { valor: 'gran_contribuyente', etiqueta: 'Gran contribuyente' }
  ],
  dian_proveedor: [
    { valor: 'simulacion', etiqueta: 'Simulación (test, sin DIAN)' },
    { valor: 'factus', etiqueta: 'Factus (proveedor real)' }
  ],
  factus_ambiente: [
    { valor: 'sandbox', etiqueta: 'Sandbox (pruebas)' },
    { valor: 'produccion', etiqueta: 'Producción (habilitación DIAN)' }
  ],
  gaveta_modo: [
    { valor: 'simulacion', etiqueta: 'Simulación' },
    { valor: 'red', etiqueta: 'Red (IP:9100)' },
    { valor: 'compartida', etiqueta: 'Impresora compartida (ruta)' }
  ]
};

// Etiqueta legible a partir de la clave técnica (codigo_barras_habilitado → "Código barras").
const etiqueta = (clave) => {
  const nombres = {
    codigo_barras_habilitado: 'Códigos de barras',
    gaveta_habilitada: 'Gaveta de dinero',
    gaveta_modo: 'Gaveta: modo (simulacion | red | compartida)',
    gaveta_direccion: 'Gaveta: dirección de la térmica (IP:9100 o ruta)',
    arqueo_habilitado: 'Arqueo de caja',
    visador_habilitado: 'Visador (pantalla cliente)',
    facturacion_electronica_habilitado: 'Facturación electrónica DIAN',
    dian_regimen: 'Régimen del contribuyente',
    dian_adquirente_consumidor: 'Permitir adquirente "Consumidor Final" (si se desactiva, la Caja exige cliente real)',
    dian_proveedor: 'Proveedor de facturación electrónica',
    dian_modo_test: 'Modo test / habilitación (sin facturas reales DIAN)',
    factus_ambiente: 'Factus: ambiente (sandbox | produccion)',
    factus_client_id: 'Factus: Client ID (o en .env como FACTUS_CLIENT_ID)',
    factus_client_secret: 'Factus: Client Secret (o en .env como FACTUS_CLIENT_SECRET)',
    notas_correctivas_habilitado: 'Notas correctivas (crédito y débito)',
    notas_prefijo_credito: 'Prefijo de notas crédito',
    notas_prefijo_debito: 'Prefijo de notas débito'
  };
  return nombres[clave] || clave;
};

export default Configuracion;
