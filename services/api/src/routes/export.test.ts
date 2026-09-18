import assert from "node:assert/strict";
import test from "node:test";
import {
  assets,
  attendancePunches,
  blocks,
  devices,
  fuelLogs,
  harvestEvents,
  meterReadings,
  notes,
  people,
  pieceRates,
  seasons,
  stockItems,
  stockMoves,
  waterPoints,
  workOrders,
} from "@plaashek/schema";
import { signStaffSession } from "../auth/staff-jwt.js";
import { buildTestApp } from "../test/app.js";
import { withTestDb } from "../test/db.js";
import { seedFarm } from "../test/fixtures.js";

test("GET /export/notes.csv scopes to the farm and quotes a comma in the body", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, membership } = await seedFarm(db);
    const { farm: otherFarm, person: otherPerson } = await seedFarm(db);

    const [block] = await db.insert(blocks).values({ farmId: farm.id, name: "Blok A" }).returning();
    const [device] = await db.insert(devices).values({ farmId: farm.id }).returning();
    const [otherDevice] = await db.insert(devices).values({ farmId: otherFarm.id }).returning();

    await db.insert(notes).values([
      { farmId: farm.id, moduleCode: "veldnotas", createdBy: person.id, deviceId: device.id, blockId: block.id, body: "Rooi vrugte, min reën" },
      { farmId: otherFarm.id, moduleCode: "veldnotas", createdBy: otherPerson.id, deviceId: otherDevice.id, body: "Other farm's note" },
    ]);

    const token = await signStaffSession({ farmMembershipId: membership.id, farmId: farm.id, role: "owner" }, deps.env.staffSessionSecret);
    const response = await app.inject({ method: "GET", url: "/export/notes.csv", headers: { authorization: `Bearer ${token}` } });

    assert.equal(response.statusCode, 200);
    assert.match(response.headers["content-type"] as string, /text\/csv/);
    const body = response.body;
    assert.match(body, /^﻿id,created_at,person,block,season,body,latitude,longitude,weather_temp,weather_humidity,weather_condition\r\n/);
    assert.match(body, /"Rooi vrugte, min reën"/);
    assert.equal(body.includes("Other farm's note"), false);
  });
});

test("GET /export/harvest.csv totals every capture for the farm, not just the active season", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, membership } = await seedFarm(db);

    const [block] = await db.insert(blocks).values({ farmId: farm.id, name: "Blok A" }).returning();
    const [device] = await db.insert(devices).values({ farmId: farm.id }).returning();

    await db.insert(harvestEvents).values([
      { farmId: farm.id, moduleCode: "boord", createdBy: person.id, deviceId: device.id, blockId: block.id, weightKg: 12.5 },
    ]);

    const token = await signStaffSession({ farmMembershipId: membership.id, farmId: farm.id, role: "admin" }, deps.env.staffSessionSecret);
    const response = await app.inject({ method: "GET", url: "/export/harvest.csv", headers: { authorization: `Bearer ${token}` } });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["content-disposition"], 'attachment; filename="boord.csv"');
    const lines = response.body.split("\r\n");
    assert.equal(lines[0], "﻿id,created_at,person,block,season,weight_kg,deduction_kg,weather_temp,weather_humidity,weather_condition");
    assert.match(lines[1], /,Blok A,,12\.5,,,,$/);
  });
});

test("GET /export/attendance.csv exports every punch for the farm, one row each", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, membership } = await seedFarm(db);
    const { farm: otherFarm, person: otherPerson } = await seedFarm(db);

    const [device] = await db.insert(devices).values({ farmId: farm.id }).returning();
    const [otherDevice] = await db.insert(devices).values({ farmId: otherFarm.id }).returning();

    await db.insert(attendancePunches).values([
      {
        farmId: farm.id,
        moduleCode: "span",
        createdBy: person.id,
        deviceId: device.id,
        direction: "in",
        createdAt: new Date("2026-11-02T04:00:00Z"),
        latitude: -25.75,
        longitude: 28.23,
      },
      {
        farmId: farm.id,
        moduleCode: "span",
        createdBy: person.id,
        deviceId: device.id,
        direction: "out",
        createdAt: new Date("2026-11-02T12:00:00Z"),
      },
      { farmId: otherFarm.id, moduleCode: "span", createdBy: otherPerson.id, deviceId: otherDevice.id, direction: "in" },
    ]);

    const token = await signStaffSession({ farmMembershipId: membership.id, farmId: farm.id, role: "admin" }, deps.env.staffSessionSecret);
    const response = await app.inject({ method: "GET", url: "/export/attendance.csv", headers: { authorization: `Bearer ${token}` } });

    assert.equal(response.statusCode, 200);
    // Not `trim()` first: that eats the UTF-8 BOM Excel needs (lib/csv.ts).
    const lines = response.body.split("\r\n").filter((line) => line !== "");
    assert.equal(lines[0], "\ufeffid,created_at,person,direction,season,latitude,longitude");
    // Two rows, this farm's only — the other farm's punch is not in the file.
    assert.equal(lines.length, 3);
    assert.match(lines[1], /,Person,in,,-25.75,28.23$/);
    assert.match(lines[2], /,Person,out,,,$/);
  });
});

