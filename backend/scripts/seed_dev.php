<?php
declare(strict_types=1);

// Datos FICTICIOS para desarrollo local. No usar en producción.
// Crea el usuario demo (correo y contraseña abajo) y ~60 socios de ejemplo.
// Uso: php scripts/seed_dev.php
// - SQLite: crea las tablas solo.
// - MySQL/MariaDB: cargar antes database/schema.mysql.sql.

if (PHP_SAPI !== 'cli') {
    exit("Solo por consola.\n");
}
require __DIR__ . '/../src/bootstrap.php';

use App\Categorias;
use App\Cobros;
use App\Db;
use App\Proveedores;
use App\Rut;
use App\SocioRepository;
use App\SocioValidator;

// Protección: nunca correr contra producción (allí 'debug' debe ser false).
if (!App\Config::get('app.debug')) {
    exit("Por seguridad, este script solo corre con 'debug' => true (desarrollo).\n");
}

const DEMO_EMAIL = 'demo@africadream.test';
const DEMO_PASSWORD = 'demo-africadream-2026';

if (Db::isSqlite()) {
    Db::pdo()->exec(file_get_contents(__DIR__ . '/../database/schema.sqlite.sql'));
}
if (!Db::one('SELECT id FROM usuarios WHERE email = ?', [DEMO_EMAIL])) {
    Db::run('INSERT INTO usuarios (email, nombre, password_hash, activo, creado_en) VALUES (?, ?, ?, 1, ?)', [
        DEMO_EMAIL, 'Usuario Demo', password_hash(DEMO_PASSWORD, PASSWORD_DEFAULT), date('Y-m-d H:i:s'),
    ]);
}

// Categorías de ejemplo (la Fundación las ajusta en la pantalla Categorías).
if (!Db::one('SELECT id FROM categorias LIMIT 1')) {
    foreach ([['Básico', 0, 4999, 'gray'], ['Medio', 5000, 9999, 'blue'], ['Alto', 10000, 19999, 'green'], ['Mayor', 20000, null, 'brand']] as [$n, $min, $max, $c]) {
        Categorias::save(['nombre' => $n, 'monto_min' => $min, 'monto_max' => $max, 'color' => $c]);
    }
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
        // Las bajas se reparten entre el alta y hoy (para que los informes tengan sentido).
        'fecha_baja' => $estado === 'baja'
            ? date('Y-m-d', strtotime($alta) + (crc32($body) % max(1, time() - strtotime($alta))))
            : null,
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
    if (!$e && $d['proveedor_nombre'] !== null) {
        $d['proveedor_id'] = Proveedores::idPorNombre($d['proveedor_nombre']);
    }
    if (!$e && !SocioRepository::findByRut($d['rut'])) {
        SocioRepository::create($d, null);
        $creados++;
    }
}
// Historial de cobros ficticio de los últimos 6 meses (envío original + 1 reintento por medio),
// para que la pantalla Informes tenga datos. Solo rellena meses que todavía no tienen nóminas.
$nominas = 0;
mt_srand(7);
for ($k = 6; $k >= 1; $k--) {
    $periodo = date('Y-m', strtotime("first day of -$k months"));
    if (Db::one('SELECT id FROM cobro_nominas WHERE periodo = ? LIMIT 1', [$periodo])) {
        continue;
    }
    {
        foreach (['PAC', 'PAT'] as $medio) {
            for ($intento = 1; $intento <= 2; $intento++) {
                try {
                    $r = Cobros::generar([
                        'periodo' => $periodo, 'medio_pago' => $medio, 'categoria_id' => null,
                        'fecha_facturacion' => "$periodo-05", 'fecha_vencimiento' => "$periodo-15",
                    ], false, null);
                } catch (App\HttpError) {
                    continue; // nadie pendiente para ese medio
                }
                $id = $r['nomina']['id'];
                foreach (Cobros::detalles($id) as $d) {
                    $ok = mt_rand(1, 100) <= ($intento === 1 ? 82 : 55);
                    Db::run('UPDATE cobro_detalles SET estado = ?, codigo = ?, motivo = ?, fecha_cargo = ? WHERE id = ?', [
                        $ok ? 'cobrado' : 'rechazado',
                        $ok ? ($medio === 'PAT' ? 'APROBADA' : '000') : ($medio === 'PAT' ? 'RECHAZO' : '800'),
                        $ok ? null : 'Ejemplo: fondos insuficientes',
                        $ok ? "$periodo-15" : null,
                        $d['id'],
                    ]);
                }
                Db::run("UPDATE cobro_nominas SET estado = 'respondida', respondida_en = ? WHERE id = ?", [date('Y-m-d H:i:s'), $id]);
                $nominas++;
            }
        }
    }
}
echo "Listo: $creados socios y $nominas nóminas de ejemplo. Usuario: " . DEMO_EMAIL . " (contraseña en scripts/seed_dev.php)\n";
