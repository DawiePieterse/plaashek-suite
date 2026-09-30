<?php

use App\Http\ApiError;
use App\Http\Middleware\ForgetFarm;
use App\Http\Middleware\RequireDevice;
use App\Http\Middleware\RequireManagement;
use App\Http\Middleware\RequireStaff;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        apiPrefix: '',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->prepend(ForgetFarm::class);
        $middleware->alias([
            'staff' => RequireStaff::class,
            'management' => RequireManagement::class,
            'device' => RequireDevice::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Every answer is JSON in the one shape the apps read: {error: {code, message}}.
        $exceptions->render(function (ApiError $e) {
            return response()->json(['error' => ['code' => $e->errorCode, 'message' => $e->getMessage()]], $e->status);
        });

        $exceptions->render(function (HttpExceptionInterface $e, Request $request) {
            $status = $e->getStatusCode();
            $code = $status === 404 ? 'not_found' : ($status === 405 ? 'method_not_allowed' : 'http_error');

            return response()->json(['error' => ['code' => $code, 'message' => $status === 404 ? "Route {$request->method()}:{$request->path()} not found" : $e->getMessage()]], $status);
        });

        $exceptions->render(function (Throwable $e) {
            if (config('app.debug')) {
                return null;
            }

            return response()->json(['error' => ['code' => 'internal_error', 'message' => 'Internal error']], 500);
        });

        $exceptions->dontReport([ApiError::class]);
    })->create();
