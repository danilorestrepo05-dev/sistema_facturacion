-- 18_eliminar_flag_obligatoria.sql
-- Fase 6.8: elimina el flag "dian_factura_obligatoria".
--
-- MOTIVO: ese flag era redundante y su promesa ("exige cliente real") nunca se
-- implementó. Su única función real era deshabilitar el adquirente genérico
-- "Consumidor Final" en ubl.js. A partir de esta versión la semántica es única:
--   dian_adquirente_consumidor = 1  -> se permite vender sin cliente (Consumidor Final)
--   dian_adquirente_consumidor = 0  -> SE EXIGE un cliente real para facturar
--
-- Para no romper instalaciones que habían activado el modo estricto, la
-- migración conserva ese comportamiento: si dian_factura_obligatoria estaba en '1'
-- se baja dian_adquirente_consumidor a '0' ANTES de borrar la clave.
--
-- Uso (bases existentes):
--   cmd /c "C:\xampp\mysql\bin\mysql.exe -u root --default-character-set=utf8mb4 < backend\sql\18_eliminar_flag_obligatoria.sql"

USE sistema_facturacion;

-- 1) Conserva el modo estricto si el flag a eliminar estaba activo (idempotente).
UPDATE configuraciones
SET valor = '0'
WHERE clave = 'dian_adquirente_consumidor'
  AND valor = '1'
  AND EXISTS (
    SELECT 1 FROM configuraciones c2
    WHERE c2.clave = 'dian_factura_obligatoria' AND c2.valor = '1'
  );

-- 2) Elimina el flag redundante.
DELETE FROM configuraciones WHERE clave = 'dian_factura_obligatoria';