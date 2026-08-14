# Sistema de Facturación e Inventario

> **⚠️ Proyecto en construcción** — Versión de desarrollo v0.9.11. Este repositorio contiene el código fuente en evolución activa; las funcionalidades y la documentación pueden cambiar. Úsalo bajo tu propio criterio.

Sistema POS y administrativo desacoplado, escalable y modular (arquitectura Monorepo Full-Stack JS). Diseñado de forma genérica para que pueda adaptarse a otros modelos de negocio (café, peluquería, tienda, etc.) cambiando únicamente registros de la base de datos y variables de entorno.

## Stack tecnológico
- **Base de datos:** MariaDB/MySQL (XAMPP, puerto 3306).
- **Backend:** Node.js + Express 5 (`backend/`).
- **Frontend:** React + Vite + Bootstrap 5 (`frontend/`, en desarrollo).

## Estado actual (v0.9.11)
- Base de datos `sistema_facturacion` con tablas `usuarios`, `impuestos`, `categorias`, `productos`, `clientes`, `proveedores`, `facturas`, `detalles_factura` y `movimientos_inventario`.
- Backend con autenticación JWT + bcrypt.
- **Roles `admin` y `cajero`**: toda escritura (catálogo, contactos, usuarios, anulación de factura, backup) exige rol administrador en el backend (403). En el frontend, las rutas de administración (`/usuarios`) están protegidas por un guard por rol (`RutaAdmin`): un cajero no puede acceder por URL.
- **Flag activo/inactivo funcional en todos los módulos**: los registros inactivos no se ofrecen en los flujos operativos (un producto inactivo no se vende, un cliente inactivo no se selecciona en Caja, los selects de categoría e impuesto solo muestran activos); los listados de gestión los siguen mostrando para poder reactivarlos.
- **Autogeneración de código de producto** (`PRO-001`, `PRO-002`, ...) con precarga editable en el formulario.
- Catálogo (categorías, impuestos, productos) y contactos (clientes, proveedores) con CRUD protegido por roles.
- Facturación transaccional: emisión con descuento de stock y movimientos de inventario, consulta y anulación.
- Impresión: PDF Carta/Media carta y ticket POS térmico (58/80mm).
- Reportes de ventas, inventario y movimientos de inventario.
- **Frontend funcional**: Login, Dashboard con KPIs y gráficos, Caja (POS), Facturas, Productos, Catálogo, Clientes, Proveedores, Reportes y Usuarios.
- Módulos pendientes: facturación electrónica DIAN (a futuro).

## Cómo ejecutar el backend

1. Encender MariaDB (XAMPP) y ejecutar el esquema:
   ```powershell
   Get-Content backend\sql\01_schema.sql -Raw | & C:\xampp\mysql\bin\mysql.exe -u root
   ```
2. Instalar dependencias (pnpm v11, activado vía corepack):
   ```powershell
   cd backend; pnpm install
   ```
3. Crear el usuario administrador (contraseña por defecto `admin123`):
   ```powershell
   pnpm run seed
   ```
4. Copiar `backend\.env.example` a `backend\.env` y ajustar valores.
5. Iniciar la API:
   ```powershell
   pnpm run dev
   ```

## Endpoints disponibles
| Método | Ruta                 | Descripción                        | Autenticación |
|--------|----------------------|------------------------------------|---------------|
| GET    | `/api/v1/health`     | Estado de la API                   | No            |
| POST   | `/api/v1/auth/login` | Inicio de sesión (`nombre_usuario`, `contrasena`) | No |
| GET    | `/api/v1/auth/perfil`| Perfil del usuario autenticado     | Token JWT (Bearer) |
| GET/POST | `/api/v1/categorias`, `/api/v1/impuestos`, `/api/v1/productos` | Catálogo (listar/crear) | Token JWT |
| GET | `/api/v1/productos/siguiente-codigo` | Código correlativo sugerido para un producto nuevo | Token JWT |
| GET/PUT/DELETE | `/api/v1/categorias/:id`, `/api/v1/impuestos/:id`, `/api/v1/productos/:id` | Catálogo (ver/editar/eliminar) | Token JWT (PUT/DELETE: admin) |
| GET/POST | `/api/v1/clientes`, `/api/v1/proveedores` | Contactos (listar/crear) | Token JWT |
| GET/PUT/DELETE | `/api/v1/clientes/:id`, `/api/v1/proveedores/:id` | Contactos (ver/editar/eliminar) | Token JWT (PUT/DELETE: admin) |
| GET/POST | `/api/v1/usuarios` | Usuarios (listar/crear) | Token JWT (admin) |
| GET/PUT/DELETE | `/api/v1/usuarios/:id` | Usuarios (ver/editar/desactivar) | Token JWT (admin) |
| GET/POST | `/api/v1/facturas` | Facturas (listar con filtros / emitir) | Token JWT |
| GET | `/api/v1/facturas/:id` | Detalle de una factura con sus líneas | Token JWT |
| POST | `/api/v1/facturas/:id/anular` | Anular factura y reponer stock | Token JWT (admin) |
| GET | `/api/v1/facturas/:id/pdf?formato=carta\|media_carta` | Descargar PDF de la factura | Token JWT |
| GET | `/api/v1/facturas/:id/ticket?ancho=58\|80` | Buffer de impresión térmica POS | Token JWT |
| GET | `/api/v1/reportes/ventas?fecha_desde&fecha_hasta` | Reporte de ventas del período | Token JWT |
| GET | `/api/v1/reportes/ventas/diarias?fecha_desde&fecha_hasta` | Ventas emitidas agrupadas por día | Token JWT |
| GET | `/api/v1/reportes/inventario` | Reporte de inventario (bajo stock, categorías) | Token JWT |
| GET | `/api/v1/reportes/movimientos?fecha_desde&fecha_hasta&tipo&motivo` | Movimientos de inventario (resumen y detalle) | Token JWT |

## Cómo ejecutar el frontend

1. Instalar dependencias:
   ```powershell
   cd frontend; pnpm install
   ```
2. Iniciar el servidor de desarrollo (proxy `/api` hacia el backend en `127.0.0.1:3000`):
   ```powershell
   pnpm run dev
   ```
3. Abrir `http://localhost:5173` e iniciar sesión con las credenciales del backend (p. ej. `admin` / `admin123`).

> Nota: el backend debe estar corriendo para el inicio de sesión y las operaciones. Para producción se puede compilar con `pnpm run build` (genera `dist/`).

## Gestión de dependencias
- El proyecto usa **pnpm v11** (ver `packageManager` en cada `package.json`; instala con `corepack enable pnpm`).
- Lockfiles versionados: `backend/pnpm-lock.yaml` y `frontend/pnpm-lock.yaml`.
- Auditoría de seguridad: `pnpm audit` (dentro de `backend/` o `frontend/`).
- `node_modules` plano (`nodeLinker: hoisted` en `pnpm-workspace.yaml`) para evitar errores de symlink en Windows.
