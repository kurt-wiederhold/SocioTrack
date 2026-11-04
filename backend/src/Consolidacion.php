<?php
declare(strict_types=1);

namespace App;

/**
 * Consolidación de donaciones recurrentes de todos los orígenes:
 *   PAC (Banco de Chile) y PAT (Transbank): se identifican por RUT y alimentan el ciclo de cobro,
 *     de modo que los rechazados quedan listos para la siguiente nómina.
 *   DO (Donar Online), CXC (Causaxcausa) y TRF (transferencias): las plataformas cobran por su
 *     cuenta y pueden no traer RUT, así que el donante se sigue por su "clave" (RUT o nombre).
 * Los archivos se leen en el navegador; aquí se valida todo de nuevo.
 */
final class Consolidacion
{
    public const ORIGENES = [
        'PAC' => 'PAC · Banco de Chile',
        'PAT' => 'PAT · Transbank',
        'DO' => 'Donar Online',
        'CXC' => 'Causaxcausa',
        'TRF' => 'Transferencias',
    ];
    private const CON_RUT = ['PAC', 'PAT'];
    private const ESTADOS = ['cobrado', 'rechazado', 'pendiente'];
    private const MAX_FILAS = 20000;

    /** "José  Pérez" -> "jose perez": para comparar nombres sin tildes ni mayúsculas. */
    public static function normalizarNombre(string $s): string
    {
        $s = mb_strtolower(trim($s));
        $s = strtr($s, ['á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ü' => 'u', 'ñ' => 'n']);
        return trim((string) preg_replace('/[^a-z0-9]+/', ' ', $s));
    }

