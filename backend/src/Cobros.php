<?php
declare(strict_types=1);

namespace App;

/**
 * Ciclo de cobro mensual:
 *   1. Generar nómina (PAC o PAT) con los socios activos que aún no se cobran en el periodo.
 *   2. Descargar el archivo y enviarlo al banco / Transbank.
 *   3. Cargar la respuesta: se cruza por RUT y cada cargo queda cobrado o rechazado.
 *   4. Generar la siguiente nómina: incluye automáticamente a los rechazados como reintento,
 *      hasta 1 envío + N reintentos por mes (config cobro.max_reintentos, por defecto 4).
 */
final class Cobros
{
    public const ESTADOS_DETALLE = ['pendiente', 'cobrado', 'rechazado'];

    public static function periodoValido(mixed $p): bool
    {
        return is_string($p) && preg_match('/^(20\d{2})-(0[1-9]|1[0-2])$/', $p) === 1;
    }

    public static function maxIntentos(): int
    {
        return 1 + max(0, (int) Config::get('cobro.max_reintentos', 4));
    }

    public static function configPac(): array
    {
        return [
            'codigo_banco' => (string) Config::get('cobro.pac.codigo_banco', '012'),
            'codigo_empresa' => (string) Config::get('cobro.pac.codigo_empresa', '004'),
            'codigo_convenio' => (string) Config::get('cobro.pac.codigo_convenio', '065'),
        ];
    }

    /**
     * Socios que se pueden incluir en una nueva nómina del periodo:
     * activos, del medio indicado, dados de alta antes de fin de mes, sin cargo cobrado
     * ni pendiente de respuesta en el periodo y con intentos disponibles.
     */
    public static function elegibles(string $periodo, string $medio, ?array $categoria = null): array
    {
        $sql = "SELECT s.id, s.rut, s.nombre, s.monto,
                       (SELECT COUNT(*) FROM cobro_detalles d WHERE d.socio_id = s.id AND d.periodo = ?) AS intentos_previos
                FROM socios s
                WHERE s.estado = 'activo' AND s.medio_pago = ? AND s.fecha_alta <= ?
                  AND NOT EXISTS (SELECT 1 FROM cobro_detalles d
                                  WHERE d.socio_id = s.id AND d.periodo = ? AND d.estado IN ('pendiente', 'cobrado'))";
        $params = [$periodo, $medio, self::finDeMes($periodo), $periodo];
        if ($categoria) {
            $sql .= ' AND s.monto >= ?';
            $params[] = $categoria['monto_min'];
            if ($categoria['monto_max'] !== null) {
                $sql .= ' AND s.monto <= ?';
                $params[] = $categoria['monto_max'];
            }
        }
        $rows = Db::all($sql . ' ORDER BY s.nombre', $params);
        $max = self::maxIntentos();
        $out = [];
        foreach ($rows as $r) {
            $previos = (int) $r['intentos_previos'];
            if ($previos < $max) {
                $out[] = ['socio_id' => (int) $r['id'], 'rut' => $r['rut'], 'nombre' => $r['nombre'],
                    'monto' => (int) $r['monto'], 'intento' => $previos + 1];
            }
        }
        return $out;
    }

    /** Situación del periodo para cada medio de pago. */
    public static function resumen(string $periodo): array
    {
        $out = [];
        foreach (SocioValidator::MEDIOS_PAGO as $medio) {
            $activos = Db::one(
                "SELECT COUNT(*) AS n, COALESCE(SUM(monto), 0) AS monto FROM socios
                 WHERE estado = 'activo' AND medio_pago = ? AND fecha_alta <= ?",
                [$medio, self::finDeMes($periodo)]
            );
            $det = Db::one(
                "SELECT
                    COUNT(DISTINCT CASE WHEN d.estado = 'cobrado' THEN d.socio_id END) AS cobrados,
                    COALESCE(SUM(CASE WHEN d.estado = 'cobrado' THEN d.monto ELSE 0 END), 0) AS monto_cobrado,
                    SUM(CASE WHEN d.estado = 'pendiente' THEN 1 ELSE 0 END) AS pendientes
                 FROM cobro_detalles d JOIN cobro_nominas n ON n.id = d.nomina_id
                 WHERE d.periodo = ? AND n.medio_pago = ?",
                [$periodo, $medio]
            );
            $agotados = Db::one(
                "SELECT COUNT(*) AS n FROM socios s
                 WHERE s.estado = 'activo' AND s.medio_pago = ?
                   AND (SELECT COUNT(*) FROM cobro_detalles d WHERE d.socio_id = s.id AND d.periodo = ?) >= " . self::maxIntentos() . "
                   AND NOT EXISTS (SELECT 1 FROM cobro_detalles d WHERE d.socio_id = s.id AND d.periodo = ?
                                   AND d.estado IN ('pendiente', 'cobrado'))",
                // maxIntentos va en el SQL como entero: en SQLite, COUNT(*) >= '5' (texto) siempre es falso.
                [$medio, $periodo, $periodo]
            );
            $elegibles = self::elegibles($periodo, $medio);
            $out[$medio] = [
                'socios_activos' => (int) $activos['n'],
                'monto_esperado' => (int) $activos['monto'],
                'cobrados' => (int) $det['cobrados'],
                'monto_cobrado' => (int) $det['monto_cobrado'],
                'pendientes_respuesta' => (int) $det['pendientes'],
                'por_enviar' => count($elegibles),
                'monto_por_enviar' => array_sum(array_column($elegibles, 'monto')),
                'reintentos_disponibles' => count(array_filter($elegibles, fn ($e) => $e['intento'] > 1)),
                'agotados' => (int) $agotados['n'],
            ];
        }
        return $out;
    }

