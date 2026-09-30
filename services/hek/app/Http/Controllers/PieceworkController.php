<?php

namespace App\Http\Controllers;

use App\Farm\Farms;
use App\Farm\WorkerNumbers;
use App\Http\ApiError;
use App\Http\Input;
use App\Logic\Csv;
use App\Logic\FarmDay;
use App\Logic\Numbers;
use App\Logic\Piecework;
use App\Support\Rows;
use Illuminate\Database\Connection;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Str;

/** Seasonal piece-work (docs/piecework-build-scope.md, ADR 0009 to 0011). */
final class PieceworkController extends Controller
{
    /** The farm's own number: any shape a payroll uses; only its uniqueness on the farm is ours. */
    private const WORKER_NUMBER = 'string|trim|min:1|max:32';

    private const WORKER_NAME = 'string|trim|min:1|max:120';

    /**
     * The seasonal register: numbered pickers, in number order.
     *
     * @return array<string, mixed>
     */
    public function workers(Request $request): array
    {
        return ['workers' => $this->seasonal($this->staff($request)->farmId)
            ->get(['id', 'name', 'worker_number', 'active'])
            ->map(fn (object $p) => ['personId' => $p->id, 'name' => $p->name, 'workerNumber' => $p->worker_number, 'active' => (bool) $p->active])
            ->all()];
    }

    /**
     * The office types the number (ADR 0011); we only check it is not already someone else's.
     *
     * @return array<string, mixed>
     */
    public function createWorker(Request $request): array
    {
        $staff = $this->staff($request);
        $body = Input::parse(['workerNumber' => self::WORKER_NUMBER, 'name' => self::WORKER_NAME], $this->body($request));
        $number = WorkerNumbers::normalise($body['workerNumber']);
        $db = $this->db();

        if (self::numberTaken($db, $staff->farmId, $number)) {
            throw ApiError::conflict('worker_number_taken', "Another worker already has number {$number}");
        }

        return $db->transaction(function () use ($db, $staff, $body, $number) {
            $id = (string) Str::uuid7();
            $db->table('people')->insert(['id' => $id, 'farm_id' => $staff->farmId, 'name' => $body['name'], 'kind' => 'seasonal', 'worker_number' => $number]);
            Farms::audit($db, $staff->farmMembershipId, 'register_seasonal_worker', $id, $staff->farmId);

            return ['person' => Rows::one($db->table('people')->where('id', $id)->first())];
        });
    }

    /**
     * Fix a typo, renumber someone, or mark a worker who left. Crates already captured keep their
     * person, and `picker_card_code` still shows the number scanned at the time.
     *
     * @return array<string, mixed>
     */
    public function updateWorker(Request $request, string $personId): array
    {
        $staff = $this->staff($request);
        $body = Input::parse([
            'workerNumber' => 'optional|'.self::WORKER_NUMBER,
            'name' => 'optional|'.self::WORKER_NAME,
            'active' => 'optional|boolean',
        ], $this->body($request));
        if ($body === []) {
            throw ApiError::validation('Nothing to change');
        }

        $db = $this->db();
        if (! Str::isUuid($personId) || ! $db->table('people')->where('id', $personId)->where('farm_id', $staff->farmId)->where('kind', 'seasonal')->exists()) {
            throw ApiError::notFound();
        }

        $number = isset($body['workerNumber']) ? WorkerNumbers::normalise($body['workerNumber']) : null;
        if ($number && self::numberTaken($db, $staff->farmId, $number, $personId)) {
            throw ApiError::conflict('worker_number_taken', "Another worker already has number {$number}");
        }

        return $db->transaction(function () use ($db, $staff, $personId, $body, $number) {
            $db->table('people')->where('id', $personId)->update(array_filter([
                'name' => $body['name'] ?? null,
                'worker_number' => $number,
                'active' => $body['active'] ?? null,
            ], fn ($v) => $v !== null));

            Farms::audit($db, $staff->farmMembershipId, 'edit_seasonal_worker', $personId, $staff->farmId);

            return ['person' => Rows::one($db->table('people')->where('id', $personId)->first())];
        });
    }

    /** The register as CSV, keyed on the farm's own number (ADR 0011). */
    public function exportWorkers(Request $request): Response
    {
        $workers = $this->seasonal($this->staff($request)->farmId)->get(['worker_number', 'name', 'active']);

        return Csv::download('werkers.csv', Csv::make(
            ['worker_number', 'name', 'active'],
            $workers->map(fn (object $w) => [$w->worker_number, $w->name, $w->active ? 'yes' : 'no']),
        ));
    }

