// scripts/migrar-detalle-impuestos.js
// v0.9.44: crea la tabla detalle_impuestos para guardar el desglose de
// VARIOS impuestos combinados por cada línea de factura (estilo Odoo/DIAN).
// Idempotente: puede ejecutarse varias veces sin daño (CREATE IF NOT EXISTS).
require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const conexion = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'sistema_facturacion'
  });

  await conexion.query(`
    CREATE TABLE IF NOT EXISTS detalle_impuestos (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      detalle_id INT UNSIGNED NOT NULL,
      impuesto_id INT UNSIGNED NOT NULL,
      nombre VARCHAR(100) NOT NULL DEFAULT '',
      porcentaje DECIMAL(5,2) NOT NULL DEFAULT 0,
      base DECIMAL(14,2) NOT NULL DEFAULT 0,
      valor DECIMAL(14,2) NOT NULL DEFAULT 0,
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_detalle_imp_detalle FOREIGN KEY (detalle_id)
        REFERENCES detalles_factura(id) ON DELETE CASCADE,
      CONSTRAINT fk_detalle_imp_impuesto FOREIGN KEY (impuesto_id)
        REFERENCES impuestos(id) ON DELETE CASCADE,
      UNIQUE KEY uq_detalle_impuesto (detalle_id, impuesto_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci
  `);
  console.log('OK: tabla detalle_impuegos verificada/creada'.replace('impuegos', 'impuestos'));

  await conexion.end();
}

main().catch((err) => { console.error('ERROR:', err.message); process.exit(1); });
