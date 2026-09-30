<?php

/*
 * Two kinds of database (docs/decisions/0015-one-database-per-farm.md):
 *
 * - `central`: organisations, farms, licences, Plaashek staff and the login directory. One per install.
 * - one per farm: everything the farm captures or keeps. Its connection is registered at runtime by
 *   App\Farm\FarmDatabase from the farm's row in `central`, as `farm_<slug>`; `farm_template` below is
 *   the shape each of those starts from.
 *
 * Both are MariaDB (10.11 on Afrihost). Times are stored in UTC.
 */

$mariadb = [
    'driver' => 'mariadb',
    'host' => env('DB_HOST', '127.0.0.1'),
    'port' => env('DB_PORT', '3306'),
    'unix_socket' => env('DB_SOCKET', ''),
    'charset' => 'utf8mb4',
    'collation' => 'utf8mb4_unicode_ci',
    'prefix' => '',
    'prefix_indexes' => true,
    'strict' => true,
    'engine' => 'InnoDB',
    'timezone' => '+00:00',
    'options' => extension_loaded('pdo_mysql') ? array_filter([
        PDO::MYSQL_ATTR_SSL_CA => env('MYSQL_ATTR_SSL_CA'),
    ]) : [],
];

return [

    'default' => 'central',

    'connections' => [

        'central' => array_merge($mariadb, [
            'database' => env('DB_DATABASE', 'plaashek'),
            'username' => env('DB_USERNAME', 'root'),
            'password' => env('DB_PASSWORD', ''),
        ]),

        // Never used by name: FarmDatabase copies it into `farm_<slug>` with that farm's own database,
        // user and password filled in.
        'farm_template' => array_merge($mariadb, [
            'database' => null,
            'username' => null,
            'password' => null,
        ]),

    ],

    'migrations' => [
        'table' => 'migrations',
        'update_date_on_publish' => true,
    ],

];
