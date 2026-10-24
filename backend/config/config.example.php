<?php
// Copiar este archivo como config.php y completar los datos.
// config.php NO se sube al repositorio (contiene credenciales).
return [
    'db' => [
        // Producción (Dreamhost / MySQL):
        'dsn'  => 'mysql:host=mysql.tudominio.cl;dbname=africadream;charset=utf8mb4',
        'user' => 'usuario_db',
        'pass' => 'clave_db',
        // Desarrollo local con SQLite (sin instalar MySQL): descomentar esta línea.
        // 'dsn' => 'sqlite:' . __DIR__ . '/../database/dev.sqlite', 'user' => null, 'pass' => null,
    ],
    'app' => [
        // true solo en desarrollo: muestra el detalle de errores en las respuestas.
        'debug' => false,
        // Minutos de inactividad antes de cerrar la sesión.
        'session_minutes' => 120,
        // Máximo de filas aceptadas por importación.
        'max_import_rows' => 5000,
    ],
    'cobro' => [
        // Reintentos de cobro por mes después del envío original (el documento indica 4).
        'max_reintentos' => 4,
        // Códigos del convenio PAC con el Banco de Chile (tomados del archivo de ejemplo de la Fundación).
        'pac' => [
            'codigo_banco' => '012',
            'codigo_empresa' => '004',
            'codigo_convenio' => '065',
        ],
    ],
];
