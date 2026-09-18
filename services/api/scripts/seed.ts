/**
 * Mooiplaas: a demo farm modelled on the Bekfontein pilot (ADR 0001), for the
 * Phase 1 exit checklist — see infra/seed/README.md. Not real Bekfontein data
 * (none exists yet per ADR 0001) — just its known shape: litchi, peak picking
 * 1 Sep - 31 Dec. Re-runnable: wipes and recreates everything under the demo
 * organisation.
 */
import { fileURLToPath } from "node:url";
import {
  assets,
  auditLog,
  captureTables,
  blocks,
  camps,
  deviceAssignments,
  deviceModules,
  devices,
  entitlements,
  farmMemberships,
  farms,
  heldWrites,
  organisations,
  pairingTokens,
  people,
  pieceRates,
  seasons,
} from "@plaashek/schema";
import { eq, inArray } from "drizzle-orm";
import { hashPassword } from "../src/auth/password.js";
import { createDb } from "../src/db.js";

const ORG_NAME = "Demo Organisasie";
const FARM_NAME = "Mooiplaas";
const ADMIN_EMAIL = "admin@mooiplaas.test";
const OWNER_EMAIL = "eienaar@mooiplaas.test";
const PASSWORD = "mooi1234";

/** The farm's screen language, chosen at setup: `pnpm seed --lang=en`. Office and phones both follow it. */
const LANGUAGE = process.argv.find((arg) => arg.startsWith("--lang="))?.slice("--lang=".length) ?? "af";
if (LANGUAGE !== "af" && LANGUAGE !== "en") throw new Error(`Unknown --lang: ${LANGUAGE} (af or en)`);

/** Licensed, plus one deliberately left out so the unlicensed-QR-fails test has something to fail against. */
const LICENSED = ["veldnotas", "boord", "span", "stoor"];
const UNLICENSED = "kudde";

try {
  process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
} catch {
  // No .env — fall through to whatever the process already has.
}

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) throw new Error("Missing required env var: DATABASE_URL");

const db = createDb(databaseUrl);

async function wipeDemoData() {
  const demoOrgs = await db.select({ id: organisations.id }).from(organisations).where(eq(organisations.name, ORG_NAME));
  if (demoOrgs.length === 0) return;

  const orgIds = demoOrgs.map((o) => o.id);
  const demoFarms = await db.select({ id: farms.id }).from(farms).where(inArray(farms.organisationId, orgIds));
  const farmIds = demoFarms.map((f) => f.id);

  if (farmIds.length > 0) {
    const demoDevices = await db.select({ id: devices.id }).from(devices).where(inArray(devices.farmId, farmIds));
    const deviceIds = demoDevices.map((d) => d.id);

    // Children first — device rows are referenced by assignments, tokens and modules.
    if (deviceIds.length > 0) {
      await db.delete(deviceModules).where(inArray(deviceModules.deviceId, deviceIds));
      await db.delete(pairingTokens).where(inArray(pairingTokens.deviceId, deviceIds));
      await db.delete(deviceAssignments).where(inArray(deviceAssignments.deviceId, deviceIds));
    }
    // Workspace rows carry no foreign key to farms (plan §6: no cross-farm FKs),
    // so nothing cascades — `captureTables` is the list every new module joins.
    for (const table of captureTables) {
      await db.delete(table).where(inArray(table.farmId, farmIds));
    }
    await db.delete(pieceRates).where(inArray(pieceRates.farmId, farmIds));
    await db.delete(heldWrites).where(inArray(heldWrites.farmId, farmIds));

    await db.delete(devices).where(inArray(devices.farmId, farmIds));
    await db.delete(auditLog).where(inArray(auditLog.farmId, farmIds));
    await db.delete(entitlements).where(inArray(entitlements.farmId, farmIds));
    await db.delete(farmMemberships).where(inArray(farmMemberships.farmId, farmIds));
    await db.delete(people).where(inArray(people.farmId, farmIds));
    await db.delete(camps).where(inArray(camps.farmId, farmIds));
    await db.delete(blocks).where(inArray(blocks.farmId, farmIds));
    await db.delete(assets).where(inArray(assets.farmId, farmIds));
    await db.delete(seasons).where(inArray(seasons.farmId, farmIds));
    await db.delete(farms).where(inArray(farms.id, farmIds));
  }

  await db.delete(organisations).where(inArray(organisations.id, orgIds));
}

async function seed() {
  const [org] = await db.insert(organisations).values({ name: ORG_NAME }).returning();
  const [farm] = await db.insert(farms).values({ organisationId: org.id, name: FARM_NAME, language: LANGUAGE }).returning();

  // Stamp names only — field workers never log in (plan §3.1).
  const staffNames = ["Anna April", "Piet Plaas", "Sannie Snyman", "Jan Jantjies"];
  const staffPeople = await db.insert(people).values(staffNames.map((name) => ({ farmId: farm.id, name }))).returning();

  const [adminPerson] = await db.insert(people).values({ farmId: farm.id, name: "Bestuurder Botha" }).returning();
  const [ownerPerson] = await db.insert(people).values({ farmId: farm.id, name: "Eienaar Erasmus" }).returning();

  const passwordHash = hashPassword(PASSWORD);
  await db.insert(farmMemberships).values([
    { farmId: farm.id, personId: adminPerson.id, email: ADMIN_EMAIL, passwordHash, role: "admin" },
    { farmId: farm.id, personId: ownerPerson.id, email: OWNER_EMAIL, passwordHash, role: "owner" },
  ]);

  const insertedBlocks = await db
    .insert(blocks)
    .values([
      { farmId: farm.id, name: "Blok A" },
      { farmId: farm.id, name: "Blok B" },
    ])
    .returning();

  await db.insert(camps).values([
    { farmId: farm.id, blockId: insertedBlocks[0].id, name: "Kamp A1" },
    { farmId: farm.id, blockId: insertedBlocks[0].id, name: "Kamp A2" },
    { farmId: farm.id, blockId: insertedBlocks[1].id, name: "Kamp B1" },
  ]);

  await db.insert(assets).values([
    { farmId: farm.id, name: "Trekker" },
    { farmId: farm.id, name: "Pakhuis" },
  ]);

  // Peak litchi picking window per ADR 0001 (Bekfontein pilot).
  const year = new Date().getUTCFullYear();
  await db.insert(seasons).values({
    farmId: farm.id,
    name: `Lietsjie-oes ${year}`,
    startsOn: `${year}-09-01`,
    endsOn: `${year}-12-31`,
    isActive: true,
  });

  await db.insert(entitlements).values(LICENSED.map((moduleCode) => ({ farmId: farm.id, moduleCode, status: "active" as const })));

  return { farm, staffPeople };
}

await wipeDemoData();
const { farm, staffPeople } = await seed();

console.log(`Seeded "${FARM_NAME}" (farm_id ${farm.id})`);
console.log(`  admin login: ${ADMIN_EMAIL} / ${PASSWORD}`);
console.log(`  owner login: ${OWNER_EMAIL} / ${PASSWORD}`);
console.log(`  language:    ${LANGUAGE}`);
console.log(`  licensed:    ${LICENSED.join(", ")}`);
console.log(`  unlicensed:  ${UNLICENSED}  (use this to test that pairing fails)`);
console.log(`  people:      ${staffPeople.map((p) => `${p.name} (${p.id})`).join("\n               ")}`);

process.exit(0);
