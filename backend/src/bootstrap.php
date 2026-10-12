<?php
declare(strict_types=1);

spl_autoload_register(function (string $class): void {
    if (str_starts_with($class, 'App\\')) {
        $file = __DIR__ . '/' . str_replace('\\', '/', substr($class, 4)) . '.php';
        if (is_file($file)) {
            require $file;
        }
    }
});

// AD_CONFIG permite usar otra configuración (lo usan las pruebas para no tocar config.php).
$configFile = getenv('AD_CONFIG') ?: __DIR__ . '/../config/config.php';
if (!is_file($configFile)) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Falta backend/config/config.php (copiar desde config.example.php)']);
    exit;
}

App\Config::load(require $configFile);
date_default_timezone_set('America/Santiago');
