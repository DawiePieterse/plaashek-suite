<?php

namespace App\Logic;

use App\Support\Rows;

/**
 * A job's lifecycle is two append-only rows paired at read time (docs/werkswinkel-build-scope.md).
 * Nothing derived is stored: a `closed` that arrives late changes the answer.
 */
final class WorkOrders
{
    /**
     * Pairs each `opened` with the next `closed` for the same asset, oldest first. A `closed` with
     * nothing open is ignored; an asset can have more than one job open at once.
     *
     * @param  iterable<array{assetId: string, assetName: string, event: string, description: ?string, at: string}>  $events
     * @return list<array{assetId: string, assetName: string, description: ?string, openedAt: string}>
     */
    public static function open(iterable $events): array
    {
        $byAsset = [];
        foreach ($events as $event) {
            $byAsset[$event['assetId']][] = $event;
        }

        $open = [];
        foreach ($byAsset as $own) {
            usort($own, fn ($a, $b) => self::ms($a['at']) <=> self::ms($b['at']));
            $queue = [];

            foreach ($own as $event) {
                if ($event['event'] === 'opened') {
                    $queue[] = $event;
                } else {
                    array_shift($queue);
                }
            }

            foreach ($queue as $event) {
                $open[] = ['assetId' => $event['assetId'], 'assetName' => $event['assetName'], 'description' => $event['description'], 'openedAt' => Rows::iso($event['at'])];
            }
        }

        usort($open, fn ($a, $b) => self::ms($a['openedAt']) <=> self::ms($b['openedAt']));

        return $open;
    }

    private static function ms(string $at): int
    {
        return (int) Rows::time($at)->getPreciseTimestamp(3);
    }
}
