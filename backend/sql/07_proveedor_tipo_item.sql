-- 07_proveedor_tipo_item.sql
-- Agrega el campo tipo_item a la tabla proveedores: tipo de item que suministra
-- el proveedor (ej. "Bebidas, aseo, papelería"). Campo opcional y multi-negocio.
-- Uso: C:\xampp\mysql\bin\mysql.exe -u root < 07_proveedor_tipo_item.sql

USE sistema_facturacion;

-- Aplica el ALTER solo si la columna no existe (idempotente y seguro de re-ejecutar).
SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'proveedores'
    AND COLUMN_NAME = 'tipo_item'
);

SET @sql := IF(@existe = 0,
  'ALTER TABLE proveedores ADD COLUMN tipo_item VARCHAR(150) NULL AFTER direccion',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
