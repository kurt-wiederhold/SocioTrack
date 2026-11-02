<?php
declare(strict_types=1);

namespace App;

/**
 * Informes de socios y cobros por periodo (mes, trimestre, semestre o año).
 *
 * Por periodo: altas, bajas, socios activos al cierre, monto mensual comprometido al cierre,
 * socios cobrados, monto cobrado (PAC / PAT) y tasa de cobro.
 *
 * Notas de cálculo:
 *  - "Activos al cierre" = dados de alta hasta esa fecha y sin baja a esa fecha
 *    (los suspendidos cuentan como socios; no se cobran pero no son bajas).
 *  - El monto comprometido usa el monto actual de cada socio (no se guarda historial de cambios de monto).
 *  - Lo cobrado sale de las respuestas cargadas en Cobros, por eso es el dato real del mes.
 *  - La tasa de cobro se calcula solo sobre cargos con respuesta (los que esperan respuesta no cuentan).
 */
final class Informes
{
    public const AGRUPACIONES = ['mes' => 1, 'trimestre' => 3, 'semestre' => 6, 'anio' => 12];
    private const MAX_MESES = 240;

    public static function periodoValido(mixed $p): bool
    {
        return Cobros::periodoValido($p);
    }

    /** Primer periodo con datos (para los selectores de la pantalla). */
    public static function primerPeriodo(): string
    {
        $r = Db::one("SELECT MIN(fecha_alta) AS f FROM socios");
        $min = $r && $r['f'] ? substr((string) $r['f'], 0, 7) : date('Y-m');
        $c = Db::one('SELECT MIN(periodo) AS p FROM cobro_detalles');
        if ($c && $c['p'] && $c['p'] < $min) {
            $min = $c['p'];
        }
        return $min;
    }

    /**
     * @return array{agrupacion:string, periodos:array, totales:array}
     */
    public static function generar(string $agrupacion, string $desde, string $hasta): array
    {
        $paso = self::AGRUPACIONES[$agrupacion];
        $inicio = self::inicioDeGrupo($desde, $paso);
        $fin = self::finDeGrupo($hasta, $paso);
        $actual = date('Y-m');
        if ($fin > $actual) {
            $fin = $actual; // no se informan meses futuros
        }
        if ($inicio > $fin) {
            throw new HttpError(422, 'El periodo “desde” debe ser anterior a “hasta”.');
        }
        $meses = self::meses($inicio, $fin);
        if (count($meses) > self::MAX_MESES) {
            throw new HttpError(422, 'El rango es demasiado largo (máximo 20 años).');
        }

        $desdeFecha = "$inicio-01";
        $hastaFecha = Cobros::finDeMes($fin);

        // Altas y bajas por mes.
        $porMes = fn (string $col) => self::indexar(Db::all(
            "SELECT SUBSTR($col, 1, 7) AS m, COUNT(*) AS n, COALESCE(SUM(monto), 0) AS monto
             FROM socios WHERE $col BETWEEN ? AND ? GROUP BY SUBSTR($col, 1, 7)",
            [$desdeFecha, $hastaFecha]
        ));
        $altas = $porMes('fecha_alta');
        $bajas = $porMes('fecha_baja');

        // Situación antes del rango, para acumular los activos al cierre de cada mes.
        $antes = fn (string $col) => Db::one(
            "SELECT COUNT(*) AS n, COALESCE(SUM(monto), 0) AS monto FROM socios WHERE $col < ?",
            [$desdeFecha]
        );
        $altasPrevias = $antes('fecha_alta');
        $bajasPrevias = $antes('fecha_baja');

        // Cobros por mes y medio de pago.
        $cobros = [];
        foreach (Db::all(
            "SELECT d.periodo AS m, n.medio_pago,
                    COUNT(DISTINCT CASE WHEN d.estado <> 'pendiente' THEN d.rut END) AS intentados,
                    COUNT(DISTINCT CASE WHEN d.estado = 'pendiente' THEN d.rut END) AS pendientes,
                    COUNT(DISTINCT CASE WHEN d.estado = 'cobrado' THEN d.rut END) AS cobrados,
                    COALESCE(SUM(CASE WHEN d.estado = 'cobrado' THEN d.monto ELSE 0 END), 0) AS monto
             FROM cobro_detalles d JOIN cobro_nominas n ON n.id = d.nomina_id
             WHERE d.periodo BETWEEN ? AND ?
             GROUP BY d.periodo, n.medio_pago",
            [$inicio, $fin]
        ) as $r) {
            $cobros[$r['m']][$r['medio_pago']] = $r;
        }

        // Recorrer mes a mes y agrupar.
        $activos = (int) $altasPrevias['n'] - (int) $bajasPrevias['n'];
        $comprometido = (int) $altasPrevias['monto'] - (int) $bajasPrevias['monto'];
        $grupos = [];
        foreach ($meses as $m) {
            $a = $altas[$m] ?? ['n' => 0, 'monto' => 0];
            $b = $bajas[$m] ?? ['n' => 0, 'monto' => 0];
            $activos += (int) $a['n'] - (int) $b['n'];
            $comprometido += (int) $a['monto'] - (int) $b['monto'];

            $clave = self::claveGrupo($m, $agrupacion);
            $g = &$grupos[$clave];
            $g ??= [
                'clave' => $clave, 'etiqueta' => self::etiqueta($m, $agrupacion),
                'desde' => $m, 'hasta' => $m,
                'altas' => 0, 'bajas' => 0,
                'socios_cobrados' => 0, 'cargos_intentados' => 0, 'cargos_pendientes' => 0,
                'monto_cobrado' => 0, 'monto_cobrado_pac' => 0, 'monto_cobrado_pat' => 0,
            ];
            $g['hasta'] = $m;
            $g['altas'] += (int) $a['n'];
            $g['bajas'] += (int) $b['n'];
            $g['activos_cierre'] = $activos;
            $g['monto_comprometido'] = $comprometido;
            foreach (['PAC', 'PAT'] as $medio) {
                $c = $cobros[$m][$medio] ?? null;
                if ($c) {
                    $g['socios_cobrados'] += (int) $c['cobrados'];
                    $g['cargos_intentados'] += (int) $c['intentados'];
                    $g['cargos_pendientes'] += (int) $c['pendientes'];
                    $g['monto_cobrado'] += (int) $c['monto'];
                    $g['monto_cobrado_' . strtolower($medio)] += (int) $c['monto'];
                }
            }
            unset($g);
        }

        $periodos = array_values(array_map(function ($g) {
            $g['neto'] = $g['altas'] - $g['bajas'];
            $g['tasa_cobro'] = $g['cargos_intentados'] > 0 ? round($g['socios_cobrados'] / $g['cargos_intentados'], 4) : null;
            return $g;
        }, $grupos));

        $suma = fn (string $k) => array_sum(array_column($periodos, $k));
        $ultimo = end($periodos) ?: [];
        $intentados = $suma('cargos_intentados');
        return [
            'agrupacion' => $agrupacion,
            'desde' => $inicio,
            'hasta' => $fin,
            'periodos' => $periodos,
            'totales' => [
                'altas' => $suma('altas'),
                'bajas' => $suma('bajas'),
                'neto' => $suma('altas') - $suma('bajas'),
                'activos_cierre' => $ultimo['activos_cierre'] ?? 0,
                'monto_comprometido' => $ultimo['monto_comprometido'] ?? 0,
                'socios_cobrados' => $suma('socios_cobrados'),
                'cargos_intentados' => $intentados,
                'cargos_pendientes' => $suma('cargos_pendientes'),
                'monto_cobrado' => $suma('monto_cobrado'),
                'monto_cobrado_pac' => $suma('monto_cobrado_pac'),
                'monto_cobrado_pat' => $suma('monto_cobrado_pat'),
                'tasa_cobro' => $intentados > 0 ? round($suma('socios_cobrados') / $intentados, 4) : null,
            ],
        ];
    }

