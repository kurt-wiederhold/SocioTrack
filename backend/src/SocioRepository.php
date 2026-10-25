<?php
declare(strict_types=1);

namespace App;

final class SocioRepository
{
    /** Columnas editables (las que valida SocioValidator). */
    public const CAMPOS = [
        'rut', 'nombre', 'email', 'telefono', 'medio_pago', 'banco', 'monto', 'estado',
        'fecha_alta', 'fecha_baja', 'proveedor_id', 'proveedor_monto', 'proveedor_cuotas',
        'proveedor_inicio', 'proveedor_fin', 'observaciones',
    ];

    private const ORDEN = ['nombre', 'rut', 'monto', 'fecha_alta', 'estado', 'creado_en', 'proveedor_fin'];

    private const FROM = "FROM socios s
            LEFT JOIN proveedores p ON p.id = s.proveedor_id
            LEFT JOIN categorias c ON s.monto >= c.monto_min AND (c.monto_max IS NULL OR s.monto <= c.monto_max)";

    /**
     * Socio + nombre del proveedor + categoría calculada por su monto
     * + estado de su cobro en el mes actual (para responder "¿este socio pagó este mes?").
     */
    private static function select(): string
    {
        $mes = self::periodoActual();
        return "SELECT s.*, p.nombre AS proveedor,
                c.id AS categoria_id, c.nombre AS categoria, c.color AS categoria_color,
                (SELECT d.estado FROM cobro_detalles d WHERE d.socio_id = s.id AND d.periodo = '$mes'
                 ORDER BY d.id DESC LIMIT 1) AS cobro_mes,
                (SELECT COUNT(*) FROM cobro_detalles d WHERE d.socio_id = s.id AND d.periodo = '$mes') AS cobro_mes_intentos
            " . self::FROM;
    }

    /** "AAAA-MM" generado por el servidor (seguro para ir dentro del SQL). */
    private static function periodoActual(): string
    {
        return date('Y-m');
    }

    public static function find(int $id): ?array
    {
        $row = Db::one(self::select() . ' WHERE s.id = ?', [$id]);
        return $row ? self::present($row) : null;
    }

    public static function findByRut(string $rut): ?array
    {
        return Db::one('SELECT * FROM socios WHERE rut = ?', [$rut]);
    }

    /**
     * @param array $f filtros: buscar, estado, medio_pago, categoria_id, proveedor_id,
     *                 proveedor_estado, orden, dir, pagina, por_pagina
     */
    public static function search(array $f): array
    {
        [$where, $params] = self::where($f);

        $orden = in_array($f['orden'] ?? '', self::ORDEN, true) ? $f['orden'] : 'nombre';
        $dir = strtolower((string) ($f['dir'] ?? '')) === 'desc' ? 'DESC' : 'ASC';
        $porPagina = min(20000, max(1, (int) ($f['por_pagina'] ?? 25)));
        $pagina = max(1, (int) ($f['pagina'] ?? 1));
        $offset = ($pagina - 1) * $porPagina;

        $total = (int) Db::one('SELECT COUNT(*) AS n ' . self::FROM . " $where", $params)['n'];
        $rows = Db::all(
            self::select() . " $where ORDER BY s.$orden $dir, s.id ASC LIMIT $porPagina OFFSET $offset",
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
                SUM(CASE WHEN estado <> 'baja' AND proveedor_fin >= ? THEN proveedor_monto ELSE 0 END) AS proveedor_monto_mensual,
                SUM(CASE WHEN estado <> 'baja' AND proveedor_fin < ? AND proveedor_revisado_en IS NULL THEN 1 ELSE 0 END) AS proveedor_por_revisar
             FROM socios",
            [$mes, $mes, $mes, $mes]
        );
        return array_map('intval', $r);
    }

