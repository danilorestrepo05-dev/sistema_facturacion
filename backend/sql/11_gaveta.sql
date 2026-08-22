-- 11_gaveta.sql
-- Fase 3: claves de configuración para la apertura de la gaveta de dinero.
--   gaveta_modo      : transporte hacia la térmica -> 'simulacion' (sin hardware,
--                      desarrollo), 'red' (impresora con IP, puerto 9100) o
--                      'compartida' (cola compartida de Windows, ruta UNC).
--   gaveta_direccion : '192.168.x.x:9100' o '\\equipo\impresora'.
-- El flag de activación ('gaveta_habilitada') ya existe desde la migración 08.
-- IMPORTANTE: ejecutar con charset utf8mb4 y redirección de cmd (no tubería de
-- PowerShell, que re-encoda en ASCII y corrompe tildes con '??'):
--   cmd /c "C:\xampp\mysql\bin\mysql.exe -u root --default-character-set=utf8mb4 < backend\sql\11_gaveta.sql"

USE sistema_facturacion;

INSERT INTO configuraciones (clave, valor, descripcion) VALUES
  ('gaveta_modo', 'simulacion', 'Modo de apertura de la gaveta: simulacion | red | compartida'),
  ('gaveta_direccion', '', 'Dirección de la térmica: IP:9100 o ruta compartida de Windows')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);
