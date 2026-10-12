<?php
declare(strict_types=1);

namespace App;

final class Http
{
    public static function json(mixed $data, int $status = 200): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
        exit;
    }

    /** Cuerpo JSON de la petición como arreglo. */
    public static function body(): array
    {
        $raw = file_get_contents('php://input') ?: '';
        if ($raw === '') {
            return [];
        }
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            throw new HttpError(400, 'El cuerpo de la petición no es JSON válido.');
        }
        return $data;
    }

    public static function securityHeaders(): void
    {
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: DENY');
        header('Referrer-Policy: same-origin');
        header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
        header('Cache-Control: no-store');
    }
}
