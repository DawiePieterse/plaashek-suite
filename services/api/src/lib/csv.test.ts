import assert from "node:assert/strict";
import test from "node:test";
import { parseCsv, toCsv } from "./csv.js";

test("reads back what we write, BOM and all", () => {
  const rows = parseCsv(toCsv(["worker_number", "name"], [["014", "Sara Sithole"]]));
  assert.deepEqual(rows, [{ worker_number: "014", name: "Sara Sithole" }]);
});

test("quoted cells keep their commas and quotes", () => {
  const rows = parseCsv('worker_number,name\r\n7,"Sithole, Sara ""Sara"""\r\n');
  assert.equal(rows[0]["name"], 'Sithole, Sara "Sara"');
});

test("headers arrive however the farm's own file spells them", () => {
  const rows = parseCsv("Worker Number,Full-Name\n9,Piet\n");
  assert.deepEqual(rows, [{ worker_number: "9", full_name: "Piet" }]);
});

test("blank lines and a missing trailing newline are not rows", () => {
  assert.equal(parseCsv("a,b\n1,2\n\n3,4").length, 2);
});

test("a header-only file has no rows", () => {
  assert.deepEqual(parseCsv("worker_number,name\n"), []);
});
