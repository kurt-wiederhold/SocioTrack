<?php
declare(strict_types=1);

// Datos FICTICIOS para desarrollo local. No usar en producción.
// Crea el usuario demo (ver README) y ~60 socios de ejemplo.
// Uso: php scripts/seed_dev.php

if (PHP_SAPI !== 'cli') {
    exit("Solo por consola.\n");
}
require __DIR__ . '/../src/bootstrap.php';

use App\Db;
use App\Rut;
use App\SocioRepository;
use App\SocioValidator;

if (!Db::isSqlite()) {
    exit("Por seguridad, este script solo corre contra la base SQLite de desarrollo.\n");
}

const DEMO_EMAIL = 'demo@africadream.test';
const DEMO_PASSWORD = 'demo-africadream-2026';

Db::pdo()->exec(file_get_contents(__DIR__ . '/../database/schema.sqlite.sql'));
if (!Db::one('SELECT id FROM usuarios WHERE email = ?', [DEMO_EMAIL])) {
    Db::run('INSERT INTO usuarios (email, nombre, password_hash, activo, creado_en) VALUES (?, ?, ?, 1, ?)', [
        DEMO_EMAIL, 'Usuario Demo', password_hash(DEMO_PASSWORD, PASSWORD_DEFAULT), date('Y-m-d H:i:s'),
    ]);
}

mt_srand(42);
$nombres = ['Camila', 'Benjamín', 'Valentina', 'Matías', 'Fernanda', 'Tomás', 'Josefa', 'Vicente', 'Antonia', 'Martín', 'Catalina', 'Joaquín', 'Isidora', 'Diego', 'Florencia'];
$apellidos = ['González', 'Muñoz', 'Rojas', 'Díaz', 'Pérez', 'Soto', 'Contreras', 'Silva', 'Martínez', 'Sepúlveda', 'Morales', 'Rodríguez', 'López', 'Fuentes', 'Hernández'];
$bancos = ['Banco de Chile', 'BancoEstado', 'Banco Santander', 'Banco BCI', 'Scotiabank'];
$proveedores = ['Captadora Sur', 'Face2Face Chile', 'Diálogo Directo'];
$montos = [3000, 5000, 5000, 7000, 10000, 15000, 20000];

$creados = 0;
for ($i = 0; $i < 60; $i++) {
    $body = (string) mt_rand(8_000_000, 24_000_000);
    $n = $nombres[array_rand($nombres)];
    $a = $apellidos[array_rand($apellidos)] . ' ' . $apellidos[array_rand($apellidos)];
    $medio = mt_rand(0, 1) ? 'PAC' : 'PAT';
    $alta = date('Y-m-d', strtotime('-' . mt_rand(0, 900) . ' days'));
    $estado = ['activo', 'activo', 'activo', 'activo', 'activo', 'suspendido', 'baja'][mt_rand(0, 6)];
    $fila = [
        'rut' => $body . '-' . Rut::dv($body),
        'nombre' => "$n $a",
        'email' => mb_strtolower(iconv('UTF-8', 'ASCII//TRANSLIT', $n)) . $i . '@ejemplo.test',
        'medio_pago' => $medio,
        'banco' => $medio === 'PAC' ? $bancos[array_rand($bancos)] : null,
        'monto' => $montos[array_rand($montos)],
        'estado' => $estado,
        'fecha_alta' => $alta,
    ];
    if (mt_rand(0, 2) === 0) {
        $fila += [
            'proveedor' => $proveedores[array_rand($proveedores)],
            'proveedor_monto' => 2500,
            'proveedor_cuotas' => [6, 12, 18, 24][mt_rand(0, 3)],
            'proveedor_inicio' => $alta,
        ];
    }
    // Algunos socios terminan este mes de pagar al proveedor (para ver la alerta).
    if ($i % 20 === 0) {
        $fila = array_merge($fila, ['estado' => 'activo', 'proveedor' => 'Captadora Sur', 'proveedor_monto' => 2500,
            'proveedor_cuotas' => 12, 'proveedor_inicio' => date('Y-m-01', strtotime('first day of -11 months'))]);
    }
    [$d, $e] = SocioValidator::validate($fila);
    if (!$e && !SocioRepository::findByRut($d['rut'])) {
        SocioRepository::create($d, null);
        $creados++;
    }
}
echo "Listo: $creados socios de ejemplo. Usuario: " . DEMO_EMAIL . " (contraseña en scripts/seed_dev.php)\n";
