-- 00_instalacion.sql
-- SCRIPT MAESTRO: instalacion completa de la base de datos desde cero (servidor nuevo / clonado).
-- Ejecuta los 14 scripts (01..14) en el orden correcto para que las claves foraneas
-- (FK) referencien tablas ya creadas y NO generen errores.
-- Envuelve la carga con FOREIGN_KEY_CHECKS=0..1 como red de seguridad, y al final
-- confirma que las FK quedan activadas.
-- IMPORTANTE: ejecutar con charset utf8mb4 y redireccion de cmd (no tuberia de PowerShell):
--   cmd /c "C:\xampp\mysql\bin\mysql.exe -u root --default-character-set=utf8mb4 < backend\sql\00_instalacion.sql"


SET FOREIGN_KEY_CHECKS = 0;


-- 01_schema.sql
-- Crea la base de datos y la tabla de usuarios del Sistema de Facturación.
-- Uso: C:\xampp\mysql\bin\mysql.exe -u root < 01_schema.sql

CREATE DATABASE IF NOT EXISTS sistema_facturacion
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_spanish_ci;

USE sistema_facturacion;

-- Tabla de usuarios del sistema (genérica, no amarrada a un negocio específico).
-- Incluye el control de intentos de login (seguridad anti fuerza bruta); para
-- bases ya existentes usa la migración 14_login_intentos.sql en vez de esto.
CREATE TABLE IF NOT EXISTS usuarios (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre_usuario VARCHAR(50) NOT NULL,
  nombre_completo VARCHAR(120) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  rol ENUM('admin', 'cajero') NOT NULL DEFAULT 'cajero',
  activo TINYINT(1) NOT NULL DEFAULT 1,
  intentos_fallidos INT UNSIGNED NOT NULL DEFAULT 0,
  bloqueado_hasta DATETIME NULL DEFAULT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuarios_nombre_usuario (nombre_usuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;


-- ==============================


-- 02_configuraciones.sql
-- Crea la tabla de configuraciones del sistema: flags de funciones opcionales
-- (códigos de barras, gaveta, arqueo, visador) que cada instalación activa o no.
-- No depende de otras tablas, por lo que corre en segundo lugar (hueco 02).
-- IMPORTANTE: ejecutar con charset utf8mb4 y redirección de cmd (no tubería de
-- PowerShell, que re-encoda en ASCII y corrompe tildes con '??'):
--   cmd /c "C:\xampp\mysql\bin\mysql.exe -u root --default-character-set=utf8mb4 < backend\sql\02_configuraciones.sql"

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


-- ==============================


-- 03_catalogo.sql
-- Crea las tablas del catálogo: impuestos, categorias y productos.
-- Uso: C:\xampp\mysql\bin\mysql.exe -u root < 03_catalogo.sql

USE sistema_facturacion;

-- Impuestos (p. ej. IVA). Genérico: cualquier impuesto con porcentaje.
CREATE TABLE IF NOT EXISTS impuestos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(80) NOT NULL,
  porcentaje DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

-- Categorías de productos (genéricas, no amarradas a un negocio).
CREATE TABLE IF NOT EXISTS categorias (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(100) NOT NULL,
  descripcion VARCHAR(255) NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categorias_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

-- Productos con control de stock y referencias a categoría e impuesto.
CREATE TABLE IF NOT EXISTS productos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo VARCHAR(50) NOT NULL,
  nombre VARCHAR(150) NOT NULL,
  descripcion VARCHAR(255) NULL,
  categoria_id INT UNSIGNED NULL,
  impuesto_id INT UNSIGNED NULL,
  precio_compra DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  precio_venta DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  stock_actual INT NOT NULL DEFAULT 0,
  stock_minimo INT NOT NULL DEFAULT 0,
  unidad_medida VARCHAR(20) NOT NULL DEFAULT 'unidad',
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_productos_codigo (codigo),
  KEY idx_productos_categoria (categoria_id),
  KEY idx_productos_impuesto (impuesto_id),
  CONSTRAINT fk_productos_categoria FOREIGN KEY (categoria_id)
    REFERENCES categorias (id) ON DELETE SET NULL,
  CONSTRAINT fk_productos_impuesto FOREIGN KEY (impuesto_id)
    REFERENCES impuestos (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;


-- ==============================


-- 04_seed_catalogo.sql
-- Datos iniciales de referencia: impuestos comunes en Colombia (IVA).
-- Las categorías se dejan vacías para que cada negocio defina las suyas.
-- Uso: C:\xampp\mysql\bin\mysql.exe -u root < 04_seed_catalogo.sql

USE sistema_facturacion;

-- Insertar solo los impuestos de referencia que aún no existen por nombre.
-- (Sin clave única en `nombre`, ON DUPLICATE KEY no evita duplicados; por eso
-- se comprueba con NOT EXISTS para que re-ejecutar el script no duplique.)
INSERT INTO impuestos (nombre, porcentaje, activo)
SELECT 'Exento',   0.00, 1 WHERE NOT EXISTS (SELECT 1 FROM impuestos WHERE nombre = 'Exento');
INSERT INTO impuestos (nombre, porcentaje, activo)
SELECT 'IVA 5%',   5.00, 1 WHERE NOT EXISTS (SELECT 1 FROM impuestos WHERE nombre = 'IVA 5%');
INSERT INTO impuestos (nombre, porcentaje, activo)
SELECT 'IVA 19%', 19.00, 1 WHERE NOT EXISTS (SELECT 1 FROM impuestos WHERE nombre = 'IVA 19%');


-- ==============================


-- 05_clientes_proveedores.sql
-- Crea las tablas de clientes y proveedores (genéricas, multi-negocio).
-- Uso: C:\xampp\mysql\bin\mysql.exe -u root < 05_clientes_proveedores.sql

USE sistema_facturacion;

-- Clientes: consumidores finales del negocio.
CREATE TABLE IF NOT EXISTS clientes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(150) NOT NULL,
  tipo_documento ENUM('CC', 'NIT', 'CE', 'Pasaporte', 'Otro') NOT NULL DEFAULT 'CC',
  documento VARCHAR(30) NULL,
  telefono VARCHAR(30) NULL,
  email VARCHAR(120) NULL,
  direccion VARCHAR(255) NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_clientes_documento (documento)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

-- Proveedores: personas o empresas que abastecen el negocio.
CREATE TABLE IF NOT EXISTS proveedores (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(150) NOT NULL,
  tipo_documento ENUM('CC', 'NIT', 'CE', 'Pasaporte', 'Otro') NOT NULL DEFAULT 'NIT',
  documento VARCHAR(30) NULL,
  telefono VARCHAR(30) NULL,
  email VARCHAR(120) NULL,
  direccion VARCHAR(255) NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_proveedores_documento (documento)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;


-- ==============================


-- 06_facturacion.sql
-- Crea las tablas de facturación: facturas, detalles_factura y movimientos_inventario.
-- Uso: C:\xampp\mysql\bin\mysql.exe -u root < 06_facturacion.sql

USE sistema_facturacion;

-- Facturas emitidas a clientes. El número es consecutivo por cada factura.
CREATE TABLE IF NOT EXISTS facturas (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  numero_factura INT UNSIGNED NOT NULL,
  prefijo VARCHAR(10) NOT NULL DEFAULT '',
  cliente_id INT UNSIGNED NULL,
  usuario_id INT UNSIGNED NOT NULL,
  tipo_pago ENUM('efectivo', 'tarjeta', 'transferencia', 'otro') NOT NULL DEFAULT 'efectivo',
  subtotal DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  impuesto_total DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  descuento DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  total DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  estado ENUM('emitida', 'anulada') NOT NULL DEFAULT 'emitida',
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_facturas_numero (numero_factura),
  KEY idx_facturas_cliente (cliente_id),
  KEY idx_facturas_usuario (usuario_id),
  KEY idx_facturas_creado (creado_en),
  CONSTRAINT fk_facturas_cliente FOREIGN KEY (cliente_id)
    REFERENCES clientes (id) ON DELETE SET NULL,
  CONSTRAINT fk_facturas_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

-- Detalle de líneas de cada factura. Guarda una copia del nombre del producto
-- y del impuesto aplicado en el momento de la venta (snapshot).
CREATE TABLE IF NOT EXISTS detalles_factura (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  factura_id INT UNSIGNED NOT NULL,
  producto_id INT UNSIGNED NULL,
  producto_nombre VARCHAR(150) NOT NULL,
  cantidad INT NOT NULL,
  precio_unitario DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  impuesto_porcentaje DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  impuesto DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  subtotal DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (id),
  KEY idx_detalles_factura (factura_id),
  KEY idx_detalles_producto (producto_id),
  CONSTRAINT fk_detalles_factura FOREIGN KEY (factura_id)
    REFERENCES facturas (id) ON DELETE CASCADE,
  CONSTRAINT fk_detalles_producto FOREIGN KEY (producto_id)
    REFERENCES productos (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

-- Movimientos de inventario: entrada/salida de stock con su motivo y referencia.
CREATE TABLE IF NOT EXISTS movimientos_inventario (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  producto_id INT UNSIGNED NOT NULL,
  tipo ENUM('entrada', 'salida') NOT NULL,
  cantidad INT NOT NULL,
  motivo ENUM('venta', 'compra', 'ajuste', 'anulacion') NOT NULL DEFAULT 'venta',
  referencia_id INT UNSIGNED NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_movimientos_producto (producto_id),
  KEY idx_movimientos_referencia (referencia_id),
  CONSTRAINT fk_movimientos_producto FOREIGN KEY (producto_id)
    REFERENCES productos (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;


-- ==============================


-- 07_proveedor_tipo_item.sql
-- Agrega el campo tipo_item a la tabla proveedores: tipo de item que suministra
-- el proveedor (ej. "Bebidas, aseo, papelería"). Campo opcional y multi-negocio.
-- Uso: C:\xampp\mysql\bin\mysql.exe -u root < 07_proveedor_tipo_item.sql

USE sistema_facturacion;

-- Aplica el ALTER solo si la columna no existe (idempotente y seguro de re-ejecutar).
SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'proveedores'
    AND COLUMN_NAME = 'tipo_item'
);

SET @sql := IF(@existe = 0,
  'ALTER TABLE proveedores ADD COLUMN tipo_item VARCHAR(150) NULL AFTER direccion',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- ==============================


-- 08_compras.sql
-- Fase 7 (v0.9.26): módulo de compras / ingreso de mercancía.
-- Agrega el costo unitario al movimiento de inventario para poder valorar
-- las entradas de mercancía en reportes. Nullable porque los movimientos
-- antiguos (venta/anulación) no lo necesitan.
USE sistema_facturacion;

-- Aplica el ALTER solo si la columna no existe (idempotente y seguro de re-ejecutar).
SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'movimientos_inventario'
    AND COLUMN_NAME = 'costo_unitario'
);

SET @sql := IF(@existe = 0,
  'ALTER TABLE movimientos_inventario ADD COLUMN costo_unitario DECIMAL(12,2) NULL AFTER cantidad',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- ==============================


-- 09_descuento_linea.sql
-- Agrega el descuento por línea a detalles_factura: monto en $ que se resta
-- al valor de la línea (tope: precio_unitario * cantidad). Los impuestos se
-- calculan sobre la base reducida (precio * cantidad - descuento).
-- El campo subtotal de la línea conserva el valor bruto (precio * cantidad).
-- Uso: cmd /c "C:\xampp\mysql\bin\mysql.exe -u root --default-character-set=utf8mb4 < backend\sql\09_descuento_linea.sql"

USE sistema_facturacion;

-- Aplica el ALTER solo si la columna no existe (idempotente y seguro de re-ejecutar).
SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'detalles_factura'
    AND COLUMN_NAME = 'descuento'
);

SET @sql := IF(@existe = 0,
  'ALTER TABLE detalles_factura ADD COLUMN descuento DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER precio_unitario',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- ==============================


-- 10_codigo_barras.sql
-- Agrega el campo de código de barras a productos (EAN-13, Code128, etc.).
-- Es único entre los productos que lo tengan asignado; puede quedar NULL
-- (MySQL permite varias filas NULL en una clave única), pues es opcional.
-- Uso: cmd /c "C:\xampp\mysql\bin\mysql.exe -u root --default-character-set=utf8mb4 < backend\sql\10_codigo_barras.sql"

USE sistema_facturacion;

-- Aplica el ALTER solo si la columna no existe (idempotente y seguro de re-ejecutar).
SET @existe := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'productos'
    AND COLUMN_NAME = 'codigo_barras'
);

-- El ALTER agrega la columna y la key única en un solo paso (solo si falta la columna).
SET @sql := IF(@existe = 0,
  'ALTER TABLE productos
     ADD COLUMN codigo_barras VARCHAR(50) NULL AFTER codigo,
     ADD UNIQUE KEY uq_productos_codigo_barras (codigo_barras)',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- ==============================


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


-- ==============================


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


-- ==============================


-- 13_compras_cabecera.sql
-- Fase 7 (v0.9.27): cabecera de compras para registrar el proveedor y el
-- total de cada ingreso de mercancía. Los movimientos de inventario con
-- motivo 'compra' apuntan a esta cabecera mediante referencia_id.
USE sistema_facturacion;

CREATE TABLE IF NOT EXISTS compras (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  proveedor_id INT UNSIGNED NULL,
  usuario_id INT UNSIGNED NOT NULL,
  total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_compras_proveedor (proveedor_id),
  CONSTRAINT fk_compras_proveedor FOREIGN KEY (proveedor_id)
    REFERENCES proveedores (id) ON DELETE SET NULL,
  CONSTRAINT fk_compras_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;


-- ==============================


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


-- ==============================


SET FOREIGN_KEY_CHECKS = 1;


-- Verificacion: lista las claves foraneas creadas.

SELECT TABLE_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME
FROM information_schema.REFERENTIAL_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = DATABASE() ORDER BY TABLE_NAME;