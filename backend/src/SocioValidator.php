<?php
declare(strict_types=1);

namespace App;

/**
 * Valida y normaliza los datos de un socio. Acepta los formatos "humanos"
 * que suelen venir en planillas Excel ($5.000, 03/01/2020, "Tarjeta", etc.).
 */
final class SocioValidator
{
    public const ESTADOS = ['activo', 'suspendido', 'baja'];
    public const MEDIOS_PAGO = ['PAC', 'PAT'];
    public const MONTO_MAX = 10_000_000;

    private const ALIAS_MEDIO = [
        'pac' => 'PAC', 'banco' => 'PAC', 'cuenta' => 'PAC', 'cuenta corriente' => 'PAC', 'cuenta vista' => 'PAC',
        'pat' => 'PAT', 'tarjeta' => 'PAT', 'transbank' => 'PAT', 'tbk' => 'PAT', 'tarjeta de credito' => 'PAT',
    ];
    private const ALIAS_ESTADO = [
        'activo' => 'activo', 'activa' => 'activo', 'vigente' => 'activo',
        'suspendido' => 'suspendido', 'suspendida' => 'suspendido', 'pausado' => 'suspendido',
        'baja' => 'baja', 'inactivo' => 'baja', 'inactiva' => 'baja', 'retirado' => 'baja',
    ];

    /**
     * @return array{0: array, 1: array<string,string>} [datos normalizados, errores por campo]
     */
    public static function validate(array $in): array
    {
        $e = [];
        $d = [];

        $rutRaw = self::str($in['rut'] ?? null);
        $d['rut'] = Rut::normalize($rutRaw);
        if ($rutRaw === '') {
            $e['rut'] = 'El RUT es obligatorio.';
        } elseif ($d['rut'] === null) {
            $e['rut'] = 'RUT inválido (revisa el dígito verificador).';
        }

        $d['nombre'] = preg_replace('/\s+/u', ' ', self::str($in['nombre'] ?? null));
        if (mb_strlen($d['nombre']) < 2) {
            $e['nombre'] = 'El nombre es obligatorio.';
        } elseif (mb_strlen($d['nombre']) > 150) {
            $e['nombre'] = 'Máximo 150 caracteres.';
        }

        $d['email'] = self::nullable(mb_strtolower(self::str($in['email'] ?? null)));
        if ($d['email'] !== null && (mb_strlen($d['email']) > 190 || !filter_var($d['email'], FILTER_VALIDATE_EMAIL))) {
            $e['email'] = 'Correo inválido.';
        }

        $d['telefono'] = self::nullable(self::str($in['telefono'] ?? null));
        if ($d['telefono'] !== null && !preg_match('/^\+?[0-9 ()\-]{6,20}$/', $d['telefono'])) {
            $e['telefono'] = 'Teléfono inválido.';
        }

        $medio = self::key($in['medio_pago'] ?? null);
        $d['medio_pago'] = self::ALIAS_MEDIO[$medio] ?? null;
        if ($d['medio_pago'] === null) {
            $e['medio_pago'] = $medio === '' ? 'El medio de pago es obligatorio.' : 'Debe ser PAC (banco) o PAT (tarjeta).';
        }

        $d['banco'] = self::nullable(self::str($in['banco'] ?? null));
        if ($d['banco'] !== null && mb_strlen($d['banco']) > 80) {
            $e['banco'] = 'Máximo 80 caracteres.';
        }

        $d['monto'] = self::money($in['monto'] ?? null);
        if ($d['monto'] === null || $d['monto'] < 1 || $d['monto'] > self::MONTO_MAX) {
            $e['monto'] = 'Monto inválido (entero en pesos, mayor a 0).';
        }

        $estado = self::key($in['estado'] ?? null);
        $d['estado'] = $estado === '' ? 'activo' : (self::ALIAS_ESTADO[$estado] ?? null);
        if ($d['estado'] === null) {
            $e['estado'] = 'Estado inválido (activo, suspendido o baja).';
        }

        $altaRaw = $in['fecha_alta'] ?? null;
        $d['fecha_alta'] = self::isEmpty($altaRaw) ? date('Y-m-d') : self::date($altaRaw);
        if ($d['fecha_alta'] === null) {
            $e['fecha_alta'] = 'Fecha inválida (usa AAAA-MM-DD o DD/MM/AAAA).';
        }

        $d['fecha_baja'] = null;
        if ($d['estado'] === 'baja') {
            $bajaRaw = $in['fecha_baja'] ?? null;
            $d['fecha_baja'] = self::isEmpty($bajaRaw) ? date('Y-m-d') : self::date($bajaRaw);
            if ($d['fecha_baja'] === null) {
                $e['fecha_baja'] = 'Fecha inválida.';
            } elseif ($d['fecha_alta'] !== null && $d['fecha_baja'] < $d['fecha_alta']) {
                $e['fecha_baja'] = 'No puede ser anterior a la fecha de alta.';
            }
        }

        // Proveedor (empresa captadora a la que se le paga por el socio durante N cuotas).
        $d['proveedor'] = self::nullable(preg_replace('/\s+/u', ' ', self::str($in['proveedor'] ?? null)));
        $d['proveedor_monto'] = null;
        $d['proveedor_cuotas'] = null;
        $d['proveedor_inicio'] = null;
        $d['proveedor_fin'] = null;
        if ($d['proveedor'] !== null) {
            if (mb_strlen($d['proveedor']) > 120) {
                $e['proveedor'] = 'Máximo 120 caracteres.';
            }
            $d['proveedor_monto'] = self::money($in['proveedor_monto'] ?? null);
            if ($d['proveedor_monto'] === null || $d['proveedor_monto'] < 0 || $d['proveedor_monto'] > self::MONTO_MAX) {
                $e['proveedor_monto'] = 'Indica el monto mensual que se paga al proveedor.';
            }
            $cuotas = self::money($in['proveedor_cuotas'] ?? null);
            $d['proveedor_cuotas'] = $cuotas;
            if ($cuotas === null || $cuotas < 1 || $cuotas > 120) {
                $e['proveedor_cuotas'] = 'Cantidad de meses entre 1 y 120.';
            }
            $iniRaw = $in['proveedor_inicio'] ?? null;
            $d['proveedor_inicio'] = self::isEmpty($iniRaw) ? $d['fecha_alta'] : self::date($iniRaw);
            if ($d['proveedor_inicio'] === null) {
                $e['proveedor_inicio'] = 'Fecha inválida.';
            }
            if (!isset($e['proveedor_cuotas']) && $d['proveedor_inicio'] !== null) {
                $d['proveedor_fin'] = self::ultimoMesProveedor($d['proveedor_inicio'], $cuotas);
            }
        }

        $d['observaciones'] = self::nullable(self::str($in['observaciones'] ?? null));
        if ($d['observaciones'] !== null && mb_strlen($d['observaciones']) > 1000) {
            $e['observaciones'] = 'Máximo 1000 caracteres.';
        }

        return [$d, $e];
    }

