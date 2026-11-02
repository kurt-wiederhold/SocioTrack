<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Http;
use App\HttpError;
use App\Informes;

final class InformeController
{
    /** GET /informes?agrupacion=mes|trimestre|semestre|anio&desde=AAAA-MM&hasta=AAAA-MM */
    public static function index(): never
    {
        $agrupacion = $_GET['agrupacion'] ?? 'mes';
        if (!is_string($agrupacion) || !isset(Informes::AGRUPACIONES[$agrupacion])) {
            throw new HttpError(422, 'Agrupación inválida (mes, trimestre, semestre o anio).');
        }
        $hasta = $_GET['hasta'] ?? date('Y-m');
        $desde = $_GET['desde'] ?? date('Y-m', strtotime('-11 months', strtotime(date('Y-m-01'))));
        if (!Informes::periodoValido($desde) || !Informes::periodoValido($hasta)) {
            throw new HttpError(422, 'Periodo inválido (formato AAAA-MM).');
        }
        Http::json(Informes::generar($agrupacion, $desde, $hasta) + ['primer_periodo' => Informes::primerPeriodo()]);
    }
}