    /**
     * Marca como revisada la alerta "el socio pasó 100% a la Fundación".
     * Sin ids: marca todas las pendientes. Devuelve cuántas se marcaron.
     */
    public static function marcarRevisados(?array $ids): int
    {
        $sql = 'UPDATE socios SET proveedor_revisado_en = ? WHERE proveedor_fin < ? AND proveedor_revisado_en IS NULL';
        $params = [date('Y-m-d H:i:s'), date('Y-m-01')];
        if ($ids !== null) {
            if (!$ids) {
                return 0;
            }
            $sql .= ' AND id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')';
            array_push($params, ...$ids);
        }
        return Db::run($sql, $params);
    }

    /** Historial de cobros del socio (más reciente primero). */
    public static function cobros(int $id): array
    {
        $rows = Db::all(
            'SELECT d.periodo, d.monto, d.intento, d.estado, d.codigo, d.motivo, d.fecha_cargo, n.medio_pago, n.numero
             FROM cobro_detalles d JOIN cobro_nominas n ON n.id = d.nomina_id
             WHERE d.socio_id = ? ORDER BY d.periodo DESC, d.id DESC LIMIT 36',
            [$id]
        );
        return array_map(function ($r) {
            foreach (['monto', 'intento', 'numero'] as $k) {
                $r[$k] = (int) $r[$k];
            }
            return $r;
        }, $rows);
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
        // Si cambia el fin del pago al proveedor, la alerta vuelve a quedar pendiente.
        $antes = Db::one('SELECT proveedor_fin FROM socios WHERE id = ?', [$id]);
        if ($antes && ($antes['proveedor_fin'] ?? null) !== ($d['proveedor_fin'] ?? null)) {
            $d['proveedor_revisado_en'] = null;
        }
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
        foreach (['id', 'monto', 'proveedor_id', 'proveedor_monto', 'proveedor_cuotas', 'creado_por', 'actualizado_por', 'categoria_id', 'cobro_mes_intentos'] as $k) {
            if (isset($r[$k])) {
                $r[$k] = (int) $r[$k];
            }
        }
        $r['proveedor_estado'] = null;
        $r['proveedor_cuotas_transcurridas'] = null;
        if (!empty($r['proveedor_id']) && $r['proveedor_fin'] !== null) {
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
        $r['proveedor_por_revisar'] = $r['proveedor_estado'] === 'finalizado'
            && empty($r['proveedor_revisado_en']) && $r['estado'] !== 'baja';
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
            $w[] = "(LOWER(s.nombre) LIKE ? ESCAPE '!' OR LOWER(s.email) LIKE ? ESCAPE '!' OR LOWER(p.nombre) LIKE ? ESCAPE '!'"
                . (preg_match('/\d{3}/', $q) ? " OR REPLACE(s.rut, '-', '') LIKE ?" : '') . ')';
            array_push($p, $like, $like, $like);
            if (preg_match('/\d{3}/', $q)) {
                $p[] = '%' . strtoupper(preg_replace('/[^0-9kK]/', '', $q)) . '%';
            }
        }
        if (in_array($f['estado'] ?? '', SocioValidator::ESTADOS, true)) {
            $w[] = 's.estado = ?';
            $p[] = $f['estado'];
        }
        if (in_array($f['medio_pago'] ?? '', SocioValidator::MEDIOS_PAGO, true)) {
            $w[] = 's.medio_pago = ?';
            $p[] = $f['medio_pago'];
        }
        // Sectorización por categoría (rango de monto definido por la Fundación).
        $cat = (string) ($f['categoria_id'] ?? '');
        if ($cat === 'sin') {
            $w[] = 'c.id IS NULL';
        } elseif (ctype_digit($cat)) {
            $w[] = 'c.id = ?';
            $p[] = (int) $cat;
        }
        if (ctype_digit((string) ($f['proveedor_id'] ?? ''))) {
            $w[] = 's.proveedor_id = ?';
            $p[] = (int) $f['proveedor_id'];
        }
        // Estado del cobro del mes actual.
        $periodo = self::periodoActual();
        $existe = fn (string $estados) => "EXISTS (SELECT 1 FROM cobro_detalles d WHERE d.socio_id = s.id AND d.periodo = '$periodo' AND d.estado IN ($estados))";
        switch ($f['cobro_mes'] ?? '') {
            case 'cobrado':
                $w[] = $existe("'cobrado'");
                break;
            case 'pendiente':
                $w[] = $existe("'pendiente'");
                break;
            case 'rechazado':
                $w[] = 'NOT ' . $existe("'cobrado', 'pendiente'") . ' AND ' . $existe("'rechazado'");
                break;
            case 'sin_enviar':
                $w[] = "s.estado = 'activo' AND NOT " . $existe("'cobrado', 'pendiente', 'rechazado'");
                break;
        }

        $mes = date('Y-m-01');
        switch ($f['proveedor_estado'] ?? '') {
            case 'sin':
                $w[] = 's.proveedor_id IS NULL';
                break;
            case 'pagando':
                $w[] = 's.proveedor_fin >= ?';
                $p[] = $mes;
                break;
            case 'ultimo_mes':
                $w[] = 's.proveedor_fin = ?';
                $p[] = $mes;
                break;
            case 'finalizado':
                $w[] = 's.proveedor_fin < ?';
                $p[] = $mes;
                break;
            case 'por_revisar':
                $w[] = "s.proveedor_fin < ? AND s.proveedor_revisado_en IS NULL AND s.estado <> 'baja'";
                $p[] = $mes;
                break;
        }
        return [$w ? 'WHERE ' . implode(' AND ', $w) : '', $p];
    }
}
