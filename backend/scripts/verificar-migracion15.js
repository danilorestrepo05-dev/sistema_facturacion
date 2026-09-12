// scripts/verificar-migracion15.js — Verifica la estructura creada por la migración 15.
const mysql = require('mysql2/promise');
(async () => {
  const c = await mysql.createConnection({ host: 'localhost', user: 'root', password: '', database: 'sistema_facturacion' });
  const [r] = await c.query('SHOW COLUMNS FROM facturas');
  console.log('facturas:', r.map(x => x.Field).join(', '));
  const [e] = await c.query("SHOW TABLES LIKE '%dian%'");
  console.log('tablas dian:', e.map(x => Object.values(x)[0]).join(', '));
  const [cfg] = await c.query("SELECT clave,valor FROM configuraciones WHERE clave LIKE 'dian%' OR clave LIKE 'facturacion%' ORDER BY clave");
  console.log('config:', cfg.map(x => x.clave + '=' + x.valor).join(', '));
  const [fk] = await c.query("SELECT TABLE_NAME, CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE CONSTRAINT_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL AND CONSTRAINT_NAME LIKE '%resolucion%' OR CONSTRAINT_NAME LIKE '%envio%'");
  console.log('FK:', fk.map(x => x.TABLE_NAME + '.' + x.CONSTRAINT_NAME).join(', '));
  await c.close();
})();