    /** Primer día del último mes en que se paga al proveedor. */
    public static function ultimoMesProveedor(string $inicio, int $cuotas): string
    {
        $d = new \DateTimeImmutable(substr($inicio, 0, 7) . '-01');
        return $d->modify('+' . ($cuotas - 1) . ' months')->format('Y-m-d');
    }

    private static function str(mixed $v): string
    {
        if (is_int($v) || is_float($v)) {
            return (string) $v;
        }
        if (!is_string($v)) {
            return '';
        }
        // Quita caracteres de control (se cuelan desde Excel); conserva saltos de línea.
        return trim(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $v) ?? '');
    }

    private static function nullable(string $v): ?string
    {
        return $v === '' ? null : $v;
    }

    private static function isEmpty(mixed $v): bool
    {
        return self::str($v) === '';
    }

    private static function key(mixed $v): string
    {
        $s = mb_strtolower(self::str($v));
        return strtr($s, ['á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u']);
    }

    /** "$5.000", "5000", 5000 -> 5000. Pesos chilenos sin decimales. */
    private static function money(mixed $v): ?int
    {
        if (is_int($v)) {
            return $v;
        }
        if (is_float($v)) {
            return (floor($v) == $v && abs($v) < 1e9) ? (int) $v : null;
        }
        $s = preg_replace('/[\s$]|clp/i', '', self::str($v));
        $s = preg_replace('/[.,]00?$/', '', $s);
        // Solo dígitos, o miles separados por punto/coma: 5000, 5.000, 1,500,000
        if (!preg_match('/^(\d+|\d{1,3}([.,]\d{3})+)$/', $s)) {
            return null;
        }
        $s = str_replace(['.', ','], '', $s);
        return strlen($s) <= 9 ? (int) $s : null;
    }

    /** Acepta AAAA-MM-DD, DD/MM/AAAA, DD-MM-AAAA y AAAAMMDD. */
    private static function date(mixed $v): ?string
    {
        $s = self::str($v);
        if (preg_match('/^(\d{4})-(\d{1,2})-(\d{1,2})/', $s, $m)) {
            [$y, $mo, $d] = [$m[1], $m[2], $m[3]];
        } elseif (preg_match('/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/', $s, $m)) {
            [$d, $mo, $y] = [$m[1], $m[2], $m[3]];
        } elseif (preg_match('/^(\d{4})(\d{2})(\d{2})$/', $s, $m)) {
            [$y, $mo, $d] = [$m[1], $m[2], $m[3]];
        } else {
            return null;
        }
        if (!checkdate((int) $mo, (int) $d, (int) $y) || (int) $y < 1990 || (int) $y > 2100) {
            return null;
        }
        return sprintf('%04d-%02d-%02d', $y, $mo, $d);
    }
}
