// src/components/Layout.jsx
// Estructura general de la aplicación: barra lateral, barra superior y contenido.
// En pantallas grandes la barra lateral es fija; en móviles se convierte en un
// menú deslizable (Offcanvas) que se abre con el botón de hamburguesa.
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { Button, Form, Offcanvas } from 'react-bootstrap';
import { useAuth } from '../context/AuthContext';
import { descargarBackup } from '../services/backup';

// Elementos del menú lateral (nombre, ruta e icono).
const enlaces = [
  { nombre: 'Dashboard', ruta: '/dashboard', icono: 'bi-speedometer2' },
  { nombre: 'Caja', ruta: '/caja', icono: 'bi-cash-coin' },
  { nombre: 'Facturas', ruta: '/facturas', icono: 'bi-receipt' },
  { nombre: 'Productos', ruta: '/productos', icono: 'bi-box-seam' },
  { nombre: 'Catálogo', ruta: '/catalogo', icono: 'bi-tags' },
  { nombre: 'Clientes', ruta: '/clientes', icono: 'bi-people' },
  { nombre: 'Proveedores', ruta: '/proveedores', icono: 'bi-truck' },
  { nombre: 'Reportes', ruta: '/reportes', icono: 'bi-graph-up' }
];

// Navegación compartida entre la barra lateral (escritorio) y el menú móvil.
const Navegacion = ({ esAdmin, onNavegar }) => (
  <nav className="nav flex-column flex-grow-1 pt-2">
    {enlaces.map((enlace) => (
      <NavLink
        key={enlace.ruta}
        to={enlace.ruta}
        onClick={onNavegar}
        className={({ isActive }) => `nav-link ${isActive ? 'activo' : ''}`}
      >
        <i className={`bi ${enlace.icono}`}></i>
        {enlace.nombre}
      </NavLink>
    ))}
    {esAdmin && (
      <NavLink
        to="/usuarios"
        onClick={onNavegar}
        className={({ isActive }) => `nav-link ${isActive ? 'activo' : ''}`}
      >
        <i className="bi bi-person-gear"></i>
        Usuarios
      </NavLink>
    )}
  </nav>
);

const Layout = () => {
  const { usuario, cerrarSesion } = useAuth();
  const navegar = useNavigate();
  const esAdmin = usuario?.rol === 'admin';

  // Menú móvil abierto o cerrado (Offcanvas).
  const [menuAbierto, setMenuAbierto] = useState(false);

  // Preferencia de "backup al salir" guardada en el navegador.
  const [backupAlSalir, setBackupAlSalir] = useState(
    localStorage.getItem('backupAlSalir') === '1'
  );
  const [generandoBackup, setGenerandoBackup] = useState(false);

  const cambiarBackupAlSalir = (activado) => {
    localStorage.setItem('backupAlSalir', activado ? '1' : '0');
    setBackupAlSalir(activado);
  };

  // Descarga un backup de la base de datos (manual o automático al salir).
  const generarBackup = async () => {
    setGenerandoBackup(true);
    try {
      await descargarBackup();
    } catch (err) {
      window.alert(err.mensaje || err.response?.data?.mensaje || 'No se pudo generar el backup');
    } finally {
      setGenerandoBackup(false);
    }
  };

  // Cierra sesión; si está activado, primero genera el backup.
  const salir = async () => {
    if (backupAlSalir) {
      try {
        await descargarBackup();
      } catch {
        // Aun si el backup falla se permite salir (se informó en generarBackup solo al manual).
      }
    }
    cerrarSesion();
    navegar('/login');
  };

  return (
    <div className="app-layout">
      {/* Barra lateral de navegación (solo pantallas grandes) */}
      <aside className="app-sidebar d-none d-lg-flex">
        <div className="marca d-flex align-items-center gap-2">
          <i className="bi bi-cup-hot-fill"></i>
          <span>Mi Negocio</span>
        </div>
        <Navegacion esAdmin={esAdmin} />
      </aside>

      {/* Menú deslizable para móviles */}
      <Offcanvas
        show={menuAbierto}
        onHide={() => setMenuAbierto(false)}
        placement="start"
        className="app-sidebar-offcanvas"
      >
        <Offcanvas.Header className="marca">
          <Offcanvas.Title>
            <i className="bi bi-cup-hot-fill me-2"></i>
            <span>Mi Negocio</span>
          </Offcanvas.Title>
        </Offcanvas.Header>
        <Navegacion esAdmin={esAdmin} onNavegar={() => setMenuAbierto(false)} />
      </Offcanvas>

      {/* Contenido */}
      <div className="app-contenido">
        <header className="app-topbar">
          <div className="d-flex align-items-center gap-2">
            <Button
              variant="outline-secondary"
              size="sm"
              className="d-lg-none"
              onClick={() => setMenuAbierto(true)}
              title="Abrir menú"
            >
              <i className="bi bi-list fs-5"></i>
            </Button>
            <h5 className="mb-0 text-secondary d-none d-md-block">Sistema de Facturación</h5>
          </div>
          <div className="d-flex align-items-center gap-3">
            {esAdmin && (
              <>
                <Form.Check
                  className="d-none d-sm-block"
                  type="switch"
                  id="backup-al-salir"
                  label="Backup al salir"
                  title="Genera y descarga un respaldo de la base de datos al cerrar sesión"
                  checked={backupAlSalir}
                  onChange={(e) => cambiarBackupAlSalir(e.target.checked)}
                />
                <Button
                  variant="primary"
                  size="sm"
                  disabled={generandoBackup}
                  onClick={generarBackup}
                  title="Descargar un respaldo de la base de datos"
                >
                  {generandoBackup ? (
                    <span className="spinner-border spinner-border-sm me-1"></span>
                  ) : (
                    <i className="bi bi-database-down me-1"></i>
                  )}
                  <span className="d-none d-md-inline">Backup</span>
                </Button>
              </>
            )}
            <div className="text-end d-none d-sm-block">
              <div className="fw-semibold small">{usuario?.nombre_completo}</div>
              <div className="text-secondary text-capitalize small">{usuario?.rol}</div>
            </div>
            <Button variant="outline-secondary" size="sm" onClick={salir}>
              <i className="bi bi-box-arrow-right me-1"></i>
              <span className="d-none d-md-inline">Salir</span>
            </Button>
          </div>
        </header>
        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
