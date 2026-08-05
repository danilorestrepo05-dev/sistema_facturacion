// src/utils/empresa.js
// Datos de la empresa leídos de las variables de entorno (.env).
// Aparecen en los documentos generados (PDF y tickets).
const dotenv = require('dotenv');

dotenv.config();

const empresa = {
  nombre: process.env.EMPRESA_NOMBRE || 'Mi Empresa',
  documento: process.env.EMPRESA_DOCUMENTO || '',
  direccion: process.env.EMPRESA_DIRECCION || '',
  telefono: process.env.EMPRESA_TELEFONO || '',
  ciudad: process.env.EMPRESA_CIUDAD || '',
  email: process.env.EMPRESA_EMAIL || '',
  moneda: process.env.EMPRESA_MONEDA || 'COP'
};

module.exports = empresa;
