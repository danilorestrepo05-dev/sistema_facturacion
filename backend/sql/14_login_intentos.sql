-- 14_login_intentos.sql
-- Seguridad: límite de intentos de inicio de sesión (anti fuerza bruta).
-- Agrega a usuarios:
--   intentos_fallidos : contador de intentos de login con contraseña incorrecta.
--   bloqueado_hasta   : fecha/hora hasta la cual el login está bloqueado (NULL = no bloqueado).
-- Cada fallo aumenta el contador; al llegar a LOGIN_MAX_INTENTOS (5) se fija
-- bloqueado_hasta por LOGIN_BLOQUEO_MINUTOS (15 min) y se reinicia el contador.
-- Uso: cmd /c "C:\xampp\mysql\bin\mysql.exe -u root --default-character-set=utf8mb4 < backend\sql\14_login_intentos.sql"

USE sistema_facturacion;

ALTER TABLE usuarios
  ADD COLUMN intentos_fallidos INT UNSIGNED NOT NULL DEFAULT 0 AFTER activo,
  ADD COLUMN bloqueado_hasta DATETIME NULL DEFAULT NULL AFTER intentos_fallidos;
