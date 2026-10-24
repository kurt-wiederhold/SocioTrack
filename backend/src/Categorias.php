<?php
declare(strict_types=1);

namespace App;

/**
 * Categorías definidas por la Fundación para sectorizar a los socios por su aporte mensual.
 * Un socio pertenece a la categoría cuyo rango [monto_min, monto_max] contiene su monto;
 * por eso los rangos no pueden cruzarse.
 */
final class Categorias
{
    public const COLORES = ['gray', 'brand', 'blue', 'green', 'yellow', 'red'];

    /** Todas, con cantidad de socios activos y aporte mensual de cada una. */
    public static function all(): array
    {
        $rows = Db::all(
            "SELECT c.*,
                    COUNT(s.id) AS socios_activos,
                    COALESCE(SUM(s.monto), 0) AS monto_mensual
             FROM categorias c
             LEFT JOIN socios s ON s.estado = 'activo' AND " . self::condicion('s', 'c') . "
             GROUP BY c.id, c.nombre, c.monto_min, c.monto_max, c.color, c.creado_en, c.actualizado_en
             ORDER BY c.monto_min"
        );
        return array_map([self::class, 'present'], $rows);
    }

    public static function find(int $id): ?array
    {
        $row = Db::one('SELECT * FROM categorias WHERE id = ?', [$id]);
        return $row ? self::present($row) : null;
    }

    /** Condición SQL "el socio $s está en la categoría $c". */
    public static function condicion(string $s, string $c): string
    {
        return "$s.monto >= $c.monto_min AND ($c.monto_max IS NULL OR $s.monto <= $c.monto_max)";
    }

    /** @return array{0: array, 1: array<string,string>} */
    public static function validate(array $in, ?int $id = null): array
    {
        $e = [];
        $nombre = is_string($in['nombre'] ?? null) ? trim(preg_replace('/\s+/u', ' ', $in['nombre'])) : '';
        if (mb_strlen($nombre) < 2 || mb_strlen($nombre) > 60) {
            $e['nombre'] = 'Nombre entre 2 y 60 caracteres.';
        }
        $min = self::entero($in['monto_min'] ?? null);
        if ($min === null) {
            $e['monto_min'] = 'Monto mínimo inválido.';
        }
        $maxRaw = $in['monto_max'] ?? null;
        $max = ($maxRaw === null || $maxRaw === '') ? null : self::entero($maxRaw);
        if ($maxRaw !== null && $maxRaw !== '' && $max === null) {
            $e['monto_max'] = 'Monto máximo inválido.';
        } elseif ($max !== null && $min !== null && $max < $min) {
            $e['monto_max'] = 'Debe ser mayor o igual al mínimo.';
        }
        $color = in_array($in['color'] ?? '', self::COLORES, true) ? $in['color'] : 'gray';

        if (!$e) {
            // Rango [min, max] no debe cruzarse con el de otra categoría.
            $tope = $max ?? PHP_INT_MAX;
            foreach (Db::all('SELECT id, nombre, monto_min, monto_max FROM categorias') as $c) {
                if ((int) $c['id'] === $id) {
                    continue;
                }
                $cMax = $c['monto_max'] === null ? PHP_INT_MAX : (int) $c['monto_max'];
                if ($min <= $cMax && (int) $c['monto_min'] <= $tope) {
                    $e['monto_min'] = "El rango se cruza con la categoría “{$c['nombre']}”.";
                    break;
                }
            }
            $dup = Db::one('SELECT id FROM categorias WHERE LOWER(nombre) = LOWER(?)', [$nombre]);
            if ($dup && (int) $dup['id'] !== $id) {
                $e['nombre'] = 'Ya existe una categoría con ese nombre.';
            }
        }
        return [['nombre' => $nombre, 'monto_min' => $min, 'monto_max' => $max, 'color' => $color], $e];
    }

    public static function save(array $d, ?int $id = null): int
    {
        $now = date('Y-m-d H:i:s');
        if ($id === null) {
            Db::run(
                'INSERT INTO categorias (nombre, monto_min, monto_max, color, creado_en, actualizado_en) VALUES (?, ?, ?, ?, ?, ?)',
                [$d['nombre'], $d['monto_min'], $d['monto_max'], $d['color'], $now, $now]
            );
            return (int) Db::pdo()->lastInsertId();
        }
        Db::run(
            'UPDATE categorias SET nombre = ?, monto_min = ?, monto_max = ?, color = ?, actualizado_en = ? WHERE id = ?',
            [$d['nombre'], $d['monto_min'], $d['monto_max'], $d['color'], $now, $id]
        );
        return $id;
    }

    public static function delete(int $id): bool
    {
        return Db::run('DELETE FROM categorias WHERE id = ?', [$id]) > 0;
    }

    private static function present(array $r): array
    {
        foreach (['id', 'monto_min', 'monto_max', 'socios_activos', 'monto_mensual'] as $k) {
            if (array_key_exists($k, $r) && $r[$k] !== null) {
                $r[$k] = (int) $r[$k];
            }
        }
        return $r;
    }

    private static function entero(mixed $v): ?int
    {
        if (is_int($v)) {
            return $v >= 0 && $v <= SocioValidator::MONTO_MAX ? $v : null;
        }
        $s = is_string($v) ? str_replace(['.', '$', ' '], '', $v) : '';
        return ($s !== '' && ctype_digit($s) && strlen($s) <= 8) ? (int) $s : null;
    }
}
