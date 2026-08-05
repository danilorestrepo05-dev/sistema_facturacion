// src/config/db.js
// Configura el pool de conexiones a MariaDB/MySQL usando mysql2 (consultas preparadas).
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

// Pool de conexiones reutilizables; libera conexiones al devolverse para evitar fugas.
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'sistema_facturacion',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true,
  decimalNumbers: true,
  charset: 'utf8mb4_spanish_ci'
});

module.exports = pool;
