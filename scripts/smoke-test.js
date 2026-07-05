const assert = require("assert/strict");
const { spawn } = require("child_process");
const fs = require("fs/promises");
const path = require("path");

const SMOKE_PORT = Number(process.env.SMOKE_PORT || 18765);
const SMOKE_PIN = process.env.SMOKE_ADMIN_PIN || "smoke-pin";
const SMOKE_DATA_FILE = path.resolve(process.env.SMOKE_DATA_FILE || path.join(process.cwd(), ".data", "smoke-db.json"));

process.env.NODE_ENV = "test-file";
process.env.DATA_FILE = SMOKE_DATA_FILE;
process.env.ADMIN_PIN = SMOKE_PIN;

const { resetLocalData } = require("../server/store");
const { createEmptyData, expireBooths } = require("../server/core");

const baseUrl = `http://127.0.0.1:${SMOKE_PORT}`;

async function call(action, body = {}) {
  const response = await fetch(`${baseUrl}/api/app?action=${encodeURIComponent(action)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!payload.ok) throw new Error(`${action}: ${payload.error}`);
  return payload;
}

async function waitForServer(child) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) break;
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Smoke server did not start on ${baseUrl}`);
}

function startSmokeServer() {
  const child = spawn(process.execPath, ["scripts/dev-server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(SMOKE_PORT),
      NODE_ENV: "test-file",
      DATA_FILE: SMOKE_DATA_FILE,
      ADMIN_PIN: SMOKE_PIN
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  return child;
}

function stopSmokeServer(child) {
  if (child && child.exitCode === null) child.kill();
}

function firstTradeItem(player) {
  for (const [armor, row] of Object.entries(player.inventory)) {
    for (const grade of ["B", "A", "S"]) {
      if (row[grade] > 0) return { armor, grade };
    }
  }
  throw new Error(`No trade item for ${player.name}`);
}

async function run() {
  await fs.mkdir(path.dirname(SMOKE_DATA_FILE), { recursive: true });
  await resetLocalData();
  const child = startSmokeServer();
  try {
    const expiryData = createEmptyData();
    expiryData.exchangeSessions["1"].status = "waiting";
    expiryData.exchangeSessions["1"].player1Id = "p_test";
    expiryData.exchangeSessions["1"].expiresAt = "2000-01-01T00:00:00.000Z";
    assert.deepEqual(expireBooths(expiryData, "2000-01-01T00:00:01.000Z"), ["1"]);
    assert.equal(expiryData.exchangeSessions["1"].status, "empty");

    await waitForServer(child);

    const a = await call("create-player", { name: "SmokeA", team: "1", gender: "male" });
    const b = await call("create-player", { name: "SmokeB", team: "1", gender: "female" });
    assert.equal(a.me.name, "SmokeA");
    assert.equal(b.me.name, "SmokeB");
    assert.match(a.me.accessCode, /^\d{4}$/);

    const aItem1 = await call("admin-adjust-item", { pin: SMOKE_PIN, playerId: a.me.id, armor: "sword", grade: "B", delta: 1 });
    assert.equal(aItem1.player.inventory.sword.B, 1);
    const aItem2 = await call("admin-adjust-item", { pin: SMOKE_PIN, playerId: a.me.id, armor: "sword", grade: "B", delta: 1 });
    const aBeforeUpgrade = aItem2.players.find((player) => player.id === a.me.id);
    assert.equal(aBeforeUpgrade.inventory.sword.B, 2);
    assert.equal(aBeforeUpgrade.inventory.sword.A, 0);
    const aItem3 = await call("admin-adjust-item", { pin: SMOKE_PIN, playerId: a.me.id, armor: "sword", grade: "B", delta: 1 });
    const aAfterUpgrade = aItem3.players.find((player) => player.id === a.me.id);
    assert.equal(aAfterUpgrade.inventory.sword.B, 0);
    assert.equal(aAfterUpgrade.inventory.sword.A, 1);

    const draw = await call("draw", { playerId: b.me.id, count: 3 });
    assert.equal(draw.results.length, 3);
    assert.ok(draw.me.ownedArmorCount > 0);

    const qr = await call("claim-qr", { playerId: a.me.id, code: "mission-truth" });
    assert.equal(qr.results.length, 1);
    assert.ok(qr.claimedQrCodes.includes("mission-truth"));
    const duplicateQr = await call("claim-qr", { playerId: a.me.id, code: "mission-truth" });
    assert.equal(duplicateQr.alreadyClaimed, true);
    assert.equal(duplicateQr.results.length, 0);

    const cleanRoute = await fetch(`${baseUrl}/exchange/1`);
    assert.equal(cleanRoute.status, 200);

    const freshA = (await call("state", { playerId: a.me.id })).me;
    const freshB = (await call("state", { playerId: b.me.id })).me;
    const aOffer = firstTradeItem(freshA);
    const bOffer = firstTradeItem(freshB);

    await call("exchange-join", { boothId: "1", playerId: freshA.id });
    await call("exchange-join", { boothId: "1", playerId: freshB.id });
    await call("exchange-select", { boothId: "1", playerId: freshA.id, items: [aOffer] });
    await call("exchange-select", { boothId: "1", playerId: freshB.id, items: [bOffer] });
    const waiting = await call("exchange-confirm", { boothId: "1", playerId: freshA.id });
    assert.notEqual(waiting.booth.status, "completed");
    const completed = await call("exchange-confirm", { boothId: "1", playerId: freshB.id });
    assert.equal(completed.booth.status, "completed");

    const ranking = await call("ranking");
    assert.equal(ranking.ranking.length, 2);
    assert.ok(ranking.ranking[0].equipmentPower >= ranking.ranking[1].equipmentPower);

    const admin = await call("admin", { pin: SMOKE_PIN });
    assert.equal(admin.players.length, 2);
    assert.equal(admin.booths.length, 2);

    console.log("Smoke test passed");
  } finally {
    stopSmokeServer(child);
    await resetLocalData();
    await fs.rm(SMOKE_DATA_FILE, { force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
