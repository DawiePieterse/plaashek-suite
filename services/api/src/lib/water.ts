/**
 * Turns the meter-reading stream into what the office actually asks for —
 * the latest reading per asset (docs/water-build-scope.md). Derived at read
 * time, never stored: a late-syncing phone changes the answer.
 */

export interface Reading {
  assetId: string;
  assetName: string;
  personName: string;
  reading: number;
  note: string | null;
  at: Date;
}

export interface AssetReading {
  assetId: string;
  assetName: string;
  reading: number;
  note: string | null;
  personName: string;
  at: string;
}

/** The most recent reading per asset — readings need not be in time order on the way in, a phone can sync a whole day at once. */
export function latestReadingPerAsset(readings: Reading[]): AssetReading[] {
  const latest = new Map<string, Reading>();

  for (const reading of readings) {
    const current = latest.get(reading.assetId);
    if (!current || reading.at.getTime() > current.at.getTime()) latest.set(reading.assetId, reading);
  }

  return [...latest.values()]
    .sort((a, b) => a.assetName.localeCompare(b.assetName))
    .map((reading) => ({
      assetId: reading.assetId,
      assetName: reading.assetName,
      reading: reading.reading,
      note: reading.note,
      personName: reading.personName,
      at: reading.at.toISOString(),
    }));
}
