const assert = require("assert/strict");

const baseUrl = String(process.env.REHEARSAL_BASE_URL || "http://127.0.0.1:8765").replace(/\/+$/, "");
const adminPin = process.env.REHEARSAL_ADMIN_PIN || process.env.ADMIN_PIN || "";
const writeEnabled = process.env.REHEARSAL_WRITE === "1";
const playerName = process.env.REHEARSAL_PLAYER_NAME || `리허설학생${Date.now()}`;

async function fetchText(pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  assert.equal(response.status, 200, `${pathname} should return 200`);
  return response.text();
}

async function assertAppRoute(pathname) {
  const html = await fetchText(pathname);
  assert.ok(html.includes("app.js"), `${pathname} should return the app shell`);
  console.log(`[PASS] ${pathname}`);
}

async function api(action, body = {}) {
  const response = await fetch(`${baseUrl}/api/app?action=${encodeURIComponent(action)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  assert.equal(payload.ok, true, `${action} failed: ${payload.error || response.status}`);
  console.log(`[PASS] api:${action}`);
  return payload;
}

async function runReadOnlyChecks() {
  const routes = [
    "/",
    "/ranking",
    "/team-ranking",
    "/monthly",
    "/mission/truth",
    "/hidden/forest-cache-1",
    "/boss",
    "/exchange/1",
    "/admin/print/qr",
    "/admin/print/equipment",
    "/admin/print/exchange",
    "/admin/print/checklist"
  ];
  for (const route of routes) await assertAppRoute(route);

  const svgResponse = await fetch(`${baseUrl}/api/app?action=qr-svg&text=${encodeURIComponent(`${baseUrl}/mission/truth`)}`);
  assert.equal(svgResponse.status, 200, "qr-svg should return 200");
  assert.match(await svgResponse.text(), /<svg/);
  console.log("[PASS] api:qr-svg");

  const state = await api("state");
  assert.ok(state.program?.programMode, "state must include program config");
  assert.equal(state.armor.length, 6, "state must include 6 equipment items");

  if (adminPin) {
    const admin = await api("admin", { pin: adminPin });
    assert.ok(Array.isArray(admin.players), "admin must include players");
    assert.ok(Array.isArray(admin.missionStats), "admin must include mission stats");
  } else {
    console.log("[SKIP] admin check; set REHEARSAL_ADMIN_PIN");
  }
}

async function runWriteChecks() {
  if (!writeEnabled) {
    console.log("[SKIP] write checks; set REHEARSAL_WRITE=1 to create rehearsal data");
    return;
  }
  const created = await api("create-player", { name: playerName, team: "리허설", gender: "male" });
  assert.equal(created.me.name, playerName);
  assert.match(created.me.accessCode, /^\d{4}$/);

  const firstClaim = await api("claim-qr", { playerId: created.me.id, code: "mission-truth" });
  assert.equal(firstClaim.claimed, true);

  const secondClaim = await api("claim-qr", { playerId: created.me.id, code: "mission-truth" });
  assert.equal(secondClaim.alreadyClaimed, true);
  assert.equal(secondClaim.results.length, 0);
}

async function main() {
  console.log(`Rehearsal target: ${baseUrl}`);
  await runReadOnlyChecks();
  await runWriteChecks();
  console.log("Rehearsal passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
