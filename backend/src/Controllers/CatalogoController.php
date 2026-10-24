<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Categorias;
use App\Http;
use App\HttpError;
use App\Proveedores;

/** CRUD de categorías (sectorización) y de proveedores (empresas captadoras). */
final class CatalogoController
{
    public static function categorias(): never
    {
        $sin = \App\Db::one(
            "SELECT COUNT(*) AS n FROM socios s WHERE s.estado = 'activo'
             AND NOT EXISTS (SELECT 1 FROM categorias c WHERE " . Categorias::condicion('s', 'c') . ')'
        );
        Http::json(['datos' => Categorias::all(), 'socios_sin_categoria' => (int) $sin['n']]);
    }

    public static function crearCategoria(): never
    {
        [$d, $e] = Categorias::validate(Http::body());
        self::failIf($e);
        Http::json(['dato' => Categorias::find(Categorias::save($d))], 201);
    }

    public static function editarCategoria(int $id): never
    {
        Categorias::find($id) ?? throw new HttpError(404, 'Categoría no encontrada.');
        [$d, $e] = Categorias::validate(Http::body(), $id);
        self::failIf($e);
        Categorias::save($d, $id);
        Http::json(['dato' => Categorias::find($id)]);
    }

    public static function eliminarCategoria(int $id): never
    {
        if (!Categorias::delete($id)) {
            throw new HttpError(404, 'Categoría no encontrada.');
        }
        Http::json(['ok' => true]);
    }

    public static function proveedores(): never
    {
        Http::json(['datos' => Proveedores::all()]);
    }

    public static function crearProveedor(): never
    {
        [$d, $e] = Proveedores::validate(Http::body());
        self::failIf($e);
        Http::json(['dato' => Proveedores::find(Proveedores::save($d))], 201);
    }

    public static function editarProveedor(int $id): never
    {
        Proveedores::find($id) ?? throw new HttpError(404, 'Proveedor no encontrado.');
        [$d, $e] = Proveedores::validate(Http::body(), $id);
        self::failIf($e);
        Proveedores::save($d, $id);
        Http::json(['dato' => Proveedores::find($id)]);
    }

    public static function eliminarProveedor(int $id): never
    {
        Proveedores::delete($id);
        Http::json(['ok' => true]);
    }

    private static function failIf(array $e): void
    {
        if ($e) {
            throw new HttpError(422, 'Revisa los datos ingresados.', $e);
        }
    }
}
