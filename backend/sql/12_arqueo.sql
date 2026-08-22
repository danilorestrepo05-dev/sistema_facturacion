-- 12_arqueo.sql
-- Fase 4: turnos de caja (arqueo). Cada cajero abre un turno con un fondo
-- inicial de efectivo, vende durante el día y lo cierra contando el dinero.
-- El sistema calcula el efectivo esperado (fondo + ventas en efectivo) y la
-- diferencia contra lo contado (sobrante/faltante).
-- IMPORTANTE: ejecutar con charset utf8mb4 y redirección de cmd (no tubería de
-- PowerShell, que re-encoda en ASCII y corrompe tildes con '??'):
--   cmd /c "C:\xampp\mysql\bin\mysql.exe -u root --default-character-set=utf8mb4 < backend\sql\12_arqueo.sql"

USE sistema_facturacion;

CREATE TABLE IF NOT EXISTS turnos_caja (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id INT UNSIGNED NOT NULL,
  factura_desde_id INT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Última factura previa a la apertura (watermark)',
  fecha_apertura DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_cierre DATETIME NULL,
  monto_apertura DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT 'Fondo inicial de efectivo',
  monto_esperado DECIMAL(14,2) NULL COMMENT 'Fondo + ventas en efectivo del turno',
  monto_real DECIMAL(14,2) NULL COMMENT 'Efectivo contado al cerrar',
  diferencia DECIMAL(14,2) NULL COMMENT 'monto_real - monto_esperado (positivo: sobrante)',
  observaciones VARCHAR(255) NULL,
  estado ENUM('abierto', 'cerrado') NOT NULL DEFAULT 'abierto',
  PRIMARY KEY (id),
  KEY idx_turnos_usuario (usuario_id),
  CONSTRAINT fk_turnos_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;