test("GET /export/stock.csv exports every move for the farm, one row each", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, membership } = await seedFarm(db);
    const { farm: otherFarm, person: otherPerson } = await seedFarm(db);

    const [block] = await db.insert(blocks).values({ farmId: farm.id, name: "Blok A" }).returning();
    const [device] = await db.insert(devices).values({ farmId: farm.id }).returning();
    const [otherDevice] = await db.insert(devices).values({ farmId: otherFarm.id }).returning();
    const [item] = await db.insert(stockItems).values({ farmId: farm.id, name: "Glifosaat", unit: "L" }).returning();
    const [otherItem] = await db.insert(stockItems).values({ farmId: otherFarm.id, name: "Ander plaas s'n", unit: "L" }).returning();

    await db.insert(stockMoves).values([
      {
        farmId: farm.id,
        moduleCode: "stoor",
        createdBy: person.id,
        deviceId: device.id,
        itemId: item.id,
        direction: "out",
        quantity: 5,
        blockId: block.id,
        note: "Blaarluis",
        createdAt: new Date("2026-11-02T04:00:00Z"),
      },
      { farmId: otherFarm.id, moduleCode: "stoor", createdBy: otherPerson.id, deviceId: otherDevice.id, itemId: otherItem.id, direction: "in", quantity: 50 },
    ]);

    const token = await signStaffSession({ farmMembershipId: membership.id, farmId: farm.id, role: "admin" }, deps.env.staffSessionSecret);
    const response = await app.inject({ method: "GET", url: "/export/stock.csv", headers: { authorization: `Bearer ${token}` } });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["content-disposition"], 'attachment; filename="stoor.csv"');
    const lines = response.body.split("\r\n").filter((line) => line !== "");
    assert.equal(lines[0], "﻿id,created_at,person,item,unit,direction,quantity,block,season,note");
    assert.equal(lines.length, 2);
    assert.match(lines[1], /,Person,Glifosaat,L,out,5,Blok A,,Blaarluis$/);
  });
});

test("GET /export/water.csv exports every reading for the farm, one row each", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, membership } = await seedFarm(db);
    const [device] = await db.insert(devices).values({ farmId: farm.id }).returning();
    const [point] = await db.insert(waterPoints).values({ farmId: farm.id, name: "Boorgat 1", unit: "m³" }).returning();

    await db.insert(meterReadings).values({
      farmId: farm.id,
      moduleCode: "water",
      createdBy: person.id,
      deviceId: device.id,
      waterPointId: point.id,
      reading: 1250,
      createdAt: new Date("2026-06-01T04:00:00Z"),
    });

    const token = await signStaffSession({ farmMembershipId: membership.id, farmId: farm.id, role: "admin" }, deps.env.staffSessionSecret);
    const response = await app.inject({ method: "GET", url: "/export/water.csv", headers: { authorization: `Bearer ${token}` } });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["content-disposition"], 'attachment; filename="water.csv"');
    const lines = response.body.split("\r\n").filter((line) => line !== "");
    assert.equal(lines[0], "﻿id,created_at,person,point,unit,reading,note");
    assert.match(lines[1], /,Person,Boorgat 1,m³,1250,$/);
  });
});

