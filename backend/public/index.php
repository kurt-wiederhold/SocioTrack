<?php
declare(strict_types=1);

// Punto de entrada único de la API. Todas las rutas /api/* llegan aquí (ver .htaccess).

// En desarrollo el código está en ../src. En Dreamhost, esta carpeta se copia a
// ~/tudominio.cl/api y el resto del backend vive FUERA del sitio web en ~/africadream_backend.
$backend = is_file(__DIR__ . '/../src/bootstrap.php') ? __DIR__ . '/..' : dirname(__DIR__, 2) . '/africadream_backend';
require $backend . '/src/bootstrap.php';

use App\Auth;
use App\Config;
use App\Controllers\AuthController;
use App\Controllers\SocioController;
use App\Http;
use App\HttpError;
use App\Router;

Http::securityHeaders();

try {
    Auth::startSession();

    $method = $_SERVER['REQUEST_METHOD'];
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    // Soporta que la API esté en /api o en una subcarpeta (/app/api/...).
    $pos = strpos($path, '/api/');
    $path = $pos === false ? '/' : rtrim(substr($path, $pos + 4), '/');

    $router = new Router();
    $router->add('GET', '/auth/me', [AuthController::class, 'me']);
    $router->add('POST', '/auth/login', [AuthController::class, 'login']);
    $router->add('POST', '/auth/logout', [AuthController::class, 'logout']);

    $protegida = function (callable $handler) use ($method): callable {
        return function (...$args) use ($handler, $method) {
            Auth::require($method);
            $handler(...$args);
        };
    };
    $router->add('GET', '/socios', $protegida([SocioController::class, 'index']));
    $router->add('POST', '/socios', $protegida([SocioController::class, 'store']));
    $router->add('GET', '/socios/proveedores', $protegida([SocioController::class, 'proveedores']));
    $router->add('POST', '/socios/importar', $protegida([SocioController::class, 'import']));
    $router->add('GET', '/socios/{id}', $protegida([SocioController::class, 'show']));
    $router->add('PUT', '/socios/{id}', $protegida([SocioController::class, 'update']));
    $router->add('DELETE', '/socios/{id}', $protegida([SocioController::class, 'destroy']));

    $router->dispatch($method, $path);
} catch (HttpError $e) {
    $res = ['error' => $e->getMessage()];
    if ($e->details) {
        $res['errores'] = $e->details;
    }
    Http::json($res, $e->getCode());
} catch (Throwable $e) {
    error_log('[africadream] ' . $e);
    Http::json(
        ['error' => Config::get('app.debug') ? $e->getMessage() : 'Error interno del servidor.'],
        500
    );
}
