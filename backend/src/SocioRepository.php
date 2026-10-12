<?php
declare(strict_types=1);

namespace App;

final class SocioRepository
{
    /** Columnas editables (las que valida SocioValidator). */
    public const CAMPOS = [
        'rut', 'nombre', 'email', 'telefono', 'medio_pago', 'banco', 'monto', 'estado',
        'fecha_alta', 'fecha_baja', 'proveedor', 'proveedor_monto', 'proveedor_cuotas',
        'proveedor_inicio', 'proveedor_fin', 'observaciones',
    ];

    private const ORDEN = ['nombre', 'rut', 'monto', 'fecha_alta', 'estado', 'creado_en', 'proveedor_fin'];

    public static function find(int $id): ?array
    {
        $row = Db::one('SELECT * FROM socios WHERE id = ?', [$id]);
        return $row ? self::present($row) : null;
    }

    public static function findByRut(string $rut): ?array
    {
        return Db::one('SELECT * FROM socios WHERE rut = ?', [$rut]);
    }

    /**
     * @param array $f filtros: buscar, estado, medio_pago, proveedor_estado, orden, dir, pagina, por_pagina
     */
    public static function search(array $f): array
    {
        [$where, $params] = self::where($f);

        $orden = in_array($f['orden'] ?? '', self::ORDEN, true) ? $f['orden'] : 'nombre';
        $dir = strtolower((string) ($f['dir'] ?? '')) === 'desc' ? 'DESC' : 'ASC';
        $porPagina = min(20000, max(1, (int) ($f['por_pagina'] ?? 25)));
        $pagina = max(1, (int) ($f['pagina'] ?? 1));
        $offset = ($pagina - 1) * $porPagina;

        $total = (int) Db::one("SELECT COUNT(*) AS n FROM socios $where", $params)['n'];
        $rows = Db::all(
            "SELECT * FROM socios $where ORDER BY $orden $dir, id ASC LIMIT $porPagina OFFSET $offset",
            $params
        );

        return [
            'datos' => array_map([self::class, 'present'], $rows),
            'total' => $total,
            'pagina' => $pagina,
            'por_pagina' => $porPagina,
        ];
    }

    /** Totales generales para las tarjetas y alertas del listado. */
    public static function resumen(): array
    {
        $mes = date('Y-m-01');
        $r = Db::one(
            "SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN estado = 'activo' THEN 1 ELSE 0 END) AS activos,
                SUM(CASE WHEN estado = 'suspendido' THEN 1 ELSE 0 END) AS suspendidos,
                SUM(CASE WHEN estado = 'baja' THEN 1 ELSE 0 END) AS bajas,
                SUM(CASE WHEN estado = 'activo' THEN monto ELSE 0 END) AS monto_mensual,
                SUM(CASE WHEN estado <> 'baja' AND proveedor_fin = ? THEN 1 ELSE 0 END) AS proveedor_ultimo_mes,
                SUM(CASE WHEN estado <> 'baja' AND proveedor_fin >= ? THEN 1 ELSE 0 END) AS proveedor_pagando,
                SUM(CASE WHEN estado <> 'baja' AND proveedor_fin >= ? THEN proveedor_monto ELSE 0 END) AS proveedor_monto_mensual
             FROM socios",
            [$mes, $mes, $mes]
        );
        return array_map('intval', $r);
    }

    public static function proveedores(): array
    {
        return array_column(
            Db::all('SELECT DISTINCT proveedor FROM socios WHERE proveedor IS NOT NULL ORDER BY proveedor'),
            'proveedor'
        );
    }

    public static function create(array $d, ?int $userId): int
    {
        $d = self::pick($d);
        $now = date('Y-m-d H:i:s');
        $d += ['creado_en' => $now, 'actualizado_en' => $now, 'creado_por' => $userId, 'actualizado_por' => $userId];
        $cols = array_keys($d);
        Db::run(
            'INSERT INTO socios (' . implode(', ', $cols) . ') VALUES (' . implode(', ', array_fill(0, count($cols), '?')) . ')',
            array_values($d)
        );
        return (int) Db::pdo()->lastInsertId();
    }

