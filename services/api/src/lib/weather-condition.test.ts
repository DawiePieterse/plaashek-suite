import assert from "node:assert/strict";
import test from "node:test";
import { weatherCondition } from "./weather-condition.js";

test("maps known WMO codes to short words", () => {
  assert.equal(weatherCondition(0), "clear");
  assert.equal(weatherCondition(61), "rain");
  assert.equal(weatherCondition(95), "thunderstorm");
});

test("falls back to unknown rather than throwing on an unmapped code", () => {
  assert.equal(weatherCondition(-1), "unknown");
});
