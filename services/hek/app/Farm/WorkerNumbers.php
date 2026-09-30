<?php

namespace App\Farm;

/**
 * The farm's own number for a worker (ADR 0011): typed by the office, printed on the card, and the join
 * key its payment system already uses. We never generate it, so we do not choose its shape either.
 */
final class WorkerNumbers
{
    /**
     * What a supervisor typed or a scanner read, reduced to what the office stored. Case and the spaces
     * or hyphens a card reader adds are noise; leading zeros are not ("014" and "14" differ in a payroll).
     */
    public static function normalise(string $raw): string
    {
        return (string) preg_replace('/[\s-]/u', '', mb_strtoupper(trim($raw)));
    }
}
