<?php

namespace App\Http\Controllers;

use App\Logic\Csv;
use App\Logic\FarmDay;
use App\Logic\Numbers;
use App\Logic\Piecework;
use App\Support\Rows;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Excel export for the office tools (plan §10 offboarding, §12 Phase 4): one CSV per module, raw, one row
 * per capture. Excel opens CSV natively; whoever opens it pairs and totals however their own books work.
 */
final class ExportController extends Controller
{
    public function notes(Request $request): Response
    {
        $rows = $this->captures($request, 'notes')
            ->leftJoin('blocks', 'blocks.id', '=', 'notes.block_id')
            ->get(['notes.id', 'notes.created_at', 'people.name as person', 'blocks.name as block', 'seasons.name as season', 'notes.body',
                'notes.latitude', 'notes.longitude', 'notes.weather_temp', 'notes.weather_humidity', 'notes.weather_condition']);

        return $this->csv('veldnotas.csv',
            ['id', 'created_at', 'person', 'block', 'season', 'body', 'latitude', 'longitude', 'weather_temp', 'weather_humidity', 'weather_condition'],
            $rows->map(fn (object $r) => [$r->id, Rows::iso($r->created_at), $r->person, $r->block, $r->season, $r->body, $r->latitude, $r->longitude, $r->weather_temp, $r->weather_humidity, $r->weather_condition]),
        );
    }

    public function harvest(Request $request): Response
    {
        $rows = $this->captures($request, 'harvest_events')
            ->leftJoin('blocks', 'blocks.id', '=', 'harvest_events.block_id')
            ->get(['harvest_events.id', 'harvest_events.created_at', 'people.name as person', 'blocks.name as block', 'seasons.name as season',
                'harvest_events.weight_kg', 'harvest_events.deduction_kg', 'harvest_events.weather_temp', 'harvest_events.weather_humidity', 'harvest_events.weather_condition']);

        return $this->csv('boord.csv',
            ['id', 'created_at', 'person', 'block', 'season', 'weight_kg', 'deduction_kg', 'weather_temp', 'weather_humidity', 'weather_condition'],
            $rows->map(fn (object $r) => [$r->id, Rows::iso($r->created_at), $r->person, $r->block, $r->season, $r->weight_kg, $r->deduction_kg, $r->weather_temp, $r->weather_humidity, $r->weather_condition]),
        );
    }

    /** Span's punches, one row each, not the paired hours Eienaar shows (docs/span-build-scope.md). */
    public function attendance(Request $request): Response
    {
        $rows = $this->captures($request, 'attendance_punches')
            ->get(['attendance_punches.id', 'attendance_punches.created_at', 'people.name as person', 'attendance_punches.direction', 'seasons.name as season',
                'attendance_punches.latitude', 'attendance_punches.longitude']);

        return $this->csv('span.csv',
            ['id', 'created_at', 'person', 'direction', 'season', 'latitude', 'longitude'],
            $rows->map(fn (object $r) => [$r->id, Rows::iso($r->created_at), $r->person, $r->direction, $r->season, $r->latitude, $r->longitude]),
        );
    }

    /** Stoor's ledger, one row per move, not the on-hand total (docs/stoor-build-scope.md). */
    public function stock(Request $request): Response
    {
        $rows = $this->captures($request, 'stock_moves')
            ->leftJoin('stock_items', 'stock_items.id', '=', 'stock_moves.item_id')
            ->leftJoin('blocks', 'blocks.id', '=', 'stock_moves.block_id')
            ->get(['stock_moves.id', 'stock_moves.created_at', 'people.name as person', 'stock_items.name as item', 'stock_items.unit',
                'stock_moves.direction', 'stock_moves.quantity', 'blocks.name as block', 'seasons.name as season', 'stock_moves.note']);

        return $this->csv('stoor.csv',
            ['id', 'created_at', 'person', 'item', 'unit', 'direction', 'quantity', 'block', 'season', 'note'],
            $rows->map(fn (object $r) => [$r->id, Rows::iso($r->created_at), $r->person, $r->item, $r->unit, $r->direction, $r->quantity, $r->block, $r->season, $r->note]),
        );
    }

    /** Water's readings, one row each, not the latest-plus-delta (docs/water-build-scope.md). */
    public function water(Request $request): Response
    {
        $rows = $this->captures($request, 'meter_readings', withSeason: false)
            ->leftJoin('water_points', 'water_points.id', '=', 'meter_readings.water_point_id')
            ->get(['meter_readings.id', 'meter_readings.created_at', 'people.name as person', 'water_points.name as point', 'water_points.unit',
                'meter_readings.reading', 'meter_readings.note']);

        return $this->csv('water.csv',
            ['id', 'created_at', 'person', 'point', 'unit', 'reading', 'note'],
            $rows->map(fn (object $r) => [$r->id, Rows::iso($r->created_at), $r->person, $r->point, $r->unit, $r->reading, $r->note]),
        );
    }

    /** Werkswinkel's job log, one row per opened or closed event, not paired. */
    public function workOrders(Request $request): Response
    {
        $rows = $this->captures($request, 'work_orders', withSeason: false)
            ->leftJoin('assets', 'assets.id', '=', 'work_orders.asset_id')
            ->get(['work_orders.id', 'work_orders.created_at', 'people.name as person', 'assets.name as asset', 'work_orders.event', 'work_orders.description']);

        return $this->csv('werkswinkel.csv',
            ['id', 'created_at', 'person', 'asset', 'event', 'description'],
            $rows->map(fn (object $r) => [$r->id, Rows::iso($r->created_at), $r->person, $r->asset, $r->event, $r->description]),
        );
    }

