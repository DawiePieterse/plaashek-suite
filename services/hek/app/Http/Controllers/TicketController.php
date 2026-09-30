<?php

namespace App\Http\Controllers;

use App\Auth\SigningKeys;
use App\Auth\Tickets;
use App\Farm\FarmDatabase;
use App\Farm\Farms;
use Illuminate\Http\Request;

final class TicketController extends Controller
{
    public function __construct(FarmDatabase $farm, private readonly SigningKeys $keys)
    {
        parent::__construct($farm);
    }

    /**
     * A fresh ticket from the farm's current licences and the device's current floor, so a revoke or a
     * lapsed licence reaches the phone here.
     *
     * @return array<string, string>
     */
    public function refresh(Request $request): array
    {
        $claims = $this->device($request);
        $db = $this->db();

        $ticket = Tickets::mint(
            $this->keys,
            $claims->farmId,
            $claims->deviceId,
            Farms::activeModuleCodes($claims->farmId),
            $db->table('device_modules')->where('device_id', $claims->deviceId)->pluck('module_code')->all(),
            // Re-read every refresh, so a farm that switches language reaches the phones already paired.
            Farms::language($claims->farmId),
            Farms::activeSeasonId($db, $claims->farmId),
        );

        return ['ticket' => $ticket];
    }

    /**
     * @return array<string, mixed>
     */
    public function jwks(): array
    {
        return $this->keys->jwks();
    }
}
