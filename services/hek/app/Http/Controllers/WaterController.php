<?php

namespace App\Http\Controllers;

use App\Logic\Numbers;
use App\Support\Rows;
use Illuminate\Http\Request;

/**
 * Water (plan §11, docs/water-build-scope.md): the catalog of points, the phone's cached copy, and the
 * latest reading per point. `/export/water.csv` lives with the other exports.
 */
final class WaterController extends Controller
{
    /**
     * @return array<string, mixed>
     */
    public function index(Request $request): array
    {
        return ['points' => Catalog::list($this->db(), 'water_points', $this->staff($request)->farmId)];
    }

    /**
     * @return array<string, mixed>
     */
    public function store(Request $request): array
    {
        $staff = $this->staff($request);

        return ['point' => Catalog::create($this->db(), 'water_points', $staff->farmId, $staff->farmMembershipId, 'create_water_point', $this->body($request))];
    }

    /**
     * @return array<string, mixed>
     */
    public function update(Request $request, string $pointId): array
    {
        $staff = $this->staff($request);

        return ['point' => Catalog::update($this->db(), 'water_points', $pointId, $staff->farmId, $staff->farmMembershipId, 'edit_water_point', $this->body($request))];
    }

    /**
     * @return array<string, mixed>
     */
    public function catalog(Request $request): array
    {
        return ['points' => Catalog::list($this->db(), 'water_points', $this->device($request)->farmId, activeOnly: true)];
    }

    /**
     * The latest reading per point and its change from the one before: a reading replaces the current
     * state rather than adding to it, the opposite of Stoor's running total.
     *
     * @return array<string, mixed>
     */
    public function latest(Request $request): array
    {
        $farmId = $this->staff($request)->farmId;
        $db = $this->db();

        // Newest first: the first two rows seen for a point are its latest and previous reading.
        $latestTwo = [];
        foreach ($db->table('meter_readings')->where('farm_id', $farmId)->orderByDesc('created_at')->get(['water_point_id', 'reading', 'created_at']) as $row) {
            if (count($latestTwo[$row->water_point_id] ?? []) < 2) {
                $latestTwo[$row->water_point_id][] = ['reading' => $row->reading, 'at' => $row->created_at];
            }
        }

        return ['points' => array_map(function (array $point) use ($latestTwo) {
            [$latest, $previous] = array_pad($latestTwo[$point['id']] ?? [], 2, null);

            return [
                'pointId' => $point['id'],
                'name' => $point['name'],
                'unit' => $point['unit'],
                'active' => $point['active'],
                'latestReading' => $latest ? Numbers::tidy($latest['reading']) : null,
                'latestAt' => $latest ? Rows::iso($latest['at']) : null,
                'delta' => $latest && $previous ? Numbers::round2($latest['reading'] - $previous['reading']) : null,
            ];
        }, Catalog::list($db, 'water_points', $farmId))];
    }
}
