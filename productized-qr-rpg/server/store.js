const fs = require("fs/promises");
const path = require("path");
const { Pool } = require("pg");
const { currentAction } = require("./request-context");
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
let dataQueue = Promise.resolve();
let postgresPool = null;

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
  if (!postgresPool) {
    postgresPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Math.max(1, Number(process.env.DB_POOL_MAX || 3)),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      allowExitOnIdle: true
    });
    postgresPool.on("error", (error) => {
      console.error("PostgreSQL idle client error", error);
    });
  }
  return postgresPool;
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
    rewardTransactions: Array.isArray(data.rewardTransactions) ? data.rewardTransactions : [],
    eventLogs: Array.isArray(data.eventLogs) ? data.eventLogs : [],
    exchangeSessions: data.exchangeSessions && typeof data.exchangeSessions === "object" ? data.exchangeSessions : {}
  };
  for (const player of next.players) {
    next.inventories[player.id] = normalizeInventory(next.inventories[player.id] || emptyInventory());
  }
  ensureBooths(next);
  return next;
}

function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

async function withFileData(mutator) {
  const data = normalizeDataShape(await readJsonFile());
  const result = await mutator(data);
  await writeJsonFile(data);
  return result;
}

async function loadPostgresData(client, { includeHistory = false } = {}) {
  const [
    playersResult,
    inventoryResult,
    drawLogsResult,
    qrClaimsResult,
    rewardTransactionsResult,
    eventLogsResult,
    boothsResult
  ] = await Promise.all([
    client.query("select id, name, team, gender, access_code, active, talent, exp, score, created_at, updated_at from players order by created_at"),
    client.query("select player_id, armor_code, grade, count from inventory"),
    includeHistory
      ? client.query(`
          select id, player_id, draw_count, result, created_at
          from (
            select id, player_id, draw_count, result, created_at
            from draw_logs
            order by created_at desc
            limit 200
          ) recent
          order by created_at
        `)
      : Promise.resolve({ rows: [] }),
    client.query("select id, player_id, mission_code as qr_code, reward, created_at from mission_completions order by created_at"),
    includeHistory
      ? client.query(`
          select id, player_id, source, talent, draw_count, result, created_at
          from (
            select id, player_id, source, talent, draw_count, result, created_at
            from reward_transactions
            order by created_at desc
            limit 500
          ) recent
          order by created_at
        `)
      : Promise.resolve({ rows: [] }),
    includeHistory
      ? client.query(`
          select id, player_id, action, detail, created_at
          from (
            select id, player_id, action, detail, created_at
            from event_logs
            order by created_at desc
            limit 200
          ) recent
          order by created_at
        `)
      : Promise.resolve({ rows: [] }),
    client.query("select booth_id, status, player1_id, player2_id, player1_items, player2_items, player1_confirmed, player2_confirmed, updated_at, expires_at, completed_at from exchange_sessions")
  ]);

  const data = createEmptyData();
  data.players = playersResult.rows.map((row) => ({
    id: row.id,
    name: row.name,
    team: row.team || "",
    gender: row.gender || "male",
    access_code: row.access_code || "",
    active: row.active !== false,
    talent: Number(row.talent || 0),
    exp: Number(row.exp || 0),
    score: Number(row.score || 0),
    created_at: row.created_at,
    updated_at: row.updated_at
  }));

  for (const player of data.players) {
    data.inventories[player.id] = emptyInventory();
  }
  for (const row of inventoryResult.rows) {
    if (!data.inventories[row.player_id]) data.inventories[row.player_id] = emptyInventory();
    if (
      data.inventories[row.player_id][row.armor_code] &&
      data.inventories[row.player_id][row.armor_code][row.grade] !== undefined
    ) {
      data.inventories[row.player_id][row.armor_code][row.grade] = Number(row.count || 0);
    }
  }
  for (const playerId of Object.keys(data.inventories)) {
    data.inventories[playerId] = normalizeInventory(data.inventories[playerId]);
  }

  data.drawLogs = drawLogsResult.rows.map((row) => ({
    id: row.id,
    playerId: row.player_id,
    drawCount: Number(row.draw_count || 0),
    result: row.result || [],
    createdAt: row.created_at
  }));
  data.qrClaims = qrClaimsResult.rows.map((row) => ({
    id: row.id,
    playerId: row.player_id,
    qrCode: row.qr_code,
    reward: row.reward || {},
    createdAt: row.created_at
  }));
  data.rewardTransactions = rewardTransactionsResult.rows.map((row) => ({
    id: row.id,
    playerId: row.player_id,
    source: row.source,
    talent: Number(row.talent || 0),
    drawCount: Number(row.draw_count || 0),
    results: row.result?.results || [],
    promotions: row.result?.promotions || [],
    createdAt: row.created_at
  }));
  data.eventLogs = eventLogsResult.rows.map((row) => ({
    id: row.id,
    playerId: row.player_id,
    action: row.action,
    detail: row.detail || {},
    createdAt: row.created_at
  }));

  data.exchangeSessions = {};
  for (const row of boothsResult.rows) {
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

function sameValue(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function rowsById(rows) {
  return new Map((rows || []).map((row) => [row.id, row]));
}

function changedRows(beforeRows, afterRows) {
  const before = rowsById(beforeRows);
  return (afterRows || []).filter((row) => !before.has(row.id) || !sameValue(before.get(row.id), row));
}

function newRows(beforeRows, afterRows) {
  const beforeIds = new Set((beforeRows || []).map((row) => row.id));
  return (afterRows || []).filter((row) => !beforeIds.has(row.id));
}

function changedInventoryPlayerIds(before, after) {
  const ids = new Set([
    ...Object.keys(before.inventories || {}),
    ...Object.keys(after.inventories || {})
  ]);
  return [...ids].filter((playerId) => {
    const oldInventory = normalizeInventory(before.inventories?.[playerId] || emptyInventory());
    const newInventory = normalizeInventory(after.inventories?.[playerId] || emptyInventory());
    return !sameValue(oldInventory, newInventory);
  });
}

function changedBooths(before, after) {
  const ids = new Set([
    ...Object.keys(before.exchangeSessions || {}),
    ...Object.keys(after.exchangeSessions || {})
  ]);
  return [...ids]
    .map((boothId) => after.exchangeSessions?.[boothId])
    .filter(Boolean)
    .filter((booth) => !sameValue(before.exchangeSessions?.[String(booth.boothId)], booth));
}

function isFullReset(before, after) {
  return (
    before.players.length > 0 &&
    after.players.length === 0 &&
    Object.keys(after.inventories || {}).length === 0 &&
    after.drawLogs.length === 0 &&
    after.qrClaims.length === 0 &&
    after.rewardTransactions.length === 0
  );
}

async function resetPostgresData(client, data) {
  const booths = Object.values(data.exchangeSessions || {}).map((booth) => ({
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
  if (booths.length) {
    await upsertBooths(client, booths);
  }

  await client.query("delete from inventory");
  await client.query("delete from mission_completions");
  await client.query("delete from reward_transactions");
  await client.query("delete from draw_logs");
  await client.query("delete from event_logs");
  await client.query("delete from players");
}

async function upsertPlayers(client, players) {
  if (!players.length) return;
  const rows = players.map((player) => ({
    id: player.id,
    name: player.name,
    team: player.team || "",
    gender: player.gender || "male",
    access_code: player.access_code || "",
    active: player.active !== false,
    talent: Number(player.talent || 0),
    exp: Number(player.exp || 0),
    score: Number(player.score || 0),
    created_at: player.created_at,
    updated_at: player.updated_at
  }));
  await client.query(`
    insert into players (id, name, team, gender, access_code, active, talent, exp, score, created_at, updated_at)
    select id, name, team, gender, access_code, active, talent, exp, score, created_at::timestamptz, updated_at::timestamptz
    from jsonb_to_recordset($1::jsonb)
    as x(id text, name text, team text, gender text, access_code text, active boolean, talent int, exp int, score int, created_at text, updated_at text)
    on conflict (id) do update set
      name = excluded.name,
      team = excluded.team,
      gender = excluded.gender,
      access_code = excluded.access_code,
      active = excluded.active,
      talent = excluded.talent,
      exp = excluded.exp,
      score = excluded.score,
      updated_at = excluded.updated_at
  `, [JSON.stringify(rows)]);
}

async function replaceInventories(client, data, playerIds) {
  if (!playerIds.length) return;
  await client.query("delete from inventory where player_id = any($1::text[])", [playerIds]);

  const rows = [];
  for (const playerId of playerIds) {
    const inventory = normalizeInventory(data.inventories?.[playerId] || emptyInventory());
    for (const [armorCode, grades] of Object.entries(inventory)) {
      for (const [grade, count] of Object.entries(grades)) {
        if (Number(count || 0) > 0) {
          rows.push({
            player_id: playerId,
            armor_code: armorCode,
            grade,
            count: Number(count)
          });
        }
      }
    }
  }
  if (!rows.length) return;
  await client.query(`
    insert into inventory (player_id, armor_code, grade, count)
    select player_id, armor_code, grade, count
    from jsonb_to_recordset($1::jsonb)
    as x(player_id text, armor_code text, grade text, count int)
  `, [JSON.stringify(rows)]);
}

async function upsertBooths(client, booths) {
  if (!booths.length) return;
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

async function insertDrawLogs(client, logs) {
  if (!logs.length) return;
  const rows = logs.map((log) => ({
    id: log.id,
    player_id: log.playerId,
    draw_count: Number(log.drawCount || 0),
    result: log.result || [],
    created_at: log.createdAt
  }));
  await client.query(`
    insert into draw_logs (id, player_id, draw_count, result, created_at)
    select id, player_id, draw_count, result, created_at::timestamptz
    from jsonb_to_recordset($1::jsonb)
    as x(id text, player_id text, draw_count int, result jsonb, created_at text)
    on conflict (id) do nothing
  `, [JSON.stringify(rows)]);
}

async function insertQrClaims(client, claims) {
  if (!claims.length) return;
  const rows = claims.map((claim) => ({
    id: claim.id,
    player_id: claim.playerId,
    qr_code: claim.qrCode,
    reward: claim.reward || {},
    created_at: claim.createdAt
  }));
  await client.query(`
    insert into mission_completions (id, player_id, mission_code, reward, created_at)
    select id, player_id, qr_code, reward, created_at::timestamptz
    from jsonb_to_recordset($1::jsonb)
    as x(id text, player_id text, qr_code text, reward jsonb, created_at text)
    on conflict (player_id, mission_code) do nothing
  `, [JSON.stringify(rows)]);
}

async function insertRewardTransactions(client, transactions) {
  if (!transactions.length) return;
  const rows = transactions.map((transaction) => ({
    id: transaction.id,
    player_id: transaction.playerId,
    source: transaction.source || "",
    talent: Number(transaction.talent || 0),
    draw_count: Number(transaction.drawCount || 0),
    result: {
      results: transaction.results || [],
      promotions: transaction.promotions || []
    },
    created_at: transaction.createdAt
  }));
  await client.query(`
    insert into reward_transactions (id, player_id, source, talent, draw_count, result, created_at)
    select id, player_id, source, talent, draw_count, result, created_at::timestamptz
    from jsonb_to_recordset($1::jsonb)
    as x(id text, player_id text, source text, talent int, draw_count int, result jsonb, created_at text)
    on conflict (id) do nothing
  `, [JSON.stringify(rows)]);
}

async function insertEventLogs(client, logs) {
  if (!logs.length) return;
  const rows = logs.map((log) => ({
    id: log.id,
    player_id: log.playerId || null,
    action: log.action,
    detail: log.detail || {},
    created_at: log.createdAt
  }));
  await client.query(`
    insert into event_logs (id, player_id, action, detail, created_at)
    select id, player_id, action, detail, created_at::timestamptz
    from jsonb_to_recordset($1::jsonb)
    as x(id text, player_id text, action text, detail jsonb, created_at text)
    on conflict (id) do nothing
  `, [JSON.stringify(rows)]);
}

async function savePostgresChanges(client, before, after) {
  if (isFullReset(before, after)) {
    await resetPostgresData(client, after);
    return;
  }

  const players = changedRows(before.players, after.players);
  const inventoryPlayerIds = changedInventoryPlayerIds(before, after);
  const booths = changedBooths(before, after).map((booth) => ({
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

  await upsertPlayers(client, players);
  await replaceInventories(client, after, inventoryPlayerIds);
  await upsertBooths(client, booths);
  await insertDrawLogs(client, newRows(before.drawLogs, after.drawLogs));
  await insertQrClaims(client, newRows(before.qrClaims, after.qrClaims));
  await insertRewardTransactions(client, newRows(before.rewardTransactions, after.rewardTransactions));
  await insertEventLogs(client, newRows(before.eventLogs, after.eventLogs));
}

const READ_ONLY_ACTIONS = new Set([
  "state",
  "qr-state",
  "ranking",
  "booth",
  "admin",
  "admin-export-csv"
]);

async function withPostgresData(mutator) {
  const action = currentAction();
  const readOnly = READ_ONLY_ACTIONS.has(action);
  const includeHistory = action.startsWith("admin");
  const client = await getPostgresPool().connect();

  if (readOnly) {
    try {
      const data = await loadPostgresData(client, { includeHistory });
      return await mutator(data);
    } finally {
      client.release();
    }
  }

  try {
    await client.query("begin isolation level serializable");
    await client.query("select pg_advisory_xact_lock($1)", [91324027]);
    const data = await loadPostgresData(client, { includeHistory });
    const before = cloneData(data);
    const result = await mutator(data);
    await savePostgresChanges(client, before, data);
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
  return enqueueDataWork(() => (shouldUsePostgres() ? withPostgresData(mutator) : withFileData(mutator)));
}

async function resetLocalData() {
  await writeJsonFile(createEmptyData());
}

module.exports = {
  DATA_FILE,
  assertDataStoreReady,
  resetLocalData,
  shouldUsePostgres,
  withData
};
