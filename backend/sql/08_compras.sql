-- 08_compras.sql
-- Fase 7 (v0.9.26): módulo de compras / ingreso de mercancía.
-- Agrega el costo unitario al movimiento de inventario para poder valorar
-- las entradas de mercancía en reportes. Nullable porque los movimientos
-- antiguos (venta/anulación) no lo necesitan.
USE sistema_facturacion;

-- Aplica el ALTER solo si la columna no existe (idempotente y seguro de re-ejecutar).
SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'movimientos_inventario'
    AND COLUMN_NAME = 'costo_unitario'
);

SET @sql := IF(@existe = 0,
  'ALTER TABLE movimientos_inventario ADD COLUMN costo_unitario DECIMAL(12,2) NULL AFTER cantidad',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