    /**
     * Valida el archivo y, si no es simulación, lo aplica.
     * $p: periodo, origen, tipo (bajada|subida), archivo, filas, simular, crear_socios, reemplazar
     */
    public static function importar(array $p, ?int $userId): array
    {
        if (!Cobros::periodoValido($p['periodo'] ?? null)) {
            throw new HttpError(422, 'Periodo inválido.');
        }
        if (!isset(self::ORIGENES[$p['origen'] ?? ''])) {
            throw new HttpError(422, 'Origen inválido.');
        }
        $filas = $p['filas'] ?? null;
        if (!is_array($filas) || !array_is_list($filas) || !$filas || count($filas) > self::MAX_FILAS) {
            throw new HttpError(422, 'El archivo no trae filas válidas.');
        }
        $origen = $p['origen'];
        $tipo = ($p['tipo'] ?? 'bajada') === 'subida' && in_array($origen, self::CON_RUT, true) ? 'subida' : 'bajada';
        [$validas, $obs] = self::normalizar($filas, $origen);

        $huella = hash('sha256', json_encode([$origen, $p['periodo'], $tipo, array_map(
            fn ($f) => [$f['clave'], $f['monto'], $f['estado'], $f['codigo']],
            $validas
        )]));
        $duplicado = Db::one('SELECT id, archivo, creado_en FROM consolidacion_lotes WHERE huella = ?', [$huella]);

        $simular = ($p['simular'] ?? true) !== false;
        $plan = self::planificar($validas, $origen, $p['periodo'], $tipo);
        $conteo = [
            'filas' => count($filas),
            'validas' => count($validas),
            'cobrados' => 0, 'rechazados' => 0, 'pendientes' => 0,
            'monto_cobrado' => 0, 'monto_rechazado' => 0,
            'invalidas' => count($obs),
            'socios_nuevos' => $plan['socios_nuevos'],
            'vinculados' => $plan['vinculados'],
            'sin_vincular' => $plan['sin_vincular'],
            'responde_nomina' => $plan['responde_nomina'],
        ];
        foreach ($validas as $f) {
            $conteo[['cobrado' => 'cobrados', 'rechazado' => 'rechazados', 'pendiente' => 'pendientes'][$f['estado']]]++;
            if ($f['estado'] === 'cobrado') {
                $conteo['monto_cobrado'] += $f['monto'];
            } elseif ($f['estado'] === 'rechazado') {
                $conteo['monto_rechazado'] += $f['monto'];
            }
        }
        $res = [
            'simulado' => $simular,
            'conteo' => $conteo,
            'observaciones' => array_slice($obs, 0, 200),
            'duplicado' => $duplicado,
        ];
        if ($simular) {
            return $res;
        }
        if (!$validas) {
            throw new HttpError(422, 'Ninguna fila del archivo es válida.');
        }
        $reemplazar = ($p['reemplazar'] ?? false) === true;
        if ($duplicado && !$reemplazar) {
            throw new HttpError(409, "Este archivo ya se cargó el {$duplicado['creado_en']} ({$duplicado['archivo']}).");
        }

        $pdo = Db::pdo();
        $pdo->beginTransaction();
        try {
            if ($duplicado) {
                self::borrarLote((int) $duplicado['id']);
            }
            Db::run(
                'INSERT INTO consolidacion_lotes (periodo, origen, tipo, archivo, huella, filas, creado_en, creado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [$p['periodo'], $origen, $tipo, self::texto($p['archivo'] ?? 'archivo', 190) ?? 'archivo', $huella, count($validas), date('Y-m-d H:i:s'), $userId]
            );
            $loteId = (int) $pdo->lastInsertId();
            if (in_array($origen, self::CON_RUT, true)) {
                self::aplicarCobro($loteId, $validas, $origen, $p['periodo'], $tipo, ($p['crear_socios'] ?? true) !== false, $userId);
            } else {
                self::aplicarDonaciones($loteId, $validas, $origen, $p['periodo']);
            }
            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
        return $res + ['lote_id' => $loteId];
    }

    /** Valida fila por fila. @return array{0: array, 1: array} [válidas, observaciones] */
    private static function normalizar(array $filas, string $origen): array
    {
        $validas = [];
        $obs = [];
        $vistos = [];
        $conRut = in_array($origen, self::CON_RUT, true);
        foreach ($filas as $i => $f) {
            $n = $i + 1;
            if (!is_array($f)) {
                $obs[] = ['fila' => $n, 'mensaje' => 'Fila inválida.'];
                continue;
            }
            $rut = Rut::normalize($f['rut'] ?? null);
            $nombre = self::texto($f['nombre'] ?? null, 150);
            $monto = is_int($f['monto'] ?? null) ? $f['monto'] : null;
            $estado = in_array($f['estado'] ?? null, self::ESTADOS, true) ? $f['estado'] : null;
            $fila = $f['fila'] ?? $n;
            if ($conRut && !$rut) {
                $obs[] = ['fila' => $fila, 'mensaje' => 'RUT inválido o ausente.'];
                continue;
            }
            if (!$conRut && !$rut && !$nombre) {
                $obs[] = ['fila' => $fila, 'mensaje' => 'Sin nombre ni RUT.'];
                continue;
            }
            if ($monto === null || $monto < 1 || $monto > SocioValidator::MONTO_MAX) {
                $obs[] = ['fila' => $fila, 'nombre' => $nombre, 'mensaje' => 'Monto inválido.'];
                continue;
            }
            if (!$estado) {
                $obs[] = ['fila' => $fila, 'nombre' => $nombre, 'mensaje' => 'Estado desconocido.'];
                continue;
            }
            if ($conRut && isset($vistos[$rut])) {
                $obs[] = ['fila' => $fila, 'nombre' => $nombre, 'mensaje' => "RUT repetido en el archivo (fila {$vistos[$rut]})."];
                continue;
            }
            if ($conRut) {
                $vistos[$rut] = $fila;
            }
            $fecha = is_string($f['fecha'] ?? null) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $f['fecha']) ? $f['fecha'] : null;
            $validas[] = [
                'rut' => $rut,
                'nombre' => $nombre,
                'monto' => $monto,
                'estado' => $estado,
                'codigo' => self::texto($f['codigo'] ?? null, 20),
                'motivo' => self::texto($f['motivo'] ?? null, 200),
                'fecha' => $fecha,
                'banco_codigo' => Bancos::codigo($f['banco_codigo'] ?? null),
                'clave' => $rut ? "r:$rut" : 'n:' . mb_substr(self::normalizarNombre((string) $nombre), 0, 180),
            ];
        }
        return [$validas, $obs];
    }

