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
        // Reintentos por mes después del envío original. La Fundación sube las nóminas tres veces
        // al mes (correo de nov. 2026), por eso 2. El documento inicial hablaba de 4: confirmar.
        'max_reintentos' => 2,
        // Convenio PAC con el Banco de Chile. El código de banco de cada línea sale del banco del socio.
        'pac' => [
            'codigo_empresa' => '004',
            'codigo_convenio' => '065',
            // Registro de totales del formato oficial. El archivo de nov. 2026 no lo trae: confirmar.
            'incluir_totales' => true,
        ],
    ],
];
