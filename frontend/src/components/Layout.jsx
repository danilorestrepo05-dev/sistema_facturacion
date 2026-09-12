// src/components/Layout.jsx
// Estructura general de la aplicación: barra superior de herramientas (marca,
// navegación con grupos y acciones) + contenido.
// En pantallas grandes la navegación es una navbar horizontal con dropdowns
// agrupados; en móviles se convierte en un menú deslizable (Offcanvas) con la
// misma navegación en vertical.
import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { Button, Form, Nav, NavDropdown, Offcanvas } from 'react-bootstrap';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/ConfigContext';
import { descargarBackup } from '../services/backup';

// Enlaces directos (sin grupo): se muestran como pestaña simple en la navbar.
const enlacesDirectos = [
  { nombre: 'Dashboard', ruta: '/dashboard', icono: 'bi-speedometer2' }
];

// Grupos del menú superior. Cada enlace puede tener:
//   soloAdmin   -> solo visible para rol admin
//   siHabilitado-> solo si el flag de configuración está activo
const grupos = [
  {
    titulo: 'Operación', icono: 'bi-cart', enlaces: [
      { nombre: 'Caja', ruta: '/caja', icono: 'bi-cash-coin' },
      { nombre: 'Facturas', ruta: '/facturas', icono: 'bi-receipt' },
      { nombre: 'Notas correctivas', ruta: '/notas', icono: 'bi-journal-arrow-up-down', soloAdmin: true },
      { nombre: 'Arqueo', ruta: '/arqueo', icono: 'bi-calculator', siHabilitado: 'arqueo_habilitado' }
    ]
  },
  {
    titulo: 'Inventario', icono: 'bi-box-seam', enlaces: [
      { nombre: 'Productos', ruta: '/productos', icono: 'bi-box-seam' },
      { nombre: 'Compras', ruta: '/compras', icono: 'bi-basket-fill', soloAdmin: true },
      { nombre: 'Catálogo', ruta: '/catalogo', icono: 'bi-tags' }
    ]
  },
  {
    titulo: 'Contactos', icono: 'bi-people', enlaces: [
      { nombre: 'Clientes', ruta: '/clientes', icono: 'bi-people' },
      { nombre: 'Proveedores', ruta: '/proveedores', icono: 'bi-truck' }
    ]
  },
  {
    titulo: 'Reportes', icono: 'bi-graph-up', enlaces: [
      { nombre: 'Reportes', ruta: '/reportes', icono: 'bi-graph-up' }
    ]
  },
  {
    titulo: 'Administración', icono: 'bi-gear', soloAdmin: true, enlaces: [
      { nombre: 'Usuarios', ruta: '/usuarios', icono: 'bi-person-gear' },
      { nombre: 'Configuración', ruta: '/configuracion', icono: 'bi-sliders' }
    ]
  }
];

// Navegación VERTICAL (menú móvil Offcanvas): vista plana con los mismos
// enlaces y privilegios que la navbar de escritorio.
const NavegacionVertical = ({ esAdmin, onNavegar }) => {
  const { estaHabilitado } = useConfig();

  const agregarEnlace = (enlace, items) => {
    if (enlace.soloAdmin && !esAdmin) return;
    if (enlace.siHabilitado && !estaHabilitado(enlace.siHabilitado)) return;
    items.push(
      <NavLink
        key={enlace.ruta}
        to={enlace.ruta}
        onClick={onNavegar}
        className={({ isActive }) => `nav-link ${isActive ? 'activo' : ''}`}
      >
        <i className={`bi ${enlace.icono}`}></i>
        {enlace.nombre}
      </NavLink>
    );
  };

  const items = [];
  enlacesDirectos.forEach((e) => agregarEnlace(e, items));
  grupos.forEach((g) => {
    if (g.soloAdmin && !esAdmin) return;
    g.enlaces.forEach((e) => agregarEnlace(e, items));
  });

  return <nav className="nav flex-column flex-grow-1 pt-2">{items}</nav>;
};

