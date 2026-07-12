const fs = require("fs/promises");
const path = require("path");
const { AsyncLocalStorage } = require("async_hooks");
const { Pool } = require("pg");
const { createEmptyData, emptyInventory, ensureBooths, normalizeInventory } = (() => {
  const core = require("./core");
  return {
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
const requestContext = new AsyncLocalStorage();
const READ_ONLY_ACTIONS = new Set(["state", "ranking", "booth", "admin", "qr-state"]);
const POOL_KEY = Symbol.for("armor-rpg.postgres-pool");
let dataQueue = Promise.resolve();

function shouldUsePostgres() {
  return Boolean(process.env.DATABASE_URL && process.env.NODE_ENV !== "test-file");
}

function requiresPersistentDatabase() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

function assertDataStoreReady() {
  if (!shouldUsePostgres() && requiresPersistentDatabase()) {
    throw new Error("DATABASE_URL 환경변수를 설정해야 합니다. Vercel/production에서는 파일 DB를 사용할 수 없습니다.");
  }
}

function getPostgresPool() {
  if (!globalThis[POOL_KEY]) {
    globalThis[POOL_KEY] = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 8000,
      allowExitOnIdle: true
    });
  }
  return globalThis[POOL_KEY];
}

function runWithRequestContext(context, callback) {
  return requestContext.run(context || {}, callback);
}

function currentAction() {
  return requestContext.getStore()?.action || "";
}

async function readJsonFile() {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return createEmptyData();
  }
}

