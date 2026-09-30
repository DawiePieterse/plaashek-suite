<?php

namespace App\Providers;

use App\Auth\SigningKeys;
use App\Farm\FarmDatabase;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // One per request: which farm the request chose.
        $this->app->scoped(FarmDatabase::class);

        $this->app->singleton(SigningKeys::class, fn () => SigningKeys::fromJwk((string) config('plaashek.ticket_signing_key_jwk')));
    }

    public function boot(): void
    {
        // `php artisan migrate` is the central database. Farm databases have their own migrations,
        // run by plaashek:farms-migrate and when a farm is created.
        $this->loadMigrationsFrom(database_path('migrations/central'));
    }
}
