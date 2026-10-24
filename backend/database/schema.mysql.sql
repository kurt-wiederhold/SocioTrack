-- Esquema MySQL / MariaDB (producción en Dreamhost)
-- Ejecutar una vez en la base de datos creada desde el panel de Dreamhost.
-- Si la base ya existía con la versión anterior, usar database/migraciones/.

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

-- Categorías definidas por la Fundación para sectorizar a los socios según su aporte mensual.
-- La categoría de cada socio se calcula por su monto (no se guarda en el socio).
CREATE TABLE IF NOT EXISTS categorias (
    id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre         VARCHAR(60)  NOT NULL UNIQUE,
    monto_min      INT UNSIGNED NOT NULL,
    monto_max      INT UNSIGNED NULL COMMENT 'NULL = sin tope',
    color          VARCHAR(20)  NOT NULL DEFAULT 'gray',
    creado_en      DATETIME     NOT NULL,
    actualizado_en DATETIME     NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Empresas captadoras: base independiente de los socios.
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
    proveedor_id     INT UNSIGNED NULL COMMENT 'Empresa captadora del socio',
    proveedor_monto  INT UNSIGNED NULL COMMENT 'Pago mensual al proveedor en CLP',
    proveedor_cuotas SMALLINT UNSIGNED NULL COMMENT 'Meses que se paga al proveedor',
    proveedor_inicio DATE         NULL,
    proveedor_fin    DATE         NULL COMMENT 'Primer día del último mes de pago al proveedor',
    proveedor_revisado_en DATETIME NULL COMMENT 'Cuándo se revisó la alerta de fin de pago al proveedor',
    observaciones    TEXT         NULL,
    creado_en        DATETIME     NOT NULL,
    actualizado_en   DATETIME     NOT NULL,
    creado_por       INT UNSIGNED NULL,
    actualizado_por  INT UNSIGNED NULL,
    INDEX idx_socios_estado (estado),
    INDEX idx_socios_medio (medio_pago),
    INDEX idx_socios_nombre (nombre),
    INDEX idx_socios_alta (fecha_alta),
    INDEX idx_socios_monto (monto),
    INDEX idx_socios_proveedor_fin (proveedor_fin),
    CONSTRAINT fk_socios_proveedor FOREIGN KEY (proveedor_id) REFERENCES proveedores (id) ON DELETE RESTRICT,
    CONSTRAINT fk_socios_creado_por FOREIGN KEY (creado_por) REFERENCES usuarios (id) ON DELETE SET NULL,
    CONSTRAINT fk_socios_actualizado_por FOREIGN KEY (actualizado_por) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ciclo de cobro: cada nómina es un archivo enviado al banco (PAC) o a Transbank (PAT).
CREATE TABLE IF NOT EXISTS cobro_nominas (
    id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    periodo           CHAR(7)      NOT NULL COMMENT 'AAAA-MM',
    medio_pago        ENUM('PAC','PAT') NOT NULL,
    numero            SMALLINT UNSIGNED NOT NULL COMMENT 'Envío N° dentro del periodo y medio',
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

-- Una fila por socio incluido en una nómina. Guarda una copia de RUT, nombre y monto
-- para que el historial no cambie si después se edita o elimina el socio.
CREATE TABLE IF NOT EXISTS cobro_detalles (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nomina_id   INT UNSIGNED NOT NULL,
    socio_id    INT UNSIGNED NULL,
    periodo     CHAR(7)      NOT NULL,
    rut         VARCHAR(10)  NOT NULL,
    nombre      VARCHAR(150) NOT NULL,
    monto       INT UNSIGNED NOT NULL,
    intento     TINYINT UNSIGNED NOT NULL COMMENT '1 = envío original, 2+ = reintentos',
    estado      ENUM('pendiente','cobrado','rechazado') NOT NULL DEFAULT 'pendiente',
    codigo      VARCHAR(20)  NULL COMMENT 'Código de respuesta del banco/Transbank',
    motivo      VARCHAR(200) NULL,
    fecha_cargo DATE         NULL,
    UNIQUE KEY uq_detalle (nomina_id, socio_id),
    INDEX idx_detalle_socio_periodo (socio_id, periodo, estado),
    INDEX idx_detalle_periodo (periodo, estado),
    CONSTRAINT fk_detalle_nomina FOREIGN KEY (nomina_id) REFERENCES cobro_nominas (id) ON DELETE CASCADE,
    CONSTRAINT fk_detalle_socio FOREIGN KEY (socio_id) REFERENCES socios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
