import assert from "node:assert/strict";
import test from "node:test";
import { latestReadingPerAsset, type Reading } from "./water.js";

function reading(assetId: string, assetName: string, value: number, at: string, note: string | null = null): Reading {
  return { assetId, assetName, personName: "Anna April", reading: value, note, at: new Date(at) };
}

test("keeps only the latest reading per asset", () => {
  const [a] = latestReadingPerAsset([
    reading("a", "Boorgat 1", 120, "2026-06-01T04:00:00Z"),
    reading("a", "Boorgat 1", 135, "2026-06-02T04:00:00Z"),
  ]);

  assert.equal(a.reading, 135);
  assert.equal(a.at, "2026-06-02T04:00:00.000Z");
});

test("readings need not arrive in time order — a phone can sync a whole day at once", () => {
  const [a] = latestReadingPerAsset([
    reading("a", "Boorgat 1", 135, "2026-06-02T04:00:00Z"),
    reading("a", "Boorgat 1", 120, "2026-06-01T04:00:00Z"),
  ]);

  assert.equal(a.reading, 135);
});

test("groups per asset, sorted by name, carries the note through", () => {
  const rows = latestReadingPerAsset([
    reading("b", "Tenk B", 40, "2026-06-01T04:00:00Z", "laag"),
    reading("a", "Boorgat 1", 120, "2026-06-01T04:00:00Z"),
  ]);

  assert.deepEqual(
    rows.map((r) => [r.assetName, r.reading, r.note]),
    [
      ["Boorgat 1", 120, null],
      ["Tenk B", 40, "laag"],
    ],
  );
});
