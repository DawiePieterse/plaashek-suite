import assert from "node:assert/strict";
import test from "node:test";
import { claims, pairTokenFromPath } from "./ticket.ts";

const base64url = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");

test("claims reads farm, device, modules, language and expiry off a ticket", () => {
  const exp = Math.floor(Date.now() / 1000) + 60;
  const payload = { farm_id: "farm-1", sub: "device-1", modules: ["boord"], lang: "en", season: "season-1", exp };
  const ticket = `${base64url({ alg: "EdDSA" })}.${base64url(payload)}.sig`;

  assert.deepEqual(claims(ticket), {
    farmId: "farm-1",
    deviceId: "device-1",
    modules: ["boord"],
    language: "en",
    seasonId: "season-1",
    expiresAt: new Date(exp * 1000),
  });
});

test("pairTokenFromPath picks the token out of the printed slip's URL, and only there", () => {
  assert.equal(pairTokenFromPath("/pair/abc-123"), "abc-123");
  assert.equal(pairTokenFromPath("/pair/abc?x=1"), "abc");
  assert.equal(pairTokenFromPath("/"), null);
  assert.equal(pairTokenFromPath("/pairing/abc"), null);
});
