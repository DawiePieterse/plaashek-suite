<?php

namespace App\Http\Controllers;

use App\Logic\Numbers;
use App\Logic\WorkOrders;
use Illuminate\Http\Request;

/**
 * Werkswinkel (plan §11, docs/werkswinkel-build-scope.md): the phone's asset picker, what is still open
 * on each asset, and the office's view of the same. The CSVs live with the other exports.
 */
final class WerkswinkelController extends Controller
{
    /**
     * The phone's cached asset list. Not `/assets-catalog`: `POST /assets` is staff-only, so the method
     * already tells the two apart.
     *
     * @return array<string, mixed>
     */
    public function assets(Request $request): array
    {
        return ['assets' => $this->db()->table('assets')->where('farm_id', $this->device($request)->farmId)->orderBy('name')->get(['id', 'name'])
            ->map(fn (object $a) => ['id' => $a->id, 'name' => $a->name])->all()];
    }

    /**
     * What is still open across every asset. Any paired phone can close any asset's job.
     *
     * @return array<string, mixed>
     */
    public function open(Request $request): array
    {
        return ['jobs' => WorkOrders::open($this->events($this->device($request)->farmId))];
    }

    /**
     * @return array<string, mixed>
     */
    public function office(Request $request): array
    {
        $byAsset = [];
        foreach (WorkOrders::open($this->events($this->staff($request)->farmId)) as $job) {
            $byAsset[$job['assetId']] ??= ['assetId' => $job['assetId'], 'assetName' => $job['assetName'], 'jobs' => []];
            $byAsset[$job['assetId']]['jobs'][] = ['description' => $job['description'], 'openedAt' => $job['openedAt']];
        }

        $assets = array_values($byAsset);
        usort($assets, fn ($a, $b) => Numbers::compareNames($a['assetName'], $b['assetName']));

        return ['assets' => $assets];
    }

    /**
     * @return list<array{assetId: string, assetName: string, event: string, description: ?string, at: string}>
     */
    private function events(string $farmId): array
    {
        return $this->db()->table('work_orders')
            ->join('assets', 'assets.id', '=', 'work_orders.asset_id')
            ->where('work_orders.farm_id', $farmId)
            ->get(['work_orders.asset_id', 'assets.name', 'work_orders.event', 'work_orders.description', 'work_orders.created_at'])
            ->map(fn (object $r) => ['assetId' => $r->asset_id, 'assetName' => $r->name, 'event' => $r->event, 'description' => $r->description, 'at' => $r->created_at])
            ->all();
    }
}
