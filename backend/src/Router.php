<?php
declare(strict_types=1);

namespace App;

final class Router
{
    /** @var array<int, array{string, string, callable}> */
    private array $routes = [];

    public function add(string $method, string $pattern, callable $handler): void
    {
        // '/socios/{id}' -> '#^/socios/(?P<id>\d+)$#'
        $regex = preg_replace('#\{(\w+)\}#', '(?P<$1>\d+)', $pattern);
        $this->routes[] = [$method, '#^' . $regex . '$#', $handler];
    }

    public function dispatch(string $method, string $path): void
    {
        $allowed = false;
        foreach ($this->routes as [$m, $regex, $handler]) {
            if (!preg_match($regex, $path, $match)) {
                continue;
            }
            $allowed = true;
            if ($m !== $method) {
                continue;
            }
            $params = array_map('intval', array_filter($match, 'is_string', ARRAY_FILTER_USE_KEY));
            $handler(...$params);
            return;
        }
        throw $allowed
            ? new HttpError(405, 'Método no permitido.')
            : new HttpError(404, 'Ruta no encontrada.');
    }
}