    /** Nóminas del periodo con sus totales. */
    public static function nominas(string $periodo): array
    {
        $rows = Db::all(
            "SELECT n.*, c.nombre AS categoria,
                    COALESCE(a.registros, 0) AS registros, COALESCE(a.monto_total, 0) AS monto_total,
                    COALESCE(a.cobrados, 0) AS cobrados, COALESCE(a.monto_cobrado, 0) AS monto_cobrado,
                    COALESCE(a.rechazados, 0) AS rechazados, COALESCE(a.pendientes, 0) AS pendientes,
                    COALESCE(a.reintentos, 0) AS reintentos
             FROM cobro_nominas n
             LEFT JOIN categorias c ON c.id = n.categoria_id
             LEFT JOIN (
                SELECT nomina_id, COUNT(*) AS registros, SUM(monto) AS monto_total,
                       SUM(CASE WHEN estado = 'cobrado' THEN 1 ELSE 0 END) AS cobrados,
                       SUM(CASE WHEN estado = 'cobrado' THEN monto ELSE 0 END) AS monto_cobrado,
                       SUM(CASE WHEN estado = 'rechazado' THEN 1 ELSE 0 END) AS rechazados,
                       SUM(CASE WHEN estado = 'pendiente' THEN 1 ELSE 0 END) AS pendientes,
                       SUM(CASE WHEN intento > 1 THEN 1 ELSE 0 END) AS reintentos
                FROM cobro_detalles GROUP BY nomina_id
             ) a ON a.nomina_id = n.id
             WHERE n.periodo = ?
             ORDER BY n.medio_pago, n.numero DESC",
            [$periodo]
        );
        return array_map([self::class, 'presentNomina'], $rows);
    }

    public static function nomina(int $id): ?array
    {
        $n = Db::one('SELECT * FROM cobro_nominas WHERE id = ?', [$id]);
        if (!$n) {
            return null;
        }
        foreach (self::nominas($n['periodo']) as $x) {
            if ($x['id'] === $id) {
                return $x;
            }
        }
        return null;
    }

    public static function detalles(int $nominaId): array
    {
        $rows = Db::all('SELECT * FROM cobro_detalles WHERE nomina_id = ? ORDER BY nombre', [$nominaId]);
        return array_map(function ($r) {
            foreach (['id', 'nomina_id', 'socio_id', 'monto', 'intento'] as $k) {
                $r[$k] = $r[$k] === null ? null : (int) $r[$k];
            }
            return $r;
        }, $rows);
    }

