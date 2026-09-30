<?php

namespace App\Http\Controllers;

use App\Logic\Numbers;
use Illuminate\Http\Request;

/**
 * Stoor (plan §11, docs/stoor-build-scope.md): the catalog, the phone's cached copy of it, and what is on
 * the shelf. `/export/stock.csv` lives with the other exports.
 */
final class StockController extends Controller
{
    /**
     * @return array<string, mixed>
     */
    public function index(Request $request): array
    {
        return ['items' => Catalog::list($this->db(), 'stock_items', $this->staff($request)->farmId)];
    }

    /**
     * @return array<string, mixed>
     */
    public function store(Request $request): array
    {
        $staff = $this->staff($request);

        return ['item' => Catalog::create($this->db(), 'stock_items', $staff->farmId, $staff->farmMembershipId, 'create_stock_item', $this->body($request))];
    }

    /**
     * @return array<string, mixed>
     */
    public function update(Request $request, string $itemId): array
    {
        $staff = $this->staff($request);

        return ['item' => Catalog::update($this->db(), 'stock_items', $itemId, $staff->farmId, $staff->farmMembershipId, 'edit_stock_item', $this->body($request))];
    }

    /**
     * The phone's cached picker: active items only.
     *
     * @return array<string, mixed>
     */
    public function catalog(Request $request): array
    {
        return ['items' => Catalog::list($this->db(), 'stock_items', $this->device($request)->farmId, activeOnly: true)];
    }

    /**
     * What is on the shelf: a running total over every move ever captured, not scoped to a season (a
     * shed does not empty itself at a season boundary). Derived, never stored.
     *
     * @return array<string, mixed>
     */
    public function onHand(Request $request): array
    {
        $farmId = $this->staff($request)->farmId;
        $db = $this->db();

        $onHand = [];
        foreach ($db->table('stock_moves')->where('farm_id', $farmId)->get(['item_id', 'direction', 'quantity']) as $move) {
            $signed = $move->direction === 'out' ? -$move->quantity : $move->quantity;
            $onHand[$move->item_id] = ($onHand[$move->item_id] ?? 0) + $signed;
        }

        return ['items' => array_map(fn (array $item) => [
            'itemId' => $item['id'],
            'name' => $item['name'],
            'unit' => $item['unit'],
            'active' => $item['active'],
            'onHand' => Numbers::round2($onHand[$item['id']] ?? 0),
        ], Catalog::list($db, 'stock_items', $farmId))];
    }
}
