<?php

return [

    // Ed25519 private JWK (kty OKP, crv Ed25519, d, x) that signs device tickets. Make one with
    // `php artisan plaashek:keys`.
    'ticket_signing_key_jwk' => env('TICKET_SIGNING_KEY_JWK'),

    // Base64 HS256 secrets. Kept apart so a farm office session can never verify as Plaashek Management.
    'staff_session_secret' => env('STAFF_SESSION_SECRET'),
    'management_session_secret' => env('MANAGEMENT_SESSION_SECRET'),

    // Where the pairing QR points: the deployed field PWA.
    'field_app_url' => rtrim((string) env('FIELD_APP_URL', 'https://app.plaashek.co.za'), '/'),

    'farm_databases' => [
        // Prepended to every farm database and user name. On Afrihost cPanel this is the account prefix,
        // e.g. `bowlsbg5n9w0_`; cPanel makes the databases, so leave auto_create off there.
        'prefix' => env('FARM_DB_PREFIX', 'plaashek_'),

        // On a local machine or a VPS the API may create a new farm's database itself, with the central
        // connection's user. cPanel does not allow that: its databases are made in the Database Wizard.
        'auto_create' => (bool) env('FARM_DB_AUTO_CREATE', false),
    ],

];
