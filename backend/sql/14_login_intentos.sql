-- 14_login_intentos.sql
-- Seguridad: límite de intentos de inicio de sesión (anti fuerza bruta).
-- Agrega a usuarios:
--   intentos_fallidos : contador de intentos de login con contraseña incorrecta.
--   bloqueado_hasta   : fecha/hora hasta la cual el login está bloqueado (NULL = no bloqueado).
-- Cada fallo aumenta el contador; al llegar a LOGIN_MAX_INTENTOS (5) se fija
-- bloqueado_hasta por LOGIN_BLOQUEO_MINUTOS (15 min) y se reinicia el contador.
--
-- NOTA PARA BASES NUEVAS: si creas la BD desde cero, estas columnas YA vienen
-- incluidas en 01_schema.sql, así que NO necesitas ejecutar este script.
-- Este script es ÚNICAMENTE para bases ya existentes (sin las columnas).
--
-- Uso (bases existentes):
--   cmd /c "C:\xampp\mysql\bin\mysql.exe -u root --default-character-set=utf8mb4 < backend\sql\14_login_intentos.sql"

USE sistema_facturacion;

-- Aplica el ALTER solo si la columna no existe (idempotente y seguro de re-ejecutar).
SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'usuarios'
    AND COLUMN_NAME = 'intentos_fallidos'
);

SET @sql := IF(@existe = 0,
  'ALTER TABLE usuarios
     ADD COLUMN intentos_fallidos INT UNSIGNED NOT NULL DEFAULT 0 AFTER activo,
     ADD COLUMN bloqueado_hasta DATETIME NULL DEFAULT NULL AFTER intentos_fallidos',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