    /**
     * Crea la nómina con los socios elegibles. Con $simular solo devuelve cuántos entrarían.
     * @return array{registros:int, monto:int, reintentos:int, nomina?:array}
     */
    public static function generar(array $p, bool $simular, ?int $userId): array
    {
        $categoria = null;
        if ($p['categoria_id'] !== null) {
            $categoria = Categorias::find($p['categoria_id']) ?? throw new HttpError(422, 'La categoría no existe.');
        }
        $socios = self::elegibles($p['periodo'], $p['medio_pago'], $categoria);
        $resumen = [
            'registros' => count($socios),
            'monto' => array_sum(array_column($socios, 'monto')),
            'reintentos' => count(array_filter($socios, fn ($s) => $s['intento'] > 1)),
        ];
        if ($simular) {
            return $resumen;
        }
        if (!$socios) {
            throw new HttpError(422, 'No hay socios pendientes de cobro para esta nómina.');
        }

        $pdo = Db::pdo();
        $pdo->beginTransaction();
        try {
            $numero = 1 + (int) Db::one(
                'SELECT COALESCE(MAX(numero), 0) AS n FROM cobro_nominas WHERE periodo = ? AND medio_pago = ?',
                [$p['periodo'], $p['medio_pago']]
            )['n'];
            Db::run(
                'INSERT INTO cobro_nominas (periodo, medio_pago, numero, categoria_id, fecha_facturacion, fecha_vencimiento, estado, creado_en, creado_por)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [$p['periodo'], $p['medio_pago'], $numero, $p['categoria_id'], $p['fecha_facturacion'],
                    $p['fecha_vencimiento'], 'generada', date('Y-m-d H:i:s'), $userId]
            );
            $id = (int) $pdo->lastInsertId();
            $stmt = $pdo->prepare(
                "INSERT INTO cobro_detalles (nomina_id, socio_id, periodo, rut, nombre, monto, intento, estado)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente')"
            );
            foreach ($socios as $s) {
                $stmt->execute([$id, $s['socio_id'], $p['periodo'], $s['rut'], $s['nombre'], $s['monto'], $s['intento']]);
            }
            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            if ($e instanceof \PDOException && $e->getCode() === '23000') {
                throw new HttpError(409, 'Otra persona generó una nómina al mismo tiempo. Actualiza la página y revisa.');
            }
            throw $e;
        }
        return $resumen + ['nomina' => self::nomina($id)];
    }

    /** @return array{0: string, 1: string} [nombre de archivo, contenido] */
    public static function archivo(int $nominaId): array
    {
        $n = Db::one('SELECT * FROM cobro_nominas WHERE id = ?', [$nominaId]) ?? throw new HttpError(404, 'Nómina no encontrada.');
        $detalles = self::detalles($nominaId);
        $base = "{$n['medio_pago']}_{$n['periodo']}_envio{$n['numero']}";
        if ($n['medio_pago'] === 'PAC') {
            return ["$base.txt", Formatos::nominaPac($detalles, $n['fecha_facturacion'], $n['fecha_vencimiento'], self::configPac())];
        }
        return ["$base.csv", Formatos::nominaPat($detalles)];
    }

    /**
     * Cruza la respuesta del banco / Transbank con la nómina (por RUT).
     * $filas: [{rut, estado: cobrado|rechazado, codigo?, motivo?, fecha?, monto?}]
     * $sinRespuesta: qué hacer con los cargos que no vienen en el archivo ('pendiente' o 'rechazado').
     */
    public static function respuesta(int $nominaId, array $filas, bool $simular, string $sinRespuesta, ?int $userId): array
    {
        $n = Db::one('SELECT * FROM cobro_nominas WHERE id = ?', [$nominaId]) ?? throw new HttpError(404, 'Nómina no encontrada.');
        $porRut = [];
        foreach (self::detalles($nominaId) as $d) {
            $porRut[$d['rut']] = $d;
        }

        $resultado = [];
        $cambios = [];
        $vistos = [];
        foreach ($filas as $i => $f) {
            $item = ['fila' => $i + 1, 'rut' => null, 'nombre' => null, 'estado' => null, 'accion' => 'invalida'];
            if (!is_array($f)) {
                $resultado[] = $item + ['mensaje' => 'Fila inválida.'];
                continue;
            }
            $rut = Rut::normalize($f['rut'] ?? null);
            $estado = in_array($f['estado'] ?? null, ['cobrado', 'rechazado'], true) ? $f['estado'] : null;
            $item['rut'] = $rut;
            $item['estado'] = $estado;
            $item['codigo'] = self::texto($f['codigo'] ?? null, 20);
            $item['motivo'] = self::texto($f['motivo'] ?? null, 200);
            if (!$rut || !$estado) {
                $resultado[] = $item + ['mensaje' => !$rut ? 'RUT inválido.' : 'Estado inválido.'];
                continue;
            }
            $det = $porRut[$rut] ?? null;
            if (!$det) {
                $resultado[] = ['accion' => 'no_encontrado', 'mensaje' => 'El RUT no está en esta nómina.'] + $item;
                continue;
            }
            if (isset($vistos[$rut])) {
                $resultado[] = ['accion' => 'repetido', 'mensaje' => 'RUT repetido en el archivo.'] + $item;
                continue;
            }
            $vistos[$rut] = true;
            $fecha = is_string($f['fecha'] ?? null) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $f['fecha']) ? $f['fecha'] : null;
            $item = ['accion' => 'aplicar', 'nombre' => $det['nombre'], 'monto' => $det['monto']] + $item;
            $montoArchivo = is_int($f['monto'] ?? null) ? $f['monto'] : null;
            if ($montoArchivo !== null && $montoArchivo !== $det['monto']) {
                $item['mensaje'] = "El archivo indica $montoArchivo y la nómina {$det['monto']}.";
            } elseif ($det['estado'] !== 'pendiente' && $det['estado'] !== $estado) {
                $item['mensaje'] = "Cambia de “{$det['estado']}” a “{$estado}”.";
            }
            $resultado[] = $item;
            $cambios[] = [$det['id'], $estado, $item['codigo'], $item['motivo'], $fecha];
        }

        $sinResp = array_values(array_filter($porRut, fn ($d) => !isset($vistos[$d['rut']]) && $d['estado'] === 'pendiente'));
        $conteo = [
            'cobrados' => count(array_filter($cambios, fn ($c) => $c[1] === 'cobrado')),
            'rechazados' => count(array_filter($cambios, fn ($c) => $c[1] === 'rechazado')),
            'monto_cobrado' => array_sum(array_map(
                fn ($c) => $c[1] === 'cobrado' ? self::montoDetalle($porRut, $c[0]) : 0, $cambios
            )),
            'no_encontrados' => count(array_filter($resultado, fn ($r) => $r['accion'] === 'no_encontrado')),
            'invalidas' => count(array_filter($resultado, fn ($r) => in_array($r['accion'], ['invalida', 'repetido'], true))),
            'sin_respuesta' => count($sinResp),
        ];

        if (!$simular) {
            if (!$cambios && !($sinRespuesta === 'rechazado' && $sinResp)) {
                throw new HttpError(422, 'El archivo no tiene ningún RUT de esta nómina.');
            }
            $pdo = Db::pdo();
            $pdo->beginTransaction();
            try {
                $stmt = $pdo->prepare('UPDATE cobro_detalles SET estado = ?, codigo = ?, motivo = ?, fecha_cargo = ? WHERE id = ?');
                foreach ($cambios as [$id, $estado, $codigo, $motivo, $fecha]) {
                    $stmt->execute([$estado, $codigo, $motivo, $fecha, $id]);
                }
                if ($sinRespuesta === 'rechazado') {
                    foreach ($sinResp as $d) {
                        $stmt->execute(['rechazado', null, 'Sin respuesta en el archivo', null, $d['id']]);
                    }
                }
                Db::run(
                    "UPDATE cobro_nominas SET estado = 'respondida', respondida_en = ?, respondida_por = ? WHERE id = ?",
                    [date('Y-m-d H:i:s'), $userId, $nominaId]
                );
                $pdo->commit();
            } catch (\Throwable $e) {
                $pdo->rollBack();
                throw $e;
            }
        }

        return [
            'simulado' => $simular,
            'conteo' => $conteo,
            'filas' => $resultado,
            'sin_respuesta' => array_map(fn ($d) => ['rut' => $d['rut'], 'nombre' => $d['nombre'], 'monto' => $d['monto']], $sinResp),
            'nomina' => $simular ? null : self::nomina($nominaId),
            'ya_respondida' => $n['estado'] === 'respondida',
        ];
    }

    /** Solo se puede eliminar una nómina que aún no tiene respuestas cargadas. */
    public static function eliminar(int $id): void
    {
        $n = Db::one('SELECT estado FROM cobro_nominas WHERE id = ?', [$id]) ?? throw new HttpError(404, 'Nómina no encontrada.');
        $respondidos = (int) Db::one("SELECT COUNT(*) AS n FROM cobro_detalles WHERE nomina_id = ? AND estado <> 'pendiente'", [$id])['n'];
        if ($n['estado'] !== 'generada' || $respondidos > 0) {
            throw new HttpError(409, 'No se puede eliminar: la nómina ya tiene respuestas cargadas.');
        }
        Db::run('DELETE FROM cobro_detalles WHERE nomina_id = ?', [$id]);
        Db::run('DELETE FROM cobro_nominas WHERE id = ?', [$id]);
    }

    public static function finDeMes(string $periodo): string
    {
        return date('Y-m-t', strtotime("$periodo-01"));
    }

    private static function presentNomina(array $r): array
    {
        foreach (['id', 'numero', 'categoria_id', 'creado_por', 'respondida_por', 'registros', 'monto_total',
            'cobrados', 'monto_cobrado', 'rechazados', 'pendientes', 'reintentos'] as $k) {
            $r[$k] = $r[$k] === null ? null : (int) $r[$k];
        }
        return $r;
    }

    private static function montoDetalle(array $porRut, int $id): int
    {
        foreach ($porRut as $d) {
            if ($d['id'] === $id) {
                return $d['monto'];
            }
        }
        return 0;
    }

    private static function texto(mixed $v, int $max): ?string
    {
        if (!is_string($v) && !is_int($v)) {
            return null;
        }
        $s = trim(preg_replace('/[\x00-\x1F\x7F]/u', '', (string) $v) ?? '');
        return $s === '' ? null : mb_substr($s, 0, $max);
    }
}
