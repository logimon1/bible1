const assert = require("assert/strict");
const { spawn } = require("child_process");
const fs = require("fs/promises");
const net = require("net");
const path = require("path");

const SMOKE_PORT = Number(process.env.SMOKE_PORT || 18765);
const SMOKE_PIN = process.env.SMOKE_ADMIN_PIN || "smoke-pin";
const SMOKE_DATA_FILE = path.resolve(process.env.SMOKE_DATA_FILE || path.join(process.cwd(), ".data", "smoke-db.json"));

process.env.NODE_ENV = "test-file";
process.env.DATA_FILE = SMOKE_DATA_FILE;
process.env.ADMIN_PIN = SMOKE_PIN;
process.env.EVENT_ENDS_AT = "";
process.env.THE_WAR_OPENS_AT = "";

const { BACKUP_DATA_FILE, isRetryablePostgresError, resetLocalData, withData } = require("../server/store");
const { createEmptyData, expireBooths } = require("../server/core");
const { eventWindow, warWindow, isServiceError } = require("../server/api");

const baseUrl = `http://127.0.0.1:${SMOKE_PORT}`;

function rawHttpRequest(requestText, port = SMOKE_PORT) {
  return new Promise((resolve, reject) => {
    let response = "";
    const socket = net.createConnection({ host: "127.0.0.1", port }, () => socket.write(requestText));
    socket.setEncoding("utf8");
    socket.setTimeout(3000, () => socket.destroy(new Error("raw HTTP request timed out")));
    socket.on("data", (chunk) => { response += chunk; });
    socket.on("end", () => resolve(response));
    socket.on("error", reject);
  });
}

async function testLocalBackupRecovery() {
  assert.equal(BACKUP_DATA_FILE, `${SMOKE_DATA_FILE}.bak`);
  await resetLocalData();
  await withData(async (data) => {
    data.eventLogs.push({ id: "backup_seed", action: "backup-seed" });
  });
  await withData(async (data) => {
    data.eventLogs.push({ id: "latest_only", action: "latest-only" });
  });
  await fs.writeFile(SMOKE_DATA_FILE, "{broken-json", "utf8");

  const recoveredIds = await withData(async (data) => data.eventLogs.map((log) => log.id), { readOnly: true });
  assert.ok(recoveredIds.includes("backup_seed"), "손상된 주 파일은 직전 백업에서 복구되어야 합니다.");
  assert.equal(recoveredIds.includes("latest_only"), false, "백업 이후의 미완료 스냅샷은 복구 데이터에 섞이면 안 됩니다.");

  await withData(async (data) => {
    data.eventLogs.push({ id: "after_recovery", action: "after-recovery" });
  });
  const repaired = JSON.parse(await fs.readFile(SMOKE_DATA_FILE, "utf8"));
  assert.ok(repaired.eventLogs.some((log) => log.id === "backup_seed"));
  assert.ok(repaired.eventLogs.some((log) => log.id === "after_recovery"));
}