async function writeJsonFile(data) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  const tempFile = `${DATA_FILE}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(data, null, 2), "utf8");
  await fs.rm(DATA_FILE, { force: true });
  await fs.rename(tempFile, DATA_FILE);
}

function normalizeDataShape(data) {
  const next = {
    players: Array.isArray(data.players) ? data.players : [],
    inventories: data.inventories && typeof data.inventories === "object" ? data.inventories : {},
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

async function loadPostgresData(client, { includeHistory = true } = {}) {
  const drawLogsPromise = includeHistory
    ? client.query("select id, player_id, draw_count, result, created_at from draw_logs order by created_at")
    : Promise.resolve({ rows: [] });
  const eventLogsPromise = includeHistory
    ? client.query("select id, player_id, action, detail, created_at from event_logs order by created_at")
    : Promise.resolve({ rows: [] });

  const [playersResult, inventoryResult, drawLogsResult, qrClaimsResult, eventLogsResult, boothsResult] = await Promise.all([
    client.query("select id, name, team, gender, access_code, talent, exp, score, created_at, updated_at from players order by created_at"),
    client.query("select player_id, armor_code, grade, count from inventory"),
    drawLogsPromise,
    client.query("select id, player_id, qr_code, reward, created_at from qr_claims order by created_at"),
    eventLogsPromise,
    client.query("select booth_id, status, player1_id, player2_id, player1_items, player2_items, player1_confirmed, player2_confirmed, updated_at, expires_at, completed_at from exchange_sessions")
  ]);
  const players = playersResult.rows;
  const inventoryRows = inventoryResult.rows;
  const drawLogs = drawLogsResult.rows;
  const qrClaims = qrClaimsResult.rows;
  const eventLogs = eventLogsResult.rows;
  const booths = boothsResult.rows;

  const data = createEmptyData();
  data.players = players.map((row) => ({
    id: row.id,
    name: row.name,
    team: row.team || "",
    gender: row.gender || "male",
    access_code: row.access_code || "",
    talent: Number(row.talent || 0),
    exp: Number(row.exp || 0),
    score: Number(row.score || 0),
    created_at: row.created_at,
    updated_at: row.updated_at
  }));
  for (const player of data.players) {
    data.inventories[player.id] = emptyInventory();
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
  data.eventLogs = eventLogs.map((row) => ({
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

async function savePostgresData(client, data) {
  const players = data.players.map((player) => ({
    id: player.id,
    name: player.name,
    team: player.team || "",
    gender: player.gender || "male",
    access_code: player.access_code || "",
    talent: Number(player.talent || 0),
    exp: Number(player.exp || 0),
    score: Number(player.score || 0),
    created_at: player.created_at,
    updated_at: player.updated_at
  }));
  const inventoryRows = [];
  for (const [playerId, inventory] of Object.entries(data.inventories)) {
    const normalized = normalizeInventory(inventory);
    for (const [armorCode, row] of Object.entries(normalized)) {
      for (const [grade, count] of Object.entries(row)) {
        if (count > 0) inventoryRows.push({ player_id: playerId, armor_code: armorCode, grade, count });
      }
    }
  }
  const booths = Object.values(data.exchangeSessions).map((booth) => ({
    booth_id: Number(booth.boothId),
    status: booth.status,
    player1_id: booth.player1Id,
    player2_id: booth.player2Id,
    player1_items: booth.player1Items || [],
    player2_items: booth.player2Items || [],
    player1_confirmed: Boolean(booth.player1Confirmed),
    player2_confirmed: Boolean(booth.player2Confirmed),
    updated_at: booth.updatedAt,
    expires_at: booth.expiresAt,
    completed_at: booth.completedAt
  }));
  const drawLogs = data.drawLogs.map((log) => ({
    id: log.id,
    player_id: log.playerId,
    draw_count: Number(log.drawCount || 0),
    result: log.result || [],
    created_at: log.createdAt
  }));
  const qrClaims = (data.qrClaims || []).map((claim) => ({
    id: claim.id,
    player_id: claim.playerId,
    qr_code: claim.qrCode,
    reward: claim.reward || {},
    created_at: claim.createdAt
  }));
  const eventLogs = data.eventLogs.map((log) => ({
    id: log.id,
    player_id: log.playerId || null,
    action: log.action,
    detail: log.detail || {},
    created_at: log.createdAt
  }));

  if (players.length) {
    await client.query(`
      insert into players (id, name, team, gender, access_code, talent, exp, score, created_at, updated_at)
      select id, name, team, gender, access_code, talent, exp, score, created_at::timestamptz, updated_at::timestamptz
      from jsonb_to_recordset($1::jsonb)
      as x(id text, name text, team text, gender text, access_code text, talent int, exp int, score int, created_at text, updated_at text)
      on conflict (id) do update set
        name = excluded.name,
        team = excluded.team,
        gender = excluded.gender,
        access_code = excluded.access_code,
        talent = excluded.talent,
        exp = excluded.exp,
        score = excluded.score,
        updated_at = excluded.updated_at
    `, [JSON.stringify(players)]);
  }
  await client.query("delete from inventory");
  if (inventoryRows.length) {
    await client.query(`
      insert into inventory (player_id, armor_code, grade, count)
      select player_id, armor_code, grade, count
      from jsonb_to_recordset($1::jsonb)
      as x(player_id text, armor_code text, grade text, count int)
    `, [JSON.stringify(inventoryRows)]);
  }
  if (booths.length) {
    await client.query(`
      insert into exchange_sessions (booth_id, status, player1_id, player2_id, player1_items, player2_items, player1_confirmed, player2_confirmed, updated_at, expires_at, completed_at)
      select booth_id, status, player1_id, player2_id, player1_items, player2_items, player1_confirmed, player2_confirmed, updated_at::timestamptz, expires_at::timestamptz, completed_at::timestamptz
      from jsonb_to_recordset($1::jsonb)
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
    `, [JSON.stringify(booths)]);
  }
  if (drawLogs.length) {
    await client.query(`
      insert into draw_logs (id, player_id, draw_count, result, created_at)
      select id, player_id, draw_count, result, created_at::timestamptz
      from jsonb_to_recordset($1::jsonb)
      as x(id text, player_id text, draw_count int, result jsonb, created_at text)
      on conflict (id) do nothing
    `, [JSON.stringify(drawLogs)]);
  }
  if (qrClaims.length) {
    await client.query(`
      insert into qr_claims (id, player_id, qr_code, reward, created_at)
      select id, player_id, qr_code, reward, created_at::timestamptz
      from jsonb_to_recordset($1::jsonb)
      as x(id text, player_id text, qr_code text, reward jsonb, created_at text)
      on conflict (player_id, qr_code) do nothing
    `, [JSON.stringify(qrClaims)]);
  }
  if (eventLogs.length) {
    await client.query(`
      insert into event_logs (id, player_id, action, detail, created_at)
      select id, player_id, action, detail, created_at::timestamptz
      from jsonb_to_recordset($1::jsonb)
      as x(id text, player_id text, action text, detail jsonb, created_at text)
      on conflict (id) do nothing
    `, [JSON.stringify(eventLogs)]);
  }
}

async function withPostgresReadData(mutator, { includeHistory = false } = {}) {
  const client = await getPostgresPool().connect();
  try {
    const data = await loadPostgresData(client, { includeHistory });
    return await mutator(data);
  } finally {
    client.release();
  }
}

async function withPostgresWriteData(mutator) {
  const client = await getPostgresPool().connect();
  try {
    await client.query("begin isolation level serializable");
    await client.query("select pg_advisory_xact_lock($1)", [91324027]);
    const data = await loadPostgresData(client, { includeHistory: true });
    const result = await mutator(data);
    await savePostgresData(client, data);
    await client.query("commit");
    return result;
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}

function enqueueDataWork(task) {
  const run = dataQueue.then(task, task);
  dataQueue = run.catch(() => {});
  return run;
}

async function withData(mutator) {
  assertDataStoreReady();
  const action = currentAction();
  const readOnly = READ_ONLY_ACTIONS.has(action);
  const includeHistory = action === "admin";

  if (shouldUsePostgres()) {
    if (readOnly) return withPostgresReadData(mutator, { includeHistory });
    return enqueueDataWork(() => withPostgresWriteData(mutator));
  }

  return enqueueDataWork(() => withFileData(mutator, { readOnly }));
}

async function resetLocalData() {
  await writeJsonFile(createEmptyData());
}

module.exports = {
  DATA_FILE,
  assertDataStoreReady,
  resetLocalData,
  runWithRequestContext,
  shouldUsePostgres,
  withData
};
