<?php
declare(strict_types=1);

namespace App;

/**
 * Códigos de banco de la CMF (ex SBIF). Cada línea de la nómina PAC lleva el código
 * del banco del socio, por eso un nombre de banco desconocido impide generar su cargo.
 */
final class Bancos
{
    public const CODIGOS = [
        '001' => 'Banco de Chile',
        '009' => 'Banco Internacional',
        '012' => 'BancoEstado',
        '014' => 'Scotiabank',
        '016' => 'Banco BCI',
        '028' => 'Banco BICE',
        '031' => 'HSBC',
        '037' => 'Banco Santander',
        '039' => 'Banco Itaú',
        '049' => 'Banco Security',
        '051' => 'Banco Falabella',
        '053' => 'Banco Ripley',
        '055' => 'Banco Consorcio',
        '672' => 'Coopeuch',
    ];

    private const ALIAS = [
        'chile' => '001', 'edwards' => '001', 'citibank' => '001',
        'internacional' => '009',
        'estado' => '012', 'bancoestado' => '012',
        'scotiabank' => '014', 'scotia' => '014',
        'bci' => '016', 'credito e inversiones' => '016',
        'bice' => '028',
        'hsbc' => '031',
        'santander' => '037',
        'itau' => '039', 'itau corpbanca' => '039', 'corpbanca' => '039',
        'security' => '049',
        'falabella' => '051',
        'ripley' => '053',
        'consorcio' => '055',
        'coopeuch' => '672',
    ];

    /** Acepta nombre o código ("Santander", "banco de chile", "37", "037"). Devuelve el código o null. */
    public static function codigo(mixed $valor): ?string
    {
        if (!is_string($valor) && !is_int($valor)) {
            return null;
        }
        $s = trim((string) $valor);
        if ($s === '') {
            return null;
        }
        if (ctype_digit($s)) {
            $c = str_pad(ltrim($s, '0') ?: '0', 3, '0', STR_PAD_LEFT);
            return isset(self::CODIGOS[$c]) ? $c : null;
        }
        $n = strtr(mb_strtolower($s), ['á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u']);
        $n = trim((string) preg_replace('/^banco\s+(de\s+|del\s+)?/', '', $n));
        return self::ALIAS[$n] ?? null;
    }

    public static function nombre(?string $codigo): ?string
    {
        return $codigo === null ? null : (self::CODIGOS[$codigo] ?? null);
    }
}
