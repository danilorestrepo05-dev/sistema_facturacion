// src/server.js
// Punto de entrada: levanta el servidor escuchando en HOST:PORT (0.0.0.0 para red local).
const app = require('./app');
const dotenv = require('dotenv');
const pool = require('./config/db');

dotenv.config();

const puerto = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';

// Verifica la conexión a la base de datos antes de iniciar el servidor.
async function iniciar() {
  try {
    await pool.query('SELECT 1');
    console.log('[DB] Conexión a la base de datos establecida.');

    app.listen(puerto, host, () => {
      console.log(`[API] Servidor escuchando en http://${host}:${puerto}`);
    });
  } catch (err) {
    console.error('[DB] No se pudo conectar a la base de datos:', err.message);
    process.exit(1);
  }
}

iniciar();
