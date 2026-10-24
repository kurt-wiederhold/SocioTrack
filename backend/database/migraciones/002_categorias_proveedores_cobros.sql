-- Migración para bases creadas con la versión anterior (MySQL/MariaDB).
-- Agrega categorías, la tabla independiente de proveedores y el ciclo de cobro.
-- Ejecutar UNA sola vez:  mysql africadream < database/migraciones/002_categorias_proveedores_cobros.sql

CREATE TABLE IF NOT EXISTS categorias (
    id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre         VARCHAR(60)  NOT NULL UNIQUE,
    monto_min      INT UNSIGNED NOT NULL,
    monto_max      INT UNSIGNED NULL,
    color          VARCHAR(20)  NOT NULL DEFAULT 'gray',
    creado_en      DATETIME     NOT NULL,
    actualizado_en DATETIME     NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS proveedores (
    id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre         VARCHAR(120) NOT NULL UNIQUE,
    rut            VARCHAR(10)  NULL,
    contacto       VARCHAR(120) NULL,
    email          VARCHAR(190) NULL,
    telefono       VARCHAR(20)  NULL,
    activo         TINYINT(1)   NOT NULL DEFAULT 1,
    observaciones  TEXT         NULL,
    creado_en      DATETIME     NOT NULL,
    actualizado_en DATETIME     NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Los proveedores escritos como texto en cada socio pasan a su propia tabla.
INSERT IGNORE INTO proveedores (nombre, creado_en, actualizado_en)
    SELECT DISTINCT proveedor, NOW(), NOW() FROM socios WHERE proveedor IS NOT NULL;

ALTER TABLE socios
    ADD COLUMN proveedor_id INT UNSIGNED NULL AFTER fecha_baja,
    ADD COLUMN proveedor_revisado_en DATETIME NULL AFTER proveedor_fin,
    ADD INDEX idx_socios_monto (monto);

UPDATE socios s JOIN proveedores p ON p.nombre = s.proveedor SET s.proveedor_id = p.id;

ALTER TABLE socios
    DROP COLUMN proveedor,
    ADD CONSTRAINT fk_socios_proveedor FOREIGN KEY (proveedor_id) REFERENCES proveedores (id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS cobro_nominas (
    id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    periodo           CHAR(7)      NOT NULL,
    medio_pago        ENUM('PAC','PAT') NOT NULL,
    numero            SMALLINT UNSIGNED NOT NULL,
    categoria_id      INT UNSIGNED NULL,
    fecha_facturacion DATE         NOT NULL,
    fecha_vencimiento DATE         NOT NULL,
    estado            ENUM('generada','respondida') NOT NULL DEFAULT 'generada',
    creado_en         DATETIME     NOT NULL,
    creado_por        INT UNSIGNED NULL,
    respondida_en     DATETIME     NULL,
    respondida_por    INT UNSIGNED NULL,
    UNIQUE KEY uq_nomina (periodo, medio_pago, numero),
    CONSTRAINT fk_nomina_categoria FOREIGN KEY (categoria_id) REFERENCES categorias (id) ON DELETE SET NULL,
    CONSTRAINT fk_nomina_creado_por FOREIGN KEY (creado_por) REFERENCES usuarios (id) ON DELETE SET NULL,
    CONSTRAINT fk_nomina_respondida_por FOREIGN KEY (respondida_por) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cobro_detalles (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nomina_id   INT UNSIGNED NOT NULL,
    socio_id    INT UNSIGNED NULL,
    periodo     CHAR(7)      NOT NULL,
    rut         VARCHAR(10)  NOT NULL,
    nombre      VARCHAR(150) NOT NULL,
    monto       INT UNSIGNED NOT NULL,
    intento     TINYINT UNSIGNED NOT NULL,
    estado      ENUM('pendiente','cobrado','rechazado') NOT NULL DEFAULT 'pendiente',
    codigo      VARCHAR(20)  NULL,
    motivo      VARCHAR(200) NULL,
    fecha_cargo DATE         NULL,
    UNIQUE KEY uq_detalle (nomina_id, socio_id),
    INDEX idx_detalle_socio_periodo (socio_id, periodo, estado),
    INDEX idx_detalle_periodo (periodo, estado),
    CONSTRAINT fk_detalle_nomina FOREIGN KEY (nomina_id) REFERENCES cobro_nominas (id) ON DELETE CASCADE,
    CONSTRAINT fk_detalle_socio FOREIGN KEY (socio_id) REFERENCES socios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
