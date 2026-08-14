// src/components/RutaAdmin.jsx
// Guard de rutas para módulos exclusivos de administradores:
// sin sesión redirige al login y un rol no-admin (cajero) no puede
// abrir el módulo ni por URL ni por otro medio, se le envía al dashboard.
import { Navigate } from 'react-router';
import { useAuth } from '../context/AuthContext';

const RutaAdmin = ({ children }) => {
  const { usuario } = useAuth();

  // Sin sesión activa: a iniciar sesión.
  if (!usuario) {
    return <Navigate to="/login" replace />;
  }

  // Rol no-admin intentando acceder a un módulo de administración.
  if (usuario.rol !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

export default RutaAdmin;
