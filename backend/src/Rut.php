<?php
declare(strict_types=1);

namespace App;

/** Utilidades para RUT chileno (dígito verificador módulo 11). */
final class Rut
{
    /** Devuelve el RUT normalizado "12345678-K" o null si es inválido. */
    public static function normalize(mixed $value): ?string
    {
        if (!is_string($value) && !is_int($value)) {
            return null;
        }
        // Se quitan ceros a la izquierda: el banco usa el RUT rellenado ("019827237K").
        $clean = ltrim(strtoupper(preg_replace('/[^0-9kK]/', '', (string) $value)), '0');
        if (strlen($clean) < 2 || strlen($clean) > 9) {
            return null;
        }
        $body = ltrim(substr($clean, 0, -1), '0');
        $dv = substr($clean, -1);
        if ($body === '' || !ctype_digit($body) || (int) $body < 100000) {
            return null;
        }
        return self::dv($body) === $dv ? "$body-$dv" : null;
    }

    public static function dv(string $body): string
    {
        $sum = 0;
        $factor = 2;
        for ($i = strlen($body) - 1; $i >= 0; $i--) {
            $sum += (int) $body[$i] * $factor;
            $factor = $factor === 7 ? 2 : $factor + 1;
        }
        $r = 11 - ($sum % 11);
        return match ($r) {
            11 => '0',
            10 => 'K',
            default => (string) $r,
        };
    }
}
