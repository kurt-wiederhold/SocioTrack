-- Consolidación de donaciones (PAC, PAT, Donar Online, Causaxcausa, transferencias).
-- Ejecutar UNA sola vez sobre bases que ya tienen la migración 002:
--   mysql africadream < database/migraciones/003_consolidacion.sql

CREATE TABLE IF NOT EXISTS consolidacion_lotes (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    periodo    CHAR(7)      NOT NULL,
    origen     ENUM('PAC','PAT','DO','CXC','TRF') NOT NULL,
    tipo       ENUM('bajada','subida') NOT NULL DEFAULT 'bajada',
    archivo    VARCHAR(190) NOT NULL,
    huella     CHAR(64)     NOT NULL,
    filas      INT UNSIGNED NOT NULL,
    nomina_id  INT UNSIGNED NULL,
    creado_en  DATETIME     NOT NULL,
    creado_por INT UNSIGNED NULL,
    UNIQUE KEY uq_lote_huella (huella),
    INDEX idx_lote_periodo (periodo),
    CONSTRAINT fk_lote_nomina FOREIGN KEY (nomina_id) REFERENCES cobro_nominas (id) ON DELETE SET NULL,
    CONSTRAINT fk_lote_creado_por FOREIGN KEY (creado_por) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS donaciones (
    id       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    lote_id  INT UNSIGNED NOT NULL,
    periodo  CHAR(7)      NOT NULL,
    origen   ENUM('DO','CXC','TRF') NOT NULL,
    socio_id INT UNSIGNED NULL,
    clave    VARCHAR(190) NOT NULL,
    rut      VARCHAR(10)  NULL,
    nombre   VARCHAR(150) NOT NULL,
    monto    INT UNSIGNED NOT NULL,
    estado   ENUM('cobrado','rechazado','pendiente') NOT NULL,
    codigo   VARCHAR(20)  NULL,
    motivo   VARCHAR(255) NULL,
    fecha    DATE         NULL,
    INDEX idx_donacion_periodo (periodo, origen, estado),
    INDEX idx_donacion_clave (clave),
    CONSTRAINT fk_donacion_lote FOREIGN KEY (lote_id) REFERENCES consolidacion_lotes (id) ON DELETE CASCADE,
    CONSTRAINT fk_donacion_socio FOREIGN KEY (socio_id) REFERENCES socios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE cobro_nominas
    ADD COLUMN externa TINYINT(1) NOT NULL DEFAULT 0 AFTER estado;

ALTER TABLE cobro_detalles
    ADD COLUMN banco_codigo CHAR(3) NULL AFTER monto,
    ADD COLUMN lote_id INT UNSIGNED NULL AFTER nomina_id,
    ADD CONSTRAINT fk_detalle_lote FOREIGN KEY (lote_id) REFERENCES consolidacion_lotes (id) ON DELETE SET NULL;
