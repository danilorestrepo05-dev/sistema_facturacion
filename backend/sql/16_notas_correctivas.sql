-- 16_notas_correctivas.sql
-- Fase 6.5: Notas Débito y Crédito (documentos correctivos de la facturación
-- electrónica DIAN).
--
-- La nota crédito compensa/corrige (total o parcialmente) una factura; la nota
-- débito la incrementa. Ambas se vinculan SIEMPRE a una factura original y en la
-- DIAN se emiten como Documento Soporte / Nota con su propio CUDE.
--
-- Estructura:
--   * notas_correctivas            : cabecera de la nota (tipo, factura original,
--                                    montos, motivo, CUDE, estado DIAN, XML).
--   * notas_correctivas_detalle    : detalle por línea (se copia de la factura
--                                    original para reflejarlo en PDF/UBL).
--   * Claves de configuración de notas (habilitado + numeración por resolución).
--
-- Uso (bases existentes):
--   cmd /c "C:\xampp\mysql\bin\mysql.exe -u root --default-character-set=utf8mb4 < backend\sql\16_notas_correctivas.sql"

USE sistema_facturacion;

-- ---------------------------------------------------------------------------
-- 1) Cabecera de notas correctivas (crédito | débito).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notas_correctivas (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tipo ENUM('credito', 'debito') NOT NULL,
  factura_original_id INT UNSIGNED NOT NULL,
  preferencia_motivo ENUM('correccion', 'anulacion', 'devolucion', 'ajuste') NULL,
  prefijo VARCHAR(20) NOT NULL DEFAULT 'NC',
  numero_nota INT UNSIGNED NOT NULL,
  motivo VARCHAR(500) NULL,
  cliente_id INT UNSIGNED NULL,
  usuario_id INT UNSIGNED NOT NULL,
  subtotal DECIMAL(15,2) NOT NULL DEFAULT 0,
  impuesto_total DECIMAL(15,2) NOT NULL DEFAULT 0,
  descuento DECIMAL(15,2) NOT NULL DEFAULT 0,
  total DECIMAL(15,2) NOT NULL DEFAULT 0,
  estado ENUM('emitida', 'anulada') NOT NULL DEFAULT 'emitida',
  -- Campos de hechos electrónicos (igual que facturas):
  cufe VARCHAR(200) NULL,                       -- CUDE de la nota
  estado_dian ENUM('local', 'enviada', 'aprobada', 'rechazada') NOT NULL DEFAULT 'local',
  xml_dian MEDIUMTEXT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_notas_numero (prefijo, numero_nota),
  KEY idx_notas_original (factura_original_id),
  KEY idx_notas_estado_dian (estado_dian),
  CONSTRAINT fk_notas_factura_original FOREIGN KEY (factura_original_id)
    REFERENCES facturas (id),
  CONSTRAINT fk_notas_cliente FOREIGN KEY (cliente_id)
    REFERENCES clientes (id) ON DELETE SET NULL,
  CONSTRAINT fk_notas_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

-- ---------------------------------------------------------------------------
-- 2) Detalle por línea de la nota (copiado de la factura original).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notas_correctivas_detalle (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nota_id INT UNSIGNED NOT NULL,
  producto_id INT UNSIGNED NULL,
  producto_nombre VARCHAR(255) NOT NULL,
  cantidad DECIMAL(12,3) NOT NULL DEFAULT 1,
  precio_unitario DECIMAL(15,2) NOT NULL DEFAULT 0,
  descuento DECIMAL(15,2) NOT NULL DEFAULT 0,
  impuesto_porcentaje DECIMAL(6,2) NOT NULL DEFAULT 0,
  impuesto DECIMAL(15,2) NOT NULL DEFAULT 0,
  subtotal DECIMAL(15,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_notas_detalle_nota (nota_id),
  CONSTRAINT fk_notas_detalle_nota FOREIGN KEY (nota_id)
    REFERENCES notas_correctivas (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

-- ---------------------------------------------------------------------------
-- 3) Cola de envíos a la DIAN del documento de la nota (paralela a envios_dian,
--    que está ligada por FK a facturas). Persiste el reintento offline de las
--    notas correctivas igual que el de las facturas.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS envios_dian_notas (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nota_id INT UNSIGNED NOT NULL,
  proveedor VARCHAR(30) NOT NULL DEFAULT 'simulacion',
  track_id VARCHAR(100) NULL,
  estado ENUM('pendiente', 'enviando', 'aprobada', 'rechazada', 'fallida')
    NOT NULL DEFAULT 'pendiente',
  cuerpo_xml MEDIUMTEXT NULL,
  intentos INT UNSIGNED NOT NULL DEFAULT 0,
  proximo_intento DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  error_ultimo TEXT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_envios_notas_estado (estado, proximo_intento),
  KEY idx_envios_notas_nota (nota_id),
  CONSTRAINT fk_envios_notas_nota FOREIGN KEY (nota_id)
    REFERENCES notas_correctivas (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

-- ---------------------------------------------------------------------------
-- 4) Claves de configuración de notas correctivas (idempotente).
-- ---------------------------------------------------------------------------
INSERT INTO configuraciones (clave, valor, descripcion) VALUES
  ('notas_correctivas_habilitado', '1', 'Activa la emisión de notas débito y crédito en esta instalación'),
  ('notas_prefijo_credito', 'NC', 'Prefijo de la numeración de las notas crédito'),
  ('notas_prefijo_debito', 'ND', 'Prefijo de la numeración de las notas débito')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);
