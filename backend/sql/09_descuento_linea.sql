-- 09_descuento_linea.sql
-- Agrega el descuento por línea a detalles_factura: monto en $ que se resta
-- al valor de la línea (tope: precio_unitario * cantidad). Los impuestos se
-- calculan sobre la base reducida (precio * cantidad - descuento).
-- El campo subtotal de la línea conserva el valor bruto (precio * cantidad).
-- Uso: cmd /c "C:\xampp\mysql\bin\mysql.exe -u root --default-character-set=utf8mb4 < backend\sql\09_descuento_linea.sql"

USE sistema_facturacion;

ALTER TABLE detalles_factura
  ADD COLUMN descuento DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER precio_unitario;
