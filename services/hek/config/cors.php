<?php

return [

    'paths' => ['*'],

    'allowed_methods' => ['*'],

    // The four office and field apps, comma separated.
    'allowed_origins' => array_values(array_filter(explode(',', (string) env('CORS_ORIGINS', '')))),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    // Not a CORS-safelisted response header: without it the office tools cannot read the filename the
    // export routes set, and every download lands under a generic name.
    'exposed_headers' => ['content-disposition'],

    'max_age' => 0,

    'supports_credentials' => false,

];
