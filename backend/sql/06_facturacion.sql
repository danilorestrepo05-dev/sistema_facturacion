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