test("GET /export/work-orders.csv and GET /export/fuel.csv export raw events for the farm", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, membership } = await seedFarm(db);
    const [device] = await db.insert(devices).values({ farmId: farm.id }).returning();
    const [asset] = await db.insert(assets).values({ farmId: farm.id, name: "Trekker" }).returning();

    await db.insert(workOrders).values({
      farmId: farm.id,
      moduleCode: "werkswinkel",
      createdBy: person.id,
      deviceId: device.id,
      assetId: asset.id,
      event: "opened",
      description: "Band pap",
      createdAt: new Date("2026-06-01T04:00:00Z"),
    });
    await db.insert(fuelLogs).values({
      farmId: farm.id,
      moduleCode: "werkswinkel",
      createdBy: person.id,
      deviceId: device.id,
      assetId: asset.id,
      litres: 45.5,
      meterReading: 12345,
      createdAt: new Date("2026-06-02T04:00:00Z"),
    });

    const token = await signStaffSession({ farmMembershipId: membership.id, farmId: farm.id, role: "admin" }, deps.env.staffSessionSecret);

    const workOrdersCsv = await app.inject({ method: "GET", url: "/export/work-orders.csv", headers: { authorization: `Bearer ${token}` } });
    assert.equal(workOrdersCsv.statusCode, 200);
    const workOrderLines = workOrdersCsv.body.split("\r\n").filter((line) => line !== "");
    assert.equal(workOrderLines[0], "﻿id,created_at,person,asset,event,description");
    assert.match(workOrderLines[1], /,Person,Trekker,opened,Band pap$/);

    const fuelCsv = await app.inject({ method: "GET", url: "/export/fuel.csv", headers: { authorization: `Bearer ${token}` } });
    assert.equal(fuelCsv.statusCode, 200);
    const fuelLines = fuelCsv.body.split("\r\n").filter((line) => line !== "");
    assert.equal(fuelLines[0], "﻿id,created_at,person,asset,litres,meter_reading,note");
    assert.match(fuelLines[1], /,Person,Trekker,45.5,12345,$/);
  });
});

test("GET /export/piecework.csv prices each picker's day and keeps the unplaced crates in the file", async () => {
  await withTestDb(async (db) => {
    const { app, deps } = await buildTestApp(db);
    const { farm, person, membership } = await seedFarm(db);

    const [block] = await db.insert(blocks).values({ farmId: farm.id, name: "Blok A" }).returning();
    const [device] = await db.insert(devices).values({ farmId: farm.id }).returning();
    const [season] = await db
      .insert(seasons)
      .values({ farmId: farm.id, name: "Lietsjie 2026", startsOn: "2026-09-01", endsOn: "2026-12-31", isActive: true })
      .returning();
    const [picker] = await db.insert(people).values({ farmId: farm.id, name: "Sara Sithole", kind: "seasonal" }).returning();

    await db.insert(pieceRates).values({
      farmId: farm.id,
      seasonId: season.id,
      effectiveFrom: "2026-09-01",
      baseCentsPerKg: 250,
      targetKg: 100,
      bonusCentsPerKg: 400,
    });

    const crate = (weightKg: number, at: string, extra: Record<string, unknown> = {}) => ({
      farmId: farm.id,
      moduleCode: "boord",
      seasonId: season.id,
      createdBy: person.id,
      deviceId: device.id,
      blockId: block.id,
      weightKg,
      createdAt: new Date(at),
      ...extra,
    });

    await db.insert(harvestEvents).values([
      crate(70, "2026-09-10T06:00:00Z", { pickerId: picker.id }),
      crate(50, "2026-09-10T11:00:00Z", { pickerId: picker.id }),
      crate(8, "2026-09-10T12:00:00Z", { pickerCardCode: "ZZZZ9999" }),
    ]);

    const token = await signStaffSession({ farmMembershipId: membership.id, farmId: farm.id, role: "admin" }, deps.env.staffSessionSecret);
    const response = await app.inject({ method: "GET", url: "/export/piecework.csv", headers: { authorization: `Bearer ${token}` } });

    assert.equal(response.statusCode, 200);
    const lines = response.body.split("\r\n").filter((line) => line !== "");
    assert.equal(lines[0], "\ufeffday,picker,card_code,season,net_kg,base_cents_per_kg,target_kg,bonus_cents_per_kg,cents,rand");
    // 120kg in one day: 100 at 250c + 20 at 400c = R330.00, on one row.
    assert.equal(lines[1], "2026-09-10,Sara Sithole,,Lietsjie 2026,120,250,100,400,33000,330.00");
    // The unplaced crate is still in the file, with its code and no pay line.
    assert.equal(lines[2], "2026-09-10,,ZZZZ9999,Lietsjie 2026,8,250,100,400,,");
  });
});