async function call(action, body = {}, origin = baseUrl) {
  const response = await fetch(`${origin}/api/app?action=${encodeURIComponent(action)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!payload.ok) {
    const error = new Error(`${action}: ${payload.error}`);
    error.code = payload.code;
    throw error;
  }
  return payload;
}

function assertWarSystemShape(payload) {
  const team = payload?.team;
  if (!team) return;
  const war = team.war;
  assert.ok(war && typeof war === "object", "team.war must be exposed");
  assert.ok(["locked", "roster", "scan", "assign", "ready"].includes(war.phase));
  assert.equal(Number.isInteger(war.scannedCount), true);
  assert.equal(Number.isInteger(war.requiredCount), true);
  assert.equal(typeof war.meScanned, "boolean");
  assert.equal(typeof war.allScanned, "boolean");
  assert.equal(typeof war.rolesComplete, "boolean");
  assert.equal(Number.isInteger(war.assignedCount), true);
  assert.equal(Number.isInteger(war.myRoleCount), true);
  assert.ok(Array.isArray(war.assignments));
  assert.equal(war.assignments.length, 6);
  assert.deepEqual(
    war.assignments.map((assignment) => assignment.armor),
    ["belt", "breastplate", "shoes", "shield", "helmet", "sword"]
  );
  assert.ok(war.assignments.every((assignment) => (
    typeof assignment.armorName === "string"
      && typeof assignment.warRole === "string"
      && (assignment.playerId === null || typeof assignment.playerId === "string")
      && typeof assignment.playerName === "string"
  )));
  assert.ok(Array.isArray(war.members));
  assert.ok(war.members.every((member) => (
    typeof member.id === "string"
      && typeof member.name === "string"
      && typeof member.scanned === "boolean"
      && Array.isArray(member.assignedArmorCodes)
  )));
}

function inventoryProgress(inventory, armorCode) {
  const row = inventory?.[armorCode] || {};
  return Number(row.B || 0) + Number(row.A || 0) * 3 + Number(row.S || 0) * 9;
}

async function assertCollectiveProgress(members, team) {
  const currentMembers = [];
  for (const member of members) currentMembers.push((await call("state", { playerId: member.id })).me);
  for (const armor of team.armorProgress || []) {
    const armorCode = armor.armor || armor.code;
    const expected = Math.min(9, currentMembers.reduce((sum, member) => sum + inventoryProgress(member.inventory, armorCode), 0));
    assert.equal(armor.progress, expected, `${armorCode} progress must combine every roster member inventory`);
  }
  return currentMembers;
}

async function testFiveMemberWarFlow(players) {
  assert.equal(players.length, 5);
  const [first, second, third, fourth, fifth] = players;
  const initial = await call("team-state", { playerId: first.id });
  assertWarSystemShape(initial);
  assert.equal(initial.team.war.phase, "scan");
  assert.equal(initial.team.war.scannedCount, 0);
  assert.equal(initial.team.war.requiredCount, 5);
  assert.equal(initial.team.war.allScanned, false);
  assert.equal(initial.team.war.rolesComplete, false);
  assert.ok(initial.team.war.assignments.every((assignment) => assignment.playerId === null));

  await assert.rejects(
    () => call("team-war-role", { playerId: first.id, armorCode: "belt", selected: true }),
    /모든 (파티원|조원)이 QR 스캔/
  );
  for (const action of ["qr-state", "claim-qr"]) {
    await assert.rejects(
      () => call(action, { playerId: first.id, code: "mission-judgment" }),
      /모든 (파티원|조원)이 THE WAR QR 스캔/
    );
  }

  const firstScan = await call("team-war-scan", { playerId: first.id });
  assertWarSystemShape(firstScan);
  assert.equal(firstScan.team.war.scannedCount, 1);
  assert.equal(firstScan.team.war.meScanned, true);
  assert.equal(firstScan.team.war.allScanned, false);
  const duplicateFirstScan = await call("team-war-scan", { playerId: first.id });
  assert.equal(duplicateFirstScan.team.war.scannedCount, 1, "a repeated scan must be idempotent");
  assert.equal(duplicateFirstScan.team.war.allScanned, false);

  let completedScan = duplicateFirstScan;
  for (const player of [second, third, fourth, fifth]) {
    completedScan = await call("team-war-scan", { playerId: player.id });
  }
  assertWarSystemShape(completedScan);
  assert.equal(completedScan.team.war.phase, "assign");
  assert.equal(completedScan.team.war.scannedCount, 5);
  assert.equal(completedScan.team.war.requiredCount, 5);
  assert.equal(completedScan.team.war.allScanned, true);
  assert.ok(completedScan.team.war.scanCompletedAt);
  assert.ok(completedScan.team.war.assembly?.character);
  assert.ok(completedScan.team.war.members.every((member) => member.scanned));
  const completedAt = completedScan.team.war.scanCompletedAt;
  const assemblyCalculatedAt = completedScan.team.war.assembly.calculatedAt;
  const duplicateCompletedScan = await call("team-war-scan", { playerId: fifth.id });
  assert.equal(duplicateCompletedScan.team.war.scannedCount, 5);
  assert.equal(duplicateCompletedScan.team.war.scanCompletedAt, completedAt);
  assert.equal(duplicateCompletedScan.team.war.assembly.calculatedAt, assemblyCalculatedAt);

  for (const action of ["qr-state", "claim-qr"]) {
    await assert.rejects(
      () => call(action, { playerId: first.id, code: "mission-judgment" }),
      /6개 파트의 담당을 모두 정한 뒤/
    );
  }

  let roleState = await call("team-war-role", { playerId: first.id, armorCode: "belt", selected: true });
  assert.equal(roleState.team.war.assignedCount, 1);
  const duplicateRoleSelection = await call("team-war-role", { playerId: first.id, armorCode: "belt", selected: true });
  assert.equal(duplicateRoleSelection.team.war.assignedCount, 1, "selecting my existing role must be idempotent");
  roleState = await call("team-war-role", { playerId: first.id, armorCode: "breastplate", selected: true });
  assert.equal(roleState.team.war.myRoleCount, 2);
  await call("team-war-role", { playerId: second.id, armorCode: "shoes", selected: true });

  await assert.rejects(
    () => call("team-war-role", { playerId: third.id, armorCode: "belt", selected: true }),
    /이미 맡은 파트/
  );
  await assert.rejects(
    () => call("team-war-role", { playerId: first.id, armorCode: "shield", selected: true }),
    /최대 2개 파트/
  );
  await assert.rejects(
    () => call("team-war-role", { playerId: second.id, armorCode: "shield", selected: true }),
    /모든 (파티원|조원)이 최소 1개 파트/
  );

  await call("team-war-role", { playerId: third.id, armorCode: "shield", selected: true });
  await call("team-war-role", { playerId: fourth.id, armorCode: "helmet", selected: true });
  const ready = await call("team-war-role", { playerId: fifth.id, armorCode: "sword", selected: true });
  assertWarSystemShape(ready);
  assert.equal(ready.team.war.phase, "ready");
  assert.equal(ready.team.war.assignedCount, 6);
  assert.equal(ready.team.war.rolesComplete, true);
  assert.ok(ready.team.war.rolesCompletedAt);
  assert.deepEqual(
    ready.team.war.members.map((member) => member.assignedArmorCodes.length),
    [2, 1, 1, 1, 1]
  );
  assert.ok(ready.team.war.members.every((member) => member.assignedArmorCodes.length >= 1 && member.assignedArmorCodes.length <= 2));
  await assert.rejects(
    () => call("qr-state", { playerId: second.id, code: "mission-judgment" }),
    /QR을 스캔할 수 있습니다/
  );
  const readiness = await call("qr-state", { playerId: first.id, code: "mission-judgment" });
  assert.equal(readiness.missionReadiness.qualified, false);
  assert.equal(readiness.missionReadiness.requiredPower, 50);
  assert.equal(readiness.missionReadiness.unpreparedMembers.length, 5);
  assert.match(readiness.missionReadiness.penalty.title, /전원 얼차려/);
  await assert.rejects(
    () => call("team-war-role", { playerId: first.id, armorCode: "belt", selected: false }),
    /배분이 완료/
  );
  const frozenRoles = await call("team-state", { playerId: first.id });
  assert.equal(frozenRoles.team.war.rolesComplete, true);
  assert.equal(frozenRoles.team.war.assignments.find((assignment) => assignment.armor === "belt").playerId, first.id);
  return ready.team;
}

async function createAndCompleteTeam(teamName, memberCount) {
  const created = [];
  for (let index = 1; index <= memberCount; index += 1) {
    created.push(await call("create-player", { name: `${teamName}-${index}`, team: teamName, gender: "male" }));
  }
  let members = [];
  for (const player of created) {
    const initial = await call("state", { playerId: player.me.id });
    assertWarSystemShape(initial);
    members.push(initial.me);
  }
  const openRoster = await call("team-state", { playerId: members[0].id });
  assert.equal(openRoster.team.rosterFinalized, false);
  assert.equal(openRoster.team.isLeader, true);
  assert.equal(openRoster.team.leaderPlayerId, members[0].id);
  assertWarSystemShape(openRoster);
  await assert.rejects(() => call("team-roster-finalize", { playerId: members[1].id }), /(파티장|조장)/);
  const claimedLeader = await call("team-leader-claim", { playerId: members[1].id });
  assert.equal(claimedLeader.team.isLeader, true);
  assert.equal(claimedLeader.team.leaderPlayerId, members[1].id);
  const formerLeader = await call("team-state", { playerId: members[0].id });
  assert.equal(formerLeader.team.isLeader, false);
  await assert.rejects(() => call("team-roster-finalize", { playerId: members[0].id }), /(파티장|조장)/);
  const reclaimedLeader = await call("team-leader-claim", { playerId: members[0].id });
  assert.equal(reclaimedLeader.team.isLeader, true);
  assert.equal(reclaimedLeader.team.leaderPlayerId, members[0].id);
  await assert.rejects(() => call("draw", { playerId: members[0].id, count: 1 }), /명단|확정/);
  const finalizedRoster = await call("team-roster-finalize", { playerId: members[0].id });
  assert.equal(finalizedRoster.team.rosterFinalized, true);
  assertWarSystemShape(finalizedRoster);
  const resumedAfterRoster = await call("create-player", { name: `${teamName}-1`, team: teamName, gender: "male" });
  assert.equal(resumedAfterRoster.me.id, members[0].id);
  if (memberCount === 6) {
    await assert.rejects(
      () => call("create-player", { name: `${teamName}-late`, team: teamName, gender: "male" }),
      /최대 인원|6명/
    );
  }

  const firstDraw = await call("claim-qr", { playerId: members[0].id, code: "draw-3" });
  assert.ok(firstDraw.results.length >= 1 && firstDraw.results.length <= 3);
  assertWarSystemShape(firstDraw);
  let granted = firstDraw.results.length;
  const armorCodes = ["belt", "breastplate", "shoes", "shield", "helmet", "sword"];
  const rawArmorCounts = Object.fromEntries(armorCodes.map((code) => [code, 0]));
  for (const result of firstDraw.results) rawArmorCounts[result.armor] += 1;
  let teamState = { team: firstDraw.team };
  for (let turn = 0; !teamState.team.ready && turn < 40; turn += 1) {
    const member = members[turn % members.length];
    const draw = await call("claim-qr", { playerId: member.id, code: "draw-3" });
    assert.ok(draw.results.length >= 1 && draw.results.length <= 3);
    assertWarSystemShape(draw);
    for (const result of draw.results) rawArmorCounts[result.armor] += 1;
    granted += draw.results.length;
    teamState = await call("team-state", { playerId: members[0].id });
    assertWarSystemShape(teamState);
  }
  assert.ok(granted >= 54, "all six armor sets must receive enough draws to complete");
  assert.ok(Object.values(rawArmorCounts).every((count) => count >= 9), "every armor slot must receive at least nine base draws");
  assert.equal(teamState.team.memberCount, memberCount);
  assert.equal(teamState.team.ready, true);
  assert.equal(teamState.team.character.completedArmorCount, 6);
  assert.equal(teamState.team.character.equipmentPower, 900);
  assert.ok(teamState.team.armorProgress.every((armor) => armor.completed && armor.progress === 9));
  members = await assertCollectiveProgress(members, teamState.team);
  for (const member of members) {
    const repeatDraw = await call("claim-qr", { playerId: member.id, code: "draw-3" });
    assert.ok(repeatDraw.results.length >= 0 && repeatDraw.results.length <= 3, "repeatable draw QR must never grant more than its configured count");
    assertWarSystemShape(repeatDraw);
  }
  return { members, team: teamState.team };
}

async function testConcurrentCollectiveDraws() {
  const players = [];
  for (let index = 1; index <= 4; index += 1) {
    players.push((await call("create-player", { name: `CollectiveDraw-${index}`, team: "CollectDraw" })).me);
  }
  const finalized = await call("team-roster-finalize", { playerId: players[0].id });
  assert.equal(finalized.team.rosterFinalized, true);
  const draws = await Promise.all(players.map((player) => call("draw", { playerId: player.id, count: 3 })));
  assert.equal(draws.reduce((sum, payload) => sum + payload.results.length, 0), 12);
  assert.ok(draws.every((payload) => {
    assertWarSystemShape(payload);
    return true;
  }));
  const team = (await call("team-state", { playerId: players[0].id })).team;
  await assertCollectiveProgress(players, team);
  return players;
}

async function testRosterLifecycle() {
  const players = [];
  for (let index = 1; index <= 3; index += 1) {
    players.push((await call("create-player", { name: `RosterFlow-${index}`, team: "RosterFlow" })).me);
  }
  await assert.rejects(
    () => call("team-roster-finalize", { playerId: players[0].id }),
    /4|6|명/
  );

  players.push((await call("create-player", { name: "RosterFlow-4", team: "RosterFlow" })).me);
  const fourMemberRoster = await call("team-roster-finalize", { playerId: players[0].id });
  assert.equal(fourMemberRoster.team.memberCount, 4);
  assert.equal(fourMemberRoster.team.rosterFinalized, true);
  assertWarSystemShape(fourMemberRoster);
  const recruited = (await call("create-player", { name: "RosterFlow-5", team: "RosterFlow", partyMode: "join" })).me;
  const afterRecruit = await call("team-state", { playerId: players[0].id });
  assert.equal(afterRecruit.team.memberCount, 5);
  assert.equal(afterRecruit.team.rosterFinalized, true, "THE WAR 스캔 전에는 확정된 조도 영입할 수 있어야 합니다.");
  assert.equal(afterRecruit.team.war.scannedCount, 0);
  const recruitLeave = await call("leave-team", { playerId: recruited.id });
  assert.equal(recruitLeave.remainingMemberCount, 4);
  assert.equal(recruitLeave.rosterFinalized, true, "4명 이상이면 탈퇴 뒤에도 조 확정 상태를 유지해야 합니다.");
  const immediateDraw = await call("draw", { playerId: players[0].id, count: 1 });
  assert.equal(immediateDraw.results.length, 1);
  assertWarSystemShape(immediateDraw);

  let fourMemberWar;
  for (const player of players) fourMemberWar = await call("team-war-scan", { playerId: player.id });
  assert.equal(fourMemberWar.team.war.allScanned, true);
  assert.equal(fourMemberWar.team.war.scannedCount, 4);
  const fourMemberDistribution = [
    [players[0], "belt"],
    [players[0], "breastplate"],
    [players[1], "shoes"],
    [players[1], "shield"],
    [players[2], "helmet"],
    [players[3], "sword"]
  ];
  for (const [player, armorCode] of fourMemberDistribution) {
    fourMemberWar = await call("team-war-role", { playerId: player.id, armorCode, selected: true });
  }
  assert.equal(fourMemberWar.team.war.rolesComplete, true);
  assert.equal(fourMemberWar.team.war.assignedCount, 6);
  assert.deepEqual(
    fourMemberWar.team.war.members.map((member) => member.assignedArmorCodes.length),
    [2, 2, 1, 1],
    "a four-member party must distribute all six parts with one or two per member"
  );

  await assert.rejects(
    () => call("team-roster-reopen", { playerId: players[0].id }),
    /알 수 없는 API 액션/
  );
  await assert.rejects(
    () => call("admin-reopen-team", { pin: SMOKE_PIN, teamKey: "RosterFlow" }),
    /THE WAR QR 스캔이 시작된 (파티|조)/
  );
  await assert.rejects(
    () => call("leave-team", { playerId: players[0].id }),
    /THE WAR QR 스캔이 시작된 뒤에는 탈퇴할 수 없습니다/
  );

  const fullTeam = [];
  for (let index = 1; index <= 6; index += 1) {
    fullTeam.push((await call("create-player", { name: `RosterFull-${index}`, team: "RosterFull" })).me);
  }
  await assert.rejects(
    () => call("create-player", { name: "RosterFull-7", team: "RosterFull" }),
    /최대 인원|6명/
  );
  const fullRoster = await call("team-roster-finalize", { playerId: fullTeam[0].id });
  assert.equal(fullRoster.team.memberCount, 6);
  return [...players, recruited, ...fullTeam];
}

async function testVoluntaryPartyLeave() {
  const players = [];
  for (let index = 1; index <= 3; index += 1) {
    players.push((await call("create-player", { name: `LeaveFlow-${index}`, team: "LeaveFlow" })).me);
  }
  const firstLeave = await call("leave-team", { playerId: players[0].id });
  assert.equal(firstLeave.remainingMemberCount, 2);
  const afterFirstLeave = await call("team-state", { playerId: players[1].id });
  assert.equal(afterFirstLeave.team.memberCount, 2);
  assert.equal(afterFirstLeave.team.isLeader, true, "leader departure must hand leadership to a remaining member");

  const secondLeave = await call("leave-team", { playerId: players[1].id });
  assert.equal(secondLeave.remainingMemberCount, 1);
  const afterSecondLeave = await call("team-state", { playerId: players[2].id });
  assert.equal(afterSecondLeave.team.isLeader, true, "a replacement leader must also be able to leave");

  const firstRejoined = await call("create-player", {
    name: players[0].name,
    team: "LeaveNew1",
    partyMode: "create",
    resumePlayerId: players[0].id
  });
  assert.equal(firstRejoined.me.id, players[0].id, "leaving and rejoining must keep the student's account and equipment");
  assert.equal(firstRejoined.me.team, "LeaveNew1");
  const secondRejoined = await call("create-player", {
    name: players[1].name,
    team: "LeaveNew2",
    partyMode: "create",
    resumePlayerId: players[1].id
  });
  assert.equal(secondRejoined.me.id, players[1].id);
  assert.equal(secondRejoined.me.team, "LeaveNew2");

  const changingRoster = [];
  for (let index = 1; index <= 4; index += 1) {
    changingRoster.push((await call("create-player", { name: `RecruitFlow-${index}`, team: "RecruitFlow" })).me);
  }
  await call("team-roster-finalize", { playerId: changingRoster[0].id });
  const confirmedLeave = await call("leave-team", { playerId: changingRoster[0].id });
  assert.equal(confirmedLeave.remainingMemberCount, 3);
  assert.equal(confirmedLeave.rosterFinalized, false, "4명 미만이 되면 다시 조 확정 대기 상태여야 합니다.");
  const replacement = (await call("create-player", { name: "RecruitFlow-5", team: "RecruitFlow", partyMode: "join" })).me;
  const awaitingRefinalize = await call("team-state", { playerId: changingRoster[1].id });
  assert.equal(awaitingRefinalize.team.memberCount, 4);
  assert.equal(awaitingRefinalize.team.rosterFinalized, false);
  const refinalized = await call("team-roster-finalize", { playerId: changingRoster[1].id });
  assert.equal(refinalized.team.rosterFinalized, true);
  return [...players, ...changingRoster, replacement];
}

async function testAdminEmergencyRosterReopen() {
  const players = [];
  for (let index = 1; index <= 4; index += 1) {
    players.push((await call("create-player", { name: `EmergencyRoster-${index}`, team: "Emergency" })).me);
  }
  const finalized = await call("team-roster-finalize", { playerId: players[0].id });
  assert.equal(finalized.team.rosterFinalized, true);
  assert.equal(finalized.team.war.scannedCount, 0);

  const reopened = await call("admin-reopen-team", { pin: SMOKE_PIN, teamKey: "Emergency" });
  assert.equal(reopened.teams.some((team) => team.key === "emergency"), false);

  const teamState = await call("team-state", { playerId: players[0].id });
  assert.equal(teamState.team.rosterFinalized, false);
  assert.equal(teamState.team.war.sessionId, null);
  assert.equal(teamState.team.war.scannedCount, 0);

  players.push((await call("create-player", { name: "EmergencyRoster-5", team: "Emergency" })).me);
  const refinalized = await call("team-roster-finalize", { playerId: players[0].id });
  assert.equal(refinalized.team.memberCount, 5);
  return players;
}

async function waitForServer(child, origin = baseUrl) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) break;
    try {
      const response = await fetch(origin);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Smoke server did not start on ${origin}`);
}

