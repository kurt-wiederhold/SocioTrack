<?php
declare(strict_types=1);

namespace App;

/** Empresas captadoras de socios: base independiente, con lo que se les debe pagar. */
final class Proveedores
{
    /** Todos los proveedores con sus totales (pagos vigentes, deuda pendiente, alertas). */
    public static function all(): array
    {
        $proveedores = Db::all('SELECT * FROM proveedores ORDER BY nombre');
        $stats = [];
        foreach ($proveedores as $p) {
            $stats[(int) $p['id']] = [
                'socios' => 0, 'pagando' => 0, 'ultimo_mes' => 0, 'finalizados' => 0,
                'monto_mensual' => 0, 'deuda_pendiente' => 0,
            ];
        }
        $socios = Db::all(
            "SELECT * FROM socios WHERE proveedor_id IS NOT NULL AND estado <> 'baja'"
        );
        foreach ($socios as $s) {
            $s = SocioRepository::present($s);
            $id = $s['proveedor_id'];
            $stats[$id]['socios']++;
            if ($s['proveedor_estado'] === 'finalizado') {
                $stats[$id]['finalizados']++;
                continue;
            }
            $stats[$id]['pagando']++;
            $stats[$id]['monto_mensual'] += (int) $s['proveedor_monto'];
            $stats[$id]['deuda_pendiente'] += (int) $s['proveedor_monto'] * ($s['proveedor_cuotas'] - $s['proveedor_cuotas_transcurridas']);
            if ($s['proveedor_estado'] === 'ultimo_mes') {
                $stats[$id]['ultimo_mes']++;
            }
        }
        return array_map(fn ($p) => self::present($p) + $stats[(int) $p['id']], $proveedores);
    }

    public static function find(int $id): ?array
    {
        $row = Db::one('SELECT * FROM proveedores WHERE id = ?', [$id]);
        return $row ? self::present($row) : null;
    }

    public static function findByNombre(string $nombre): ?array
    {
        return Db::one('SELECT * FROM proveedores WHERE LOWER(nombre) = LOWER(?)', [$nombre]);
    }

    /** @return array{0: array, 1: array<string,string>} */
    public static function validate(array $in, ?int $id = null): array
    {
        $e = [];
        $txt = fn ($k) => is_string($in[$k] ?? null) ? trim(preg_replace('/\s+/u', ' ', $in[$k])) : '';
        $d = [
            'nombre' => $txt('nombre'),
            'rut' => null,
            'contacto' => $txt('contacto') ?: null,
            'email' => mb_strtolower($txt('email')) ?: null,
            'telefono' => $txt('telefono') ?: null,
            'activo' => ($in['activo'] ?? true) === false ? 0 : 1,
            'observaciones' => is_string($in['observaciones'] ?? null) ? (trim($in['observaciones']) ?: null) : null,
        ];
        if (mb_strlen($d['nombre']) < 2 || mb_strlen($d['nombre']) > 120) {
            $e['nombre'] = 'Nombre entre 2 y 120 caracteres.';
        } else {
            $dup = self::findByNombre($d['nombre']);
            if ($dup && (int) $dup['id'] !== $id) {
                $e['nombre'] = 'Ya existe un proveedor con ese nombre.';
            }
        }
        if ($txt('rut') !== '') {
            $d['rut'] = Rut::normalize($txt('rut'));
            if ($d['rut'] === null) {
                $e['rut'] = 'RUT inválido.';
            }
        }
        if ($d['email'] !== null && !filter_var($d['email'], FILTER_VALIDATE_EMAIL)) {
            $e['email'] = 'Correo inválido.';
        }
        if ($d['telefono'] !== null && !preg_match('/^\+?[0-9 ()\-]{6,20}$/', $d['telefono'])) {
            $e['telefono'] = 'Teléfono inválido.';
        }
        if ($d['contacto'] !== null && mb_strlen($d['contacto']) > 120) {
            $e['contacto'] = 'Máximo 120 caracteres.';
        }
        if ($d['observaciones'] !== null && mb_strlen($d['observaciones']) > 1000) {
            $e['observaciones'] = 'Máximo 1000 caracteres.';
        }
        return [$d, $e];
    }

    public static function save(array $d, ?int $id = null): int
    {
        $now = date('Y-m-d H:i:s');
        $cols = ['nombre', 'rut', 'contacto', 'email', 'telefono', 'activo', 'observaciones'];
        $vals = array_map(fn ($c) => $d[$c] ?? null, $cols);
        if ($id === null) {
            Db::run(
                'INSERT INTO proveedores (' . implode(', ', $cols) . ', creado_en, actualizado_en) VALUES (' . str_repeat('?, ', count($cols)) . '?, ?)',
                [...$vals, $now, $now]
            );
            return (int) Db::pdo()->lastInsertId();
        }
        $set = implode(', ', array_map(fn ($c) => "$c = ?", $cols));
        Db::run("UPDATE proveedores SET $set, actualizado_en = ? WHERE id = ?", [...$vals, $now, $id]);
        return $id;
    }

    /** Busca un proveedor por nombre y, si no existe, lo crea (usado al importar planillas). */
    public static function idPorNombre(string $nombre): int
    {
        $p = self::findByNombre($nombre);
        return $p ? (int) $p['id'] : self::save(['nombre' => $nombre, 'activo' => 1]);
    }

    public static function delete(int $id): void
    {
        $n = (int) Db::one('SELECT COUNT(*) AS n FROM socios WHERE proveedor_id = ?', [$id])['n'];
        if ($n > 0) {
            throw new HttpError(409, "No se puede eliminar: tiene $n socio(s) asociados. Puedes marcarlo como inactivo.");
        }
        if (Db::run('DELETE FROM proveedores WHERE id = ?', [$id]) === 0) {
            throw new HttpError(404, 'Proveedor no encontrado.');
        }
    }

    private static function present(array $r): array
    {
        $r['id'] = (int) $r['id'];
        $r['activo'] = (bool) (int) $r['activo'];
        return $r;
    }
}
