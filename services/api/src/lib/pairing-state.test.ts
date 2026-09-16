import assert from "node:assert/strict";
import test from "node:test";
import { pairingTokenState, type PairingTokenRow } from "./pairing-state.js";

function row(overrides: Partial<PairingTokenRow>): PairingTokenRow {
  return {
    id: "token-1",
    deviceId: "device-1",
    moduleCode: "boord",
    token: "abc",
    printedAt: new Date("2026-01-01T00:00:00Z"),
    printedBy: "staff-1",
    expiresAt: new Date("2026-01-03T00:00:00Z"),
    usedAt: null,
    cancelledAt: null,
    ...overrides,
  };
}

test("pending: not used, not cancelled, not yet expired", () => {
  const now = new Date("2026-01-02T00:00:00Z");
  assert.equal(pairingTokenState(row({}), now), "pending");
});

test("used takes priority once set", () => {
  const now = new Date("2026-01-02T00:00:00Z");
  assert.equal(pairingTokenState(row({ usedAt: new Date("2026-01-01T12:00:00Z") }), now), "used");
});

test("cancelled when cancelledAt is set and not used", () => {
  const now = new Date("2026-01-02T00:00:00Z");
  assert.equal(pairingTokenState(row({ cancelledAt: new Date("2026-01-01T12:00:00Z") }), now), "cancelled");
});

test("expired at the exact expiry instant", () => {
  const expiresAt = new Date("2026-01-03T00:00:00Z");
  assert.equal(pairingTokenState(row({ expiresAt }), expiresAt), "expired");
});

test("expired after the expiry instant", () => {
  const expiresAt = new Date("2026-01-03T00:00:00Z");
  const now = new Date("2026-01-03T00:00:01Z");
  assert.equal(pairingTokenState(row({ expiresAt }), now), "expired");
});
