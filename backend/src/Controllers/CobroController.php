<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Auth;
use App\Cobros;
use App\Http;
use App\HttpError;
use App\SocioValidator;

final class CobroController
{
    /** GET /cobros?periodo=AAAA-MM */
    public static function index(): never
    {
        $periodo = $_GET['periodo'] ?? date('Y-m');
        if (!Cobros::periodoValido($periodo)) {
            throw new HttpError(422, 'Periodo inválido (formato AAAA-MM).');
        }
        Http::json([
            'periodo' => $periodo,
            'max_intentos' => Cobros::maxIntentos(),
            'resumen' => Cobros::resumen($periodo),
            'nominas' => Cobros::nominas($periodo),
        ]);
    }

    /**
     * POST /cobros/nominas
     * { periodo, medio_pago, categoria_id?, fecha_facturacion?, fecha_vencimiento?, simular }
     */
    public static function generar(): never
    {
        $b = Http::body();
        $e = [];
        $periodo = $b['periodo'] ?? null;
        if (!Cobros::periodoValido($periodo)) {
            $e['periodo'] = 'Periodo inválido.';
        }
        $medio = $b['medio_pago'] ?? null;
        if (!in_array($medio, SocioValidator::MEDIOS_PAGO, true)) {
            $e['medio_pago'] = 'Medio de pago inválido.';
        }
        $cat = $b['categoria_id'] ?? null;
        if ($cat !== null && $cat !== '' && (!is_int($cat) || $cat < 1)) {
            $e['categoria_id'] = 'Categoría inválida.';
        }
        $fact = self::fecha($b['fecha_facturacion'] ?? null) ?? date('Y-m-d');
        $venc = self::fecha($b['fecha_vencimiento'] ?? null) ?? date('Y-m-d', strtotime('+14 days'));
        if (!empty($b['fecha_facturacion']) && !self::fecha($b['fecha_facturacion'])) {
            $e['fecha_facturacion'] = 'Fecha inválida.';
        }
        if (!empty($b['fecha_vencimiento']) && !self::fecha($b['fecha_vencimiento'])) {
            $e['fecha_vencimiento'] = 'Fecha inválida.';
        } elseif ($venc < $fact) {
            $e['fecha_vencimiento'] = 'No puede ser anterior a la fecha de facturación.';
        }
        if ($e) {
            throw new HttpError(422, 'Revisa los datos.', $e);
        }

        $r = Cobros::generar([
            'periodo' => $periodo,
            'medio_pago' => $medio,
            'categoria_id' => is_int($cat) ? $cat : null,
            'fecha_facturacion' => $fact,
            'fecha_vencimiento' => $venc,
        ], ($b['simular'] ?? true) !== false, Auth::userId());
        Http::json($r, isset($r['nomina']) ? 201 : 200);
    }

    public static function ver(int $id): never
    {
        $n = Cobros::nomina($id) ?? throw new HttpError(404, 'Nómina no encontrada.');
        Http::json(['dato' => $n, 'detalles' => Cobros::detalles($id)]);
    }

    /** GET /cobros/nominas/{id}/archivo — descarga el TXT (PAC) o CSV (PAT). */
    public static function archivo(int $id): never
    {
        [$nombre, $contenido] = Cobros::archivo($id);
        header('Content-Type: text/plain; charset=us-ascii');
        header('Content-Disposition: attachment; filename="' . $nombre . '"');
        header('Content-Length: ' . strlen($contenido));
        echo $contenido;
        exit;
    }

    /** POST /cobros/nominas/{id}/respuesta { filas, simular, sin_respuesta: pendiente|rechazado } */
    public static function respuesta(int $id): never
    {
        $b = Http::body();
        $filas = $b['filas'] ?? null;
        if (!is_array($filas) || !array_is_list($filas) || count($filas) > 20000) {
            throw new HttpError(422, 'No se recibieron filas válidas.');
        }
        $sinRespuesta = ($b['sin_respuesta'] ?? 'pendiente') === 'rechazado' ? 'rechazado' : 'pendiente';
        Http::json(Cobros::respuesta($id, $filas, ($b['simular'] ?? true) !== false, $sinRespuesta, Auth::userId()));
    }

    public static function eliminar(int $id): never
    {
        Cobros::eliminar($id);
        Http::json(['ok' => true]);
    }

    private static function fecha(mixed $v): ?string
    {
        return is_string($v) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) && checkdate((int) substr($v, 5, 2), (int) substr($v, 8, 2), (int) substr($v, 0, 4))
            ? $v : null;
    }
}
