import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, verifyPassword } from "./password.js";

test("verifyPassword accepts the correct password", () => {
  const stored = hashPassword("correct-horse-battery-staple");
  assert.equal(verifyPassword("correct-horse-battery-staple", stored), true);
});

test("verifyPassword rejects a wrong password", () => {
  const stored = hashPassword("correct-horse-battery-staple");
  assert.equal(verifyPassword("wrong-password", stored), false);
});

test("verifyPassword rejects a malformed stored value", () => {
  assert.equal(verifyPassword("anything", "not-a-valid-stored-hash"), false);
});