    /** "2026-08" con paso 3 -> "2026-07" (inicio del trimestre). */
    public static function inicioDeGrupo(string $mes, int $paso): string
    {
        [$y, $m] = array_map('intval', explode('-', $mes));
        $m = intdiv($m - 1, $paso) * $paso + 1;
        return sprintf('%04d-%02d', $y, $m);
    }

    public static function finDeGrupo(string $mes, int $paso): string
    {
        [$y, $m] = array_map('intval', explode('-', self::inicioDeGrupo($mes, $paso)));
        return sprintf('%04d-%02d', $y, $m + $paso - 1);
    }

    private static function meses(string $desde, string $hasta): array
    {
        $out = [];
        [$y, $m] = array_map('intval', explode('-', $desde));
        while (($p = sprintf('%04d-%02d', $y, $m)) <= $hasta && count($out) <= self::MAX_MESES) {
            $out[] = $p;
            if (++$m > 12) {
                $m = 1;
                $y++;
            }
        }
        return $out;
    }

    private static function claveGrupo(string $mes, string $agrupacion): string
    {
        [$y, $m] = array_map('intval', explode('-', $mes));
        return match ($agrupacion) {
            'mes' => $mes,
            'trimestre' => "$y-T" . (intdiv($m - 1, 3) + 1),
            'semestre' => "$y-S" . (intdiv($m - 1, 6) + 1),
            'anio' => (string) $y,
        };
    }

    private static function etiqueta(string $mes, string $agrupacion): string
    {
        static $nombres = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
        [$y, $m] = array_map('intval', explode('-', $mes));
        return match ($agrupacion) {
            'mes' => $nombres[$m - 1] . " $y",
            'trimestre' => 'T' . (intdiv($m - 1, 3) + 1) . " $y",
            'semestre' => 'S' . (intdiv($m - 1, 6) + 1) . " $y",
            'anio' => (string) $y,
        };
    }

    private static function indexar(array $rows): array
    {
        $out = [];
        foreach ($rows as $r) {
            $out[$r['m']] = $r;
        }
        return $out;
    }
}
