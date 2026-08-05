// src/middleware/auth.js
// Middleware de autenticación: valida el token JWT enviado en el header Authorization.
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config();

const verificarToken = (req, res, next) => {
  const header = req.headers.authorization || '';

  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ exito: false, mensaje: 'Token no proporcionado' });
  }

  const token = header.slice(7);

  try {
    // El payload del token contiene id, nombre_usuario y rol del usuario.
    req.usuario = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch (err) {
    return res.status(401).json({ exito: false, mensaje: 'Token inválido o expirado' });
  }
};

module.exports = { verificarToken };
