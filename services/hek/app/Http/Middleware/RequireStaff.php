<?php

namespace App\Http\Middleware;

use App\Auth\StaffClaims;
use App\Farm\FarmDatabase;
use App\Http\ApiError;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

/**
 * A farm office session, optionally limited to roles (`staff:admin` or `staff:admin,owner`). Chooses the
 * session's farm database for the rest of the request.
 */
final class RequireStaff
{
    public function __construct(private readonly FarmDatabase $farm) {}

    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $token = $request->bearerToken();
        if (! $token) {
            throw ApiError::unauthorized('unauthenticated', 'Missing bearer token');
        }

        try {
            $claims = StaffClaims::verify($token);
        } catch (Throwable) {
            throw ApiError::unauthorized('unauthenticated', 'Invalid or expired session');
        }

        if ($roles !== [] && ! in_array($claims->role, $roles, true)) {
            throw ApiError::forbidden('forbidden', 'Requires role: '.implode(' or ', $roles));
        }

        try {
            $this->farm->use($claims->farmId);
        } catch (ApiError) {
            throw ApiError::unauthorized('unauthenticated', 'Invalid or expired session');
        }

        $request->attributes->set('staff', $claims);

        return $next($request);
    }
}
