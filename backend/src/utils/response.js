// src/utils/response.js
// Utilidades para responder de forma uniforme en toda la API.
const jsonExito = (res, datos = null, mensaje = 'OK', status = 200) =>
  res.status(status).json({ exito: true, mensaje, datos });

const jsonError = (res, mensaje = 'Error', status = 400, detalle = null) =>
  res.status(status).json({ exito: false, mensaje, detalle });

module.exports = { jsonExito, jsonError };