    public static function update(int $id, array $d, ?int $userId): void
    {
        $d = self::pick($d);
        $d += ['actualizado_en' => date('Y-m-d H:i:s'), 'actualizado_por' => $userId];
        $set = implode(', ', array_map(fn ($c) => "$c = ?", array_keys($d)));
        Db::run("UPDATE socios SET $set WHERE id = ?", [...array_values($d), $id]);
    }

    public static function delete(int $id): bool
    {
        return Db::run('DELETE FROM socios WHERE id = ?', [$id]) > 0;
    }

    /** Agrega campos calculados que necesita la interfaz. */
    public static function present(array $r): array
    {
        foreach (['id', 'monto', 'proveedor_monto', 'proveedor_cuotas', 'creado_por', 'actualizado_por'] as $k) {
            if ($r[$k] !== null) {
                $r[$k] = (int) $r[$k];
            }
        }
        $r['proveedor_estado'] = null;
        $r['proveedor_cuotas_transcurridas'] = null;
        if ($r['proveedor'] !== null && $r['proveedor_fin'] !== null) {
            $mes = date('Y-m-01');
            $r['proveedor_estado'] = match (true) {
                $r['proveedor_fin'] < $mes => 'finalizado',
                $r['proveedor_fin'] === $mes => 'ultimo_mes',
                default => 'pagando',
            };
            $ini = new \DateTimeImmutable(substr($r['proveedor_inicio'], 0, 7) . '-01');
            $hoy = new \DateTimeImmutable($mes);
            $meses = $hoy < $ini ? 0 : ($hoy->diff($ini)->y * 12 + $hoy->diff($ini)->m + 1);
            $r['proveedor_cuotas_transcurridas'] = min($meses, $r['proveedor_cuotas']);
        }
        return $r;
    }

    private static function pick(array $d): array
    {
        return array_intersect_key($d, array_flip(self::CAMPOS));
    }

    private static function where(array $f): array
    {
        $w = [];
        $p = [];

        $q = trim((string) ($f['buscar'] ?? ''));
        if ($q !== '') {
            // '!' como carácter de escape: funciona igual en MySQL y SQLite.
            $like = '%' . str_replace(['!', '%', '_'], ['!!', '!%', '!_'], mb_strtolower($q)) . '%';
            $w[] = "(LOWER(nombre) LIKE ? ESCAPE '!' OR LOWER(email) LIKE ? ESCAPE '!' OR LOWER(proveedor) LIKE ? ESCAPE '!'"
                . (preg_match('/\d{3}/', $q) ? " OR REPLACE(rut, '-', '') LIKE ?" : '') . ')';
            array_push($p, $like, $like, $like);
            if (preg_match('/\d{3}/', $q)) {
                $p[] = '%' . strtoupper(preg_replace('/[^0-9kK]/', '', $q)) . '%';
            }
        }
        if (in_array($f['estado'] ?? '', SocioValidator::ESTADOS, true)) {
            $w[] = 'estado = ?';
            $p[] = $f['estado'];
        }
        if (in_array($f['medio_pago'] ?? '', SocioValidator::MEDIOS_PAGO, true)) {
            $w[] = 'medio_pago = ?';
            $p[] = $f['medio_pago'];
        }
        // Rangos de monto definidos por la Fundación (sectorizar la base de cobro).
        if (ctype_digit((string) ($f['monto_min'] ?? ''))) {
            $w[] = 'monto >= ?';
            $p[] = (int) $f['monto_min'];
        }
        if (ctype_digit((string) ($f['monto_max'] ?? ''))) {
            $w[] = 'monto <= ?';
            $p[] = (int) $f['monto_max'];
        }
        $mes = date('Y-m-01');
        switch ($f['proveedor_estado'] ?? '') {
            case 'sin':
                $w[] = 'proveedor IS NULL';
                break;
            case 'pagando':
                $w[] = 'proveedor_fin >= ?';
                $p[] = $mes;
                break;
            case 'ultimo_mes':
                $w[] = 'proveedor_fin = ?';
                $p[] = $mes;
                break;
            case 'finalizado':
                $w[] = 'proveedor_fin < ?';
                $p[] = $mes;
                break;
        }
        return [$w ? 'WHERE ' . implode(' AND ', $w) : '', $p];
    }
}
