// src/views/Login.jsx
// Pantalla de inicio de sesión.
import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router';
import { Button, Card, Form, Alert } from 'react-bootstrap';
import { useAuth } from '../context/AuthContext';

const Login = () => {
  const { usuario, iniciarSesion } = useAuth();
  const navegar = useNavigate();

  const [nombreUsuario, setNombreUsuario] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  // Si ya hay sesión, ir directo al dashboard.
  if (usuario) {
    return <Navigate to="/dashboard" replace />;
  }

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      await iniciarSesion(nombreUsuario, contrasena);
      navegar('/dashboard');
    } catch (err) {
      setError(err.response?.data?.mensaje || 'No se pudo iniciar sesión');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="d-flex align-items-center justify-content-center" style={{ minHeight: '100vh', backgroundColor: '#eef2f7' }}>
      <Card style={{ width: '100%', maxWidth: 400 }} className="shadow-sm">
        <Card.Body className="p-4">
          <div className="text-center mb-4">
            <div className="display-6 mb-2"><i className="bi bi-cup-hot-fill"></i></div>
            <h4 className="fw-bold mb-1">Sistema de Facturación</h4>
            <p className="text-secondary mb-0">Inicia sesión para continuar</p>
          </div>

          {error && <Alert variant="danger">{error}</Alert>}

          <Form onSubmit={enviar}>
            <Form.Group className="mb-3">
              <Form.Label>Usuario</Form.Label>
              <Form.Control
                type="text"
                placeholder="ej. admin"
                value={nombreUsuario}
                onChange={(e) => setNombreUsuario(e.target.value)}
                required
                autoFocus
              />
            </Form.Group>

            <Form.Group className="mb-4">
              <Form.Label>Contraseña</Form.Label>
              <Form.Control
                type="password"
                placeholder="••••••••"
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
                required
              />
            </Form.Group>

            <Button type="submit" variant="primary" className="w-100" disabled={cargando}>
              {cargando ? 'Ingresando…' : 'Ingresar'}
            </Button>
          </Form>
        </Card.Body>
      </Card>
    </div>
  );
};

export default Login;
