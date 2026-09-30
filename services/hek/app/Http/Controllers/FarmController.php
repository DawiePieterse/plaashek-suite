<?php

namespace App\Http\Controllers;

use App\Farm\CaptureTables;
use App\Farm\Farms;
use App\Http\ApiError;
use App\Http\Input;
use Illuminate\Http\Request;

final class FarmController extends Controller
{
    /**
     * Everything the Farm Admin Tool needs to draw its pickers: the farm, stamp names, blocks and camps,
     * assets, licensed modules, and what is waiting on the office.
     *
     * @return array<string, mixed>
     */
    public function show(Request $request): array
    {
        $farmId = $this->staff($request)->farmId;
        $db = $this->db();

        $farm = Farms::central()->table('farms')->where('id', $farmId)->first(['id', 'name', 'latitude', 'longitude']);
        if (! $farm) {
            throw ApiError::notFound();
        }

        // Every season-stamped module: a capture the phone could not stamp is the office's to place,
        // whichever module it came from (plan §6).
        $withoutSeason = 0;
        foreach (CaptureTables::SEASON_STAMPED as $table) {
            $withoutSeason += $db->table($table)->where('farm_id', $farmId)->whereNull('season_id')->count();
        }

        return [
            'farm' => ['id' => $farm->id, 'name' => $farm->name, 'coords' => Farms::coordsPair($farm->latitude, $farm->longitude)],
            // Staff only: a seasonal picker carries a card, never a phone (ADR 0009). The piece-work
            // register is where they live.
            'people' => $db->table('people')->where('farm_id', $farmId)->where('kind', 'staff')->orderBy('name')->get(['id', 'name'])
                ->map(fn (object $p) => ['id' => $p->id, 'name' => $p->name])->all(),
            'blocks' => Farms::blocks($db, $farmId),
            'camps' => $db->table('camps')->where('farm_id', $farmId)->orderBy('name')->get(['id', 'name', 'block_id'])
                ->map(fn (object $c) => ['id' => $c->id, 'name' => $c->name, 'blockId' => $c->block_id])->all(),
            'assets' => $db->table('assets')->where('farm_id', $farmId)->orderBy('name')->get(['id', 'name'])
                ->map(fn (object $a) => ['id' => $a->id, 'name' => $a->name])->all(),
            'modules' => Farms::activeModuleCodes($farmId),
            // Captures waiting behind a lapsed licence (plan §5), and ones without a season (§6).
            'waiting' => [
                'held' => $db->table('held_writes')->where('farm_id', $farmId)->whereNull('released_at')->count(),
                'withoutSeason' => $withoutSeason,
            ],
        ];
    }

    /**
     * Where the farm is, for the office weather line. The phone's stamps use its own fix.
     *
     * @return array<string, mixed>
     */
    public function coordinates(Request $request): array
    {
        $staff = $this->staff($request);
        ['lat' => $lat, 'lon' => $lon] = Input::parse(WeatherController::COORDINATES, $this->body($request));

        Farms::central()->table('farms')->where('id', $staff->farmId)->update(['latitude' => $lat, 'longitude' => $lon]);
        Farms::audit($this->db(), $staff->farmMembershipId, 'set_farm_coordinates', $staff->farmId, $staff->farmId);

        return ['coords' => ['lat' => $lat, 'lon' => $lon]];
    }
}
