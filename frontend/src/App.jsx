// src/App.jsx
// Define las rutas de la aplicación.
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './views/Login';
import Dashboard from './views/Dashboard';
import Caja from './views/Caja';
import Facturas from './views/Facturas';
import Productos from './views/Productos';
import Catalogo from './views/Catalogo';
import Clientes from './views/Clientes';
import Proveedores from './views/Proveedores';
import Reportes from './views/Reportes';
import Usuarios from './views/Usuarios';

const App = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="caja" element={<Caja />} />
        <Route path="facturas" element={<Facturas />} />
        <Route path="productos" element={<Productos />} />
        <Route path="catalogo" element={<Catalogo />} />
        <Route path="clientes" element={<Clientes />} />
        <Route path="proveedores" element={<Proveedores />} />
        <Route path="reportes" element={<Reportes />} />
        <Route path="usuarios" element={<Usuarios />} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  </BrowserRouter>
);

export default App;
