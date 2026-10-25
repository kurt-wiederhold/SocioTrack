<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Auth;
use App\Config;
use App\Db;
use App\Http;
use App\Proveedores;
use App\HttpError;
use App\Rut;
use App\SocioRepository;
use App\SocioValidator;
use PDOException;

final class SocioController
{
    public static function index(): never
    {
        $filtros = array_intersect_key($_GET, array_flip([
            'buscar', 'estado', 'medio_pago', 'categoria_id', 'proveedor_id', 'proveedor_estado', 'cobro_mes', 'orden', 'dir', 'pagina', 'por_pagina',
        ]));
        $filtros = array_map(fn ($v) => is_string($v) ? $v : '', $filtros);

        Http::json(SocioRepository::search($filtros) + ['resumen' => SocioRepository::resumen()]);
    }

    /**
     * Marca como revisada la alerta "pasó 100% a la Fundación".
     * Body: { ids: [1, 2] } o { todos: true }.
     */
    public static function revisarAlertas(): never
    {
        $b = Http::body();
        if (($b['todos'] ?? false) === true) {
            $n = SocioRepository::marcarRevisados(null);
        } else {
            $ids = $b['ids'] ?? null;
            if (!is_array($ids) || !$ids || count($ids) > 5000 || array_filter($ids, fn ($i) => !is_int($i) || $i < 1)) {
                throw new HttpError(422, 'Indica los socios a marcar.');
            }
            $n = SocioRepository::marcarRevisados(array_values(array_unique($ids)));
        }
        Http::json(['marcados' => $n]);
    }

    public static function show(int $id): never
    {
        Http::json(['dato' => self::findOrFail($id)]);
    }

    public static function cobros(int $id): never
    {
        self::findOrFail($id);
        Http::json(['datos' => SocioRepository::cobros($id)]);
    }

    public static function store(): never
    {
        [$d, $errores] = SocioValidator::validate(Http::body());
        if (!$errores && SocioRepository::findByRut($d['rut'])) {
            $errores['rut'] = 'Ya existe un socio con este RUT.';
        }
        self::resolverProveedor($d, $errores);
        self::failIf($errores);

        try {
            $id = SocioRepository::create($d, Auth::userId());
        } catch (PDOException $e) {
            self::rethrowDuplicate($e);
        }
        Http::json(['dato' => SocioRepository::find($id)], 201);
    }

    public static function update(int $id): never
    {
        self::findOrFail($id);
        [$d, $errores] = SocioValidator::validate(Http::body());
        if (!$errores) {
            $otro = SocioRepository::findByRut($d['rut']);
            if ($otro && (int) $otro['id'] !== $id) {
                $errores['rut'] = 'Ya existe otro socio con este RUT.';
            }
        }
        self::resolverProveedor($d, $errores);
        self::failIf($errores);

        try {
            SocioRepository::update($id, $d, Auth::userId());
        } catch (PDOException $e) {
            self::rethrowDuplicate($e);
        }
        Http::json(['dato' => SocioRepository::find($id)]);
    }

    public static function destroy(int $id): never
    {
        if (!SocioRepository::delete($id)) {
            throw new HttpError(404, 'Socio no encontrado.');
        }
        Http::json(['ok' => true]);
    }