    /** Qué pasará al aplicar: socios nuevos, vínculos por nombre y cargos que responde. */
    private static function planificar(array $validas, string $origen, string $periodo, string $tipo): array
    {
        $plan = ['socios_nuevos' => 0, 'vinculados' => 0, 'sin_vincular' => 0, 'responde_nomina' => 0];
        if (in_array($origen, self::CON_RUT, true)) {
            $pendientes = self::detallesPendientes($periodo, $origen);
            foreach ($validas as $f) {
                if (!SocioRepository::findByRut($f['rut'])) {
                    $plan['socios_nuevos']++;
                }
                if ($tipo === 'bajada' && isset($pendientes[$f['rut']])) {
                    $plan['responde_nomina']++;
                }
            }
            return $plan;
        }
        $indice = self::indiceSocios();
        foreach ($validas as $f) {
            self::socioPara($f, $indice) ? $plan['vinculados']++ : $plan['sin_vincular']++;
        }
        return $plan;
    }

    /** Cargos del medio que esperan respuesta en el periodo, por RUT. */
    private static function detallesPendientes(string $periodo, string $medio): array
    {
        $out = [];
        foreach (Db::all(
            "SELECT d.id, d.rut, d.nomina_id FROM cobro_detalles d JOIN cobro_nominas n ON n.id = d.nomina_id
             WHERE d.periodo = ? AND n.medio_pago = ? AND d.estado = 'pendiente'",
            [$periodo, $medio]
        ) as $d) {
            $out[$d['rut']] = $d;
        }
        return $out;
    }