    /**
     * The same file back: `worker_number` decides who each row is, so a known number is updated and a new
     * one added. Nothing is deleted: a worker missing from the file has not resigned. A row the farm
     * cannot act on is reported back by code, and the rows around it still land.
     *
     * @return array<string, mixed>
     */
    public function import(Request $request): array
    {
        $staff = $this->staff($request);
        $text = str_starts_with((string) $request->header('content-type'), 'text/csv') ? $request->getContent() : '';
        $rows = Csv::parse($text);
        $db = $this->db();

        $byNumber = $db->table('people')->where('farm_id', $staff->farmId)->where('kind', 'seasonal')->whereNotNull('worker_number')
            ->pluck('id', 'worker_number')->all();

        $skipped = [];
        $seen = [];
        $created = 0;
        $updated = 0;

        $db->transaction(function () use ($db, $staff, $rows, $byNumber, &$skipped, &$seen, &$created, &$updated) {
            foreach ($rows as $index => $row) {
                // The header is row 1 in the file the office is looking at.
                $line = $index + 2;
                $number = WorkerNumbers::normalise($row['worker_number'] ?? $row['number'] ?? '');
                $name = trim($row['name'] ?? $row['full_name'] ?? '');
                $active = ! preg_match('/^(no|nee|false|0|inactive)$/i', $row['active'] ?? '');

                if ($number === '') {
                    $skipped[] = ['row' => $line, 'reason' => 'no_number'];

                    continue;
                }
                if ($name === '') {
                    $skipped[] = ['row' => $line, 'reason' => 'no_name'];

                    continue;
                }
                if (isset($seen[$number])) {
                    $skipped[] = ['row' => $line, 'reason' => 'duplicate_number', 'workerNumber' => $number];

                    continue;
                }
                $seen[$number] = true;

                if (isset($byNumber[$number])) {
                    $db->table('people')->where('id', $byNumber[$number])->update(['name' => $name, 'active' => $active]);
                    $updated++;
                } else {
                    $db->table('people')->insert(['id' => (string) Str::uuid7(), 'farm_id' => $staff->farmId, 'name' => $name, 'kind' => 'seasonal', 'worker_number' => $number, 'active' => $active]);
                    $created++;
                }
            }

            Farms::audit($db, $staff->farmMembershipId, 'import_seasonal_workers', $staff->farmId, $staff->farmId);
        });

        return ['created' => $created, 'updated' => $updated, 'skipped' => $skipped];
    }

    /**
     * The phone's copy of the register, so a scan resolves with no signal. Ticket-gated: it names the
     * farm's workers.
     *
     * @return array<string, mixed>
     */
    public function pickers(Request $request): array
    {
        return ['pickers' => $this->db()->table('people')
            ->where('farm_id', $this->device($request)->farmId)
            ->where('kind', 'seasonal')
            ->where('active', true)
            ->whereNotNull('worker_number')
            ->orderBy('worker_number')
            ->get(['worker_number', 'id', 'name'])
            ->map(fn (object $p) => ['workerNumber' => $p->worker_number, 'personId' => $p->id, 'personName' => $p->name])
            ->all()];
    }

    /**
     * @return array<string, mixed>
     */
    public function rates(Request $request): array
    {
        $farmId = $this->staff($request)->farmId;
        $db = $this->db();

        $season = Farms::activeSeason($db, $farmId);
        if (! $season) {
            return ['season' => null, 'rates' => []];
        }

        return [
            'season' => ['id' => $season['id'], 'name' => $season['name']],
            'rates' => array_map(fn (array $r) => self::tidyRate($r), Rows::all($db->table('piece_rates')->where('farm_id', $farmId)->where('season_id', $season['id'])->orderByDesc('effective_from')->get())),
        ];
    }

    /**
     * A rate change is a new row, never an edit: last week keeps the rate it was picked under (ADR 0010).
     *
     * @return array<string, mixed>
     */
    public function createRate(Request $request): array
    {
        $staff = $this->staff($request);
        $body = Input::parse([
            'effectiveFrom' => 'date',
            'baseCentsPerKg' => 'int|positive',
            'targetKg' => 'optional|nullable|number|positive',
            'bonusCentsPerKg' => 'optional|nullable|int|positive',
        ], $this->body($request));

        // Half a tier is a rate nobody can apply: both sides of it or neither.
        if ((($body['targetKg'] ?? null) === null) !== (($body['bonusCentsPerKg'] ?? null) === null)) {
            throw ApiError::validation('targetKg and bonusCentsPerKg must be set together');
        }

        $db = $this->db();
        $season = Farms::activeSeason($db, $staff->farmId);
        if (! $season) {
            throw ApiError::notFound('No active season to set a rate for');
        }

        return $db->transaction(function () use ($db, $staff, $body, $season) {
            $id = (string) Str::uuid7();
            $db->table('piece_rates')->insert([
                'id' => $id,
                'farm_id' => $staff->farmId,
                'season_id' => $season['id'],
                'effective_from' => $body['effectiveFrom'],
                'base_cents_per_kg' => $body['baseCentsPerKg'],
                'target_kg' => $body['targetKg'] ?? null,
                'bonus_cents_per_kg' => $body['bonusCentsPerKg'] ?? null,
            ]);

            Farms::audit($db, $staff->farmMembershipId, 'set_piece_rate', $id, $staff->farmId);

            return ['rate' => self::tidyRate(Rows::one($db->table('piece_rates')->where('id', $id)->first()))];
        });
    }

