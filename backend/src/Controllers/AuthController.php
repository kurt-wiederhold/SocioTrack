<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Auth;
use App\Http;
use App\HttpError;

final class AuthController
{
    /** Devuelve el usuario actual (o null) y el token CSRF para las siguientes peticiones. */
    public static function me(): never
    {
        Http::json(['usuario' => Auth::user(), 'csrf' => Auth::csrfToken()]);
    }

    public static function login(): never
    {
        Auth::checkCsrf();
        $b = Http::body();
        $email = $b['email'] ?? '';
        $password = $b['password'] ?? '';
        if (!is_string($email) || !is_string($password) || $email === '' || $password === '') {
            throw new HttpError(422, 'Ingresa correo y contraseña.');
        }
        $usuario = Auth::login($email, $password);
        Http::json(['usuario' => $usuario, 'csrf' => Auth::csrfToken()]);
    }

    public static function logout(): never
    {
        Auth::checkCsrf();
        Auth::logout();
        Http::json(['ok' => true]);
    }
}
