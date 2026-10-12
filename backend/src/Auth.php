<?php
declare(strict_types=1);

namespace App;

/**
 * Autenticación por sesión PHP + token CSRF.
 * - Cookie HttpOnly, SameSite=Lax y Secure cuando hay HTTPS.
 * - Toda petición que modifica datos debe enviar la cabecera X-CSRF-Token.
 * - Bloqueo temporal tras varios intentos fallidos de login.
 */
final class Auth
{
    private const MAX_INTENTOS = 5;
    private const VENTANA_MINUTOS = 15;

    public static function startSession(): void
    {
        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');

        session_name('ad_session');
        session_set_cookie_params([
            'lifetime' => 0,
            'path' => '/',
            'secure' => $https,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        $ttl = 60 * (int) Config::get('app.session_minutes', 120);
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
        // Sin esto PHP puede borrar la sesión a los 24 min (valor por defecto) aunque el TTL sea mayor.
        ini_set('session.gc_maxlifetime', (string) $ttl);
        session_start();

        $ahora = time();
        if (isset($_SESSION['ultimo_uso']) && $ahora - $_SESSION['ultimo_uso'] > $ttl) {
            $_SESSION = [];
            session_regenerate_id(true);
        }
        $_SESSION['ultimo_uso'] = $ahora;
    }

    public static function user(): ?array
    {
        return $_SESSION['usuario'] ?? null;
    }

    public static function userId(): ?int
    {
        return self::user()['id'] ?? null;
    }

    public static function csrfToken(): string
    {
        if (empty($_SESSION['csrf'])) {
            $_SESSION['csrf'] = bin2hex(random_bytes(32));
        }
        return $_SESSION['csrf'];
    }

    /** Exige sesión iniciada; en métodos que modifican datos exige también CSRF. */
    public static function require(string $method): void
    {
        if (self::user() === null) {
            throw new HttpError(401, 'Debes iniciar sesión.');
        }
        if (in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
            self::checkCsrf();
        }
    }

    public static function checkCsrf(): void
    {
        $enviado = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
        if (!is_string($enviado) || !hash_equals(self::csrfToken(), $enviado)) {
            throw new HttpError(419, 'La sesión expiró. Recarga la página.');
        }
    }

    public static function login(string $email, string $password): array
    {
        $email = mb_substr(mb_strtolower(trim($email)), 0, 190);
        $ip = substr($_SERVER['REMOTE_ADDR'] ?? 'desconocida', 0, 45);
        $desde = date('Y-m-d H:i:s', time() - self::VENTANA_MINUTOS * 60);

        $r = Db::one(
            'SELECT SUM(CASE WHEN email = ? THEN 1 ELSE 0 END) AS por_email,
                    SUM(CASE WHEN ip = ? THEN 1 ELSE 0 END) AS por_ip
             FROM login_intentos WHERE (ip = ? OR email = ?) AND creado_en >= ?',
            [$email, $ip, $ip, $email, $desde]
        );
        // 5 fallos por cuenta, o 20 desde la misma IP (oficina con IP compartida).
        if ((int) $r['por_email'] >= self::MAX_INTENTOS || (int) $r['por_ip'] >= self::MAX_INTENTOS * 4) {
            throw new HttpError(429, 'Demasiados intentos. Espera ' . self::VENTANA_MINUTOS . ' minutos.');
        }

        $usuario = Db::one('SELECT id, email, nombre, password_hash FROM usuarios WHERE email = ? AND activo = 1', [$email]);
        // password_verify se ejecuta siempre para no revelar por tiempo si el correo existe.
        $hash = $usuario['password_hash'] ?? '$2y$12$98TmqV.E74NZSpw7B1ToXO8aGbOzHott2OzRDChSNO.WId31LeyPm';
        if (!password_verify($password, $hash) || $usuario === null) {
            Db::run('INSERT INTO login_intentos (ip, email, creado_en) VALUES (?, ?, ?)', [$ip, $email, date('Y-m-d H:i:s')]);
            throw new HttpError(401, 'Correo o contraseña incorrectos.');
        }

        Db::run('DELETE FROM login_intentos WHERE email = ? OR creado_en < ?', [$email, $desde]);
        if (password_needs_rehash($usuario['password_hash'], PASSWORD_DEFAULT)) {
            Db::run('UPDATE usuarios SET password_hash = ? WHERE id = ?', [password_hash($password, PASSWORD_DEFAULT), $usuario['id']]);
        }

        session_regenerate_id(true);
        unset($_SESSION['csrf']);
        $_SESSION['usuario'] = [
            'id' => (int) $usuario['id'],
            'email' => $usuario['email'],
            'nombre' => $usuario['nombre'],
        ];
        return $_SESSION['usuario'];
    }

    public static function logout(): void
    {
        $_SESSION = [];
        $p = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires' => time() - 3600,
            'path' => $p['path'],
            'secure' => $p['secure'],
            'httponly' => true,
            'samesite' => $p['samesite'],
        ]);
        session_destroy();
    }
}