    /**
     * Kilograms and rand per picker for a period, the active season by default. Derived at read time
     * (ADR 0010): pull it again after a late sync rather than trusting yesterday's copy.
     *
     * @return array<string, mixed>
     */
    public function payout(Request $request): array
    {
        $farmId = $this->staff($request)->farmId;
        $query = Input::parse(['from' => 'optional|date', 'to' => 'optional|date'], $request->query());
        $db = $this->db();

        $season = Farms::activeSeason($db, $farmId);
        if (! $season) {
            return ['season' => null, 'from' => null, 'to' => null, 'people' => [], 'unattributedCrates' => 0, 'unattributedKg' => 0];
        }

        $from = $query['from'] ?? $season['startsOn'];
        $to = $query['to'] ?? $season['endsOn'];

        $crates = $db->table('harvest_events')
            ->leftJoin('people', 'people.id', '=', 'harvest_events.picker_id')
            ->where('harvest_events.farm_id', $farmId)
            ->where('harvest_events.season_id', $season['id'])
            ->where('harvest_events.created_at', '>=', Rows::db(FarmDay::start($from)))
            ->where('harvest_events.created_at', '<=', Rows::db(FarmDay::end($to)))
            ->get(['harvest_events.picker_id', 'people.name as picker_name', 'harvest_events.created_at', 'harvest_events.weight_kg', 'harvest_events.deduction_kg']);

        $attributed = [];
        $unattributedCrates = 0;
        $unattributedKg = 0;

        foreach ($crates as $crate) {
            $kg = Piecework::netKg($crate->weight_kg, $crate->deduction_kg);
            // A crate whose card never resolved is still work the office has to place: counted, not dropped.
            if (! $crate->picker_id || ! $crate->picker_name) {
                $unattributedCrates++;
                $unattributedKg += $kg;

                continue;
            }
            $attributed[] = ['pickerId' => $crate->picker_id, 'pickerName' => $crate->picker_name, 'at' => $crate->created_at, 'netKg' => $kg];
        }

        return [
            'season' => ['id' => $season['id'], 'name' => $season['name']],
            'from' => $from,
            'to' => $to,
            'people' => Piecework::rollUp($attributed, self::rateRows($db, $farmId, $season['id'])),
            'unattributedCrates' => $unattributedCrates,
            'unattributedKg' => Numbers::round2($unattributedKg),
        ];
    }

    /**
     * Crates the office still has to place: a card was scanned but matched nobody.
     *
     * @return array<string, mixed>
     */
    public function unattributed(Request $request): array
    {
        return ['crates' => $this->db()->table('harvest_events')
            ->where('farm_id', $this->staff($request)->farmId)
            ->whereNull('picker_id')
            ->whereNotNull('picker_card_code')
            ->orderByDesc('created_at')
            ->limit(200)
            ->get(['id', 'created_at', 'weight_kg', 'picker_card_code'])
            ->map(fn (object $c) => ['id' => $c->id, 'createdAt' => Rows::iso($c->created_at), 'weightKg' => Numbers::tidy($c->weight_kg), 'scannedNumber' => $c->picker_card_code])
            ->all()];
    }

    /**
     * Rates for one season, or every season when `$seasonId` is null, in the shape Piecework reads.
     *
     * @return list<array<string, mixed>>
     */
    public static function rateRows(Connection $db, string $farmId, ?string $seasonId = null): array
    {
        return $db->table('piece_rates')
            ->where('farm_id', $farmId)
            ->when($seasonId !== null, fn ($q) => $q->where('season_id', $seasonId))
            ->get(['season_id', 'effective_from', 'base_cents_per_kg', 'target_kg', 'bonus_cents_per_kg'])
            ->map(fn (object $r) => [
                'seasonId' => $r->season_id,
                'effectiveFrom' => $r->effective_from,
                'baseCentsPerKg' => (int) $r->base_cents_per_kg,
                'targetKg' => $r->target_kg === null ? null : Numbers::tidy($r->target_kg),
                'bonusCentsPerKg' => $r->bonus_cents_per_kg === null ? null : (int) $r->bonus_cents_per_kg,
            ])
            ->all();
    }

    private function seasonal(string $farmId): Builder
    {
        return $this->db()->table('people')->where('farm_id', $farmId)->where('kind', 'seasonal')->orderBy('worker_number')->orderBy('name');
    }

    /** A number belongs to one worker on a farm (ADR 0011). `$exceptPersonId` lets an edit keep its own. */
    private static function numberTaken(Connection $db, string $farmId, string $number, ?string $exceptPersonId = null): bool
    {
        return $db->table('people')
            ->where('farm_id', $farmId)
            ->where('worker_number', $number)
            ->when($exceptPersonId !== null, fn ($q) => $q->where('id', '!=', $exceptPersonId))
            ->exists();
    }

    /**
     * @param  array<string, mixed>  $rate
     * @return array<string, mixed>
     */
    private static function tidyRate(array $rate): array
    {
        if ($rate['targetKg'] !== null) {
            $rate['targetKg'] = Numbers::tidy($rate['targetKg']);
        }

        return $rate;
    }
}
