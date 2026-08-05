-- 07_proveedor_tipo_item.sql
-- Agrega el campo tipo_item a la tabla proveedores: tipo de item que suministra
-- el proveedor (ej. "Café, pasilla, azúcar"). Campo opcional y multi-negocio.
-- Uso: C:\xampp\mysql\bin\mysql.exe -u root < 07_proveedor_tipo_item.sql

USE sistema_facturacion;

ALTER TABLE proveedores
  ADD COLUMN tipo_item VARCHAR(150) NULL AFTER direccion;