// Navegación HORIZONTAL (escritorio): pestañas directas + dropdowns por grupo.
const NavegacionHorizontal = ({ esAdmin }) => {
  const { estaHabilitado } = useConfig();
  const { pathname } = useLocation();

  const esVisible = (enlace) =>
    (!enlace.soloAdmin || esAdmin) &&
    (!enlace.siHabilitado || estaHabilitado(enlace.siHabilitado));

  const renderEnlace = (enlace) => (
    <Nav.Link
      key={enlace.ruta}
      as={NavLink}
      to={enlace.ruta}
      className={({ isActive }) => (isActive ? 'activo' : '')}
    >
      <i className={`bi ${enlace.icono} me-1`}></i>
      {enlace.nombre}
    </Nav.Link>
  );

  const renderGrupo = (grupo, esUltimo) => {
    if (grupo.soloAdmin && !esAdmin) return null;
    const visibles = grupo.enlaces.filter(esVisible);
    if (visibles.length === 0) return null;
    // Un solo enlace dentro del grupo se muestra como pestaña sencilla.
    if (visibles.length === 1) return renderEnlace(visibles[0]);
    const grupoActivo = visibles.some((e) => pathname === e.ruta);
    return (
      <NavDropdown
        key={grupo.titulo}
        id={`nav-grupo-${grupo.titulo}`}
        title={<><i className={`bi ${grupo.icono} me-1`}></i>{grupo.titulo}</>}
        active={grupoActivo}
        // El último grupo abre su menú pegado al borde derecho para no cortarse.
        align={esUltimo ? 'end' : 'start'}
      >
        {visibles.map((enlace) => (
          <NavDropdown.Item
            key={enlace.ruta}
            as={NavLink}
            to={enlace.ruta}
            className={pathname === enlace.ruta ? 'active' : ''}
          >
            <i className={`bi ${enlace.icono}`}></i>
            {enlace.nombre}
          </NavDropdown.Item>
        ))}
      </NavDropdown>
    );
  };

  const gruposVisibles = grupos.filter(
    (g) => !g.soloAdmin || esAdmin
  );

  return (
    <div className="app-navbar-nav">
      {enlacesDirectos.filter(esVisible).map(renderEnlace)}
      {gruposVisibles.map((grupo, i) =>
        renderGrupo(grupo, i === gruposVisibles.length - 1)
      )}
    </div>
  );
};

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
      {/* Barra superior de dos filas: (1) marca + acciones, (2) menú por grupos. */}
      <header className="app-navbar">
        {/* Fila 1: marca y acciones */}
        <div className="app-navbar-alta">
          <div className="app-navbar-marca">
            <Button
              variant="outline-secondary"
              size="sm"
              className="d-lg-none"
              onClick={() => setMenuAbierto(true)}
              title="Abrir menú"
            >
              <i className="bi bi-list fs-5"></i>
            </Button>
            <i className="bi bi-receipt-cutoff"></i>
            <span>Mi Negocio</span>
          </div>

          <div className="app-navbar-acciones d-flex align-items-center gap-3">
            {esAdmin && (
              <>
                <Form.Check
                  className="d-none d-xl-flex"
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
                  <span className="d-none d-lg-inline">Backup</span>
                </Button>
              </>
            )}
            <div className="text-end d-none d-lg-block">
              <div className="fw-semibold small">{usuario?.nombre_completo}</div>
              <div className="text-secondary text-capitalize small">{usuario?.rol}</div>
            </div>
            <Button variant="outline-secondary" size="sm" onClick={salir}>
              <i className="bi bi-box-arrow-right me-1"></i>
              <span className="d-none d-md-inline">Salir</span>
            </Button>
          </div>
        </div>

        {/* Fila 2: navegación por grupos (solo desktop) */}
        <div className="app-navbar-baja d-none d-lg-flex">
          <NavegacionHorizontal esAdmin={esAdmin} />
        </div>
      </header>

      {/* Menú deslizable para móviles */}
      <Offcanvas
        show={menuAbierto}
        onHide={() => setMenuAbierto(false)}
        placement="start"
        className="app-sidebar-offcanvas"
      >
        <Offcanvas.Header className="marca">
          <Offcanvas.Title>
            <i className="bi bi-receipt-cutoff me-2"></i>
            <span>Mi Negocio</span>
          </Offcanvas.Title>
        </Offcanvas.Header>
        <NavegacionVertical esAdmin={esAdmin} onNavegar={() => setMenuAbierto(false)} />
      </Offcanvas>

      {/* Contenido */}
      <div className="app-contenido">
        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;