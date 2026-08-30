// scripts/normalizar-nombres-impuestos.js
// Normaliza los nombres de impuestos en detalle_impuestos que tienen el
// porcentaje embebido (ej: "IVA 19%" → "IVA"). Es idempotente: solo toca
// registros cuyo nombre termina en un patrón tipo " 19%", " 0%", " 6.5%", etc.
// Ejecutar con: node scripts/normalizar-nombres-impuestos.js

const mysql = require('mysql2/promise');

const main = async () => {
  const conexion = await mysql.createConnection({
    host: 'localhost', user: 'root', password: '', database: 'sistema_facturacion'
  });

  try {
    // Quita el último token del nombre si parece un porcentaje (ej: "IVA 19%" → "IVA").
    // Usa SUBSTRING_INDEX para cortar desde la derecha en el último espacio.
    const [resultado] = await conexion.query(
      "UPDATE detalle_impuestos SET nombre = TRIM(SUBSTRING(nombre, 1, LENGTH(nombre) - LENGTH(SUBSTRING_INDEX(nombre, ' ', -1)))) WHERE nombre REGEXP ' [0-9]+(\\.[0-9]+)?%$'"
    );

    const filasAfectadas = resultado.affectedRows;

    if (filasAfectadas > 0) {
      const [muestra] = await conexion.query(
        'SELECT id, nombre FROM detalle_impuestos ORDER BY id DESC LIMIT 10'
      );
      console.log(`OK: ${filasAfectadas} registros normalizados.`);
      console.log('Muestra reciente:', muestra.map((r) => `[${r.id}] ${r.nombre}`).join(', '));
    } else {
      console.log('OK: todos los nombres ya están normalizados.');
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await conexion.end();
  }
};

main();
