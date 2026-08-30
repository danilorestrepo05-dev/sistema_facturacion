-- 04_seed_catalogo.sql
-- Datos iniciales de referencia: impuestos comunes en Colombia (IVA).
-- Las categorías se dejan vacías para que cada negocio defina las suyas.
-- Uso: C:\xampp\mysql\bin\mysql.exe -u root < 04_seed_catalogo.sql

USE sistema_facturacion;

-- Insertar solo los impuestos de referencia que aún no existen por nombre.
-- (Sin clave única en `nombre`, ON DUPLICATE KEY no evita duplicados; por eso
-- se comprueba con NOT EXISTS para que re-ejecutar el script no duplique.)
INSERT INTO impuestos (nombre, porcentaje, activo)
SELECT 'Exento',   0.00, 1 WHERE NOT EXISTS (SELECT 1 FROM impuestos WHERE nombre = 'Exento');
INSERT INTO impuestos (nombre, porcentaje, activo)
SELECT 'IVA 5%',   5.00, 1 WHERE NOT EXISTS (SELECT 1 FROM impuestos WHERE nombre = 'IVA 5%');
INSERT INTO impuestos (nombre, porcentaje, activo)
SELECT 'IVA 19%', 19.00, 1 WHERE NOT EXISTS (SELECT 1 FROM impuestos WHERE nombre = 'IVA 19%');
