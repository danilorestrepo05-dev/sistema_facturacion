# Sistema de Facturación e Inventario

> **⚠️ Proyecto en construcción** — Versión de desarrollo v0.9.34. Este repositorio contiene el código fuente en evolución activa; las funcionalidades y la documentación pueden cambiar. Úsalo bajo tu propio criterio.

Sistema POS y administrativo desacoplado, escalable y modular (arquitectura Monorepo Full-Stack JS). Diseñado de forma genérica para que pueda adaptarse a cualquier modelo de negocio (tienda, peluquería, droguería, restaurante, etc.) cambiando únicamente registros de la base de datos y variables de entorno.

## Stack tecnológico
- **Base de datos:** MariaDB/MySQL (XAMPP, puerto 3306).
- **Backend:** Node.js + Express 5 (`backend/`).
- **Frontend:** React + Vite + Bootstrap 5 (`frontend/`, en desarrollo).

## Estado actual (v0.9.27)
- Base de datos `sistema_facturacion` con tablas `usuarios`, `impuestos`, `categorias`, `productos`, `clientes`, `proveedores`, `facturas`, `detalles_factura`, `movimientos_inventario` y `configuraciones`.
- **Descuentos**: por línea (monto $ con tope al valor de la línea; impuesto calculado sobre la base reducida) y descuento adicional de factura; desglose visible en el detalle de Facturas, ticket POS y PDF. El descuento total no puede dejar la venta en $0 ni en negativo (400 del backend + aviso en Caja).
- **Módulo de configuraciones**: flags por instalación (códigos de barras, gaveta de dinero, arqueo de caja, visador) que activan o desactivan funciones opcionales en toda la interfaz; pantalla de administración exclusiva del admin (`/configuracion`).
- **Carrito persistente en Caja**: la venta en curso sobrevive la navegación entre módulos y un refresco de página (sessionStorage); se vacía al cerrar sesión o al emitir la factura.
- Backend con autenticación JWT + bcrypt.
- **Roles `admin` y `cajero`**: toda escritura (catálogo, contactos, usuarios, anulación de factura, backup) exige rol administrador en el backend (403). En el frontend, las rutas de administración (`/usuarios`) están protegidas por un guard por rol (`RutaAdmin`): un cajero no puede acceder por URL.
- **Flag activo/inactivo funcional en todos los módulos**: los registros inactivos no se ofrecen en los flujos operativos (un producto inactivo no se vende, un cliente inactivo no se selecciona en Caja, los selects de categoría e impuesto solo muestran activos); los listados de gestión los siguen mostrando para poder reactivarlos.
- **Autogeneración de código de producto** (`PRO-001`, `PRO-002`, ...) con precarga editable en el formulario.
- Catálogo (categorías, impuestos, productos) y contactos (clientes, proveedores) con CRUD protegido por roles.
- Facturación transaccional: emisión con descuento de stock y movimientos de inventario, consulta y anulación.
- **Compras / ingreso de mercancía (solo admin)**: registro de entradas de stock con costo unitario obligatorio, proveedor opcional (cabecera `compras`) y escáner de código de barras (pistola o cámara, precarga el último costo conocido); suma inventario, actualiza el precio de compra del producto y genera movimientos con motivo `compra` visibles en Reportes → Movimientos. El precio de compra es opcional al crear un producto: se aprende con la primera compra.
- Impresión: PDF Carta/Media carta y ticket POS térmico (58/80mm).
- Reportes de ventas, inventario y movimientos de inventario.
- **Frontend funcional**: Login, Dashboard con KPIs y gráficos, Caja (POS), Facturas, Productos, Catálogo, Clientes, Proveedores, Reportes y Usuarios.
- Módulos pendientes: facturación electrónica DIAN (a futuro).

## Cómo ejecutar el backend

