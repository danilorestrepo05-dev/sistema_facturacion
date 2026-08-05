// src/middleware/rol.js
// Middleware de autorización por rol. Requiere pasar por verificarToken antes.
// Verifica que el usuario autenticado tenga el rol de administrador.
const verificarAdmin = (req, res, next) => {
  if (req.usuario && req.usuario.rol === 'admin') {
    return next();
  }
  return res.status(403).json({ exito: false, mensaje: 'Requiere rol de administrador' });
};

module.exports = { verificarAdmin };
