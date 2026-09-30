<?php

namespace App\Http\Controllers;

use App\Farm\Farms;
use App\Http\ApiError;
use App\Http\Input;
use App\Support\Rows;
use Illuminate\Database\Connection;
use Illuminate\Support\Str;

/**
 * The catalog shape Stoor and Water share (docs/stoor-build-scope.md, docs/water-build-scope.md): a
 * farm-defined list of `{name, unit, active}`, added and edited by the office.
 */
final class Catalog
{
    public const CREATE = ['name' => 'string', 'unit' => 'string'];

    /** An item nobody uses any more is retired, not deleted: its past captures stay real history. */
    public const UPDATE = ['name' => 'optional|string', 'unit' => 'optional|string', 'active' => 'optional|boolean'];

    /**
     * @param  array<string, mixed>  $body
     * @return array<string, mixed>
     */
    public static function create(Connection $db, string $table, string $farmId, string $actor, string $action, array $body): array
    {
        $values = Input::parse(self::CREATE, $body);

        return $db->transaction(function () use ($db, $table, $farmId, $actor, $action, $values) {
            $id = (string) Str::uuid7();
            $db->table($table)->insert(['id' => $id, 'farm_id' => $farmId, 'name' => $values['name'], 'unit' => $values['unit']]);
            Farms::audit($db, $actor, $action, $id, $farmId);

            return Rows::one($db->table($table)->where('id', $id)->first());
        });
    }

    /**
     * Rename, fix the unit, or retire. Captures already made keep pointing at it.
     *
     * @param  array<string, mixed>  $body
     * @return array<string, mixed>
     */
    public static function update(Connection $db, string $table, string $id, string $farmId, string $actor, string $action, array $body): array
    {
        $values = Input::parse(self::UPDATE, $body);
        if ($values === []) {
            throw ApiError::validation('Nothing to change');
        }

        Farms::assertOwns($db, $table, $id, $farmId);

        return $db->transaction(function () use ($db, $table, $id, $farmId, $actor, $action, $values) {
            $db->table($table)->where('id', $id)->update($values);
            Farms::audit($db, $actor, $action, $id, $farmId);

            return Rows::one($db->table($table)->where('id', $id)->first());
        });
    }

    /**
     * @return list<array<string, mixed>>
     */
    public static function list(Connection $db, string $table, string $farmId, bool $activeOnly = false): array
    {
        return Rows::all($db->table($table)
            ->where('farm_id', $farmId)
            ->when($activeOnly, fn ($q) => $q->where('active', true))
            ->orderBy('name')
            ->get($activeOnly ? ['id', 'name', 'unit'] : ['id', 'name', 'unit', 'active']));
    }
}
