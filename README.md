# Sistema de Facturación e Inventario

> **⚠️ Proyecto en construcción** — Versión de desarrollo v0.9.6. Este repositorio contiene el código fuente en evolución activa; las funcionalidades y la documentación pueden cambiar. Úsalo bajo tu propio criterio.

Sistema POS y administrativo desacoplado, escalable y modular (arquitectura Monorepo Full-Stack JS). Diseñado de forma genérica para que pueda adaptarse a otros modelos de negocio (café, peluquería, tienda, etc.) cambiando únicamente registros de la base de datos y variables de entorno.

## Stack tecnológico
- **Base de datos:** MariaDB/MySQL (XAMPP, puerto 3306).
- **Backend:** Node.js + Express 5 (`backend/`).
- **Frontend:** React + Vite + Bootstrap 5 (`frontend/`, en desarrollo).

## Estado actual (v0.9.6)
- Base de datos `sistema_facturacion` con tablas `usuarios`, `impuestos`, `categorias`, `productos`, `clientes`, `proveedores`, `facturas`, `detalles_factura` y `movimientos_inventario`.
- Backend con autenticación JWT + bcrypt.
- Gestión de usuarios (solo admin): crear, editar, desactivar y cambiar contraseñas desde la interfaz.
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
2. Instalar dependencias:
   ```powershell
   cd backend; npm install
   ```
3. Crear el usuario administrador (contraseña por defecto `admin123`):
   ```powershell
   npm run seed
   ```
4. Copiar `backend\.env.example` a `backend\.env` y ajustar valores.
5. Iniciar la API:
   ```powershell
   npm run dev
   ```

## Endpoints disponibles
| Método | Ruta                 | Descripción                        | Autenticación |
|--------|----------------------|------------------------------------|---------------|
| GET    | `/api/v1/health`     | Estado de la API                   | No            |
| POST   | `/api/v1/auth/login` | Inicio de sesión (`nombre_usuario`, `contrasena`) | No |
| GET    | `/api/v1/auth/perfil`| Perfil del usuario autenticado     | Token JWT (Bearer) |
| GET/POST | `/api/v1/categorias`, `/api/v1/impuestos`, `/api/v1/productos` | Catálogo (listar/crear) | Token JWT |
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
   cd frontend; npm install
   ```
2. Iniciar el servidor de desarrollo (proxy `/api` hacia el backend en `127.0.0.1:3000`):
   ```powershell
   npm run dev
   ```
3. Abrir `http://localhost:5173` e iniciar sesión con las credenciales del backend (p. ej. `admin` / `admin123`).

> Nota: el backend debe estar corriendo para el inicio de sesión y las operaciones. Para producción se puede compilar con `npm run build` (genera `dist/`).
