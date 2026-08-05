// src/middleware/errorHandler.js
// Manejador centralizado de errores: evita filtrar detalles internos al cliente.
const errorHandler = (err, req, res, next) => {
  console.error('[ERROR]', err);

  const status = err.status || 500;
  const mensaje = status === 500
    ? 'Error interno del servidor'
    : err.message;

  res.status(status).json({ exito: false, mensaje });
};

module.exports = { errorHandler };
