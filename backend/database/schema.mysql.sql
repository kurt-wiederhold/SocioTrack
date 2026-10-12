-- Esquema MySQL / MariaDB (producción en Dreamhost)
-- Ejecutar una vez en la base de datos creada desde el panel de Dreamhost.

CREATE TABLE IF NOT EXISTS usuarios (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    email         VARCHAR(190) NOT NULL UNIQUE,
    nombre        VARCHAR(120) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    activo        TINYINT(1)   NOT NULL DEFAULT 1,
    creado_en     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS login_intentos (
    id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ip        VARCHAR(45)  NOT NULL,
    email     VARCHAR(190) NOT NULL,
    creado_en DATETIME     NOT NULL,
    INDEX idx_intentos_ip (ip, creado_en),
    INDEX idx_intentos_email (email, creado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS socios (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    rut              VARCHAR(10)  NOT NULL UNIQUE COMMENT 'Normalizado: 12345678-K',
    nombre           VARCHAR(150) NOT NULL,
    email            VARCHAR(190) NULL,
    telefono         VARCHAR(20)  NULL,
    medio_pago       ENUM('PAC','PAT') NOT NULL COMMENT 'PAC = cargo en cuenta bancaria, PAT = tarjeta vía Transbank',
    banco            VARCHAR(80)  NULL,
    monto            INT UNSIGNED NOT NULL COMMENT 'Aporte mensual en CLP',
    estado           ENUM('activo','suspendido','baja') NOT NULL DEFAULT 'activo',
    fecha_alta       DATE         NOT NULL,
    fecha_baja       DATE         NULL,
    proveedor        VARCHAR(120) NULL COMMENT 'Empresa captadora del socio',
    proveedor_monto  INT UNSIGNED NULL COMMENT 'Pago mensual al proveedor en CLP',
    proveedor_cuotas SMALLINT UNSIGNED NULL COMMENT 'Meses que se paga al proveedor',
    proveedor_inicio DATE         NULL,
    proveedor_fin    DATE         NULL COMMENT 'Primer día del último mes de pago al proveedor',
    observaciones    TEXT         NULL,
    creado_en        DATETIME     NOT NULL,
    actualizado_en   DATETIME     NOT NULL,
    creado_por       INT UNSIGNED NULL,
    actualizado_por  INT UNSIGNED NULL,
    INDEX idx_socios_estado (estado),
    INDEX idx_socios_medio (medio_pago),
    INDEX idx_socios_nombre (nombre),
    INDEX idx_socios_alta (fecha_alta),
    INDEX idx_socios_proveedor_fin (proveedor_fin),
    CONSTRAINT fk_socios_creado_por FOREIGN KEY (creado_por) REFERENCES usuarios (id) ON DELETE SET NULL,
    CONSTRAINT fk_socios_actualizado_por FOREIGN KEY (actualizado_por) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
