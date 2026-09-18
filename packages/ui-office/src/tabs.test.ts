import assert from "node:assert/strict";
import test from "node:test";
import { officeTabs } from "./tabs.js";

const ids = (modules: string[]) => officeTabs(modules, "af").map((tab) => tab.id);

test("a module tab appears only when the farm is licensed for it", () => {
  assert.deepEqual(ids(["veldnotas", "boord", "span"]), ["veldnotas", "boord", "span", "farm"]);
  assert.deepEqual(ids(["boord"]), ["boord", "farm"]);
});

test("tabs keep the build order, whatever order the licences come back in", () => {
  assert.deepEqual(ids(["span", "veldnotas", "boord"]), ["veldnotas", "boord", "span", "farm"]);
});

test("a licensed module with no office panel yet is not a tab", () => {
  // `eienaar` is the owner tool itself, not a field module; `kudde` has no
  // panel. Neither should draw an empty tab.
  assert.deepEqual(ids(["veldnotas", "eienaar", "kudde"]), ["veldnotas", "farm"]);
});

test("a farm with nothing licensed still has its settings", () => {
  assert.deepEqual(ids([]), ["farm"]);
});

test("the farm settings tab is labelled in the farm's language", () => {
  assert.equal(officeTabs([], "af").at(-1)?.label, "Plaasinstellings");
  assert.equal(officeTabs([], "en").at(-1)?.label, "Farm settings");
});
