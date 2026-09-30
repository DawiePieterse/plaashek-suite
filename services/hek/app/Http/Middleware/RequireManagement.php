<?php

namespace App\Http\Middleware;

use App\Auth\ManagementClaims;
use App\Http\ApiError;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

/** Plaashek Management only: a farm session token can never reach this layer (plan §3.1). */
final class RequireManagement
{
    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->bearerToken();
        if (! $token) {
            throw ApiError::unauthorized('unauthenticated', 'Missing bearer token');
        }

        try {
            $request->attributes->set('management', ManagementClaims::verify($token));
        } catch (Throwable) {
            throw ApiError::unauthorized('unauthenticated', 'Invalid or expired session');
        }

        return $next($request);
    }
}
