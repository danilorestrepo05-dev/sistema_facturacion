// src/controllers/backup.controller.js
// Genera un respaldo (backup) de la base de datos usando mysqldump de XAMPP
// y lo entrega como archivo .sql para descargar.
const { execFile } = require('child_process');
const { promisify } = require('util');
const dotenv = require('dotenv');
const { jsonError } = require('../utils/response');

dotenv.config();

const execFileAsync = promisify(execFile);

// Ruta del ejecutable de mysqldump (configurable con MYSQLDUMP_PATH en .env).
const rutaMysqldump = process.env.MYSQLDUMP_PATH || 'C:\\xampp\\mysql\\bin\\mysqldump.exe';

// GET /api/v1/backup
const generar = async (req, res, next) => {
  try {
    const args = [
      '--no-tablespaces',
      `--host=${process.env.DB_HOST || '127.0.0.1'}`,
      `--port=${process.env.DB_PORT || 3306}`,
      `--user=${process.env.DB_USER || 'root'}`,
      `--password=${process.env.DB_PASSWORD || ''}`,
      process.env.DB_NAME || 'sistema_facturacion'
    ];

    // Ejecuta mysqldump y captura el script SQL en memoria.
    const { stdout } = await execFileAsync(rutaMysqldump, args, {
      maxBuffer: 100 * 1024 * 1024,
      timeout: 120000,
      windowsHide: true
    });

    // Marca de tiempo en hora local (evita el desfase de UTC que cambia el día).
    const ahora = new Date();
    const rellenar = (n) => String(n).padStart(2, '0');
    const marca =
      `${ahora.getFullYear()}${rellenar(ahora.getMonth() + 1)}${rellenar(ahora.getDate())}` +
      `${rellenar(ahora.getHours())}${rellenar(ahora.getMinutes())}${rellenar(ahora.getSeconds())}`;

    res.setHeader('Content-Type', 'application/sql');
    res.setHeader('Content-Disposition', `attachment; filename="backup-${marca}.sql"`);
    return res.send(stdout);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return jsonError(
        res,
        `No se encontró mysqldump en ${rutaMysqldump}. Define MYSQLDUMP_PATH en el .env`,
        500
      );
    }
    return next(err);
  }
};

module.exports = { generar };
