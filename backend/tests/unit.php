<?php
declare(strict_types=1);

// Pruebas unitarias sin dependencias. Uso: php tests/unit.php

require __DIR__ . '/../src/Rut.php';
require __DIR__ . '/../src/SocioValidator.php';

use App\Rut;
use App\SocioValidator;

$fallos = 0;
function check(string $nombre, mixed $obtenido, mixed $esperado): void
{
    global $fallos;
    if ($obtenido === $esperado) {
        echo "  ok   $nombre\n";
    } else {
        $fallos++;
        echo "  FALLA $nombre: esperado " . var_export($esperado, true) . ', obtenido ' . var_export($obtenido, true) . "\n";
    }
}

echo "RUT\n";
// RUTs tomados de los archivos de ejemplo de Transbank y Banco de Chile.
check('con guion', Rut::normalize('16209682-6'), '16209682-6');
check('con puntos', Rut::normalize('16.209.682-6'), '16209682-6');
check('dv K minúscula', Rut::normalize('19827237-k'), '19827237-K');
check('formato banco con ceros', Rut::normalize('019827237K'), '19827237-K');
check('dv incorrecto', Rut::normalize('16209682-5'), null);
check('vacío', Rut::normalize(''), null);
check('texto', Rut::normalize('hola'), null);

echo "Validador\n";
$base = ['rut' => '16.209.682-6', 'nombre' => '  Damian   Gelerstein ', 'medio_pago' => 'Tarjeta', 'monto' => '$7.000'];
[$d, $e] = SocioValidator::validate($base);
check('sin errores', $e, []);
check('nombre limpio', $d['nombre'], 'Damian Gelerstein');
check('alias medio pago', $d['medio_pago'], 'PAT');
check('monto con $ y punto', $d['monto'], 7000);
check('estado por defecto', $d['estado'], 'activo');
check('fecha alta por defecto', $d['fecha_alta'], date('Y-m-d'));

[$d, $e] = SocioValidator::validate($base + ['fecha_alta' => '03/01/2020', 'estado' => 'Baja', 'fecha_baja' => '2019-12-01']);
check('fecha dd/mm/aaaa', $d['fecha_alta'], '2020-01-03');
check('baja anterior al alta', isset($e['fecha_baja']), true);

[$d, $e] = SocioValidator::validate(['monto' => '5000.5', 'medio_pago' => 'efectivo']);
check('decimal rechazado', isset($e['monto']), true);
check('medio inválido', isset($e['medio_pago']), true);
check('rut obligatorio', $e['rut'] ?? null, 'El RUT es obligatorio.');
check('nombre obligatorio', isset($e['nombre']), true);

[$d, $e] = SocioValidator::validate(['monto' => '1,500,000'] + $base);
check('miles con coma', $d['monto'], 1500000);

[$d, $e] = SocioValidator::validate($base + ['proveedor' => 'Captadora X', 'proveedor_monto' => '3000', 'proveedor_cuotas' => '12', 'proveedor_inicio' => '2026-01-15']);
check('proveedor sin errores', $e, []);
check('fin proveedor = último mes de pago', $d['proveedor_fin'], '2026-12-01');

[$d, $e] = SocioValidator::validate($base + ['proveedor' => 'Captadora X']);
check('proveedor exige cuotas', isset($e['proveedor_cuotas']), true);
check('proveedor exige monto', isset($e['proveedor_monto']), true);

[$d, $e] = SocioValidator::validate($base + ['proveedor_monto' => '3000', 'proveedor_cuotas' => '12']);
check('sin proveedor se limpian sus campos', [$d['proveedor_monto'], $d['proveedor_cuotas']], [null, null]);

[$d, $e] = SocioValidator::validate(['nombre' => "Ana\x00 Pérez\x07"] + $base);
check('quita caracteres de control', $d['nombre'], 'Ana Pérez');
[$d, $e] = SocioValidator::validate(['monto' => 1e20] + $base);
check('monto gigante rechazado', isset($e['monto']), true);
[$d, $e] = SocioValidator::validate(['monto' => '1.500,00'] + $base);
check('monto con decimales ,00', $d['monto'], 1500);
[$d, $e] = SocioValidator::validate(['fecha_alta' => '31/02/2026'] + $base);
check('fecha imposible', isset($e['fecha_alta']), true);
check('rut con espacios', Rut::normalize(' 12 345 678 5 '), '12345678-5');

echo $fallos ? "\n$fallos prueba(s) fallaron\n" : "\nTodas las pruebas pasaron\n";
exit($fallos ? 1 : 0);
