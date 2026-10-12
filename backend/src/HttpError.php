<?php
declare(strict_types=1);

namespace App;

use RuntimeException;

/** Error que se responde al cliente tal cual (mensaje seguro de mostrar). */
final class HttpError extends RuntimeException
{
    public function __construct(int $status, string $message, public readonly array $details = [])
    {
        parent::__construct($message, $status);
    }
}
