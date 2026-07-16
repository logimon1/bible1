const fs = require("fs/promises");
const path = require("path");
const { Pool } = require("pg");
const { ARMOR, createEmptyData, emptyInventory, ensureBooths, normalizeInventory } = (() => {
  const core = require("./core");
  return {
    ARMOR: core.ARMOR,
    createEmptyData: core.createEmptyData,
    emptyInventory: core.emptyInventory,
    ensureBooths: (data) => {
      data.exchangeSessions = data.exchangeSessions || {};
      for (const boothId of ["1", "2"]) {
        if (!data.exchangeSessions[boothId]) data.exchangeSessions[boothId] = core.emptyBooth(boothId);
      }
    },
    normalizeInventory: core.normalizeInventory
  };
})();

const DATA_FILE = path.resolve(process.env.DATA_FILE || path.join(process.cwd(), ".data", "dev-db.json"));
const BACKUP_DATA_FILE = `${DATA_FILE}.bak`;
const APP_DATABASE_ID = "current-retreat-v2";
let dataQueue = Promise.resolve();
let postgresPool = null;

function normalizedTeamKey(value) {
  const compact = String(value || "").trim().toLowerCase().replace(/\s+/g, "");
  const numeric = compact.match(/^(\d+)(?:\uC870)?$/);
  return numeric ? `${Number(numeric[1])}\uC870` : compact;
}

function emptyTeamSetting() {
  return {
    leaderPlayerId: null,
    rosterFinalized: false,
    rosterMemberIds: [],
    rosterFinalizedAt: null,
    warSessionId: null,
    warScannedPlayerIds: [],
    warScanCompletedAt: null,
    warAssemblySnapshot: null,
    warRoleAssignments: {},
    warRolesCompletedAt: null
  };
}

function normalizedTeamSetting(setting, playerIds) {
  const source = setting && typeof setting === "object" ? setting : {};
  const rosterFinalized = Boolean(source.rosterFinalized);
  const rosterMemberIds = [...new Set((Array.isArray(source.rosterMemberIds) ? source.rosterMemberIds : [])
    .map((playerId) => String(playerId || ""))
    .filter((playerId) => playerIds.has(playerId)))];
  const activeRosterIds = rosterFinalized ? new Set(rosterMemberIds) : new Set();
  const warScannedPlayerIds = [...new Set((Array.isArray(source.warScannedPlayerIds) ? source.warScannedPlayerIds : [])
    .map((playerId) => String(playerId || ""))
    .filter((playerId) => activeRosterIds.has(playerId)))];
  const allScanned = activeRosterIds.size >= 4 && [...activeRosterIds].every((playerId) => warScannedPlayerIds.includes(playerId));
  const armorCodes = new Set(ARMOR.map((armor) => armor.code));
  const warRoleAssignments = {};
  if (allScanned && source.warRoleAssignments && typeof source.warRoleAssignments === "object") {
    for (const [armorCode, playerId] of Object.entries(source.warRoleAssignments)) {
      const normalizedPlayerId = String(playerId || "");
      if (armorCodes.has(armorCode) && activeRosterIds.has(normalizedPlayerId)) warRoleAssignments[armorCode] = normalizedPlayerId;
    }
  }
  const roleCounts = new Map([...activeRosterIds].map((playerId) => [playerId, 0]));
  for (const playerId of Object.values(warRoleAssignments)) roleCounts.set(playerId, (roleCounts.get(playerId) || 0) + 1);
  const rolesComplete = Object.keys(warRoleAssignments).length === ARMOR.length
    && [...activeRosterIds].every((playerId) => roleCounts.get(playerId) >= 1 && roleCounts.get(playerId) <= 2);
  return {
    leaderPlayerId: playerIds.has(String(source.leaderPlayerId || "")) ? String(source.leaderPlayerId) : null,
    rosterFinalized,
    rosterMemberIds: rosterFinalized ? rosterMemberIds : [],
    rosterFinalizedAt: rosterFinalized && source.rosterFinalizedAt ? source.rosterFinalizedAt : null,
    warSessionId: rosterFinalized && source.warSessionId ? String(source.warSessionId) : null,
    warScannedPlayerIds: rosterFinalized ? warScannedPlayerIds : [],
    warScanCompletedAt: allScanned && source.warScanCompletedAt ? source.warScanCompletedAt : null,
    warAssemblySnapshot: allScanned && source.warAssemblySnapshot && typeof source.warAssemblySnapshot === "object" ? source.warAssemblySnapshot : null,
    warRoleAssignments,
    warRolesCompletedAt: rolesComplete && source.warRolesCompletedAt ? source.warRolesCompletedAt : null
  };
}

