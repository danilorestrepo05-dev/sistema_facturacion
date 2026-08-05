-- 04_seed_catalogo.sql
-- Datos iniciales de referencia: impuestos comunes en Colombia (IVA).
-- Las categorías se dejan vacías para que cada negocio defina las suyas.
-- Uso: C:\xampp\mysql\bin\mysql.exe -u root < 04_seed_catalogo.sql

USE sistema_facturacion;

INSERT INTO impuestos (nombre, porcentaje, activo) VALUES
  ('Exento', 0.00, 1),
  ('IVA 5%', 5.00, 1),
  ('IVA 19%', 19.00, 1)
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre);
