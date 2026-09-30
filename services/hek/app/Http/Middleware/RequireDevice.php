<?php

namespace App\Http\Middleware;

use App\Auth\SigningKeys;
use App\Auth\TicketExpired;
use App\Auth\Tickets;
use App\Farm\FarmDatabase;
use App\Http\ApiError;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * The bearer ticket every device route needs (sync, ticket refresh, weather, the cached lists). Chooses
 * the ticket's farm database for the rest of the request.
 */
final class RequireDevice
{
    public function __construct(private readonly FarmDatabase $farm, private readonly SigningKeys $keys) {}

    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->bearerToken();
        if (! $token) {
            throw ApiError::unauthorized('unauthenticated', 'Missing device ticket');
        }

        try {
            $claims = Tickets::verify($token, $this->keys);
        } catch (TicketExpired) {
            throw ApiError::unauthorized('ticket_expired', 'Device ticket has expired');
        } catch (\Throwable) {
            throw ApiError::unauthorized('ticket_invalid', 'Device ticket is invalid');
        }

        try {
            $this->farm->use($claims->farmId);
        } catch (ApiError) {
            throw ApiError::unauthorized('ticket_invalid', 'Device ticket is invalid');
        }

        $request->attributes->set('device', $claims);

        return $next($request);
    }
}
