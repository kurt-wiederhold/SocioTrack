<?php
declare(strict_types=1);

// Crea (o actualiza la contraseña de) un usuario del sistema.
// Uso: php scripts/crear_usuario.php correo@fundacion.cl "Nombre Apellido"
// La contraseña se pide por consola para que no quede en el historial.

if (PHP_SAPI !== 'cli') {
    exit("Solo por consola.\n");
}
require __DIR__ . '/../src/bootstrap.php';

use App\Db;

[$_, $email, $nombre] = $argv + [null, null, null];
if (!$email || !$nombre || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    exit("Uso: php scripts/crear_usuario.php correo@fundacion.cl \"Nombre Apellido\"\n");
}

$password = getenv('AD_PASSWORD') ?: null;
if ($password === null) {
    echo 'Contraseña (mín. 10 caracteres): ';
    if (DIRECTORY_SEPARATOR === '/') {
        system('stty -echo');
    }
    $password = trim((string) fgets(STDIN));
    if (DIRECTORY_SEPARATOR === '/') {
        system('stty echo');
    }
    echo "\n";
}
if (mb_strlen($password) < 10) {
    exit("La contraseña debe tener al menos 10 caracteres.\n");
}

$email = mb_strtolower($email);
$hash = password_hash($password, PASSWORD_DEFAULT);
if (Db::one('SELECT id FROM usuarios WHERE email = ?', [$email])) {
    Db::run('UPDATE usuarios SET nombre = ?, password_hash = ?, activo = 1 WHERE email = ?', [$nombre, $hash, $email]);
    echo "Usuario actualizado: $email\n";
} else {
    Db::run('INSERT INTO usuarios (email, nombre, password_hash, activo, creado_en) VALUES (?, ?, ?, 1, ?)', [$email, $nombre, $hash, date('Y-m-d H:i:s')]);
    echo "Usuario creado: $email\n";
}
