<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Auth;
use App\Cobros;
use App\Consolidacion;
use App\Http;
use App\HttpError;

final class ConsolidacionController
{
    /** GET /consolidacion?periodo=AAAA-MM */
    public static function index(): never
    {
        $periodo = $_GET['periodo'] ?? date('Y-m');
        if (!Cobros::periodoValido($periodo)) {
            throw new HttpError(422, 'Periodo inválido (formato AAAA-MM).');
        }
        Http::json(Consolidacion::consolidado($periodo));
    }

    /** POST /consolidacion/importar { periodo, origen, tipo, archivo, filas, simular, crear_socios, reemplazar } */
    public static function importar(): never
    {
        Http::json(Consolidacion::importar(Http::body(), Auth::userId()));
    }

    public static function eliminarLote(int $id): never
    {
        Consolidacion::eliminarLote($id);
        Http::json(['ok' => true]);
    }
}
