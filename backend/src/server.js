// src/server.js
// Punto de entrada: levanta el servidor escuchando en HOST:PORT (0.0.0.0 para red local).
const app = require('./app');
const dotenv = require('dotenv');
const pool = require('./config/db');
const dianService = require('./services/dian/dian.service');

dotenv.config();

const puerto = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';

// Intervalo (ms) con el que se reintentan los envíos DIAN pendientes de la cola
// offline. Es un respaldo automático: el cajero también puede forzarlo desde la
// interfaz (POST /api/v1/dian/procesar-cola) cuando vuelve la conexión.
const INTERVALO_COLA_DIAN_MS = Number(process.env.DIAN_JOB_INTERVALO_MS || 5 * 60_000);

// Job programado: procesa los documentos electrónicos que quedaron pendientes.
function programarColaDian() {
  const ejecutar = () => {
    dianService.procesarColaPendiente().then((r) => {
      if (r.procesados > 0) {
        console.log(`[DIAN] Cola de reintentos procesada: ${r.procesados} envíos.`);
      }
    }).catch((e) => console.error('[DIAN] Error en job de cola:', e.message));
  };
  // Primera pasada poco después del arranque.
  const inicial = setTimeout(ejecutar, 30_000);
  const timer = setInterval(ejecutar, INTERVALO_COLA_DIAN_MS);
  timer.unref?.();
  inicial.unref?.();
}

// Verifica la conexión a la base de datos antes de iniciar el servidor.
async function iniciar() {
  try {
    await pool.query('SELECT 1');
    console.log('[DB] Conexión a la base de datos establecida.');

    app.listen(puerto, host, () => {
      console.log(`[API] Servidor escuchando en http://${host}:${puerto}`);
      programarColaDian();
    });
  } catch (err) {
    console.error('[DB] No se pudo conectar a la base de datos:', err.message);
    process.exit(1);
  }
}

iniciar();
