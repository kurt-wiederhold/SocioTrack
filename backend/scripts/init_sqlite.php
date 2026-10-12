<?php
declare(strict_types=1);

// Crea la base SQLite de desarrollo usando database/schema.sqlite.sql.
// Uso: php scripts/init_sqlite.php

if (PHP_SAPI !== 'cli') {
    exit("Solo por consola.\n");
}
require __DIR__ . '/../src/bootstrap.php';

use App\Db;

if (!Db::isSqlite()) {
    exit("config.php no apunta a SQLite. Para MySQL ejecuta database/schema.mysql.sql.\n");
}
Db::pdo()->exec(file_get_contents(__DIR__ . '/../database/schema.sqlite.sql'));
echo "Base de datos SQLite lista.\n";
