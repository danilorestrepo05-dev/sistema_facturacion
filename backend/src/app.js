// src/app.js
// Configura la aplicación Express: middleware globales, rutas y manejo de errores.
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth.routes');
const usuarioRoutes = require('./routes/usuario.routes');
const categoriaRoutes = require('./routes/categoria.routes');
const impuestoRoutes = require('./routes/impuesto.routes');
const productoRoutes = require('./routes/producto.routes');
const clienteRoutes = require('./routes/cliente.routes');
const proveedorRoutes = require('./routes/proveedor.routes');
const facturaRoutes = require('./routes/factura.routes');
const reporteRoutes = require('./routes/reporte.routes');
const backupRoutes = require('./routes/backup.routes');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();

// Habilita peticiones desde el frontend (local y red local).
app.use(cors({ origin: true, credentials: true }));

// Parsea el cuerpo de las peticiones JSON.
app.use(express.json());

// Endpoint de salud para verificar que la API responde.
app.get('/api/v1/health', (req, res) =>
  res.json({ exito: true, mensaje: 'API operativa', hora: new Date().toISOString() })
);

// Rutas de autenticación.
app.use('/api/v1/auth', authRoutes);

// Rutas de gestión de usuarios (solo admin).
app.use('/api/v1/usuarios', usuarioRoutes);

// Rutas del catálogo.
app.use('/api/v1/categorias', categoriaRoutes);
app.use('/api/v1/impuestos', impuestoRoutes);
app.use('/api/v1/productos', productoRoutes);

// Rutas de clientes y proveedores.
app.use('/api/v1/clientes', clienteRoutes);
app.use('/api/v1/proveedores', proveedorRoutes);

// Rutas de facturación.
app.use('/api/v1/facturas', facturaRoutes);

// Rutas de reportes.
app.use('/api/v1/reportes', reporteRoutes);

// Rutas de backup (solo admin).
app.use('/api/v1/backup', backupRoutes);

// Ruta raíz informativa.
app.get('/', (req, res) =>
  res.json({ exito: true, mensaje: 'Sistema de Facturación - API', version: '0.1.0' })
);

// Manejador centralizado de errores (siempre al final).
app.use(errorHandler);

module.exports = app;
