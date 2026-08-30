// scripts/verificar-maestro.js — Verifica la estructura de una BD construida desde el maestro.
// Uso: node scripts/verificar-maestro.js <nombre_bd>
const mysql = require('mysql2/promise');

(async () => {
  const bd = process.argv[2] || 'sistema_facturacion_test';
  const c = await mysql.createConnection({ host: 'localhost', user: 'root', password: '', database: bd });

  const [tablas] = await c.query(
    'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME'
  );
  console.log('TABLAS (' + tablas.length + '):', tablas.map(t => t.TABLE_NAME).join(', '));

  const esperadas = ['productos', 'proveedores', 'movimientos_inventario', 'detalles_factura', 'usuarios', 'configuraciones', 'compras', 'turnos_caja'];
  for (const t of esperadas) {
    const [col] = await c.query('SHOW COLUMNS FROM ' + t);
    console.log('\n' + t + ': ' + col.map(x => x.Field).join(', '));
  }

  const [fk] = await c.query(
    'SELECT COUNT(*) AS n FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()'
  );
  console.log('\nTotal FK:', fk[0].n);

  const [imp] = await c.query('SELECT nombre, porcentaje FROM impuestos ORDER BY porcentaje');
  console.log('Impuestos seed:', imp.map(i => i.nombre + ' (' + i.porcentaje + '%)').join(', '));

  const [cfg] = await c.query('SELECT clave, valor FROM configuraciones ORDER BY clave');
  console.log('Configuraciones (' + cfg.length + '):', cfg.map(x => x.clave + '=' + x.valor).join(', '));

  await c.close();
})();
