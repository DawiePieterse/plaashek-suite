<?php

namespace App\Weather;

use App\Http\ApiError;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * The one place the suite talks to Open-Meteo (docs/veldnotas-reuse-audit.md). No API key: nothing to
 * rotate or bill. Swap providers here only.
 */
final class OpenMeteo
{
    /**
     * Answers within five minutes and about a kilometre share one upstream call: Open-Meteo's "current"
     * data has ~15-minute granularity and a coarser grid, so a fresher or finer fetch returns the same.
     */
    private const CACHE_SECONDS = 300;

    /**
     * Collapsed WMO codes: the short words the field screen and office report need. Anything unlisted is
     * "unknown" rather than an error, so a note still saves.
     */
    private const CONDITIONS = [
        0 => 'clear', 1 => 'mostly_clear', 2 => 'partly_cloudy', 3 => 'cloudy',
        45 => 'fog', 48 => 'fog',
        51 => 'drizzle', 53 => 'drizzle', 55 => 'drizzle',
        61 => 'rain', 63 => 'rain', 65 => 'rain',
        71 => 'snow', 73 => 'snow', 75 => 'snow',
        80 => 'showers', 81 => 'showers', 82 => 'showers',
        95 => 'thunderstorm', 96 => 'thunderstorm', 99 => 'thunderstorm',
    ];

    public static function condition(int $code): string
    {
        return self::CONDITIONS[$code] ?? 'unknown';
    }

    /**
     * @return array{temp: float|int, humidity: float|int, condition: string}
     */
    public static function current(float $lat, float $lon): array
    {
        $key = sprintf('weather:%.2f,%.2f', $lat, $lon);

        // A failed lookup throws before anything is cached, so it is never the answer for five minutes.
        return Cache::remember($key, self::CACHE_SECONDS, fn () => self::fetch($lat, $lon));
    }

    /**
     * @return array{temp: float|int, humidity: float|int, condition: string}
     */
    private static function fetch(float $lat, float $lon): array
    {
        try {
            $response = Http::timeout(10)->get('https://api.open-meteo.com/v1/forecast', [
                'latitude' => $lat,
                'longitude' => $lon,
                'current' => 'temperature_2m,relative_humidity_2m,weather_code',
            ]);
        } catch (Throwable) {
            throw new ApiError(502, 'weather_unavailable', 'Weather lookup failed');
        }

        $current = $response->json('current');
        if (! $response->successful() || ! is_array($current)) {
            throw new ApiError(502, 'weather_unavailable', 'Weather lookup failed');
        }

        return [
            'temp' => $current['temperature_2m'],
            'humidity' => $current['relative_humidity_2m'],
            'condition' => self::condition((int) $current['weather_code']),
        ];
    }
}
