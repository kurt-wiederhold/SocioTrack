<?php
declare(strict_types=1);

namespace App;

/**
 * Archivos que se envían a cobro.
 *
 * PAC — "Formato Nómina de Cargos Banco de Chile": registros de 80 bytes, ASCII, CRLF.
 *   Detalle (D):  banco del socio(3) empresa(3) convenio(3) 'D' identServicio(22, izq.) ' '
 *                 datoAdicional(10) monto(11, con 2 decimales sin separador)
 *                 fechaFacturación(AAAAMMDD) fechaVencimiento(AAAAMMDD) '.'×10
 *   Totales (T):  '001' empresa(3) convenio(3) 'T' ' '×33 montoTotal(11) registros(6)
 *                 indReintento(S/N) númeroReintentos(0-5) '.'×18
 *   El identificador de servicio es el RUT rellenado con ceros: 19.827.237-K -> "019827237K".
 *
 * PAT — Transbank: una línea por cargo "V;monto;NOMBRE;RUT", sin encabezado, CRLF.
 */
final class Formatos
{
    public const LARGO_PAC = 80;

    /**
     * @param array $detalles filas con rut, monto, intento, banco_codigo
     * @param array $pac      codigo_empresa, codigo_convenio, incluir_totales
     */
    public static function nominaPac(array $detalles, string $fechaFacturacion, string $fechaVencimiento, array $pac): string
    {
        $empresa = self::num($pac['codigo_empresa'], 3);
        $convenio = self::num($pac['codigo_convenio'], 3);
        $fact = str_replace('-', '', $fechaFacturacion);
        $venc = str_replace('-', '', $fechaVencimiento);

        $lineas = [];
        $total = 0;
        $maxIntento = 1;
        foreach ($detalles as $d) {
            $total += (int) $d['monto'];
            $maxIntento = max($maxIntento, (int) $d['intento']);
            $lineas[] = self::num((string) $d['banco_codigo'], 3) . $empresa . $convenio . 'D'
                . str_pad(self::identificadorServicio($d['rut']), 22)
                . ' '
                . str_repeat(' ', 10)
                . self::num((int) $d['monto'] * 100, 11)
                . $fact . $venc
                . str_repeat('.', 10);
        }
        $reintento = $maxIntento > 1;
        // El formato oficial define un registro de totales; se puede desactivar por configuración
        // (el archivo enviado por la Fundación en nov. 2026 no lo trae: falta confirmar con el banco).
        if ($pac['incluir_totales'] ?? true) {
            $lineas[] = '001' . $empresa . $convenio . 'T'
                . str_repeat(' ', 33)
                . self::num($total * 100, 11)
                . self::num(count($detalles), 6)
                . ($reintento ? 'S' : 'N')
                . ($reintento ? (string) min(5, $maxIntento - 1) : '0')
                . str_repeat('.', 18);
        }

        foreach ($lineas as $l) {
            if (strlen($l) !== self::LARGO_PAC) {
                throw new \LogicException('Registro PAC de largo inválido: ' . strlen($l));
            }
        }
        return implode("\r\n", $lineas) . "\r\n";
    }

    /** @param array $detalles filas con rut, nombre, monto */
    public static function nominaPat(array $detalles): string
    {
        $lineas = array_map(
            fn ($d) => 'V;' . (int) $d['monto'] . ';' . self::ascii($d['nombre'], 60) . ';' . $d['rut'],
            $detalles
        );
        return implode("\r\n", $lineas) . "\r\n";
    }

    /** "19827237-K" -> "019827237K" (9 dígitos + DV), como en los archivos del banco. */
    public static function identificadorServicio(string $rut): string
    {
        [$cuerpo, $dv] = explode('-', $rut);
        return str_pad($cuerpo, 9, '0', STR_PAD_LEFT) . $dv;
    }

    /** Texto ASCII sin tildes ni ';' (el separador del archivo). */
    public static function ascii(string $s, int $max): string
    {
        $s = strtr($s, [
            'á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ü' => 'u', 'ñ' => 'n',
            'Á' => 'A', 'É' => 'E', 'Í' => 'I', 'Ó' => 'O', 'Ú' => 'U', 'Ü' => 'U', 'Ñ' => 'N',
        ]);
        $s = preg_replace('/[^\x20-\x7E]/', '', $s);
        $s = str_replace([';', '"'], ' ', $s);
        return substr(trim(preg_replace('/\s+/', ' ', $s)), 0, $max);
    }

    private static function num(int|string $n, int $largo): string
    {
        $s = (string) $n;
        if (!ctype_digit($s) || strlen($s) > $largo) {
            throw new \InvalidArgumentException("Valor numérico fuera de formato: $s");
        }
        return str_pad($s, $largo, '0', STR_PAD_LEFT);
    }
}
