-- 10_codigo_barras.sql
-- Agrega el campo de código de barras a productos (EAN-13, Code128, etc.).
-- Es único entre los productos que lo tengan asignado; puede quedar NULL
-- (MySQL permite varias filas NULL en una clave única), pues es opcional.
-- Uso: cmd /c "C:\xampp\mysql\bin\mysql.exe -u root --default-character-set=utf8mb4 < backend\sql\10_codigo_barras.sql"

USE sistema_facturacion;

ALTER TABLE productos
  ADD COLUMN codigo_barras VARCHAR(50) NULL AFTER codigo,
  ADD UNIQUE KEY uq_productos_codigo_barras (codigo_barras);