function postgresConnectionString() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
}

function shouldUsePostgres() {
  return Boolean(postgresConnectionString() && process.env.NODE_ENV !== "test-file");
}

function requiresPersistentDatabase() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

function assertDataStoreReady() {
  if (!shouldUsePostgres() && requiresPersistentDatabase()) {
    throw new Error("DATABASE_URL 또는 POSTGRES_URL 환경변수를 설정해야 합니다. Vercel/production에서는 파일 DB를 사용할 수 없습니다.");
  }
}

async function readParsedJsonFile(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function readJsonFile() {
  let primaryError;
  try {
    return await readParsedJsonFile(DATA_FILE);
  } catch (error) {
    primaryError = error;
  }

  try {
    const recovered = await readParsedJsonFile(BACKUP_DATA_FILE);
    console.warn(`로컬 데이터 파일을 읽지 못해 백업에서 복구했습니다: ${primaryError.message}`);
    return recovered;
  } catch (backupError) {
    if (primaryError.code === "ENOENT" && backupError.code === "ENOENT") return createEmptyData();
    const error = new Error("서버 저장소 데이터 파일과 복구용 백업을 모두 읽지 못했습니다.");
    error.code = "LOCAL_DATA_UNAVAILABLE";
    error.primaryError = primaryError;
    error.backupError = backupError;
    throw error;
  }
}

async function writeFileDurably(filePath, contents) {
  const handle = await fs.open(filePath, "w");
  try {
    await handle.writeFile(contents, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function replaceFile(sourcePath, targetPath) {
  try {
    await fs.rename(sourcePath, targetPath);
  } catch (error) {
    if (!["EEXIST", "EPERM", "ENOTEMPTY"].includes(error.code)) throw error;
    await fs.rm(targetPath, { force: true });
    await fs.rename(sourcePath, targetPath);
  }
}

async function writeJsonFile(data) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  const nonce = `${process.pid}.${Date.now()}`;
  const tempFile = `${DATA_FILE}.${nonce}.tmp`;
  const backupTempFile = `${BACKUP_DATA_FILE}.${nonce}.tmp`;
  const restoreTempFile = `${DATA_FILE}.${nonce}.restore.tmp`;
  await writeFileDurably(tempFile, JSON.stringify(data, null, 2));

  try {
    let currentRaw = null;
    try {
      currentRaw = await fs.readFile(DATA_FILE, "utf8");
      JSON.parse(currentRaw);
    } catch (error) {
      if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
      if (error instanceof SyntaxError) {
        currentRaw = null;
        console.warn(`기존 로컬 데이터가 손상되어 이전 백업을 보존합니다: ${error.message}`);
      }
    }

    if (currentRaw !== null) {
      await writeFileDurably(backupTempFile, currentRaw);
      await replaceFile(backupTempFile, BACKUP_DATA_FILE);
    }

    try {
      await replaceFile(tempFile, DATA_FILE);
    } catch (writeError) {
      try {
        const backupRaw = await fs.readFile(BACKUP_DATA_FILE, "utf8");
        JSON.parse(backupRaw);
        await writeFileDurably(restoreTempFile, backupRaw);
        await replaceFile(restoreTempFile, DATA_FILE);
      } catch (restoreError) {
        writeError.restoreError = restoreError;
      }
      throw writeError;
    }
  } finally {
    await Promise.all([
      fs.rm(tempFile, { force: true }),
      fs.rm(backupTempFile, { force: true }),
      fs.rm(restoreTempFile, { force: true })
    ]);
  }
}

function normalizeDataShape(data) {
  const playerIds = new Set((Array.isArray(data.players) ? data.players : []).map((player) => player.id));
  const teamSettings = {};
  const rawTeamSettings = data.teamSettings && typeof data.teamSettings === "object" ? data.teamSettings : {};
  for (const [rawTeamKey, setting] of Object.entries(rawTeamSettings)) {
    const teamKey = normalizedTeamKey(rawTeamKey);
    if (!teamKey) continue;
    teamSettings[teamKey] = normalizedTeamSetting(setting, playerIds);
  }
  const next = {
    players: Array.isArray(data.players) ? data.players.map((player) => {
      const normalizedPlayer = { ...player };
      delete normalizedPlayer.access_code;
      return normalizedPlayer;
    }) : [],
    inventories: data.inventories && typeof data.inventories === "object" ? data.inventories : {},
    teamSettings,
    drawLogs: Array.isArray(data.drawLogs) ? data.drawLogs : [],
    qrClaims: Array.isArray(data.qrClaims) ? data.qrClaims : [],
    eventLogs: Array.isArray(data.eventLogs) ? data.eventLogs : [],
    exchangeSessions: data.exchangeSessions && typeof data.exchangeSessions === "object" ? data.exchangeSessions : {}
  };
  for (const player of next.players) {
    next.inventories[player.id] = normalizeInventory(next.inventories[player.id] || emptyInventory());
  }
  ensureBooths(next);
  return next;
}

async function withFileData(mutator, { readOnly = false } = {}) {
  const data = normalizeDataShape(await readJsonFile());
  const result = await mutator(data);
  if (!readOnly) await writeJsonFile(data);
  return result;
}

async function loadPostgresData(client, { includeHistory = false } = {}) {
  const eventLogsSql = includeHistory
    ? "coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at) from (select id, player_id, action, detail, created_at from event_logs order by created_at desc limit 80) e), '[]'::jsonb)"
    : "'[]'::jsonb";
  const snapshot = await client.query(`
    select
      (select value from app_metadata where key = 'application') as app_identity,
      coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at) from players p), '[]'::jsonb) as players,
      coalesce((select jsonb_agg(to_jsonb(i)) from inventory i), '[]'::jsonb) as inventory,
      coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at, r.id) from (
        select id, player_id, action, detail, created_at
        from event_logs
        where action in (
          'team_leader_claimed',
          'team_roster_finalized',
          'team_roster_reopened',
          'admin_team_roster_reopened',
          'team_war_scanned',
          'team_war_role_updated'
        )
        order by created_at, id
      ) r), '[]'::jsonb) as team_state_events,
      '[]'::jsonb as draw_logs,
      coalesce((select jsonb_agg(to_jsonb(q) order by q.created_at) from qr_claims q), '[]'::jsonb) as qr_claims,
      ${eventLogsSql} as event_logs,
      coalesce((select jsonb_agg(to_jsonb(x) order by x.booth_id) from exchange_sessions x), '[]'::jsonb) as booths
  `);
  const row = snapshot.rows[0] || {};
  if (row.app_identity !== APP_DATABASE_ID) {
    const error = new Error("연결된 데이터베이스가 이번 수련회 앱 전용 DB가 아닙니다.");
    error.code = "DB_IDENTITY_MISMATCH";
    throw error;
  }
  const players = row.players || [];
  const inventoryRows = row.inventory || [];
  const teamStateEvents = row.team_state_events || [];
  const drawLogs = row.draw_logs || [];
  const qrClaims = row.qr_claims || [];
  const eventLogs = row.event_logs || [];
  const booths = row.booths || [];

  const data = createEmptyData();
  data.players = players.map((row) => ({
    id: row.id,
    name: row.name,
    team: row.team || "",
    gender: row.gender || "male",
    talent: Number(row.talent || 0),
    exp: Number(row.exp || 0),
    score: Number(row.score || 0),
    created_at: row.created_at,
    updated_at: row.updated_at
  }));
  for (const player of data.players) {
    data.inventories[player.id] = emptyInventory();
  }
  const playersById = new Map(data.players.map((player) => [player.id, player]));
  const playerIds = new Set(playersById.keys());
  for (const row of teamStateEvents) {
    const detail = row.detail && typeof row.detail === "object" ? row.detail : {};
    const eventPlayer = playersById.get(row.player_id);
    const teamKey = normalizedTeamKey(detail.teamKey || detail.team || eventPlayer?.team);
    if (!teamKey) continue;
    if (row.action === "team_leader_claimed") {
      if (!playerIds.has(row.player_id)) continue;
      const current = data.teamSettings[teamKey] || emptyTeamSetting();
      data.teamSettings[teamKey] = {
        ...current,
        leaderPlayerId: row.player_id
      };
      continue;
    }
    if (row.action === "team_roster_finalized") {
      const rosterMemberIds = [...new Set((Array.isArray(detail.memberIds) ? detail.memberIds : [])
        .map((playerId) => String(playerId || ""))
        .filter((playerId) => playerIds.has(playerId)))];
      const current = data.teamSettings[teamKey] || emptyTeamSetting();
      data.teamSettings[teamKey] = {
        ...emptyTeamSetting(),
        leaderPlayerId: current.leaderPlayerId || row.player_id,
        rosterFinalized: true,
        rosterMemberIds,
        rosterFinalizedAt: row.created_at,
        warSessionId: String(detail.warSessionId || `war_${row.id}`)
      };
      continue;
    }
    if (row.action === "team_roster_reopened" || row.action === "admin_team_roster_reopened") {
      const current = data.teamSettings[teamKey] || emptyTeamSetting();
      data.teamSettings[teamKey] = {
        ...emptyTeamSetting(),
        leaderPlayerId: current.leaderPlayerId || detail.leaderPlayerId || row.player_id
      };
      continue;
    }
    if (row.action === "team_war_scanned") {
      const current = data.teamSettings[teamKey] || emptyTeamSetting();
      if (!current.rosterFinalized) continue;
      const eventSessionId = String(detail.warSessionId || "");
      if (current.warSessionId && eventSessionId && current.warSessionId !== eventSessionId) continue;
      const memberId = String(detail.memberId || row.player_id || "");
      if (!current.rosterMemberIds.includes(memberId)) continue;
      const warScannedPlayerIds = [...new Set([...(current.warScannedPlayerIds || []), memberId])];
      const allScanned = current.rosterMemberIds.length >= 4
        && current.rosterMemberIds.every((playerId) => warScannedPlayerIds.includes(playerId));
      data.teamSettings[teamKey] = {
        ...current,
        warSessionId: current.warSessionId || eventSessionId || `war_${row.id}`,
        warScannedPlayerIds,
        warScanCompletedAt: allScanned ? (detail.completedAt || row.created_at) : null,
        warAssemblySnapshot: allScanned && detail.assemblySnapshot && typeof detail.assemblySnapshot === "object"
          ? detail.assemblySnapshot
          : current.warAssemblySnapshot
      };
      continue;
    }
    if (row.action === "team_war_role_updated") {
      const current = data.teamSettings[teamKey] || emptyTeamSetting();
      if (!current.rosterFinalized || !current.warScanCompletedAt) continue;
      const eventSessionId = String(detail.warSessionId || "");
      if (current.warSessionId && eventSessionId && current.warSessionId !== eventSessionId) continue;
      const armorCode = String(detail.armorCode || "");
      if (!ARMOR.some((armor) => armor.code === armorCode)) continue;
      const assignments = { ...(current.warRoleAssignments || {}) };
      if (detail.selected) {
        const assignedPlayerId = String(detail.assignedPlayerId || row.player_id || "");
        if (!current.rosterMemberIds.includes(assignedPlayerId)) continue;
        assignments[armorCode] = assignedPlayerId;
      } else if (!assignments[armorCode] || assignments[armorCode] === row.player_id) {
        delete assignments[armorCode];
      }
      data.teamSettings[teamKey] = {
        ...current,
        warRoleAssignments: assignments,
        warRolesCompletedAt: detail.completedAt || null
      };
    }
  }
  for (const row of inventoryRows) {
    if (!data.inventories[row.player_id]) data.inventories[row.player_id] = emptyInventory();
    if (data.inventories[row.player_id][row.armor_code] && data.inventories[row.player_id][row.armor_code][row.grade] !== undefined) {
      data.inventories[row.player_id][row.armor_code][row.grade] = Number(row.count || 0);
    }
  }
  for (const playerId of Object.keys(data.inventories)) {
    data.inventories[playerId] = normalizeInventory(data.inventories[playerId]);
  }
  data.drawLogs = drawLogs.map((row) => ({
    id: row.id,
    playerId: row.player_id,
    drawCount: Number(row.draw_count || 0),
    result: row.result || [],
    createdAt: row.created_at
  }));
  data.qrClaims = qrClaims.map((row) => ({
    id: row.id,
    playerId: row.player_id,
    qrCode: row.qr_code,
    reward: row.reward || {},
    createdAt: row.created_at
  }));
  const mergedEventRows = [...new Map([...eventLogs, ...teamStateEvents].map((row) => [row.id, row])).values()]
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at) || String(a.id).localeCompare(String(b.id)));
  data.eventLogs = mergedEventRows.map((row) => ({
    id: row.id,
    playerId: row.player_id,
    action: row.action,
    detail: row.detail || {},
    createdAt: row.created_at
  }));
  data.exchangeSessions = {};
  for (const row of booths) {
    data.exchangeSessions[String(row.booth_id)] = {
      boothId: String(row.booth_id),
      status: row.status || "empty",
      player1Id: row.player1_id,
      player2Id: row.player2_id,
      player1Items: row.player1_items || [],
      player2Items: row.player2_items || [],
      player1Confirmed: Boolean(row.player1_confirmed),
      player2Confirmed: Boolean(row.player2_confirmed),
      updatedAt: row.updated_at,
      expiresAt: row.expires_at,
      completedAt: row.completed_at
    };
  }
  return normalizeDataShape(data);
}

function playerRows(data) {
  return data.players.map((player) => ({
    id: player.id,
    name: player.name,
    team: player.team || "",
    gender: player.gender || "male",
    talent: Number(player.talent || 0),
    exp: Number(player.exp || 0),
    score: Number(player.score || 0),
    created_at: player.created_at,
    updated_at: player.updated_at
  }));
}

function inventoryRows(data) {
  const rows = [];
  for (const [playerId, inventory] of Object.entries(data.inventories)) {
    const normalized = normalizeInventory(inventory);
    for (const [armorCode, row] of Object.entries(normalized)) {
      for (const [grade, count] of Object.entries(row)) {
        if (count > 0) rows.push({ player_id: playerId, armor_code: armorCode, grade, count: Number(count) });
      }
    }
  }
  return rows;
}

function boothRows(data) {
  return Object.values(data.exchangeSessions).map((booth) => ({
    booth_id: Number(booth.boothId),
    status: booth.status || "empty",
    player1_id: booth.player1Id || null,
    player2_id: booth.player2Id || null,
    player1_items: booth.player1Items || [],
    player2_items: booth.player2Items || [],
    player1_confirmed: Boolean(booth.player1Confirmed),
    player2_confirmed: Boolean(booth.player2Confirmed),
    updated_at: booth.updatedAt || new Date().toISOString(),
    expires_at: booth.expiresAt || null,
    completed_at: booth.completedAt || null
  }));
}

function drawLogRows(data) {
  return data.drawLogs.map((log) => ({
    id: log.id,
    player_id: log.playerId || null,
    draw_count: Number(log.drawCount || 0),
    result: log.result || [],
    created_at: log.createdAt
  }));
}

function qrClaimRows(data) {
  return (data.qrClaims || []).map((claim) => ({
    id: claim.id,
    player_id: claim.playerId,
    qr_code: claim.qrCode,
    reward: claim.reward || {},
    created_at: claim.createdAt
  }));
}

function eventLogRows(data) {
  return data.eventLogs.map((log) => ({
    id: log.id,
    player_id: log.playerId || null,
    action: log.action,
    detail: log.detail || {},
    created_at: log.createdAt
  }));
}

function changedRows(nextRows, previousRows, keyOf) {
  const previous = new Map(previousRows.map((row) => [keyOf(row), JSON.stringify(row)]));
  return nextRows.filter((row) => previous.get(keyOf(row)) !== JSON.stringify(row));
}

function addedRows(nextRows, previousRows, keyOf) {
  const previous = new Set(previousRows.map(keyOf));
  return nextRows.filter((row) => !previous.has(keyOf(row)));
}

async function savePostgresData(client, data, previousData) {
  const players = changedRows(playerRows(data), playerRows(previousData), (row) => row.id);
  const nextInventory = inventoryRows(data);
  const previousInventory = inventoryRows(previousData);
  const inventoryKey = (row) => `${row.player_id}:${row.armor_code}:${row.grade}`;
  const inventoryUpserts = changedRows(nextInventory, previousInventory, inventoryKey);
  const nextInventoryKeys = new Set(nextInventory.map(inventoryKey));
  const inventoryDeletes = previousInventory.filter((row) => !nextInventoryKeys.has(inventoryKey(row)));
  const booths = changedRows(boothRows(data), boothRows(previousData), (row) => String(row.booth_id));
  const drawLogs = addedRows(drawLogRows(data), drawLogRows(previousData), (row) => row.id);
  const qrClaims = addedRows(qrClaimRows(data), qrClaimRows(previousData), (row) => row.id);
  const eventLogs = addedRows(eventLogRows(data), eventLogRows(previousData), (row) => row.id);

  if (players.length) {
    await client.query(`
      insert into players (id, name, team, gender, talent, exp, score, created_at, updated_at)
      select id, name, team, gender, talent, exp, score, created_at::timestamptz, updated_at::timestamptz
      from jsonb_to_recordset($1::jsonb)
      as x(id text, name text, team text, gender text, talent int, exp int, score int, created_at text, updated_at text)
      on conflict (id) do update set
        name = excluded.name,
        team = excluded.team,
        gender = excluded.gender,
        talent = excluded.talent,
        exp = excluded.exp,
        score = excluded.score,
        updated_at = excluded.updated_at
    `, [JSON.stringify(players)]);
  }
  if (inventoryDeletes.length || inventoryUpserts.length || booths.length || drawLogs.length || qrClaims.length || eventLogs.length) {
    await client.query(`
      with
      deleted_inventory as (
        delete from inventory i
        using jsonb_to_recordset($1::jsonb) as x(player_id text, armor_code text, grade text)
        where i.player_id = x.player_id and i.armor_code = x.armor_code and i.grade = x.grade
        returning 1
      ),
      upserted_inventory as (
        insert into inventory (player_id, armor_code, grade, count)
        select player_id, armor_code, grade, count
        from jsonb_to_recordset($2::jsonb)
        as x(player_id text, armor_code text, grade text, count int)
        on conflict (player_id, armor_code, grade) do update set count = excluded.count
        returning 1
      ),
      upserted_booths as (
        insert into exchange_sessions (booth_id, status, player1_id, player2_id, player1_items, player2_items, player1_confirmed, player2_confirmed, updated_at, expires_at, completed_at)
        select booth_id, status, player1_id, player2_id, player1_items, player2_items, player1_confirmed, player2_confirmed, updated_at::timestamptz, expires_at::timestamptz, completed_at::timestamptz
        from jsonb_to_recordset($3::jsonb)
        as x(booth_id int, status text, player1_id text, player2_id text, player1_items jsonb, player2_items jsonb, player1_confirmed boolean, player2_confirmed boolean, updated_at text, expires_at text, completed_at text)
        on conflict (booth_id) do update set
          status = excluded.status,
          player1_id = excluded.player1_id,
          player2_id = excluded.player2_id,
          player1_items = excluded.player1_items,
          player2_items = excluded.player2_items,
          player1_confirmed = excluded.player1_confirmed,
          player2_confirmed = excluded.player2_confirmed,
          updated_at = excluded.updated_at,
          expires_at = excluded.expires_at,
          completed_at = excluded.completed_at
        returning 1
      ),
      inserted_draws as (
        insert into draw_logs (id, player_id, draw_count, result, created_at)
        select id, player_id, draw_count, result, created_at::timestamptz
        from jsonb_to_recordset($4::jsonb)
        as x(id text, player_id text, draw_count int, result jsonb, created_at text)
        on conflict (id) do nothing
        returning 1
      ),
      inserted_claims as (
        insert into qr_claims (id, player_id, qr_code, reward, created_at)
        select id, player_id, qr_code, reward, created_at::timestamptz
        from jsonb_to_recordset($5::jsonb)
        as x(id text, player_id text, qr_code text, reward jsonb, created_at text)
        on conflict (player_id, qr_code) do nothing
        returning 1
      ),
      inserted_events as (
        insert into event_logs (id, player_id, action, detail, created_at)
        select id, player_id, action, detail, created_at::timestamptz
        from jsonb_to_recordset($6::jsonb)
        as x(id text, player_id text, action text, detail jsonb, created_at text)
        on conflict (id) do nothing
        returning 1
      )
      select
        (select count(*) from deleted_inventory) as inventory_deleted,
        (select count(*) from upserted_inventory) as inventory_upserted,
        (select count(*) from upserted_booths) as booths_upserted,
        (select count(*) from inserted_draws) as draws_inserted,
        (select count(*) from inserted_claims) as claims_inserted,
        (select count(*) from inserted_events) as events_inserted
    `, [
      JSON.stringify(inventoryDeletes),
      JSON.stringify(inventoryUpserts),
      JSON.stringify(booths),
      JSON.stringify(drawLogs),
      JSON.stringify(qrClaims),
      JSON.stringify(eventLogs)
    ]);
  }
}

function getPostgresPool() {
  if (!postgresPool) {
    postgresPool = new Pool({
      connectionString: postgresConnectionString(),
      max: Math.max(1, Number(process.env.PG_POOL_MAX || 2)),
      idleTimeoutMillis: 60000,
      connectionTimeoutMillis: 1800,
      statement_timeout: 2800,
      query_timeout: 3200,
      allowExitOnIdle: true
    });
    postgresPool.on("error", (error) => {
      console.error("Postgres 유휴 연결 오류", { code: error?.code || "", message: error?.message || String(error) });
    });
  }
  return postgresPool;
}

function isRetryablePostgresError(error) {
  const code = String(error?.code || "");
  if (["40001", "40P01", "53300", "55P03", "57P01", "57P02", "57P03", "08000", "08001", "08003", "08006", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ENETUNREACH"].includes(code)) return true;
  return code === "57014" && /statement|lock|timeout/i.test(String(error?.message || ""));
}

async function withPostgresData(mutator, { readOnly = false, includeHistory = false } = {}) {
  const pool = getPostgresPool();
  const client = await pool.connect();
  try {
    if (!readOnly) {
      await client.query("begin isolation level serializable");
      await client.query("set local lock_timeout = '2000ms'");
      await client.query("select pg_advisory_xact_lock(91324027)");
    }
    const data = await loadPostgresData(client, { includeHistory });
    const previousData = readOnly ? null : JSON.parse(JSON.stringify(data));
    const result = await mutator(data);
    if (!readOnly) {
      await savePostgresData(client, data, previousData);
      await client.query("commit");
    }
    return result;
  } catch (error) {
    if (!readOnly) {
      try {
        await client.query("rollback");
      } catch {}
    }
    throw error;
  } finally {
    client.release();
  }
}

async function withPostgresRetry(mutator, options) {
  const startedAt = Date.now();
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await withPostgresData(mutator, options);
    } catch (error) {
      lastError = error;
      if (!isRetryablePostgresError(error) || attempt === 1 || Date.now() - startedAt >= 2500) throw error;
      await new Promise((resolve) => setTimeout(resolve, 80 + Math.floor(Math.random() * 101)));
    }
  }
  throw lastError;
}

async function getHealthSnapshot() {
  assertDataStoreReady();
  if (shouldUsePostgres()) {
    const result = await getPostgresPool().query(`
      with
      metadata_shape as (select key, value, updated_at from app_metadata limit 0),
      players_shape as (select id, name, team, gender, talent, exp, score, created_at, updated_at from players limit 0),
      inventory_shape as (select player_id, armor_code, grade, count from inventory limit 0),
      draw_logs_shape as (select id, player_id, draw_count, result, created_at from draw_logs limit 0),
      qr_claims_shape as (select id, player_id, qr_code, reward, created_at from qr_claims limit 0),
      exchange_shape as (
        select booth_id, status, player1_id, player2_id, player1_items, player2_items,
               player1_confirmed, player2_confirmed, updated_at, expires_at, completed_at
        from exchange_sessions limit 0
      ),
      event_logs_shape as (select id, player_id, action, detail, created_at from event_logs limit 0)
      select
        (select value from app_metadata where key = 'application') as app_identity,
        (select count(*)::int from players) as players,
        ((select count(*) from metadata_shape)
          + (select count(*) from players_shape)
          + (select count(*) from inventory_shape)
          + (select count(*) from draw_logs_shape)
          + (select count(*) from qr_claims_shape)
          + (select count(*) from exchange_shape)
          + (select count(*) from event_logs_shape))::int as schema_probe,
        (current_setting('transaction_read_only') = 'off'
          and not pg_is_in_recovery()
          and not row_security_active('public.app_metadata'::regclass)
          and not row_security_active('public.players'::regclass)
          and not row_security_active('public.inventory'::regclass)
          and not row_security_active('public.draw_logs'::regclass)
          and not row_security_active('public.qr_claims'::regclass)
          and not row_security_active('public.exchange_sessions'::regclass)
          and not row_security_active('public.event_logs'::regclass)
          and has_table_privilege(current_user, 'public.app_metadata', 'SELECT')
          and has_table_privilege(current_user, 'public.app_metadata', 'INSERT')
          and has_table_privilege(current_user, 'public.app_metadata', 'UPDATE')
          and has_table_privilege(current_user, 'public.players', 'SELECT')
          and has_table_privilege(current_user, 'public.players', 'INSERT')
          and has_table_privilege(current_user, 'public.players', 'UPDATE')
          and has_table_privilege(current_user, 'public.inventory', 'SELECT')
          and has_table_privilege(current_user, 'public.inventory', 'INSERT')
          and has_table_privilege(current_user, 'public.inventory', 'UPDATE')
          and has_table_privilege(current_user, 'public.inventory', 'DELETE')
          and has_table_privilege(current_user, 'public.draw_logs', 'SELECT')
          and has_table_privilege(current_user, 'public.draw_logs', 'INSERT')
          and has_table_privilege(current_user, 'public.qr_claims', 'SELECT')
          and has_table_privilege(current_user, 'public.qr_claims', 'INSERT')
          and has_table_privilege(current_user, 'public.exchange_sessions', 'SELECT')
          and has_table_privilege(current_user, 'public.exchange_sessions', 'INSERT')
          and has_table_privilege(current_user, 'public.exchange_sessions', 'UPDATE')
          and has_table_privilege(current_user, 'public.event_logs', 'SELECT')
          and has_table_privilege(current_user, 'public.event_logs', 'INSERT')) as writable
    `);
    if (result.rows[0]?.app_identity !== APP_DATABASE_ID) {
      const error = new Error("연결된 데이터베이스가 이번 수련회 앱 전용 DB가 아닙니다.");
      error.code = "DB_IDENTITY_MISMATCH";
      throw error;
    }
    if (!result.rows[0]?.writable) {
      const error = new Error("데이터베이스가 읽기 전용이거나 앱에 필요한 쓰기 권한이 없습니다.");
      error.code = "DATASTORE_NOT_WRITABLE";
      throw error;
    }
    return { storage: "postgres", players: Number(result.rows[0]?.players || 0), schemaReady: true, writable: true, databaseId: APP_DATABASE_ID };
  }
  const data = normalizeDataShape(await readJsonFile());
  return { storage: "file", players: data.players.length, schemaReady: true, writable: true, databaseId: `${APP_DATABASE_ID}-local` };
}

function enqueueDataWork(task) {
  const run = dataQueue.then(task, task);
  dataQueue = run.catch(() => {});
  return run;
}

async function withData(mutator, { readOnly = false, includeHistory = false } = {}) {
  assertDataStoreReady();
  const usePostgres = shouldUsePostgres();
  const task = () => (usePostgres
    ? withPostgresRetry(mutator, { readOnly, includeHistory })
    : withFileData(mutator, { readOnly }));
  return usePostgres && readOnly ? task() : enqueueDataWork(task);
}

async function resetLocalData() {
  await Promise.all([
    fs.rm(DATA_FILE, { force: true }),
    fs.rm(BACKUP_DATA_FILE, { force: true })
  ]);
  await writeJsonFile(normalizeDataShape(createEmptyData()));
}

module.exports = {
  BACKUP_DATA_FILE,
  DATA_FILE,
  assertDataStoreReady,
  getHealthSnapshot,
  isRetryablePostgresError,
  resetLocalData,
  shouldUsePostgres,
  withData
};
