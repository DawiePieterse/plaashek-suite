<?php

namespace App\Http\Controllers;

use App\Farm\Farms;
use App\Http\Input;
use App\Support\Rows;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * The farm's own people, blocks, camps and assets. Add-only: nothing downstream asks to rename or remove
 * one yet (plan §12 Phase 4). `GET /farm` lists them for the office's pickers.
 */
final class MasterDataController extends Controller
{
    /**
     * @return array<string, mixed>
     */
    public function person(Request $request): array
    {
        ['name' => $name] = Input::parse(['name' => 'string'], $this->body($request));

        return ['person' => $this->create($request, 'people', ['name' => $name], 'create_person')];
    }

    /**
     * @return array<string, mixed>
     */
    public function block(Request $request): array
    {
        ['name' => $name] = Input::parse(['name' => 'string'], $this->body($request));

        return ['block' => $this->create($request, 'blocks', ['name' => $name], 'create_block')];
    }

    /**
     * @return array<string, mixed>
     */
    public function camp(Request $request): array
    {
        $body = Input::parse(['name' => 'string', 'blockId' => 'optional|uuid'], $this->body($request));

        if (isset($body['blockId'])) {
            Farms::assertOwns($this->db(), 'blocks', $body['blockId'], $this->staff($request)->farmId);
        }

        return ['camp' => $this->create($request, 'camps', ['name' => $body['name'], 'block_id' => $body['blockId'] ?? null], 'create_camp')];
    }

    /**
     * Werkswinkel's first step (docs/werkswinkel-build-scope.md): assets had a table and no create path.
     *
     * @return array<string, mixed>
     */
    public function asset(Request $request): array
    {
        ['name' => $name] = Input::parse(['name' => 'string'], $this->body($request));

        return ['asset' => $this->create($request, 'assets', ['name' => $name], 'create_asset')];
    }

    /**
     * Picker data for Boord's block field: a list to render, not part of the ticket.
     *
     * @return array<string, mixed>
     */
    public function fieldBlocks(Request $request): array
    {
        return ['blocks' => Farms::blocks($this->db(), $this->device($request)->farmId)];
    }

    /**
     * One farm row and its audit line, in one transaction.
     *
     * @param  array<string, mixed>  $values
     * @return array<string, mixed>
     */
    private function create(Request $request, string $table, array $values, string $action): array
    {
        $staff = $this->staff($request);
        $db = $this->db();

        return $db->transaction(function () use ($db, $staff, $table, $values, $action) {
            $id = (string) Str::uuid7();
            $db->table($table)->insert(['id' => $id, 'farm_id' => $staff->farmId, ...$values]);
            Farms::audit($db, $staff->farmMembershipId, $action, $id, $staff->farmId);

            return Rows::one($db->table($table)->where('id', $id)->first());
        });
    }
}