1. Encender MariaDB (XAMPP) y ejecutar el esquema. Usa redirección de `cmd` con
   charset utf8mb4: la tubería de PowerShell re-encoda en ASCII y corrompe las tildes:
   ```powershell
   cmd /c "C:\xampp\mysql\bin\mysql.exe -u root --default-character-set=utf8mb4 < backend\sql\01_schema.sql"
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
| GET | `/api/v1/productos/codigo-barras/:codigo` | Lookup por código de barras (escáner en Caja) | Token JWT |
| GET/PUT/DELETE | `/api/v1/categorias/:id`, `/api/v1/impuestos/:id`, `/api/v1/productos/:id` | Catálogo (ver/editar/eliminar) | Token JWT (PUT/DELETE: admin) |
| GET/POST | `/api/v1/clientes`, `/api/v1/proveedores` | Contactos (listar/crear) | Token JWT |
| GET/PUT/DELETE | `/api/v1/clientes/:id`, `/api/v1/proveedores/:id` | Contactos (ver/editar/eliminar) | Token JWT (PUT/DELETE: admin) |
| GET/POST | `/api/v1/usuarios` | Usuarios (listar/crear) | Token JWT (admin) |
| GET/PUT/DELETE | `/api/v1/usuarios/:id` | Usuarios (ver/editar/desactivar) | Token JWT (admin) |
| GET/POST | `/api/v1/facturas` | Facturas (listar con filtros / emitir) | Token JWT |
| GET | `/api/v1/facturas/:id` | Detalle de una factura con sus líneas | Token JWT |
| POST | `/api/v1/facturas/:id/anular` | Anular factura y reponer stock | Token JWT (admin) |
| POST | `/api/v1/compras` | Registrar ingreso de mercancía (`{proveedor_id?, items:[{producto_id, cantidad, costo_unitario}]}`) | Token JWT (admin) |
| GET | `/api/v1/facturas/:id/pdf?formato=carta\|media_carta` | Descargar PDF de la factura | Token JWT |
| GET | `/api/v1/facturas/:id/ticket?ancho=58\|80` | Buffer de impresión térmica POS | Token JWT |
| GET | `/api/v1/reportes/ventas?fecha_desde&fecha_hasta` | Reporte de ventas del período | Token JWT |
| GET | `/api/v1/reportes/ventas/diarias?fecha_desde&fecha_hasta` | Ventas emitidas agrupadas por día | Token JWT |
| GET | `/api/v1/reportes/inventario` | Reporte de inventario (bajo stock, categorías) | Token JWT |
| GET | `/api/v1/reportes/movimientos?fecha_desde&fecha_hasta&tipo&motivo` | Movimientos de inventario (resumen y detalle) | Token JWT |
| GET | `/api/v1/configuracion` | Flags de configuración del sistema (funciones opcionales) | Token JWT |
| PUT | `/api/v1/configuracion` | Actualizar un flag (`{clave, valor}`) | Token JWT (admin) |
| POST | `/api/v1/gaveta/abrir` | Enviar pulso ESC/POS a la gaveta vía térmica (409 si está deshabilitada) | Token JWT |
| POST | `/api/v1/turnos/abrir` | Abrir turno de caja con fondo inicial (`{monto_apertura}`) | Token JWT |
| POST | `/api/v1/turnos/cerrar` | Cerrar turno contando efectivo (`{monto_real, observaciones}`) y cuadrar | Token JWT |
| GET | `/api/v1/turnos/actual` | Turno abierto del usuario + efectivo esperado en vivo | Token JWT |
| GET | `/api/v1/turnos` | Historial de turnos (cajeros: solo los propios) | Token JWT |

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

## Códigos de barras y escáner (opcional)
1. Aplicar la migración `backend/sql/10_codigo_barras.sql` (agrega `productos.codigo_barras`, único).
2. En **Configuración** (admin), activar el flag **Códigos de barras**: aparece la barra de escaneo en Caja.
3. Asignar el código del fabricante a cada producto desde el formulario de Productos (campo opcional).
4. Escanear en Caja con pistola USB (modo teclado: lee código + Enter) o con la cámara del botón 📷 (el navegador exige `localhost` o HTTPS).

## Gaveta de dinero (opcional)
1. Aplicar la migración `backend/sql/11_gaveta.sql` (claves `gaveta_modo` y `gaveta_direccion`).
2. En **Configuración** (admin), activar el flag **Gaveta de dinero**: aparece el botón "Abrir gaveta" en Caja y las ventas en efectivo la abren automáticamente.
3. Sin hardware el sistema arranca en modo `simulacion` (el comando se confirma pero no se envía). Cuando instales la térmica:
   - Térmica con IP en red local → `gaveta_modo = red`, `gaveta_direccion = 192.168.x.x:9100`.
   - Impresora compartida de Windows → `gaveta_modo = compartida`, `gaveta_direccion = \\equipo\impresora`.
4. La gaveta debe estar conectada a la térmica con cable RJ11/RJ12; el pulso lo emite la impresora al recibir el comando ESC/POS kick.

## Arqueo de caja (opcional)
1. Aplicar la migración `backend/sql/12_arqueo.sql` (tabla `turnos_caja`).
2. En **Configuración** (admin), activar el flag **Arqueo de caja**: aparece el módulo **Arqueo** en el menú.
3. Flujo diario: el cajero abre turno con su fondo inicial → vende normalmente → al cerrar cuenta el efectivo físico; el sistema calcula lo esperado (fondo + ventas en efectivo) y marca la diferencia como cuadrado / sobrante / faltante. Queda historial por cajero.
4. Con el arqueo activo **no se puede vender sin turno abierto**: el backend rechaza la venta con 409 y Caja muestra un aviso para abrir turno (cada cajero necesita su propio turno). Las ventas hechas sin turno quedarían por fuera del cuadre, por eso se bloquean.

## Visador — pantalla del cliente (opcional)
1. En **Configuración** (admin), activar el flag **Visador**: aparece el botón "Pantalla cliente" en Caja.
2. Al pulsarlo se abre `/visador` en una ventana nueva (sin barra lateral): muestra los ítems y totales de la venta en tiempo real y un agradecimiento al emitir cada factura.
3. Está pensado para un **segundo monitor** conectado al mismo PC de caja: arrastra la ventana a esa pantalla y presiona F11 para pantalla completa.
4. Al cerrar el modal "Factura emitida" (botón "Nueva venta") el visador vuelve a la espera de inmediato; si el cajero empieza a agregar productos durante el agradecimiento, este se corta solo y muestra la nueva venta.

## Gestión de dependencias
- El proyecto usa **pnpm v11** (ver `packageManager` en cada `package.json`; instala con `corepack enable pnpm`).
- Lockfiles versionados: `backend/pnpm-lock.yaml` y `frontend/pnpm-lock.yaml`.
- Auditoría de seguridad: `pnpm audit` (dentro de `backend/` o `frontend/`).
- `node_modules` plano (`nodeLinker: hoisted` en `pnpm-workspace.yaml`) para evitar errores de symlink en Windows.
