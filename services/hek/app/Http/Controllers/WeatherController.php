<?php

namespace App\Http\Controllers;

use App\Farm\Farms;
use App\Http\ApiError;
use App\Http\Input;
use App\Weather\OpenMeteo;
use Illuminate\Http\Request;

/**
 * Server-proxied weather stamps. The phone asks with its own GPS fix; the office asks with none and gets
 * the farm's stored point, set in the Farm Admin Tool.
 */
final class WeatherController extends Controller
{
    public const COORDINATES = ['lat' => 'coerce_number|min:-90|max:90', 'lon' => 'coerce_number|min:-180|max:180'];

    /**
     * @return array<string, mixed>
     */
    public function current(Request $request): array
    {
        ['lat' => $lat, 'lon' => $lon] = Input::parse(self::COORDINATES, $request->query());

        return OpenMeteo::current($lat, $lon);
    }

    /**
     * @return array<string, mixed>
     */
    public function farm(Request $request): array
    {
        $farm = Farms::central()->table('farms')->where('id', $this->staff($request)->farmId)->first(['latitude', 'longitude']);

        $coords = Farms::coordsPair($farm?->latitude, $farm?->longitude);
        if (! $coords) {
            throw new ApiError(409, 'no_coordinates', 'The farm has no coordinates set');
        }

        return OpenMeteo::current($coords['lat'], $coords['lon']);
    }
}