    /**
     * Importación masiva (planilla Excel ya leída en el navegador).
     * Body: { filas: [{rut, nombre, ...}], actualizar_existentes: bool, simular: bool }
     * Con simular=true solo valida y devuelve qué pasaría con cada fila.
     */
    public static function import(): never
    {
        $body = Http::body();
        $filas = $body['filas'] ?? null;
        $max = (int) Config::get('app.max_import_rows', 5000);
        if (!is_array($filas) || !array_is_list($filas) || count($filas) === 0) {
            throw new HttpError(422, 'No se recibieron filas para importar.');
        }
        if (count($filas) > $max) {
            throw new HttpError(422, "Máximo $max filas por importación.");
        }
        $actualizar = ($body['actualizar_existentes'] ?? false) === true;
        $simular = ($body['simular'] ?? true) !== false;

        // Buscar de una vez los RUT que ya existen.
        $ruts = [];
        foreach ($filas as $f) {
            if (is_array($f) && ($r = Rut::normalize($f['rut'] ?? null))) {
                $ruts[$r] = true;
            }
        }
        $existentes = [];
        foreach (array_chunk(array_keys($ruts), 500) as $chunk) {
            $marks = implode(',', array_fill(0, count($chunk), '?'));
            foreach (Db::all("SELECT * FROM socios WHERE rut IN ($marks)", $chunk) as $row) {
                $existentes[$row['rut']] = $row;
            }
        }

        // Proveedores existentes por nombre (en minúsculas) para resolver la columna "Proveedor".
        $provPorNombre = [];
        foreach (Db::all('SELECT id, nombre FROM proveedores') as $p) {
            $provPorNombre[mb_strtolower($p['nombre'])] = (int) $p['id'];
        }

        $resultado = [];
        $vistos = [];
        $plan = [];
        foreach ($filas as $i => $fila) {
            $numero = $i + 2; // fila 1 = encabezados en la planilla
            if (!is_array($fila)) {
                $resultado[] = ['fila' => $numero, 'accion' => 'error', 'errores' => ['fila' => 'Fila inválida.']];
                continue;
            }
            if (isset($fila['_fila']) && is_int($fila['_fila'])) {
                $numero = $fila['_fila'];
            }
            $rut = Rut::normalize($fila['rut'] ?? null);
            $existe = $rut ? ($existentes[$rut] ?? null) : null;

            $entrada = $fila;
            if ($existe && $actualizar) {
                // Solo se reemplazan las columnas que vienen con valor en la planilla.
                $conValor = array_filter($fila, fn ($v) => $v !== null && $v !== '');
                $entrada = array_merge($existe, $conValor);
                if (isset($conValor['proveedor'])) {
                    unset($entrada['proveedor_id']); // la planilla trae otro proveedor por nombre
                }
            }
            [$d, $errores] = SocioValidator::validate($entrada);

            $proveedorNuevo = null;
            if ($d['proveedor_nombre'] !== null && !isset($errores['proveedor'])) {
                $d['proveedor_id'] = $provPorNombre[mb_strtolower($d['proveedor_nombre'])] ?? null;
                if ($d['proveedor_id'] === null) {
                    $proveedorNuevo = $d['proveedor_nombre'];
                }
            }

            if ($rut && isset($vistos[$rut])) {
                $errores['rut'] = "RUT repetido en la planilla (fila {$vistos[$rut]}).";
            }
            if ($rut) {
                $vistos[$rut] ??= $numero;
            }

            $sinCambios = $existe && !$errores && self::iguales($d, $existe);
            $accion = match (true) {
                (bool) $errores => 'error',
                $existe && (!$actualizar || $sinCambios) => 'omitir',
                (bool) $existe => 'actualizar',
                default => 'crear',
            };
            // Se devuelven los valores ya interpretados para que el usuario confirme que se leyeron bien.
            $item = [
                'fila' => $numero, 'rut' => $d['rut'] ?? null, 'nombre' => $d['nombre'], 'accion' => $accion,
                'monto' => $d['monto'], 'medio_pago' => $d['medio_pago'], 'fecha_alta' => $d['fecha_alta'],
            ];
            if ($errores) {
                $item['errores'] = $errores;
            }
            if ($accion === 'omitir') {
                $item['mensaje'] = $sinCambios ? 'Ya existe, sin cambios.' : 'Ya existe en la base de datos.';
            } elseif ($proveedorNuevo !== null && $accion !== 'error') {
                $item['mensaje'] = "Se creará el proveedor “{$proveedorNuevo}”.";
            }
            $resultado[] = $item;
            if ($accion === 'crear' || $accion === 'actualizar') {
                $plan[] = [$accion, $d, $existe['id'] ?? null, $proveedorNuevo];
            }
        }

        if (!$simular && $plan) {
            $pdo = Db::pdo();
            $pdo->beginTransaction();
            try {
                $creados = [];
                foreach ($plan as [$accion, $d, $id, $proveedorNuevo]) {
                    if ($proveedorNuevo !== null) {
                        $clave = mb_strtolower($proveedorNuevo);
                        $d['proveedor_id'] = $creados[$clave] ??= Proveedores::idPorNombre($proveedorNuevo);
                    }
                    $accion === 'crear'
                        ? SocioRepository::create($d, Auth::userId())
                        : SocioRepository::update((int) $id, $d, Auth::userId());
                }
                $pdo->commit();
            } catch (\Throwable $e) {
                $pdo->rollBack();
                if ($e instanceof PDOException && $e->getCode() === '23000') {
                    // Otro usuario creó uno de estos RUT mientras se importaba.
                    throw new HttpError(409, 'Los datos cambiaron durante la importación. Vuelve a revisar el archivo; no se guardó nada.');
                }
                throw $e;
            }
        }

        $conteo = ['crear' => 0, 'actualizar' => 0, 'omitir' => 0, 'error' => 0];
        foreach ($resultado as $r) {
            $conteo[$r['accion']]++;
        }
        Http::json(['simulado' => $simular, 'conteo' => $conteo, 'filas' => $resultado]);
    }

    /**
     * Formulario/API: el proveedor_id debe existir; si viene un nombre, se usa o se crea ese proveedor.
     */
    private static function resolverProveedor(array &$d, array &$errores): void
    {
        if ($errores) {
            return;
        }
        if ($d['proveedor_id'] !== null && !Proveedores::find($d['proveedor_id'])) {
            $errores['proveedor_id'] = 'El proveedor no existe.';
        } elseif ($d['proveedor_nombre'] !== null) {
            $d['proveedor_id'] = Proveedores::idPorNombre($d['proveedor_nombre']);
        }
    }

    /** ¿Los datos validados son iguales a lo que ya está guardado? */
    private static function iguales(array $nuevo, array $guardado): bool
    {
        foreach (SocioRepository::CAMPOS as $c) {
            if ((string) ($nuevo[$c] ?? '') !== (string) ($guardado[$c] ?? '')) {
                return false;
            }
        }
        return true;
    }

    private static function findOrFail(int $id): array
    {
        return SocioRepository::find($id) ?? throw new HttpError(404, 'Socio no encontrado.');
    }

    private static function failIf(array $errores): void
    {
        if ($errores) {
            throw new HttpError(422, 'Revisa los datos ingresados.', $errores);
        }
    }

    private static function rethrowDuplicate(PDOException $e): never
    {
        // 23000 = violación de restricción (RUT único) por una carrera entre dos peticiones.
        if ($e->getCode() === '23000') {
            throw new HttpError(422, 'Revisa los datos ingresados.', ['rut' => 'Ya existe un socio con este RUT.']);
        }
        throw $e;
    }
}
