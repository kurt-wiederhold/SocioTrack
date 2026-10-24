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

[$d, $e] = SocioValidator::validate($base + ['proveedor_id' => '7', 'proveedor_monto' => 2500, 'proveedor_cuotas' => 3]);
check('proveedor por id', [$d['proveedor_id'], $d['proveedor_nombre']], [7, null]);
[$d, $e] = SocioValidator::validate($base + ['proveedor_id' => 'abc']);
check('proveedor_id inválido', isset($e['proveedor_id']), true);

echo "Formato nómina PAC (Banco de Chile) y PAT (Transbank)\n";
require __DIR__ . '/../src/Formatos.php';
$pac = ['codigo_banco' => '012', 'codigo_empresa' => '004', 'codigo_convenio' => '065'];
$det = [
    ['rut' => '12345678-5', 'monto' => 6000, 'intento' => 1, 'nombre' => 'Ana'],
    ['rut' => '9999999-3', 'monto' => 5000, 'intento' => 1, 'nombre' => 'Luis'],
];
$lineas = explode("\r\n", rtrim(App\Formatos::nominaPac($det, '2019-12-20', '2020-01-03', $pac), "\r\n"));
check('identificador de servicio con ceros', App\Formatos::identificadorServicio('9827237-K'), '009827237K');
check('todas las líneas de 80 bytes', array_unique(array_map('strlen', $lineas)), [80]);
check('detalle según especificación',
    $lineas[0],
    '012004065D' . str_pad('0123456785', 22) . ' ' . str_repeat(' ', 10) . '00000600000' . '20191220' . '20200103' . '..........');
// Mismo registro de totales que el archivo real enviado por la Fundación (8 cargos por $41.000).
$ocho = array_fill(0, 8, ['rut' => '12345678-5', 'monto' => 0, 'intento' => 1]);
$ocho[0]['monto'] = 41000;
$total = explode("\r\n", rtrim(App\Formatos::nominaPac($ocho, '2019-12-20', '2020-01-03', $pac), "\r\n"))[8];
check('registro de totales idéntico al del banco', $total, '001004065T' . str_repeat(' ', 33) . '00004100000000008N0..................');
$det[1]['intento'] = 3;
$total = explode("\r\n", rtrim(App\Formatos::nominaPac($det, '2019-12-20', '2020-01-03', $pac), "\r\n"))[2];
check('nómina con reintentos marca S', substr($total, 60, 2), 'S2');
check('línea PAT', App\Formatos::nominaPat([['monto' => 7000, 'nombre' => 'José Ñuñez; Pérez', 'rut' => '16209682-6']]), "V;7000;Jose Nunez Perez;16209682-6\r\n");

echo $fallos ? "\n$fallos prueba(s) fallaron\n" : "\nTodas las pruebas pasaron\n";
exit($fallos ? 1 : 0);
