<?php

namespace App\Farm;

/**
 * Every table holding captured field data, one row per capture, each carrying the workspace stamp
 * (plan §6). A new module adds its table here once, and everything that sweeps "all captures" follows.
 */
final class CaptureTables
{
    public const ALL = ['notes', 'harvest_events', 'attendance_punches', 'stock_moves', 'meter_readings', 'work_orders', 'fuel_logs'];

    /**
     * The ones that must carry a season. Water and Werkswinkel are season-less (plan §6), so "captures
     * without a season" is a question only these can be asked.
     */
    public const SEASON_STAMPED = ['notes', 'harvest_events', 'attendance_punches', 'stock_moves'];
}