    /** Fuel fill-ups, raw: no derived litres-per-hour (docs/werkswinkel-build-scope.md). */
    public function fuel(Request $request): Response
    {
        $rows = $this->captures($request, 'fuel_logs', withSeason: false)
            ->leftJoin('assets', 'assets.id', '=', 'fuel_logs.asset_id')
            ->get(['fuel_logs.id', 'fuel_logs.created_at', 'people.name as person', 'assets.name as asset', 'fuel_logs.litres', 'fuel_logs.meter_reading', 'fuel_logs.note']);

        return $this->csv('brandstof.csv',
            ['id', 'created_at', 'person', 'asset', 'litres', 'meter_reading', 'note'],
            $rows->map(fn (object $r) => [$r->id, Rows::iso($r->created_at), $r->person, $r->asset, $r->litres, $r->meter_reading, $r->note]),
        );
    }

    /**
     * The file payroll uses (ADR 0010): one row per picker per day, with the rate in force that day beside
     * it so the rand can be checked rather than trusted. Crates whose card never resolved are in here too,
     * with an empty picker and the scanned code: work the office still has to place.
     *
     * Not a payslip, and not a minimum-wage check: a seasonal picker has no hours (ADR 0008, ADR 0010).
     */
    public function piecework(Request $request): Response
    {
        $farmId = $this->staff($request)->farmId;
        $db = $this->db();

        $crates = $db->table('harvest_events')
            ->leftJoin('people', 'people.id', '=', 'harvest_events.picker_id')
            ->leftJoin('seasons', 'seasons.id', '=', 'harvest_events.season_id')
            ->where('harvest_events.farm_id', $farmId)
            ->orderBy('harvest_events.created_at')
            ->get(['harvest_events.created_at', 'harvest_events.picker_id', 'people.name as picker', 'harvest_events.picker_card_code',
                'seasons.name as season', 'harvest_events.season_id', 'harvest_events.weight_kg', 'harvest_events.deduction_kg']);

        $ratesBySeason = collect(PieceworkController::rateRows($db, $farmId))->groupBy('seasonId');

        // Picker and day is the pay unit: the tier is daily, and rounding happens once per day.
        $buckets = [];
        foreach ($crates as $crate) {
            $day = FarmDay::key($crate->created_at);
            $key = ($crate->picker_id ?? 'card:'.($crate->picker_card_code ?? 'none'))."|{$day}";
            $buckets[$key] ??= [
                'day' => $day,
                'picker' => $crate->picker,
                'cardCode' => $crate->picker_card_code,
                'season' => $crate->season,
                'seasonId' => $crate->season_id,
                'kg' => 0,
            ];
            $buckets[$key]['kg'] += Piecework::netKg($crate->weight_kg, $crate->deduction_kg);
        }

        $rows = array_values($buckets);
        // Day, then named pickers, then the day's unplaced crates at the bottom where payroll sees them.
        usort($rows, fn ($a, $b) => strcmp($a['day'], $b['day'])
            ?: (int) ($a['picker'] === null) - (int) ($b['picker'] === null)
            ?: Numbers::compareNames($a['picker'] ?? $a['cardCode'] ?? '', $b['picker'] ?? $b['cardCode'] ?? ''));

        return $this->csv('stukwerk.csv',
            ['day', 'picker', 'card_code', 'season', 'net_kg', 'base_cents_per_kg', 'target_kg', 'bonus_cents_per_kg', 'cents', 'rand'],
            array_map(function (array $bucket) use ($ratesBySeason) {
                $rate = Piecework::rateOn($bucket['day'], $ratesBySeason[$bucket['seasonId'] ?? ''] ?? []);
                // No picker, no pay line: the kilograms are real, whose they are is not yet known.
                $cents = $rate && $bucket['picker'] !== null ? Piecework::dayCents($bucket['kg'], $rate) : null;

                return [
                    $bucket['day'],
                    $bucket['picker'],
                    $bucket['cardCode'],
                    $bucket['season'],
                    Numbers::round2($bucket['kg']),
                    $rate['baseCentsPerKg'] ?? null,
                    $rate['targetKg'] ?? null,
                    $rate['bonusCentsPerKg'] ?? null,
                    $cents,
                    $cents === null ? null : number_format($cents / 100, 2, '.', ''),
                ];
            }, $rows),
        );
    }

    /**
     * One capture table joined to who made each row and, for season-stamped ones, the season, oldest
     * first.
     */
    private function captures(Request $request, string $table, bool $withSeason = true): Builder
    {
        return $this->db()->table($table)
            ->leftJoin('people', 'people.id', '=', "{$table}.created_by")
            ->when($withSeason, fn (Builder $q) => $q->leftJoin('seasons', 'seasons.id', '=', "{$table}.season_id"))
            ->where("{$table}.farm_id", $this->staff($request)->farmId)
            ->orderBy("{$table}.created_at");
    }

    /**
     * @param  list<string>  $headers
     * @param  iterable<list<mixed>>  $rows
     */
    private function csv(string $filename, array $headers, iterable $rows): Response
    {
        return Csv::download($filename, Csv::make($headers, $rows));
    }
}
