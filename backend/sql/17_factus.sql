-- 17_factus.sql
-- Fase 6.7: Configuración del proveedor real de facturación electrónica
-- (Factus) para la DIAN.
--
-- Estas claves NO almacenan secretos sensibles de forma obligatoria: el
-- adaptador factus.adapter.js lee primero las variables de entorno .env
-- (FACTUS_CLIENT_ID, FACTUS_CLIENT_SECRET, FACTUS_AMBIENTE) y usa la tabla de
-- configuración solo como respaldo para operar sin tocar el .env. Se prefieren
-- las variables de entorno en producción (no se versionan).
--
-- Uso (bases existentes):
--   cmd /c "C:\xampp\mysql\bin\mysql.exe -u root --default-character-set=utf8mb4 < backend\sql\17_factus.sql"

USE sistema_facturacion;

-- Claves de configuración del proveedor Factus (idempotente).
INSERT INTO configuraciones (clave, valor, descripcion) VALUES
  ('factus_ambiente', 'sandbox', 'Ambiente de Factus: sandbox (pruebas) | produccion (habilitación real DIAN)'),
  ('factus_client_id', '', 'Client ID de Factus (también puede definirse en .env como FACTUS_CLIENT_ID)'),
  ('factus_client_secret', '', 'Client Secret de Factus (también puede definirse en .env como FACTUS_CLIENT_SECRET)')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);