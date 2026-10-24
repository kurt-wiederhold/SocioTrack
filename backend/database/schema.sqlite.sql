-- Esquema equivalente para desarrollo local con SQLite (no requiere instalar MySQL).

CREATE TABLE IF NOT EXISTS usuarios (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE,
    nombre        TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    activo        INTEGER NOT NULL DEFAULT 1,
    creado_en     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS login_intentos (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    ip        TEXT NOT NULL,
    email     TEXT NOT NULL,
    creado_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_intentos_ip ON login_intentos (ip, creado_en);
CREATE INDEX IF NOT EXISTS idx_intentos_email ON login_intentos (email, creado_en);

CREATE TABLE IF NOT EXISTS categorias (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre         TEXT NOT NULL UNIQUE,
    monto_min      INTEGER NOT NULL,
    monto_max      INTEGER NULL,
    color          TEXT NOT NULL DEFAULT 'gray',
    creado_en      TEXT NOT NULL,
    actualizado_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS proveedores (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre         TEXT NOT NULL UNIQUE,
    rut            TEXT NULL,
    contacto       TEXT NULL,
    email          TEXT NULL,
    telefono       TEXT NULL,
    activo         INTEGER NOT NULL DEFAULT 1,
    observaciones  TEXT NULL,
    creado_en      TEXT NOT NULL,
    actualizado_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS socios (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    rut              TEXT NOT NULL UNIQUE,
    nombre           TEXT NOT NULL,
    email            TEXT NULL,
    telefono         TEXT NULL,
    medio_pago       TEXT NOT NULL CHECK (medio_pago IN ('PAC','PAT')),
    banco            TEXT NULL,
    monto            INTEGER NOT NULL CHECK (monto > 0),
    estado           TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','suspendido','baja')),
    fecha_alta       TEXT NOT NULL,
    fecha_baja       TEXT NULL,
    proveedor_id     INTEGER NULL REFERENCES proveedores (id) ON DELETE RESTRICT,
    proveedor_monto  INTEGER NULL,
    proveedor_cuotas INTEGER NULL,
    proveedor_inicio TEXT NULL,
    proveedor_fin    TEXT NULL,
    proveedor_revisado_en TEXT NULL,
    observaciones    TEXT NULL,
    creado_en        TEXT NOT NULL,
    actualizado_en   TEXT NOT NULL,
    creado_por       INTEGER NULL REFERENCES usuarios (id) ON DELETE SET NULL,
    actualizado_por  INTEGER NULL REFERENCES usuarios (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_socios_estado ON socios (estado);
CREATE INDEX IF NOT EXISTS idx_socios_medio ON socios (medio_pago);
CREATE INDEX IF NOT EXISTS idx_socios_nombre ON socios (nombre);
CREATE INDEX IF NOT EXISTS idx_socios_alta ON socios (fecha_alta);
CREATE INDEX IF NOT EXISTS idx_socios_monto ON socios (monto);
CREATE INDEX IF NOT EXISTS idx_socios_proveedor_fin ON socios (proveedor_fin);

CREATE TABLE IF NOT EXISTS cobro_nominas (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    periodo           TEXT NOT NULL,
    medio_pago        TEXT NOT NULL CHECK (medio_pago IN ('PAC','PAT')),
    numero            INTEGER NOT NULL,
    categoria_id      INTEGER NULL REFERENCES categorias (id) ON DELETE SET NULL,
    fecha_facturacion TEXT NOT NULL,
    fecha_vencimiento TEXT NOT NULL,
    estado            TEXT NOT NULL DEFAULT 'generada' CHECK (estado IN ('generada','respondida')),
    creado_en         TEXT NOT NULL,
    creado_por        INTEGER NULL REFERENCES usuarios (id) ON DELETE SET NULL,
    respondida_en     TEXT NULL,
    respondida_por    INTEGER NULL REFERENCES usuarios (id) ON DELETE SET NULL,
    UNIQUE (periodo, medio_pago, numero)
);

CREATE TABLE IF NOT EXISTS cobro_detalles (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nomina_id   INTEGER NOT NULL REFERENCES cobro_nominas (id) ON DELETE CASCADE,
    socio_id    INTEGER NULL REFERENCES socios (id) ON DELETE SET NULL,
    periodo     TEXT NOT NULL,
    rut         TEXT NOT NULL,
    nombre      TEXT NOT NULL,
    monto       INTEGER NOT NULL,
    intento     INTEGER NOT NULL,
    estado      TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','cobrado','rechazado')),
    codigo      TEXT NULL,
    motivo      TEXT NULL,
    fecha_cargo TEXT NULL,
    UNIQUE (nomina_id, socio_id)
);
CREATE INDEX IF NOT EXISTS idx_detalle_socio_periodo ON cobro_detalles (socio_id, periodo, estado);
CREATE INDEX IF NOT EXISTS idx_detalle_periodo ON cobro_detalles (periodo, estado);
