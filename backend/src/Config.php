<?php
declare(strict_types=1);

namespace App;

final class Config
{
    private static array $values = [];

    public static function load(array $values): void
    {
        self::$values = $values;
    }

    /** Lee un valor con notación de punto, ej: Config::get('app.debug'). */
    public static function get(string $key, mixed $default = null): mixed
    {
        $value = self::$values;
        foreach (explode('.', $key) as $part) {
            if (!is_array($value) || !array_key_exists($part, $value)) {
                return $default;
            }
            $value = $value[$part];
        }
        return $value;
    }
}
