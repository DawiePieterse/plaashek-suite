<?php

namespace App\Http\Controllers;

use App\Farm\Farms;
use App\Logic\Attendance;
use App\Logic\Numbers;
use App\Support\Rows;
use Illuminate\Http\Request;

/**
 * The owner's rollups for the active season. No active season: nothing to roll up yet, rather than
 * mixing seasons together.
 */
final class EienaarController extends Controller
{
    /** How many notes the veldnotas summary shows; the CSV export has them all. */
    private const NOTES_PAGE = 50;

    /**
     * Crates and kilograms by block (docs/boord-reuse-audit.md).
     *
     * @return array<string, mixed>
     */
    public function harvest(Request $request): array
    {
        $farmId = $this->staff($request)->farmId;
        $db = $this->db();

        $season = Farms::activeSeason($db, $farmId);
        if (! $season) {
            return ['season' => null, 'blocks' => []];
        }

        $rows = $db->table('harvest_events')
            ->join('blocks', 'blocks.id', '=', 'harvest_events.block_id')
            ->where('harvest_events.farm_id', $farmId)
            ->where('harvest_events.season_id', $season['id'])
            ->groupBy('blocks.id', 'blocks.name')
            ->orderBy('blocks.name')
            ->selectRaw('blocks.id as block_id, blocks.name as block_name, count(harvest_events.id) as crates, sum(harvest_events.weight_kg) as kg')
            ->get();

        return [
            'season' => ['id' => $season['id'], 'name' => $season['name']],
            'blocks' => $rows->map(fn (object $row) => [
                'blockId' => $row->block_id,
                'blockName' => $row->block_name,
                'crates' => (int) $row->crates,
                'kg' => Numbers::tidy((float) ($row->kg ?? 0)),
            ])->all(),
        ];
    }

    /**
     * Days and hours per person, paired at read time (docs/span-build-scope.md).
     *
     * @return array<string, mixed>
     */
    public function attendance(Request $request): array
    {
        $farmId = $this->staff($request)->farmId;
        $db = $this->db();

        $season = Farms::activeSeason($db, $farmId);
        if (! $season) {
            return ['season' => null, 'people' => []];
        }

        $punches = $db->table('attendance_punches')
            ->join('people', 'people.id', '=', 'attendance_punches.created_by')
            ->where('attendance_punches.farm_id', $farmId)
            ->where('attendance_punches.season_id', $season['id'])
            ->orderBy('attendance_punches.created_at')
            ->get(['attendance_punches.created_by', 'people.name', 'attendance_punches.direction', 'attendance_punches.created_at'])
            ->map(fn (object $p) => ['personId' => $p->created_by, 'personName' => $p->name, 'direction' => $p->direction, 'at' => $p->created_at]);

        return ['season' => ['id' => $season['id'], 'name' => $season['name']], 'people' => Attendance::rollUp($punches)];
    }

    /**
     * The newest notes of the active season, with who wrote them, where, and the weather stamped when
     * they were written (ADR 0006: append-only, so exactly what the field saw).
     *
     * @return array<string, mixed>
     */
    public function veldnotas(Request $request): array
    {
        $farmId = $this->staff($request)->farmId;
        $db = $this->db();

        $season = Farms::activeSeason($db, $farmId);
        if (! $season) {
            return ['season' => null, 'total' => 0, 'notes' => []];
        }

        $scope = fn () => $db->table('notes')->where('notes.farm_id', $farmId)->where('notes.season_id', $season['id']);

        $rows = $scope()
            ->join('people', 'people.id', '=', 'notes.created_by')
            ->leftJoin('blocks', 'blocks.id', '=', 'notes.block_id')
            ->orderByDesc('notes.created_at')
            ->limit(self::NOTES_PAGE)
            ->get([
                'notes.id', 'notes.body', 'notes.created_at as at', 'people.name as person_name', 'blocks.name as block_name',
                'notes.weather_temp', 'notes.weather_condition',
            ]);

        return ['season' => ['id' => $season['id'], 'name' => $season['name']], 'total' => $scope()->count(), 'notes' => Rows::all($rows)];
    }
}
