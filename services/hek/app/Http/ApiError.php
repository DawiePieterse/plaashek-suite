<?php

namespace App\Http;

use RuntimeException;

/**
 * An error the API answers with on purpose: rendered as `{error: {code, message}}` with its status
 * (bootstrap/app.php). The office and field apps word the message themselves from `code`.
 */
final class ApiError extends RuntimeException
{
    public function __construct(public readonly int $status, public readonly string $errorCode, string $message)
    {
        parent::__construct($message);
    }

    public static function badRequest(string $code, string $message): self
    {
        return new self(400, $code, $message);
    }

    public static function unauthorized(string $code, string $message): self
    {
        return new self(401, $code, $message);
    }

    public static function forbidden(string $code, string $message): self
    {
        return new self(403, $code, $message);
    }

    public static function notFound(string $message = 'Not found'): self
    {
        return new self(404, 'not_found', $message);
    }

    public static function conflict(string $code, string $message): self
    {
        return new self(409, $code, $message);
    }

    public static function gone(string $code, string $message): self
    {
        return new self(410, $code, $message);
    }

    public static function validation(string $message): self
    {
        return new self(400, 'validation_error', $message);
    }
}
