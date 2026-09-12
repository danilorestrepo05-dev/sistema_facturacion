-- 15_facturacion_electronica.sql
-- Fase 6: Facturación Electrónica DIAN.
-- Estructura base para facturar electrónicamente (válida para despliegue local
-- con cola offline y para VPS centralizado). Incluye:
--   * Tabla resoluciones_dian : resoluciones/autorizaciones DIAN del negocio.
--   * Tabla envios_dian       : COLA de envíos a la DIAN (persistente, por si no
--                               hay internet en el momento de la venta).
--   * Columnas nuevas en facturas: cufe, estado_dian, xml_dian, resolucion_id.
--   * Claves de configuración de facturación electrónica de la instalación.
-- NOTA: la numeración por resolución se habilita en producción; por ahora las
-- columnas quedan opcionales para no alterar el flujo actual de facturación.
-- Uso (bases existentes):
--   cmd /c "C:\xampp\mysql\bin\mysql.exe -u root --default-character-set=utf8mb4 < backend\sql\15_facturacion_electronica.sql"

USE sistema_facturacion;

-- ---------------------------------------------------------------------------
-- 1) Tabla de resoluciones DIAN (autorizaciones de numeración del negocio).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS resoluciones_dian (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  prefijo VARCHAR(20) NOT NULL DEFAULT '',
  numero_resolucion VARCHAR(40) NOT NULL DEFAULT '',
  descripcion VARCHAR(255) NULL,
  numero_inicial INT UNSIGNED NOT NULL DEFAULT 1,
  numero_final INT UNSIGNED NULL,
  numero_actual INT UNSIGNED NOT NULL DEFAULT 0,
  fecha_resolucion DATETIME NULL,
  fecha_vencimiento DATETIME NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

-- ---------------------------------------------------------------------------
-- 2) Cola de envíos a la DIAN (persistente; sobrevive reinicios y sirve igual
--    en local sin internet que en un backend central en VPS).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS envios_dian (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  factura_id INT UNSIGNED NOT NULL,
  resolucion_id INT UNSIGNED NULL,
  proveedor VARCHAR(30) NOT NULL DEFAULT 'simulacion',   -- simulacion | factus | otro
  track_id VARCHAR(100) NULL,                             -- id de seguimiento del proveedor
  estado ENUM('pendiente', 'enviando', 'aprobada', 'rechazada', 'fallida')
    NOT NULL DEFAULT 'pendiente',
  cuerpo_xml MEDIUMTEXT NULL,                             -- XML UBL 2.1 generado
  intentos INT UNSIGNED NOT NULL DEFAULT 0,
  proximo_intento DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  error_ultimo TEXT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_envios_estado_proximo (estado, proximo_intento),
  KEY idx_envios_factura (factura_id),
  CONSTRAINT fk_envios_factura FOREIGN KEY (factura_id)
    REFERENCES facturas (id) ON DELETE CASCADE,
  CONSTRAINT fk_envios_resolucion FOREIGN KEY (resolucion_id)
    REFERENCES resoluciones_dian (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

-- ---------------------------------------------------------------------------
-- 3) Columnas nuevas en facturas para el hecho electrónico (todas opcionales).
--    Se agregan solo si no existen (idempotente).
-- ---------------------------------------------------------------------------
SET @existe_cufe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'facturas' AND COLUMN_NAME = 'cufe'
);
SET @sql := IF(@existe_cufe = 0,
  'ALTER TABLE facturas
     ADD COLUMN cufe VARCHAR(200) NULL AFTER total,
     ADD COLUMN estado_dian ENUM(''local'', ''enviada'', ''aprobada'', ''rechazada'') NULL DEFAULT ''local'' AFTER cufe,
     ADD COLUMN xml_dian MEDIUMTEXT NULL AFTER estado_dian,
     ADD COLUMN resolucion_id INT UNSIGNED NULL AFTER xml_dian,
     ADD CONSTRAINT fk_facturas_resolucion FOREIGN KEY (resolucion_id)
       REFERENCES resoluciones_dian (id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- 4) Claves de configuración de facturación electrónica (por instalación).
--    Se insertan sin pisar valores que el admin ya haya cambiado.
-- ---------------------------------------------------------------------------
INSERT INTO configuraciones (clave, valor, descripcion) VALUES
  ('facturacion_electronica_habilitado', '0', 'Activa la facturación electrónica DIAN en esta instalación'),
  ('dian_regimen', 'responsable_iva', 'Régimen del contribuyente ante la DIAN: responsable_iva | no_responsable | simplificado | gran_contribuyente'),
  ('dian_adquirente_consumidor', '1', 'Permite usar el adquirente genérico "Consumidor Final" en facturas electrónicas. Si se desactiva, la Caja exige seleccionar un cliente real para facturar'),
  ('dian_proveedor', 'simulacion', 'Proveedor de facturación electrónica: simulacion (test) | factus'),
  ('dian_modo_test', '1', 'Modo test/habilitación (sin facturas reales contra la DIAN)')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);