    /**
     * PAC/PAT: si el RUT está en una nómina que espera respuesta, se le responde; si no, entra a una
     * nómina externa (el archivo se envió fuera del sistema). Así los rechazados quedan elegibles
     * para el siguiente reintento y todo el ciclo sigue funcionando igual.
     */
    private static function aplicarCobro(int $loteId, array $validas, string $origen, string $periodo, string $tipo, bool $crearSocios, ?int $userId): void
    {
        $pendientes = self::detallesPendientes($periodo, $origen);
        $respondidas = [];
        $nominaExterna = null;
        foreach ($validas as $f) {
            $socio = SocioRepository::findByRut($f['rut']);
            if (!$socio && $crearSocios) {
                $id = SocioRepository::create([
                    'rut' => $f['rut'],
                    // El banco no entrega el nombre: se completa después en la ficha del socio.
                    'nombre' => $f['nombre'] ?: 'Sin nombre (' . $f['rut'] . ')',
                    'medio_pago' => $origen,
                    'banco' => Bancos::nombre($f['banco_codigo']),
                    'monto' => $f['monto'],
                    'estado' => 'activo',
                    'fecha_alta' => "$periodo-01",
                ], $userId);
                $socio = ['id' => $id, 'nombre' => $f['nombre'] ?: 'Sin nombre (' . $f['rut'] . ')', 'banco' => Bancos::nombre($f['banco_codigo'])];
            } elseif ($socio && empty($socio['banco']) && $f['banco_codigo']) {
                Db::run('UPDATE socios SET banco = ? WHERE id = ?', [Bancos::nombre($f['banco_codigo']), $socio['id']]);
            }

            $pendiente = $pendientes[$f['rut']] ?? null;
            if ($pendiente) {
                if ($tipo === 'subida') {
                    continue; // ya está esperando respuesta en este periodo
                }
                Db::run(
                    'UPDATE cobro_detalles SET estado = ?, codigo = ?, motivo = ?, fecha_cargo = ?, lote_id = ? WHERE id = ?',
                    [$f['estado'], $f['codigo'], $f['motivo'], $f['fecha'], $loteId, $pendiente['id']]
                );
                $respondidas[(int) $pendiente['nomina_id']] = true;
                continue;
            }
            if ($nominaExterna === null) {
                $nominaExterna = self::crearNominaExterna($periodo, $origen, $tipo, $f['fecha'], $userId);
                Db::run('UPDATE consolidacion_lotes SET nomina_id = ? WHERE id = ?', [$nominaExterna, $loteId]);
            }
            $previos = $socio
                ? (int) Db::one('SELECT COUNT(*) AS n FROM cobro_detalles WHERE socio_id = ? AND periodo = ?', [$socio['id'], $periodo])['n']
                : 0;
            Db::run(
                'INSERT INTO cobro_detalles (nomina_id, lote_id, socio_id, periodo, rut, nombre, monto, banco_codigo, intento, estado, codigo, motivo, fecha_cargo)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [$nominaExterna, $loteId, $socio['id'] ?? null, $periodo, $f['rut'],
                    $socio['nombre'] ?? ($f['nombre'] ?: 'Sin nombre (' . $f['rut'] . ')'), $f['monto'],
                    $f['banco_codigo'] ?? Bancos::codigo($socio['banco'] ?? null), $previos + 1, $f['estado'], $f['codigo'], $f['motivo'], $f['fecha']]
            );
        }
        foreach (array_keys($respondidas) as $nominaId) {
            Db::run("UPDATE cobro_nominas SET estado = 'respondida', respondida_en = ?, respondida_por = ? WHERE id = ?", [date('Y-m-d H:i:s'), $userId, $nominaId]);
        }
    }

    private static function crearNominaExterna(string $periodo, string $medio, string $tipo, ?string $fecha, ?int $userId): int
    {
        $numero = 1 + (int) Db::one('SELECT COALESCE(MAX(numero), 0) AS n FROM cobro_nominas WHERE periodo = ? AND medio_pago = ?', [$periodo, $medio])['n'];
        $f = $fecha ?? "$periodo-01";
        Db::run(
            'INSERT INTO cobro_nominas (periodo, medio_pago, numero, fecha_facturacion, fecha_vencimiento, estado, externa, creado_en, creado_por, respondida_en)
             VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)',
            [$periodo, $medio, $numero, $f, $f, $tipo === 'subida' ? 'generada' : 'respondida', date('Y-m-d H:i:s'), $userId, $tipo === 'subida' ? null : date('Y-m-d H:i:s')]
        );
        return (int) Db::pdo()->lastInsertId();
    }

    private static function aplicarDonaciones(int $loteId, array $validas, string $origen, string $periodo): void
    {
        $indice = self::indiceSocios();
        $stmt = Db::pdo()->prepare(
            'INSERT INTO donaciones (lote_id, periodo, origen, socio_id, clave, rut, nombre, monto, estado, codigo, motivo, fecha)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        foreach ($validas as $f) {
            $stmt->execute([$loteId, $periodo, $origen, self::socioPara($f, $indice), $f['clave'], $f['rut'], $f['nombre'] ?? $f['rut'],
                $f['monto'], $f['estado'], $f['codigo'], $f['motivo'], $f['fecha']]);
        }
    }

    /** Socios por RUT y por nombre normalizado, para vincular donantes de plataformas. */
    private static function indiceSocios(): array
    {
        $i = ['rut' => [], 'nombre' => [], 'tokens' => []];
        foreach (Db::all('SELECT id, rut, nombre FROM socios') as $s) {
            $n = self::normalizarNombre($s['nombre']);
            $i['rut'][$s['rut']] = (int) $s['id'];
            $i['nombre'][$n][] = (int) $s['id'];
            $i['tokens'][(int) $s['id']] = explode(' ', $n);
        }
        return $i;
    }

    /**
     * Vincula con un socio solo si no hay ambigüedad: por RUT, por nombre exacto o porque
     * todas las palabras del nombre (mínimo dos) están en exactamente un socio.
     */
    private static function socioPara(array $f, array $indice): ?int
    {
        if ($f['rut']) {
            return $indice['rut'][$f['rut']] ?? null;
        }
        $n = self::normalizarNombre((string) $f['nombre']);
        $exacto = $indice['nombre'][$n] ?? [];
        if (count($exacto) === 1) {
            return $exacto[0];
        }
        if ($exacto) {
            return null;
        }
        $tokens = explode(' ', $n);
        if (count($tokens) < 2) {
            return null;
        }
        $hallados = [];
        foreach ($indice['tokens'] as $id => $t) {
            if (!array_diff($tokens, $t)) {
                $hallados[] = $id;
            }
        }
        return count($hallados) === 1 ? $hallados[0] : null;
    }

    public static function eliminarLote(int $id): void
    {
        if (!Db::one('SELECT id FROM consolidacion_lotes WHERE id = ?', [$id])) {
            throw new HttpError(404, 'Carga no encontrada.');
        }
        $pdo = Db::pdo();
        $pdo->beginTransaction();
        try {
            self::borrarLote($id);
            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }

    /** Deshace una carga: los socios creados se conservan (son datos válidos del donante). */
    private static function borrarLote(int $id): void
    {
        $lote = Db::one('SELECT nomina_id FROM consolidacion_lotes WHERE id = ?', [$id]);
        $nominas = array_column(Db::all(
            'SELECT DISTINCT d.nomina_id FROM cobro_detalles d JOIN cobro_nominas n ON n.id = d.nomina_id WHERE d.lote_id = ? AND n.externa = 0',
            [$id]
        ), 'nomina_id');
        Db::run(
            "UPDATE cobro_detalles SET estado = 'pendiente', codigo = NULL, motivo = NULL, fecha_cargo = NULL, lote_id = NULL
             WHERE lote_id = ? AND nomina_id IN (SELECT id FROM cobro_nominas WHERE externa = 0)",
            [$id]
        );
        foreach ($nominas as $n) {
            $conRespuesta = (int) Db::one("SELECT COUNT(*) AS n FROM cobro_detalles WHERE nomina_id = ? AND estado <> 'pendiente'", [$n])['n'];
            if (!$conRespuesta) {
                Db::run("UPDATE cobro_nominas SET estado = 'generada', respondida_en = NULL, respondida_por = NULL WHERE id = ?", [$n]);
            }
        }
        if ($lote['nomina_id']) {
            Db::run('DELETE FROM cobro_detalles WHERE nomina_id = ?', [$lote['nomina_id']]);
            Db::run('DELETE FROM cobro_nominas WHERE id = ?', [$lote['nomina_id']]);
        }
        Db::run('DELETE FROM donaciones WHERE lote_id = ?', [$id]);
        Db::run('DELETE FROM consolidacion_lotes WHERE id = ?', [$id]);
    }

    /** Vista consolidada del periodo: una fila por donante y origen, totales y conclusiones. */
    public static function consolidado(string $periodo): array
    {
        $filas = self::resultados($periodo);
        $porOrigen = [];
        foreach (self::ORIGENES as $o => $label) {
            $porOrigen[$o] = ['origen' => $o, 'etiqueta' => $label, 'donantes' => 0, 'cobrados' => 0, 'rechazados' => 0,
                'pendientes' => 0, 'sin_enviar' => 0, 'monto_cobrado' => 0, 'monto_no_cobrado' => 0, 'tasa' => null];
        }
        foreach ($filas as $f) {
            $x = &$porOrigen[$f['origen']];
            if ($f['estado'] === 'sin_enviar') {
                $x['sin_enviar']++;
                unset($x);
                continue;
            }
            $x['donantes']++;
            if ($f['estado'] === 'cobrado') {
                $x['cobrados']++;
                $x['monto_cobrado'] += $f['monto'];
            } elseif ($f['estado'] === 'rechazado') {
                $x['rechazados']++;
                $x['monto_no_cobrado'] += $f['monto'];
            } else {
                $x['pendientes']++;
            }
            unset($x);
        }
        $tot = ['donantes' => 0, 'cobrados' => 0, 'rechazados' => 0, 'pendientes' => 0, 'sin_enviar' => 0, 'monto_cobrado' => 0, 'monto_no_cobrado' => 0, 'tasa' => null];
        foreach ($porOrigen as $o => $x) {
            $conRespuesta = $x['cobrados'] + $x['rechazados'];
            $porOrigen[$o]['tasa'] = $conRespuesta ? round($x['cobrados'] / $conRespuesta, 4) : null;
            foreach ($tot as $k => $_) {
                if ($k !== 'tasa') {
                    $tot[$k] += $x[$k];
                }
            }
        }
        $resp = $tot['cobrados'] + $tot['rechazados'];
        $tot['tasa'] = $resp ? round($tot['cobrados'] / $resp, 4) : null;

        return [
            'periodo' => $periodo,
            'max_intentos' => Cobros::maxIntentos(),
            'totales' => $tot,
            'por_origen' => array_values($porOrigen),
            'filas' => $filas,
            'conclusiones' => self::conclusiones($periodo, $filas, $porOrigen, $tot),
            'lotes' => array_map(function ($l) {
                $l['id'] = (int) $l['id'];
                $l['filas'] = (int) $l['filas'];
                return $l;
            }, Db::all('SELECT id, origen, tipo, archivo, filas, creado_en FROM consolidacion_lotes WHERE periodo = ? ORDER BY id DESC', [$periodo])),
        ];
    }

    /** Una fila por donante y origen en el periodo, con su resultado final. */
    private static function resultados(string $periodo): array
    {
        $grupos = [];
        $socioIds = [];
        foreach (Db::all(
            'SELECT d.*, n.medio_pago FROM cobro_detalles d JOIN cobro_nominas n ON n.id = d.nomina_id WHERE d.periodo = ? ORDER BY d.id',
            [$periodo]
        ) as $d) {
            $k = $d['medio_pago'] . '|' . $d['rut'];
            $g = $grupos[$k] ?? ['clave' => 'r:' . $d['rut'], 'rut' => $d['rut'], 'nombre' => $d['nombre'], 'origen' => $d['medio_pago'],
                'monto' => (int) $d['monto'], 'estado' => 'rechazado', 'intentos' => 0, 'motivo' => null, 'codigo' => null,
                'socio_id' => $d['socio_id'] === null ? null : (int) $d['socio_id'], 'banco_codigo' => $d['banco_codigo'], 'fecha' => null];
            $g['intentos']++;
            $g['monto'] = (int) $d['monto'];
            if ($g['estado'] !== 'cobrado') {
                $g['estado'] = $d['estado'];
                $g['motivo'] = $d['estado'] === 'cobrado' ? null : ($d['motivo'] ?? $g['motivo']);
                $g['codigo'] = $d['codigo'] ?? $g['codigo'];
                $g['fecha'] = $d['fecha_cargo'] ?? $g['fecha'];
            }
            $grupos[$k] = $g;
            if ($g['socio_id']) {
                $socioIds[$g['socio_id']] = true;
            }
        }
        $filas = array_values($grupos);
        foreach (Db::all('SELECT * FROM donaciones WHERE periodo = ? ORDER BY id', [$periodo]) as $d) {
            $filas[] = ['clave' => $d['clave'], 'rut' => $d['rut'], 'nombre' => $d['nombre'], 'origen' => $d['origen'],
                'monto' => (int) $d['monto'], 'estado' => $d['estado'], 'intentos' => 1, 'motivo' => $d['motivo'], 'codigo' => $d['codigo'],
                'socio_id' => $d['socio_id'] === null ? null : (int) $d['socio_id'], 'banco_codigo' => null, 'fecha' => $d['fecha']];
        }
        // Socios activos que aún no aparecen en ningún cobro: "a quiénes no se les ha cobrado".
        foreach (Db::all("SELECT id, rut, nombre, medio_pago, monto, banco FROM socios WHERE estado = 'activo' AND fecha_alta <= ?", [Cobros::finDeMes($periodo)]) as $s) {
            if (!isset($socioIds[(int) $s['id']])) {
                $filas[] = ['clave' => 'r:' . $s['rut'], 'rut' => $s['rut'], 'nombre' => $s['nombre'], 'origen' => $s['medio_pago'],
                    'monto' => (int) $s['monto'], 'estado' => 'sin_enviar', 'intentos' => 0, 'motivo' => null, 'codigo' => null,
                    'socio_id' => (int) $s['id'], 'banco_codigo' => Bancos::codigo($s['banco']), 'fecha' => null];
            }
        }
        usort($filas, fn ($a, $b) => strcmp(self::normalizarNombre($a['nombre']), self::normalizarNombre($b['nombre'])));
        return $filas;
    }

    /** Lecturas automáticas del periodo: qué pasó y qué conviene hacer. */
    private static function conclusiones(string $periodo, array $filas, array $porOrigen, array $tot): array
    {
        $out = [];
        $agregar = function (string $tipo, string $texto, array $filtro = []) use (&$out) {
            $out[] = ['tipo' => $tipo, 'texto' => $texto, 'filtro' => $filtro ?: null];
        };
        $clp = fn (int $n) => '$' . number_format($n, 0, ',', '.');
        $pct = fn (float $v) => round($v * 100) . '%';
        // "1 donante lleva" / "3 donantes llevan"
        $n = fn (int $c, string $uno, string $varios) => $c . ' ' . ($c === 1 ? $uno : $varios);
        $resp = $tot['cobrados'] + $tot['rechazados'];

        if ($resp) {
            $agregar('info', "Se cobró {$clp($tot['monto_cobrado'])} a {$tot['cobrados']} de {$resp} donantes con respuesta ({$pct($tot['tasa'])}).");
        }

        // Dinero por recuperar y qué se puede reintentar.
        $max = Cobros::maxIntentos();
        $rech = array_filter($filas, fn ($f) => $f['estado'] === 'rechazado');
        $reintentables = array_filter($rech, fn ($f) => in_array($f['origen'], self::CON_RUT, true) && $f['socio_id'] && $f['intentos'] < $max);
        $agotados = array_filter($rech, fn ($f) => in_array($f['origen'], self::CON_RUT, true) && $f['intentos'] >= $max);
        if ($reintentables) {
            $monto = array_sum(array_column($reintentables, 'monto'));
            $agregar('accion', $n(count($reintentables), 'rechazo PAC/PAT se puede reintentar', 'rechazos PAC/PAT se pueden reintentar') . " por {$clp($monto)}: genera la nómina depurada en Cobros.", ['estado' => 'rechazado']);
        }
        if ($agotados) {
            $agregar('accion', $n(count($agotados), 'socio agotó', 'socios agotaron') . " los {$max} envíos del mes: conviene contactarlos para revisar su medio de pago.", ['estado' => 'rechazado']);
        }

        // Origen con peor resultado (solo si hay más de uno con datos).
        $conDatos = array_filter($porOrigen, fn ($x) => $x['tasa'] !== null);
        if (count($conDatos) > 1) {
            uasort($conDatos, fn ($a, $b) => $a['tasa'] <=> $b['tasa']);
            $peor = reset($conDatos);
            if ($peor['tasa'] < 0.9) {
                $agregar('aviso', "{$peor['etiqueta']} tiene la tasa de cobro más baja: {$pct($peor['tasa'])}.", ['origen' => $peor['origen']]);
            }
        }

        // Motivo y banco con más rechazos.
        $motivos = [];
        $bancos = [];
        foreach ($rech as $f) {
            $m = $f['motivo'] ?: ($f['codigo'] ? "código {$f['codigo']}" : null);
            if ($m) {
                $motivos[$m] = ($motivos[$m] ?? 0) + 1;
            }
            if ($f['origen'] === 'PAC' && $f['banco_codigo']) {
                $bancos[$f['banco_codigo']] = ($bancos[$f['banco_codigo']] ?? 0) + 1;
            }
        }
        if ($motivos) {
            arsort($motivos);
            $veces = reset($motivos);
            if ($veces > 1) {
                $agregar('info', "Motivo de rechazo más frecuente ({$veces} casos): " . key($motivos) . '.');
            }
        }
        if ($bancos) {
            arsort($bancos);
            $veces = reset($bancos);
            if ($veces > 1) {
                $agregar('info', 'Banco con más rechazos PAC: ' . (Bancos::nombre((string) key($bancos)) ?? key($bancos)) . " ({$veces}).");
            }
        }

        // Seguimiento contra el mes anterior.
        $anterior = date('Y-m', strtotime("$periodo-01 -1 month"));
        $previas = array_filter(self::resultados($anterior), fn ($f) => $f['estado'] !== 'sin_enviar');
        if ($previas) {
            $idx = fn ($f) => $f['origen'] . '|' . $f['clave'];
            $mapaPrev = [];
            $origenesPrev = [];
            foreach ($previas as $f) {
                $mapaPrev[$idx($f)] = $f;
                $origenesPrev[$f['origen']] = true;
            }
            $conResultado = array_filter($filas, fn ($f) => $f['estado'] !== 'sin_enviar');
            $mapaAct = [];
            $origenesAct = [];
            foreach ($conResultado as $f) {
                $mapaAct[$idx($f)] = $f;
                $origenesAct[$f['origen']] = true;
            }
            $seguidos = 0;
            $nuevos = 0;
            foreach ($mapaAct as $k => $f) {
                if ($f['estado'] === 'rechazado' && ($mapaPrev[$k]['estado'] ?? null) === 'rechazado') {
                    $seguidos++;
                }
                if (!isset($mapaPrev[$k]) && isset($origenesPrev[$f['origen']])) {
                    $nuevos++;
                }
            }
            $ausentes = 0;
            foreach ($mapaPrev as $k => $f) {
                if ($f['estado'] === 'cobrado' && !isset($mapaAct[$k]) && isset($origenesAct[$f['origen']])) {
                    $ausentes++;
                }
            }
            if ($seguidos) {
                $agregar('aviso', $n($seguidos, 'donante lleva', 'donantes llevan') . ' dos meses seguidos con rechazo: hay riesgo de perderlos.', ['estado' => 'rechazado']);
            }
            if ($ausentes) {
                $agregar('aviso', $n($ausentes, 'donante cobrado el mes anterior no aparece', 'donantes cobrados el mes anterior no aparecen') . ' este mes.');
            }
            if ($nuevos) {
                $agregar('ok', $n($nuevos, 'donante aparece', 'donantes aparecen') . ' por primera vez respecto del mes anterior.');
            }
        }

        // Calidad de los datos.
        $sinVinculo = array_filter($filas, fn ($f) => !$f['rut'] && !$f['socio_id']);
        if ($sinVinculo) {
            $agregar('aviso', $n(count($sinVinculo), 'donante viene sin RUT y no calza', 'donantes vienen sin RUT y no calzan') . ' con ningún socio: se siguen solo por el nombre. Conviene pedir el RUT o correo a la plataforma.', ['sin_vinculo' => true]);
        }
        $sinNombre = (int) Db::one("SELECT COUNT(*) AS n FROM socios WHERE nombre LIKE 'Sin nombre (%'")['n'];
        if ($sinNombre) {
            $agregar('accion', $n($sinNombre, 'socio se creó', 'socios se crearon') . ' desde un archivo del banco, que no trae nombres: complétalos en Socios.');
        }
        $sinBanco = count(array_filter($filas, fn ($f) => $f['origen'] === 'PAC' && $f['estado'] === 'sin_enviar' && !$f['banco_codigo']));
        if ($sinBanco) {
            $agregar('accion', $n($sinBanco, 'socio PAC no tiene', 'socios PAC no tienen') . ' banco reconocido y no puede ir en la nómina: indícalo en su ficha.');
        }
        $faltan = array_filter($porOrigen, fn ($x) => !$x['donantes']);
        if ($faltan && $resp) {
            $agregar('info', 'Sin información cargada este mes: ' . implode(', ', array_column($faltan, 'etiqueta')) . '.');
        }
        $resumen = $resp ? [array_shift($out)] : [];
        $orden = ['accion' => 0, 'aviso' => 1, 'ok' => 2, 'info' => 3];
        usort($out, fn ($a, $b) => $orden[$a['tipo']] <=> $orden[$b['tipo']]);
        return [...$resumen, ...$out];
    }

    private static function texto(mixed $v, int $max): ?string
    {
        if (!is_string($v) && !is_int($v)) {
            return null;
        }
        $s = trim((string) preg_replace('/\s+/u', ' ', (string) preg_replace('/[\x00-\x1F\x7F]/u', ' ', (string) $v)));
        return $s === '' ? null : mb_substr($s, 0, $max);
    }
}
