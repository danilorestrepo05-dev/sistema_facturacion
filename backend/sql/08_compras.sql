-- 08_compras.sql
-- Fase 7 (v0.9.26): módulo de compras / ingreso de mercancía.
-- Agrega el costo unitario al movimiento de inventario para poder valorar
-- las entradas de mercancía en reportes. Nullable porque los movimientos
-- antiguos (venta/anulación) no lo necesitan.
USE sistema_facturacion;

ALTER TABLE movimientos_inventario
  ADD COLUMN costo_unitario DECIMAL(12,2) NULL AFTER cantidad;
