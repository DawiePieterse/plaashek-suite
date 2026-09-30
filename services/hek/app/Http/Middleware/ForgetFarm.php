<?php

namespace App\Http\Middleware;

use App\Farm\FarmDatabase;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** No request starts or ends with another request's farm chosen. */
final class ForgetFarm
{
    public function __construct(private readonly FarmDatabase $farm) {}

    public function handle(Request $request, Closure $next): Response
    {
        $this->farm->forget();

        try {
            return $next($request);
        } finally {
            $this->farm->forget();
        }
    }
}