function startSmokeServer({ port = SMOKE_PORT, warOpensAt = "" } = {}) {
  const child = spawn(process.execPath, ["scripts/dev-server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      NODE_ENV: "test-file",
      DATA_FILE: SMOKE_DATA_FILE,
      ADMIN_PIN: SMOKE_PIN,
      EVENT_ENDS_AT: "",
      THE_WAR_OPENS_AT: warOpensAt
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  return child;
}

async function stopSmokeServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 3000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function testLockedWarApi() {
  const lockedPort = SMOKE_PORT + 1;
  const origin = `http://127.0.0.1:${lockedPort}`;
  const child = startSmokeServer({ port: lockedPort, warOpensAt: "2099-07-15T00:00:00+09:00" });
  try {
    await waitForServer(child, origin);
    const health = await call("health", {}, origin);
    assert.equal(health.warOpen, false);
    assert.equal(health.warOpensAt, "2099-07-14T15:00:00.000Z");

    const players = [];
    for (let index = 1; index <= 4; index += 1) {
      players.push((await call("create-player", { name: `LockedWar-${index}`, team: "LockedWar" }, origin)).me);
    }
    await call("team-roster-finalize", { playerId: players[0].id }, origin);
    const draw = await call("claim-qr", { playerId: players[0].id, code: "draw-1" }, origin);
    assert.equal(draw.results.length, 1, "ordinary equipment draws stay available before THE WAR");
    for (const [action, body] of [
      ["team-war-scan", { playerId: players[0].id }],
      ["team-war-role", { playerId: players[0].id, armorCode: "belt", selected: true }]
    ]) {
      await assert.rejects(
        () => call(action, body, origin),
        (error) => error.code === "THE_WAR_LOCKED"
      );
    }
    for (const code of ["mission-judgment", "boss-forest"]) {
      for (const action of ["qr-state", "claim-qr"]) {
        await assert.rejects(
          () => call(action, { playerId: players[0].id, code }, origin),
          (error) => error.code === "THE_WAR_LOCKED"
        );
      }
    }
  } finally {
    await stopSmokeServer(child);
  }
}

function firstTradeItem(player) {
  for (const [armor, row] of Object.entries(player.inventory)) {
    for (const grade of ["B", "A"]) {
      if (row[grade] > 0) return { armor, grade };
    }
  }
  throw new Error(`No trade item for ${player.name}`);
}

async function run() {
  await fs.mkdir(path.dirname(SMOKE_DATA_FILE), { recursive: true });
  const vercelConfig = JSON.parse(await fs.readFile(path.join(process.cwd(), "vercel.json"), "utf8"));
  assert.ok(vercelConfig.rewrites.some((rule) => rule.source === "/party" && rule.destination === "/index.html"));
  const schemaText = await fs.readFile(path.join(process.cwd(), "schema.sql"), "utf8");
  assert.match(schemaText, /current-retreat-v2/);
  assert.doesNotMatch(schemaText, /drop column if exists access_code/i);
  await testLocalBackupRecovery();
  await resetLocalData();
  await testLockedWarApi();
  await resetLocalData();
  const child = startSmokeServer();
  try {
    assert.deepEqual(eventWindow(0), { active: true, endsAt: null });
    process.env.EVENT_ENDS_AT = "2026-07-15T10:00:00+09:00";
    assert.equal(eventWindow(Date.parse("2026-07-15T09:59:59+09:00")).active, true);
    assert.deepEqual(eventWindow(Date.parse("2026-07-15T10:00:00+09:00")), {
      active: false,
      endsAt: "2026-07-15T01:00:00.000Z"
    });
    process.env.EVENT_ENDS_AT = "invalid";
    assert.throws(() => eventWindow(), /ISO-8601/);
    process.env.EVENT_ENDS_AT = "2026-07-15T10:00:00";
    assert.throws(() => eventWindow(), /시간대/);
    process.env.EVENT_ENDS_AT = "";

    assert.deepEqual(warWindow(0), { open: true, opensAt: null });
    process.env.THE_WAR_OPENS_AT = "2026-07-15T00:00:00+09:00";
    assert.deepEqual(warWindow(Date.parse("2026-07-14T23:59:59+09:00")), {
      open: false,
      opensAt: "2026-07-14T15:00:00.000Z"
    });
    assert.deepEqual(warWindow(Date.parse("2026-07-15T00:00:00+09:00")), {
      open: true,
      opensAt: "2026-07-14T15:00:00.000Z"
    });
    process.env.THE_WAR_OPENS_AT = "";
    process.env.EVENT_ENDS_AT = "2026-07-15T10:00:00+09:00";
    assert.deepEqual(warWindow(Date.parse("2026-07-14T23:59:59+09:00")), {
      open: false,
      opensAt: "2026-07-14T15:00:00.000Z"
    });
    assert.deepEqual(warWindow(Date.parse("2026-07-15T00:00:00+09:00")), {
      open: true,
      opensAt: "2026-07-14T15:00:00.000Z"
    });
    process.env.EVENT_ENDS_AT = "2026-07-15T00:00:00+09:00";
    assert.throws(() => warWindow(), /이른 시각/);
    process.env.EVENT_ENDS_AT = "";
    process.env.THE_WAR_OPENS_AT = "invalid";
    assert.throws(() => warWindow(), /ISO-8601/);
    process.env.THE_WAR_OPENS_AT = "2026-07-15T00:00:00";
    assert.throws(() => warWindow(), /시간대/);
    process.env.THE_WAR_OPENS_AT = "2026-07-15T06:00:00+09:00";
    process.env.EVENT_ENDS_AT = "2026-07-15T06:00:00+09:00";
    assert.throws(() => warWindow(), /이른 시각/);
    process.env.EVENT_ENDS_AT = "";
    process.env.THE_WAR_OPENS_AT = "";
    assert.equal(isServiceError({ code: "ECONNRESET" }), true);
    assert.equal(isServiceError(new Error("선택할 장비가 올바르지 않습니다.")), false);
    assert.equal(isRetryablePostgresError({ code: "40001" }), true);
    assert.equal(isRetryablePostgresError({ code: "23505" }), false);

    await withData(async (data) => {
      data.eventLogs.push({ id: "read_only_probe", action: "probe" });
    }, { readOnly: true });
    const readOnlyProbePersisted = await withData(async (data) => data.eventLogs.some((log) => log.id === "read_only_probe"), { readOnly: true });
    assert.equal(readOnlyProbePersisted, false);

    const expiryData = createEmptyData();
    expiryData.exchangeSessions["1"].status = "waiting";
    expiryData.exchangeSessions["1"].player1Id = "p_test";
    expiryData.exchangeSessions["1"].expiresAt = "2000-01-01T00:00:00.000Z";
    assert.deepEqual(expireBooths(expiryData, "2000-01-01T00:00:01.000Z"), ["1"]);
    assert.equal(expiryData.exchangeSessions["1"].status, "empty");

    await waitForServer(child);

    const invalidEncoding = await fetch(`${baseUrl}/%E0%A4%A`);
    assert.equal(invalidEncoding.status, 400);
    const malformedHost = await rawHttpRequest("GET / HTTP/1.1\r\nHost: [\r\nConnection: close\r\n\r\n");
    assert.match(malformedHost, /^HTTP\/1\.1 400 Bad Request/);
    const malformedHeader = await rawHttpRequest("GET / HTTP/1.1\r\nHost: localhost\r\nInvalid header\r\n\r\n");
    assert.match(malformedHeader, /^HTTP\/1\.1 400 Bad Request/);

    const health = await call("health");
    assert.equal(health.service, "current-retreat-api");
    assert.equal(health.status, "ready");
    assert.equal(health.active, true);
    assert.equal(health.endsAt, null);
    assert.equal(health.warOpen, true);
    assert.equal(health.warOpensAt, null);
    assert.equal(health.storage, "file");
    assert.equal(health.schemaReady, true);
    assert.equal(health.writable, true);
    assert.equal(health.adminConfigured, true);
    assert.equal(health.databaseId, "current-retreat-v2-local");

    const unsupportedMethod = await fetch(`${baseUrl}/api/app?action=state`, { method: "PUT" });
    assert.equal(unsupportedMethod.status, 405);
    assert.equal((await unsupportedMethod.json()).ok, false);
    const unknownAction = await fetch(`${baseUrl}/api/app?action=not-a-real-action`);
    assert.equal(unknownAction.status, 400);
    assert.match((await unknownAction.json()).error, /알 수 없는 API 액션/);
    const oversizedBody = await fetch(`${baseUrl}/api/app?action=state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "x".repeat(70 * 1024)
    });
    assert.equal(oversizedBody.status, 413);
    assert.equal((await oversizedBody.json()).ok, false);

    const partyCreator = await call("create-player", { name: "PartyLeader", team: "용기파티", partyMode: "create" });
    assert.equal(partyCreator.team.isLeader, true);
    assert.equal(partyCreator.team.leaderName, "PartyLeader");
    const partyJoiner = await call("create-player", { name: "PartyMember", team: "용기파티", partyMode: "join" });
    assert.equal(partyJoiner.team.isLeader, false);
    const correction = await call("create-player", { name: "오타학생", team: "수정전" });
    const corrected = await call("admin-update-player", { pin: SMOKE_PIN, playerId: correction.me.id, name: "수정학생", team: "수정후" });
    assert.equal(corrected.player.name, "수정학생");
    assert.equal(corrected.player.team, "수정후");
    await assert.rejects(
      () => call("admin-update-player", { pin: SMOKE_PIN, playerId: correction.me.id, score: "Infinity" }),
      /정수/
    );
    await assert.rejects(
      () => call("create-player", { name: "이름", team: "1234567890123" }),
      /12자/
    );
    await assert.rejects(
      () => call("create-player", { name: "DuplicateCreator", team: "용기파티", partyMode: "create" }),
      /존재|참가/
    );
    await assert.rejects(
      () => call("create-player", { name: "MissingJoiner", team: "없는파티", partyMode: "join" }),
      /찾을 수 없|새 파티/
    );

    const a = await call("create-player", { name: "SmokeA", team: "1", gender: "male" });
    const b = await call("create-player", { name: "SmokeB", team: "1", gender: "female" });
    const c = await call("create-player", { name: "SmokeC", team: "1" });
    const d = await call("create-player", { name: "SmokeD", team: "1" });
    const e = await call("create-player", { name: "SmokeE", team: "1" });
    assert.equal(a.me.name, "SmokeA");
    assert.equal(b.me.name, "SmokeB");
    assert.equal(a.active, true);
    assert.equal(a.endsAt, null);
    assert.equal("accessCode" in a.me, false);
    const rejoinedA = await call("create-player", { name: "SmokeA", team: "1" });
    assert.equal(rejoinedA.me.id, a.me.id);
    const resumedByIdentity = await call("state", { name: "SmokeA", team: "1" });
    assert.equal(resumedByIdentity.me.id, a.me.id);
    assert.ok(a.qrRewards.every((reward) => !/시련|숲/.test(`${reward.title} ${reward.description}`)));
    assert.deepEqual(
      a.qrRewards
        .filter((reward) => reward.code.startsWith("draw-"))
        .map((reward) => [reward.code, reward.reward.draws]),
      [["draw-1", 1], ["draw-2", 2], ["draw-3", 3]]
    );
    assert.ok(a.qrRewards.filter((reward) => reward.code.startsWith("draw-")).every((reward) => reward.repeatable));
    assert.deepEqual(
      a.qrRewards.filter((reward) => reward.type === "mission").map((reward) => [reward.code, reward.stat, reward.demon]),
      [
        ["mission-judgment", "판단력", "거짓의 마귀"],
        ["mission-endurance", "인내력", "낙심의 마귀"],
        ["mission-speed", "스피드", "추격의 마귀"],
        ["mission-teamwork", "협동력", "분열의 마귀"],
        ["mission-intellect", "지력", "혼란의 마귀"],
        ["mission-power", "힘", "파괴의 마귀"]
      ]
    );

    const smokeRoster = await call("team-roster-finalize", { playerId: a.me.id });
    assert.equal(smokeRoster.team.memberCount, 5);
    assert.equal(smokeRoster.team.rosterFinalized, true);
    assertWarSystemShape(smokeRoster);
    await assert.rejects(
      () => call("admin-update-player", { pin: SMOKE_PIN, playerId: a.me.id, team: "다른조" }),
      /명단을 먼저 다시 연/
    );
    await testFiveMemberWarFlow([a.me, b.me, c.me, d.me, e.me]);
    await assert.rejects(
      () => call("admin-adjust-item", { pin: SMOKE_PIN, playerId: a.me.id, armor: "sword", grade: "B", delta: 100 }),
      /-99|99|정수/
    );

    await call("admin-adjust-item", { pin: SMOKE_PIN, playerId: c.me.id, armor: "shoes", grade: "B", delta: 1 });
    await call("admin-adjust-item", { pin: SMOKE_PIN, playerId: d.me.id, armor: "shoes", grade: "B", delta: 1 });
    const collectiveState = await call("state", { playerId: a.me.id });
    const collectiveShoes = collectiveState.team.armorProgress.find((row) => row.armor === "shoes");
    assert.equal(collectiveShoes.progress, 2);
    assertWarSystemShape(collectiveState);
    await assertCollectiveProgress([a.me, b.me, c.me, d.me, e.me], collectiveState.team);

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
    assert.equal(aAfterUpgrade.ownedArmorCount, 1);
    assert.equal(aAfterUpgrade.equipmentPower, 40);

    const armorCodes = ["belt", "breastplate", "shoes", "shield", "helmet", "sword"];
    for (const armorCode of armorCodes) {
      for (const grade of ["B", "A"]) {
        for (let count = 0; count < 2; count += 1) {
          await call("admin-adjust-item", { pin: SMOKE_PIN, playerId: b.me.id, armor: armorCode, grade, delta: 1 });
        }
      }
    }
    const cascadeDraw = await call("draw", { playerId: b.me.id, count: 1 });
    assert.equal(cascadeDraw.results.length, 1);
    assert.deepEqual(cascadeDraw.promotions.map(({ from, to, count }) => ({ from, to, count })), [
      { from: "B", to: "A", count: 3 },
      { from: "A", to: "S", count: 3 }
    ]);
    const cascadeArmor = cascadeDraw.results[0].armor;
    assert.ok(cascadeDraw.promotions.every((promotion) => promotion.armor === cascadeArmor));
    assert.deepEqual(cascadeDraw.me.inventory[cascadeArmor], { B: 0, A: 0, S: 1 });

    const draw = await call("draw", { playerId: b.me.id, count: 3 });
    assert.ok(draw.results.length >= 1 && draw.results.length <= 3);
    assertWarSystemShape(draw);
    assert.ok(draw.me.ownedArmorCount > 0);

    for (const count of [1, 2, 3]) {
      const drawQr = await call("claim-qr", { playerId: a.me.id, code: `draw-${count}` });
      assert.ok(drawQr.results.length <= count);
      assert.equal(drawQr.repeatable, true);
      assert.equal(drawQr.claimedQrCodes.includes(`draw-${count}`), false);
      const duplicateDrawQr = await call("claim-qr", { playerId: a.me.id, code: `draw-${count}` });
      assert.notEqual(duplicateDrawQr.alreadyClaimed, true);
      assert.equal(duplicateDrawQr.repeatable, true);
      assert.ok(duplicateDrawQr.results.length <= count);
    }

    const team6 = await createAndCompleteTeam("Team6", 6);
    const team5 = await createAndCompleteTeam("Team5", 5);
    const team4 = await createAndCompleteTeam("Team4", 4);
    const collectivePlayers = await testConcurrentCollectiveDraws();
    const lifecyclePlayers = await testRosterLifecycle();
    const voluntaryLeavePlayers = await testVoluntaryPartyLeave();
    const emergencyRosterPlayers = await testAdminEmergencyRosterReopen();

    const qr = await call("claim-qr", { playerId: a.me.id, code: "mission-judgment" });
    assert.ok(qr.results.length <= 1);
    assert.ok(qr.claimedQrCodes.includes("mission-judgment"));
    const duplicateQr = await call("claim-qr", { playerId: a.me.id, code: "mission-judgment" });
    assert.equal(duplicateQr.alreadyClaimed, true);
    assert.equal(duplicateQr.results.length, 0);
    const concurrentMissionClaims = await Promise.all([
      call("claim-qr", { playerId: a.me.id, code: "mission-endurance" }),
      call("claim-qr", { playerId: a.me.id, code: "mission-endurance" })
    ]);
    assert.equal(concurrentMissionClaims.filter((payload) => payload.alreadyClaimed).length, 1);
    assert.ok(concurrentMissionClaims.reduce((sum, payload) => sum + payload.results.length, 0) <= 1);

    for (const route of ["/party", "/forest", "/team/roles", "/team/merge", "/exchange/1", "/draw/1", "/draw/2", "/draw/3", "/mission/judgment", "/mission/endurance", "/mission/speed", "/mission/teamwork", "/mission/intellect", "/mission/power", "/hidden/forest-cache-1", "/boss"]) {
      const cleanRoute = await fetch(`${baseUrl}${route}`);
      assert.equal(cleanRoute.status, 200);
      assert.match(cleanRoute.headers.get("content-type") || "", /^text\/html/);
      const html = await cleanRoute.text();
      assert.match(html, /src="\/app\.js/);
      assert.match(html, /href="\/styles\.css/);
      assert.match(html, /<title>전신갑주를 입어라<\/title>/);
      assert.match(html, /family=Jua/);
    }

    const scriptAsset = await fetch(`${baseUrl}/app.js`);
    assert.equal(scriptAsset.status, 200);
    assert.match(scriptAsset.headers.get("content-type") || "", /^application\/javascript/);
    const scriptText = await scriptAsset.text();
    assert.match(scriptText, /promotion-result-grade/);
    assert.match(scriptText, /자동 합성 대성공/);
    assert.match(scriptText, /등급 장비가 탄생했어요/);
    assert.match(scriptText, /\$\{promotionHtml\}[\s\S]*\$\{drawCardsHtml\}/);
    assert.match(scriptText, /equipment-current-grade/);
    assert.match(scriptText, /synthesis-progress-card/);
    assert.match(scriptText, /equipment-meaning-card/);
    assert.match(scriptText, /합성 진행도/);
    assert.doesNotMatch(scriptText, /equipment-quick-facts|equipment-roadmap-head|equipment-grade-roadmap|미션 특성/);
    assert.doesNotMatch(scriptText, /기본 도전|힌트 1개|재도전|방해 무효|무효화|gradeBenefitText|shortBenefits|등급 효과/);
    assert.match(scriptText, /entry-topbar/);
    assert.match(scriptText, /classList\.add\("entry-mode"\)/);
    assert.match(scriptText, /classList\.add\("home-mode"\)/);
    assert.match(scriptText, /classList\.add\("player-mode"\)/);
    assert.match(scriptText, /top-settings-button[\s\S]*openSettingsMenu/);
    assert.match(scriptText, /settings-menu-row settings-audio-row audio-control/);
    assert.doesNotMatch(scriptText, /settings-menu-row audio-toggle/);
    assert.match(scriptText, /querySelectorAll\("\.audio-control"\)/);
    assert.match(scriptText, /settings-menu-row is-danger[\s\S]*로그아웃/);
    assert.match(scriptText, /back[\s\S]*←[\s\S]*뒤로가기/);
    assert.doesNotMatch(scriptText, /logoutLabel|>나가기</);
    assert.match(scriptText, /studentBottomNavHtml/);
    assert.match(scriptText, /"홈"[\s\S]*"(파티|우리 조)"[\s\S]*"THE WAR"[\s\S]*"랭킹"/);
    assert.match(scriptText, /party-dashboard-hero/);
    assert.match(scriptText, /(파티|조) 전투력/);
    assert.match(scriptText, /party-member-grid/);
    assert.doesNotMatch(scriptText, /파티원을 누르면 보유 장비가 열립니다/);
    assert.doesNotMatch(scriptText, /보유 장비 보기/);
    assert.match(scriptText, /이름: \$\{escapeHtml\(member\.name\)\}/);
    assert.match(scriptText, /<small>전투력:<\/small>/);
    assert.doesNotMatch(scriptText, /통합 장비 현황|모든 파티원의 장비가 자동으로 합산됩니다|파티 전체 자동 합산|아직 0개/);
    assert.doesNotMatch(scriptText, /function partyArmorGridHtml/);
    assert.match(scriptText, /party-member-leader/);
    assert.doesNotMatch(scriptText, /전신갑주 현황|눌러서 장비 확인/);
    assert.match(scriptText, /openPartyMemberDetail/);
    assert.match(scriptText, /function renderParty\(\)/);
    assert.match(scriptText, /용사 로그인/);
    assert.match(scriptText, /entry-login-button[\s\S]*<span>로그인<\/span>/);
    assert.doesNotMatch(scriptText, /새 파티 만들기|파티 참가하기/);
    assert.match(scriptText, /원정대 결성/);
    assert.match(scriptText, /최소 4명 · 최대 6명/);
    assert.match(scriptText, /<span>조 이름<\/span><strong>“\$\{escapeHtml\(partyName\)\}”<\/strong><span>을 입력하세요<\/span>/);
    assert.doesNotMatch(scriptText, /조원들이 입력할 조 이름|로그인 화면의 <b>조 이름<\/b>|시작하려면 \$\{remaining\}명이 더 필요해요|party-lobby-limits/);
    assert.doesNotMatch(scriptText, /partyLobbySlotsHtml/);
    assert.match(scriptText, /THE WAR QR 스캔 전까지는 탈퇴·영입이 가능합니다/);
    assert.doesNotMatch(scriptText, /담당 장비를 나눠 맡으세요|내 장비를 선택하세요|이 배정으로 확정합니다/);
    assert.match(scriptText, /server-connection-banner/);
    assert.match(scriptText, /team-roster-finalize/);
    assert.match(scriptText, /team-leader-claim/);
    assert.match(scriptText, /leave-team/);
    assert.match(scriptText, /function leaveTeam\(\)/);
    assert.match(scriptText, /party-lobby-leave/);
    assert.doesNotMatch(scriptText, /team-roster-reopen|reopenTeamRoster|파티원 명단 다시 열기/);
    assert.match(scriptText, /admin-reopen-team/);
    assert.match(scriptText, /adminReopenTeam/);
    assert.match(scriptText, /THE WAR QR 스캔 전/);
    assert.match(scriptText, /rosterFinalized/);
    assert.match(scriptText, /current\.parts\[1\] === "roles"/);
    assert.match(scriptText, /api\("team-war-scan"/);
    assert.match(scriptText, /api\("team-war-role"/);
    assert.match(scriptText, /allScanned/);
    assert.match(scriptText, /rolesComplete/);
    assert.match(scriptText, /toggleWarRole/);
    assert.match(scriptText, /home-loadout-heading/);
    assert.match(scriptText, /나의 전신갑주/);
    assert.doesNotMatch(scriptText, /MY CHARACTER|<span>내 전투력<\/span>/);
    assert.match(scriptText, /home-character-power[\s\S]*<small>전투력<\/small>/);
    assert.match(scriptText, /equipmentBoardHtml\(me, \{ showStatus: false \}\)/);
    assert.doesNotMatch(scriptText, /openPowerBreakdown|home-power-button/);
    assert.match(scriptText, /home-equipment-actions[\s\S]*openInventoryModal/);
    assert.doesNotMatch(scriptText, /LOCAL_QR_TEST_GROUPS|localQrTestEnabled|renderLocalQrTestPanel|createLocalTestParty|simulateLocalWarFlow|local-qr-test/);
    assert.doesNotMatch(scriptText, /모든 QR 버튼 테스트|전원 스캔 · 합산 연출 보기|data-qa-action=/);
    assert.match(scriptText, /inventory-simple-list/);
    assert.match(scriptText, /inventory-grade-chip/);
    assert.doesNotMatch(scriptText, /inventory-power-formula|inventory-grade-cell|inventory-summary-best/);
    assert.doesNotMatch(scriptText, /home-draw-card|home-draw-buttons/);
    assert.match(scriptText, /S MAX/);
    assert.match(scriptText, /중복 획득 잠금/);
    assert.match(scriptText, /전신갑주 S 풀세트 완성/);
    assert.match(scriptText, /equipment-draw-page/);
    assert.match(scriptText, /equipment-draw-buttons/);
    assert.match(scriptText, /const drawCount = Math\.max\(1, Math\.min\(3, Number\(reward\.reward\?\.draws \|\| 1\)\)\)/);
    assert.match(scriptText, /data-draw-count="\$\{drawCount\}"/);
    assert.match(scriptText, /claimQrReward\('\$\{escapeHtml\(code\)\}', \{ auto: true \}\)/);
    assert.match(scriptText, /장비 \$\{drawCount\}회 뽑기/);
    assert.match(scriptText, /draw-qr-reveal/);
    assert.doesNotMatch(scriptText, /qrAutoClaimArmed|QR 인식 완료/);
    assert.match(scriptText, /showDrawModal\(payload\.results \|\| \[\], payload\.promotions \|\| \[\], \{ qrFlow: auto, fullSetComplete: Boolean\(payload\.fullSetComplete\) \}\)/);
    assert.match(scriptText, /game-dock/);
    assert.match(scriptText, /student-page ranking-page/);
    assert.match(scriptText, /ranking-tabs/);
    assert.match(scriptText, /data-ranking-tab="party"/);
    assert.match(scriptText, /data-ranking-tab="individual"/);
    assert.match(scriptText, /function partyRankingHtml/);
    assert.match(scriptText, /function selectRankingTab/);
    assert.match(scriptText, /partyRanking/);
    assert.match(scriptText, /확정된 (파티|조)가 없습니다/);
    assert.match(scriptText, /student-page challenge-page/);
    assert.match(scriptText, /team-merge-stage/);
    assert.match(scriptText, /모든 장비 계산 완료!/);
    assert.match(scriptText, /team-state/);
    assert.match(scriptText, /모든 (파티원|조원)이 같은 QR을 스캔하면 다음 단계가 자동으로 열립니다/);
    assert.match(scriptText, /전원 스캔 완료/);
    assert.match(scriptText, /trial-forest-hero\.webp/);
    assert.match(scriptText, /forest-test-grid/);
    assert.match(scriptText, /THE WAR/);
    assert.match(scriptText, /영적 전쟁이 시작됩니다/);
    assert.match(scriptText, /THE WAR · SEALED/);
    assert.doesNotMatch(scriptText, /시험의 숲이[\s\S]{0,80}깨어납니다/);
    assert.match(scriptText, /war-locked-art[\s\S]*trial-forest-hero\.webp/);
    assert.match(scriptText, /가장 자신 있는 파트를 맡으세요/);
    assert.match(scriptText, /한 사람당 1~2개 파트/);
    assert.match(scriptText, /war-role-grid/);
    assert.match(scriptText, /war-role-card/);
    assert.match(scriptText, /war-role-claim-button/);
    assert.match(scriptText, /warOpen/);
    assert.match(scriptText, /판단력[\s\S]*인내력[\s\S]*스피드[\s\S]*협동력[\s\S]*지력[\s\S]*힘/);
    assert.match(scriptText, /거짓의 마귀[\s\S]*낙심의 마귀[\s\S]*추격의 마귀[\s\S]*분열의 마귀[\s\S]*혼란의 마귀[\s\S]*파괴의 마귀/);
    assert.match(scriptText, /mission-encounter-page/);
    assert.match(scriptText, /이 파트를 맡은 대표가 도전합니다/);
    assert.match(scriptText, /미션 완료 · 보상 받기/);
    assert.match(scriptText, /forest-qr-button/);
    assert.equal((scriptText.match(/<span>QR 스캔하기<\/span>/g) || []).length, 1);
    assert.match(scriptText, /BarcodeDetector/);
    assert.match(scriptText, /openForestQrScanner/);
    assert.match(scriptText, /raw\.startsWith\("draw-"\)[\s\S]*\/draw\//);
    assert.match(scriptText, /\["qr", "draw", "mission", "hidden", "boss"\]/);
    assert.doesNotMatch(scriptText, /장비별 도전|forestMainHtml|forest-mission-box/);
    assert.doesNotMatch(scriptText, /맞서는 도전|<span>상대<\/span>/);
    assert.doesNotMatch(scriptText, /갑주 도전/);
    assert.match(scriptText, /student-page exchange-page/);
    assert.match(scriptText, /student-page reward-page/);
    assert.match(scriptText, /aria-labelledby="inventory-dialog-title"/);
    assert.doesNotMatch(scriptText, /entry-hero-copy/);
    assert.doesNotMatch(scriptText, /entry-card-emblem/);
    assert.match(scriptText, /aria-labelledby="equipment-dialog-title"/);
    assert.doesNotMatch(scriptText, /자동 합성 진행/);
    assert.doesNotMatch(scriptText, /장비 특성 ·/);
    assert.match(scriptText, /M82 170 L178 106/);
    assert.match(scriptText, /M278 170 L198 148/);
    assert.match(scriptText, /이름과 조 이름으로 로그인합니다/);
    assert.doesNotMatch(scriptText, /4자리|재접속|player-code|STORAGE_CODE|accessCode/);
    assert.match(scriptText, /교사 PIN/);
    assert.match(scriptText, /STORAGE_AUDIO_ENABLED/);
    assert.match(scriptText, /AUDIO_MUSIC_PATTERNS/);
    assert.match(scriptText, /window\.AudioContext \|\| window\.webkitAudioContext/);
    assert.match(scriptText, /function playGameSound/);
    assert.match(scriptText, /document\.addEventListener\("pointerdown"/);
    assert.match(scriptText, /document\.addEventListener\("visibilitychange"/);
    assert.match(scriptText, /aria-label="\$\{enabled \? "배경음과 효과음 끄기" : "배경음과 효과음 켜기"\}"/);
    assert.match(scriptText, /createResilientStorage/);
    assert.match(scriptText, /safeSessionStorage\.setItem\(STORAGE_PIN/);
    assert.match(scriptText, /EVENT_ENDED/);
    assert.match(scriptText, /3일 운영 완료/);
    assert.match(scriptText, /}, 30000\);/);
    assert.match(scriptText, /}, 8000\);/);
    assert.doesNotMatch(scriptText, /await wait\(1500\)/);
    assert.doesNotMatch(scriptText, /시련의 숲|입장코드/);
    const styleAsset = await fetch(`${baseUrl}/styles.css`);
    assert.equal(styleAsset.status, 200);
    assert.match(styleAsset.headers.get("content-type") || "", /^text\/css/);
    const styleText = await styleAsset.text();
    assert.match(styleText, /\.promotion-result-grade\s*\{/);
    assert.doesNotMatch(styleText, /\.local-qr-test-panel|\.local-qr-test-grid|\.local-qr-test-button/);
    assert.match(styleText, /font-size:54px/);
    assert.match(styleText, /@media\(max-width:430px\)/);
    assert.match(styleText, /@media\(prefers-reduced-motion:reduce\)/);
    assert.match(styleText, /\.equipment-detail-hero\s*\{/);
    assert.match(styleText, /\.equipment-meaning-card\s*\{/);
    assert.doesNotMatch(styleText, /equipment-current-effect|equipment-grade-step-benefit|benefit-table|\.benefit\s*\{/);
    assert.match(styleText, /\.entry-auto-resume-note\s*\{/);
    assert.doesNotMatch(styleText, /\.reconnect-details\s*\{|\.entry-reconnect\s*\{|\.access-code-badge\s*\{|\.home-access-code\s*\{/);
    assert.match(styleText, /body\.entry-mode\s*\{/);
    assert.match(styleText, /body\.home-mode\s*\{/);
    assert.match(styleText, /body\.player-mode\s*\{/);
    assert.match(styleText, /\.entry-topbar\s*\{/);
    assert.match(styleText, /\.home-art-banner\s*\{/);
    assert.match(styleText, /\.home-equipment-power\s*\{/);
    assert.match(styleText, /\.inventory-simple-row\s*\{/);
    assert.match(styleText, /\.home-ranking-card\s*\{/);
    assert.match(styleText, /\.student-panel\s*\{/);
    assert.match(styleText, /\.ranking-panel\s*\{/);
    assert.match(styleText, /\.ranking-tabs\s*\{/);
    assert.match(styleText, /\.party-rank-copy/);
    assert.match(styleText, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
    assert.match(styleText, /\.forest-hero-card\s*\{/);
    assert.match(styleText, /\.forest-test-grid\s*\{/);
    assert.match(styleText, /\.forest-qr-button\s*\{/);
    assert.match(styleText, /\.home-qr-button\s*\{/);
    assert.match(styleText, /\.forest-qr-modal\s*\{/);
    assert.match(styleText, /\.reward-page \.qr-reward-card\s*\{/);
    assert.match(styleText, /\.qr-auto-claim-panel\s*\{/);
    assert.match(styleText, /\.draw-modal\.qr-flow:not\(\.has-promotion\)\s*\{/);
    assert.match(styleText, /\.draw-qr-reveal\s*\{/);
    assert.match(styleText, /@keyframes qrRevealCore/);
    assert.match(styleText, /\.slot-max-lock\s*\{/);
    assert.match(styleText, /\.full-set-complete-banner\s*\{/);
    assert.match(styleText, /\.team-roster-finalize-button\s*\{/);
    assert.match(styleText, /\.party-leader-claim\s*\{/);
    assert.match(styleText, /\.party-lobby-leave\s*\{/);
    assert.match(styleText, /\.admin-finalized-team\s*\{/);
    assert.doesNotMatch(styleText, /\.team-roster-reopen-button\s*\{/);
    assert.match(styleText, /\.party-power-hero\s*\{/);
    assert.match(styleText, /\.party-armor-grid\s*\{/);
    assert.match(styleText, /\.party-member-grid\s*\{/);
    assert.match(styleText, /--font-display:"Jua"/);
    assert.match(styleText, /\.party-member-leader,\.party-member-me\s*\{/);
    assert.match(styleText, /#server-connection-banner\s*\{/);
    assert.match(styleText, /\.party-lobby-hero\s*\{/);
    assert.match(styleText, /\.party-lobby-start\s*\{/);
    assert.doesNotMatch(styleText, /\.party-lobby-limits/);
    assert.match(styleText, /\.party-lobby-invite p strong\s*\{/);
    assert.match(styleText, /\.team-merge-stage\s*\{/);
    assert.match(styleText, /\.war-scan-waiting\s*\{/);
    assert.match(styleText, /\.war-scan-member\s*\{/);
    assert.match(styleText, /\.team-member-grid\s*\{/);
    assert.match(styleText, /\.team-test-grid \.forest-test-card\s*\{/);
    assert.match(styleText, /\.mission-encounter-hero\s*\{/);
    assert.match(styleText, /\.mission-representative-card\s*\{/);
    assert.match(styleText, /\.war-role-grid\s*\{/);
    assert.match(styleText, /\.war-role-card\s*\{/);
    assert.match(styleText, /\.war-role-claim-button\s*\{/);
    assert.match(styleText, /\.war-role-team-status\s*\{/);
    assert.match(styleText, /\.war-locked-[a-z-]+\s*\{/);
    assert.match(styleText, /--entry-canvas:#111a22/);
    assert.match(styleText, /width:44px/);
    assert.match(styleText, /\.audio-toggle\s*\{/);
    assert.match(styleText, /\.audio-toggle\.is-muted\s*\{/);
    assert.match(styleText, /\.game-dock\s*\{/);
    assert.match(styleText, /\.top-settings-button\s*\{/);
    assert.match(styleText, /\.home-character-hero\s*\{/);
    assert.match(styleText, /\.home-loadout-card\s*\{/);
    assert.match(styleText, /\.party-dashboard-hero\s*\{/);
    assert.doesNotMatch(styleText, /\.power-breakdown-modal\s*\{/);
    assert.match(styleText, /\.war-locked-art\s*\{/);
    const imageAsset = await fetch(`${baseUrl}/assets/armor/belt.webp`);
    assert.equal(imageAsset.status, 200);
    assert.equal(imageAsset.headers.get("content-type"), "image/webp");
    const entryHeroAsset = await fetch(`${baseUrl}/assets/ui/entry-armor-hero.webp`);
    assert.equal(entryHeroAsset.status, 200);
    assert.equal(entryHeroAsset.headers.get("content-type"), "image/webp");
    const forestHeroAsset = await fetch(`${baseUrl}/assets/ui/trial-forest-hero.webp`);
    assert.equal(forestHeroAsset.status, 200);
    assert.equal(forestHeroAsset.headers.get("content-type"), "image/webp");

    for (const privatePath of ["/package.json", "/server/store.js", "/.data/dev-db.json"]) {
      const privateResponse = await fetch(`${baseUrl}${privatePath}`);
      assert.equal(privateResponse.status, 404);
    }

    await call("admin-adjust-item", { pin: SMOKE_PIN, playerId: a.me.id, armor: "sword", grade: "S", delta: 1 });
    const protectedDraw = await call("draw", { playerId: a.me.id, count: 3 });
    assert.ok(protectedDraw.results.every((item) => item.armor !== "sword"), "S등급을 획득한 장비는 뽑기에서 다시 지급되면 안 됩니다.");
    await call("admin-adjust-item", { pin: SMOKE_PIN, playerId: b.me.id, armor: "shield", grade: "S", delta: 1 });
    const sOwnerA = (await call("state", { playerId: a.me.id })).me;
    const sOwnerB = (await call("state", { playerId: b.me.id })).me;
    await call("exchange-join", { boothId: "2", playerId: sOwnerA.id });
    await call("exchange-join", { boothId: "2", playerId: sOwnerB.id });
    await call("exchange-select", { boothId: "2", playerId: sOwnerA.id, items: [{ armor: "sword", grade: "S" }] });
    await call("exchange-select", { boothId: "2", playerId: sOwnerB.id, items: [{ armor: "shield", grade: "S" }] });
    await call("exchange-confirm", { boothId: "2", playerId: sOwnerA.id });
    const sExchange = await call("exchange-confirm", { boothId: "2", playerId: sOwnerB.id });
    assert.equal(sExchange.booth.status, "completed");
    const afterSExchangeA = (await call("state", { playerId: a.me.id })).me;
    const afterSExchangeB = (await call("state", { playerId: b.me.id })).me;
    assert.equal(afterSExchangeA.inventory.shield.S, 1, "S등급 장비도 교환되어야 합니다.");
    assert.equal(afterSExchangeB.inventory.sword.S, 1, "S등급 장비도 교환되어야 합니다.");

    await call("admin-adjust-item", { pin: SMOKE_PIN, playerId: b.me.id, armor: "shield", grade: "B", delta: 1 });
    const freshA = (await call("state", { playerId: a.me.id })).me;
    const freshB = (await call("state", { playerId: b.me.id })).me;
    const aOffer = firstTradeItem(freshA);
    const bOffer = firstTradeItem(freshB);

    await call("exchange-join", { boothId: "1", playerId: freshA.id });
    await call("exchange-join", { boothId: "1", playerId: freshB.id });
    await assert.rejects(
      () => call("exchange-cancel", { boothId: "1", playerId: c.me.id }),
      /참여자/
    );
    await call("exchange-select", { boothId: "1", playerId: freshA.id, items: [aOffer] });
    await call("exchange-select", { boothId: "1", playerId: freshB.id, items: [bOffer] });
    const waiting = await call("exchange-confirm", { boothId: "1", playerId: freshA.id });
    assert.notEqual(waiting.booth.status, "completed");
    await call("exchange-select", { boothId: "1", playerId: freshB.id, items: [bOffer] });
    const changedOfferWaiting = await call("exchange-confirm", { boothId: "1", playerId: freshB.id });
    assert.notEqual(changedOfferWaiting.booth.status, "completed", "품목 변경 뒤에는 상대도 다시 동의해야 합니다.");
    const completed = await call("exchange-confirm", { boothId: "1", playerId: freshA.id });
    assert.equal(completed.booth.status, "completed");
    const repeatedConfirm = await call("exchange-confirm", { boothId: "1", playerId: freshA.id });
    assert.equal(repeatedConfirm.booth.status, "completed");
    assert.deepEqual(repeatedConfirm.me.inventory, completed.me.inventory, "완료된 교환을 다시 확인해도 장비가 또 이동하면 안 됩니다.");
    await assert.rejects(
      () => call("exchange-select", { boothId: "1", playerId: freshA.id, items: [aOffer] }),
      /완료된 교환/
    );

    const ranking = await call("ranking");
    assert.equal(ranking.ranking.length, 27 + lifecyclePlayers.length + voluntaryLeavePlayers.length + emergencyRosterPlayers.length);
    assert.ok(ranking.ranking[0].equipmentPower >= ranking.ranking[1].equipmentPower);
    assert.ok(Array.isArray(ranking.partyRanking));
    assert.ok(ranking.partyRanking.length >= 5, "확정된 파티만 파티 랭킹에 표시되어야 합니다.");
    assert.ok(ranking.partyRanking.some((party) => party.team === "Team6"));
    assert.ok(ranking.partyRanking.every((party) => party.memberCount >= 4 && /(파티|조)$/.test(party.name)));
    assert.ok(ranking.partyRanking[0].equipmentPower >= ranking.partyRanking[1].equipmentPower);

    const admin = await call("admin", { pin: SMOKE_PIN });
    assert.equal(admin.players.length, 27 + lifecyclePlayers.length + voluntaryLeavePlayers.length + emergencyRosterPlayers.length);
    assert.equal(admin.booths.length, 2);
    assert.equal("accessCode" in admin.players.find((player) => player.id === a.me.id), false);

    const loadPlayers = [a.me, b.me, c.me, d.me, e.me, ...team6.members, ...team5.members, ...team4.members, ...collectivePlayers, ...lifecyclePlayers, ...voluntaryLeavePlayers, ...emergencyRosterPlayers].slice(0, 20);
    const burstStartedAt = Date.now();
    const burstResults = await Promise.all(loadPlayers.flatMap((player) => Array.from({ length: 5 }, () => call("state", { playerId: player.id }))));
    assert.equal(burstResults.length, 100);
    assert.ok(burstResults.every((payload) => payload.me && loadPlayers.some((player) => player.id === payload.me.id)));
    assert.ok(Date.now() - burstStartedAt < 8000, "20명 동시 상태 조회가 8초 안에 끝나야 합니다.");

    console.log("Smoke test passed");
  } finally {
    await stopSmokeServer(child);
    await resetLocalData();
    await Promise.all([
      fs.rm(SMOKE_DATA_FILE, { force: true }),
      fs.rm(BACKUP_DATA_FILE, { force: true })
    ]);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
