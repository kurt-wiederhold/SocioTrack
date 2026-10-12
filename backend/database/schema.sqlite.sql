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
    proveedor        TEXT NULL,
    proveedor_monto  INTEGER NULL,
    proveedor_cuotas INTEGER NULL,
    proveedor_inicio TEXT NULL,
    proveedor_fin    TEXT NULL,
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
CREATE INDEX IF NOT EXISTS idx_socios_proveedor_fin ON socios (proveedor_fin);
