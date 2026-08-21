-- 08_configuraciones.sql
-- Crea la tabla de configuraciones del sistema: flags de funciones opcionales
-- (códigos de barras, gaveta, arqueo, visador) que cada instalación activa o no.
-- IMPORTANTE: ejecutar con charset utf8mb4 y redirección de cmd (no tubería de
-- PowerShell, que re-encoda en ASCII y corrompe tildes con '??'):
--   cmd /c "C:\xampp\mysql\bin\mysql.exe -u root --default-character-set=utf8mb4 < backend\sql\08_configuraciones.sql"

USE sistema_facturacion;

CREATE TABLE IF NOT EXISTS configuraciones (
  clave VARCHAR(50) NOT NULL,
  valor VARCHAR(255) NOT NULL,
  descripcion VARCHAR(255) NULL,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (clave)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

-- Flags de funciones opcionales. Todas inician en '0' (desactivadas) para no
-- alterar instalaciones existentes. Al re-ejecutar se conserva el `valor` ya
-- cambiado por el administrador, pero la `descripcion` se refresca (permite
-- reparar textos dañados por problemas de encoding).
INSERT INTO configuraciones (clave, valor, descripcion) VALUES
  ('codigo_barras_habilitado', '0', 'Habilita códigos de barras en productos y escáner en Caja'),
  ('gaveta_habilitada', '0', 'Habilita la apertura de la gaveta de dinero (requiere impresora térmica)'),
  ('arqueo_habilitado', '0', 'Habilita turnos de caja y control de efectivo (arqueo)'),
  ('visador_habilitado', '0', 'Habilita el visador (pantalla para el cliente)')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);
