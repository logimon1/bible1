const {
  ARMOR,
  DRAW_COUNTS,
  FOREST_TRIALS,
  QR_REWARDS,
  accessCode,
  addItem,
  addItemWithPromotions,
  addItems,
  boothView,
  boothsView,
  emptyInventory,
  expireBooths,
  hasItems,
  id,
  normalizeInventory,
  nowIso,
  publicPlayer,
  publicQrReward,
  qrRewardByCode,
  rankingFromData,
  removeItems,
  resetBooth,
  sanitizeTradeItems,
  serializeItem
} = require("./core");
const { withData } = require("./store");

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function sendError(res, status, message) {
  sendJson(res, status, { ok: false, error: message });
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("요청 본문 JSON을 읽을 수 없습니다.");
  }
}

function getQuery(req) {
  const host = req.headers.host || "localhost";
  const url = new URL(req.url, `http://${host}`);
  return url.searchParams;
}

function adminAllowed(body) {
  const pin = String(process.env.ADMIN_PIN || "").trim();
  if (!pin) {
    if (process.env.NODE_ENV === "production" || process.env.DATABASE_URL) {
      throw new Error("ADMIN_PIN 환경변수를 설정해야 관리자 기능을 사용할 수 있습니다.");
    }
    return true;
  }
  return String(body.pin || "") === pin;
}

function findPlayerById(data, playerId) {
  return data.players.find((player) => player.id === playerId);
}

function findPlayerByName(data, name) {
  return data.players.find((player) => player.name.trim() === String(name || "").trim());
}

function findPlayersByNameTeam(data, name, team) {
  const cleanName = String(name || "").trim();
  const cleanTeam = String(team || "").trim();
  return data.players.filter((player) => player.name.trim() === cleanName && String(player.team || "").trim() === cleanTeam);
}

function findPlayerByIdentity(data, { name, team = "", accessCode = "" }) {
  const matches = findPlayersByNameTeam(data, name, team);
  const cleanCode = String(accessCode || "").trim();
  if (cleanCode) {
    return matches.find((player) => String(player.access_code || "").trim() === cleanCode) || null;
  }
  if (matches.length === 1 && !matches[0].access_code) return matches[0];
  return null;
}

function statePayload(data, player) {
  const me = player ? publicPlayer(player, data.inventories[player.id] || emptyInventory(), { includePrivate: true }) : null;
  return {
    ok: true,
    armor: ARMOR,
    forestTrials: FOREST_TRIALS,
    qrRewards: QR_REWARDS.map(publicQrReward),
    claimedQrCodes: player ? (data.qrClaims || []).filter((claim) => claim.playerId === player.id).map((claim) => claim.qrCode) : [],
    me,
    ranking: rankingFromData(data),
    booths: boothsView(data)
  };
}

function createEvent(data, playerId, action, detail) {
  data.eventLogs.push({ id: id("log"), playerId, action, detail, createdAt: nowIso() });
}

function validateBoothId(boothId) {
  const value = String(boothId || "");
  if (!["1", "2"].includes(value)) throw new Error("교환소 번호가 올바르지 않습니다.");
  return value;
}

function validateQrReward(code) {
  const reward = qrRewardByCode(code);
  if (!reward) throw new Error("등록되지 않은 QR입니다. 선생님에게 QR 주소를 확인해주세요.");
  return reward;
}

function grantRandomDraws(data, player, count) {
  let inventory = data.inventories[player.id] || emptyInventory();
  const results = [];
  const promotions = [];
  for (let i = 0; i < count; i += 1) {
    const armor = ARMOR[Math.floor(Math.random() * ARMOR.length)];
    const grant = addItemWithPromotions(inventory, armor.code, "B", 1);
    inventory = grant.inventory;
    results.push({ armor: armor.code, armorName: armor.name, grade: "B" });
    promotions.push(...grant.promotions.map((promotion) => ({
      ...promotion,
      armorName: ARMOR.find((item) => item.code === promotion.armor)?.name || promotion.armor
    })));
  }
  data.inventories[player.id] = inventory;
  player.updated_at = nowIso();
  return { results, promotions };
}

function availableItems(inventory) {
  const normalized = normalizeInventory(inventory);
  const items = [];
  for (const armor of ARMOR) {
    for (const grade of ["B", "A", "S"]) {
      const count = normalized[armor.code][grade];
      if (count > 0) items.push({ armor: armor.code, armorName: armor.name, grade, count });
    }
  }
  return items;
}

function joinBooth(data, boothId, playerId) {
  const booth = boothView(data, boothId);
  if (booth.status === "completed") {
    resetBooth(data, boothId);
  }
  const current = data.exchangeSessions[boothId];
  if (!findPlayerById(data, playerId)) throw new Error("학생 정보를 찾을 수 없습니다.");
  if (current.player1Id === playerId || current.player2Id === playerId) {
    return current;
  }
  if (!current.player1Id) {
    current.player1Id = playerId;
    current.status = "waiting";
  } else if (!current.player2Id) {
    current.player2Id = playerId;
    current.status = "ready";
  } else {
    throw new Error("이 교환소는 이미 2명이 사용 중입니다.");
  }
  current.updatedAt = nowIso();
  current.expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  return current;
}

function setBoothItems(data, boothId, playerId, items) {
  const current = data.exchangeSessions[boothId];
  if (!current || (current.player1Id !== playerId && current.player2Id !== playerId)) {
    throw new Error("먼저 교환소에 입장해주세요.");
  }
  const clean = sanitizeTradeItems(items);
  const inventory = data.inventories[playerId] || emptyInventory();
  if (!hasItems(inventory, clean)) throw new Error("선택한 장비를 보유하고 있지 않습니다.");
  if (current.player1Id === playerId) {
    current.player1Items = clean;
    current.player1Confirmed = false;
  } else {
    current.player2Items = clean;
    current.player2Confirmed = false;
  }
  current.status = current.player1Id && current.player2Id ? "ready" : "waiting";
  current.updatedAt = nowIso();
  return current;
}

function confirmBooth(data, boothId, playerId) {
  const current = data.exchangeSessions[boothId];
  if (!current || (current.player1Id !== playerId && current.player2Id !== playerId)) {
    throw new Error("교환소 참여자가 아닙니다.");
  }
  if (!current.player1Id || !current.player2Id) throw new Error("교환 상대를 기다리는 중입니다.");
  if (!current.player1Items.length || !current.player2Items.length) throw new Error("양쪽 모두 교환 장비를 선택해야 합니다.");
  if (current.player1Id === playerId) current.player1Confirmed = true;
  if (current.player2Id === playerId) current.player2Confirmed = true;
  current.updatedAt = nowIso();

  if (current.player1Confirmed && current.player2Confirmed) {
    const p1 = findPlayerById(data, current.player1Id);
    const p2 = findPlayerById(data, current.player2Id);
    const p1Inventory = data.inventories[p1.id] || emptyInventory();
    const p2Inventory = data.inventories[p2.id] || emptyInventory();
    if (!hasItems(p1Inventory, current.player1Items)) throw new Error(`${p1.name}의 교환 장비가 부족합니다.`);
    if (!hasItems(p2Inventory, current.player2Items)) throw new Error(`${p2.name}의 교환 장비가 부족합니다.`);
    const p1Removed = removeItems(p1Inventory, current.player1Items);
    const p2Removed = removeItems(p2Inventory, current.player2Items);
    data.inventories[p1.id] = addItems(p1Removed, current.player2Items);
    data.inventories[p2.id] = addItems(p2Removed, current.player1Items);
    p1.updated_at = nowIso();
    p2.updated_at = nowIso();
    current.status = "completed";
    current.completedAt = nowIso();
    createEvent(data, p1.id, "exchange_completed", {
      boothId,
      sent: current.player1Items.map(serializeItem),
      received: current.player2Items.map(serializeItem),
      with: p2.name
    });
    createEvent(data, p2.id, "exchange_completed", {
      boothId,
      sent: current.player2Items.map(serializeItem),
      received: current.player1Items.map(serializeItem),
      with: p1.name
    });
  }
  return current;
}

async function runAction(action, body, query) {
  return withData(async (data) => {
    for (const boothId of expireBooths(data)) {
      createEvent(data, null, "exchange_expired", { boothId });
    }

    if (action === "state") {
      const identity = {
          name: query.get("name") || body.name || "",
          team: query.get("team") || body.team || "",
          accessCode: query.get("accessCode") || body.accessCode || ""
        };
      const player = (body.playerId ? findPlayerById(data, body.playerId) : null) || findPlayerByIdentity(data, identity);
      return statePayload(data, player);
    }

    if (action === "create-player") {
      const name = String(body.name || "").trim();
      if (!name) throw new Error("이름을 입력해주세요.");
      const team = String(body.team || "").trim();
      const submittedCode = String(body.accessCode || "").trim();
      let player = findPlayerByIdentity(data, { name, team, accessCode: submittedCode });
      const matches = findPlayersByNameTeam(data, name, team);
      if (!player && submittedCode) {
        throw new Error("이름, 조, 입장코드가 일치하는 학생을 찾을 수 없습니다.");
      }
      if (!player && matches.length > 0) {
        throw new Error("이미 같은 이름/조의 캐릭터가 있습니다. 재접속은 입장코드를 입력하거나 선생님에게 확인해주세요.");
      }
      if (!player) {
        player = {
          id: id("p"),
          name,
          team,
          gender: body.gender === "female" ? "female" : "male",
          access_code: accessCode(),
          talent: 0,
          exp: 0,
          score: 0,
          created_at: nowIso(),
          updated_at: nowIso()
        };
        data.players.push(player);
        data.inventories[player.id] = emptyInventory();
        createEvent(data, player.id, "player_created", { team: player.team });
      }
      return statePayload(data, player);
    }

    if (action === "draw") {
      const player = findPlayerById(data, body.playerId);
      if (!player) throw new Error("학생 정보를 찾을 수 없습니다.");
      const count = Number(body.count || 0);
      if (!DRAW_COUNTS.has(count)) throw new Error("1뽑기, 2뽑기, 3뽑기만 가능합니다.");
      const { results, promotions } = grantRandomDraws(data, player, count);
      data.drawLogs.push({ id: id("draw"), playerId: player.id, drawCount: count, result: { results, promotions }, createdAt: nowIso() });
      createEvent(data, player.id, "draw", { count, results, promotions });
      return { ...statePayload(data, player), results, promotions };
    }

    if (action === "qr-state") {
      const reward = validateQrReward(body.code || query.get("code"));
      const player = body.playerId ? findPlayerById(data, body.playerId) : null;
      const claim = player ? (data.qrClaims || []).find((item) => item.playerId === player.id && item.qrCode === reward.code) : null;
      return {
        ...statePayload(data, player),
        qrReward: publicQrReward(reward),
        claimed: Boolean(claim),
        claim
      };
    }

    if (action === "claim-qr") {
      const reward = validateQrReward(body.code || query.get("code"));
      const player = findPlayerById(data, body.playerId);
      if (!player) throw new Error("학생 정보를 찾을 수 없습니다.");
      const existing = (data.qrClaims || []).find((claim) => claim.playerId === player.id && claim.qrCode === reward.code);
      if (existing) {
        return {
          ...statePayload(data, player),
          qrReward: publicQrReward(reward),
          claimed: true,
          alreadyClaimed: true,
          claim: existing,
          results: [],
          promotions: []
        };
      }
      const drawCount = Math.max(0, Math.min(3, Number(reward.reward?.draws || 0)));
      const { results, promotions } = grantRandomDraws(data, player, drawCount);
      const claim = {
        id: id("qr"),
        playerId: player.id,
        qrCode: reward.code,
        reward: { ...reward.reward, results, promotions },
        createdAt: nowIso()
      };
      data.qrClaims = data.qrClaims || [];
      data.qrClaims.push(claim);
      data.drawLogs.push({ id: id("draw"), playerId: player.id, drawCount, result: { source: "qr", qrCode: reward.code, results, promotions }, createdAt: nowIso() });
      createEvent(data, player.id, "qr_claim", { qrCode: reward.code, reward: reward.reward, results, promotions });
      return { ...statePayload(data, player), qrReward: publicQrReward(reward), claimed: true, claim, results, promotions };
    }

    if (action === "ranking") {
      return { ok: true, ranking: rankingFromData(data) };
    }

    if (action === "booth") {
      return { ok: true, booth: boothView(data, validateBoothId(query.get("boothId") || body.boothId)), booths: boothsView(data) };
    }

    if (action === "exchange-join") {
      const boothId = validateBoothId(body.boothId);
      const player = findPlayerById(data, body.playerId);
      if (!player) throw new Error("학생 정보를 찾을 수 없습니다.");
      joinBooth(data, boothId, player.id);
      createEvent(data, player.id, "exchange_join", { boothId });
      return { ...statePayload(data, player), booth: boothView(data, boothId), availableItems: availableItems(data.inventories[player.id]) };
    }

    if (action === "exchange-select") {
      const boothId = validateBoothId(body.boothId);
      const player = findPlayerById(data, body.playerId);
      if (!player) throw new Error("학생 정보를 찾을 수 없습니다.");
      setBoothItems(data, boothId, player.id, body.items);
      createEvent(data, player.id, "exchange_select", { boothId, items: body.items });
      return { ...statePayload(data, player), booth: boothView(data, boothId), availableItems: availableItems(data.inventories[player.id]) };
    }

    if (action === "exchange-confirm") {
      const boothId = validateBoothId(body.boothId);
      const player = findPlayerById(data, body.playerId);
      if (!player) throw new Error("학생 정보를 찾을 수 없습니다.");
      confirmBooth(data, boothId, player.id);
      return { ...statePayload(data, player), booth: boothView(data, boothId), availableItems: availableItems(data.inventories[player.id]) };
    }

    if (action === "exchange-cancel") {
      const boothId = validateBoothId(body.boothId);
      const player = findPlayerById(data, body.playerId);
      if (!player) throw new Error("학생 정보를 찾을 수 없습니다.");
      resetBooth(data, boothId);
      createEvent(data, player.id, "exchange_cancel", { boothId });
      return { ...statePayload(data, player), booth: boothView(data, boothId) };
    }

    if (action === "exchange-reset") {
      if (!adminAllowed(body)) throw new Error("관리자 PIN이 올바르지 않습니다.");
      const boothId = validateBoothId(body.boothId);
      resetBooth(data, boothId);
      createEvent(data, null, "exchange_reset", { boothId });
      return { ok: true, booths: boothsView(data) };
    }

    if (action === "admin") {
      if (!adminAllowed(body)) throw new Error("관리자 PIN이 올바르지 않습니다.");
      return {
        ok: true,
        armor: ARMOR,
        qrRewards: QR_REWARDS.map(publicQrReward),
        ranking: rankingFromData(data),
        players: data.players.map((player) => publicPlayer(player, data.inventories[player.id] || emptyInventory(), { includePrivate: true })),
        booths: boothsView(data),
        logs: data.eventLogs.slice(-80).reverse()
      };
    }

    if (action === "admin-adjust-item") {
      if (!adminAllowed(body)) throw new Error("관리자 PIN이 올바르지 않습니다.");
      const player = findPlayerById(data, body.playerId);
      if (!player) throw new Error("학생 정보를 찾을 수 없습니다.");
      const delta = Number(body.delta || 0);
      if (!delta) throw new Error("변경 수량을 입력해주세요.");
      let inventory = data.inventories[player.id] || emptyInventory();
      if (delta > 0) {
        inventory = addItem(inventory, body.armor, String(body.grade || "B").toUpperCase(), delta);
      } else {
        for (let i = 0; i < Math.abs(delta); i += 1) {
          inventory = removeItems(inventory, [{ armor: body.armor, grade: String(body.grade || "B").toUpperCase() }]);
        }
      }
      data.inventories[player.id] = inventory;
      player.updated_at = nowIso();
      createEvent(data, player.id, "admin_adjust_item", { armor: body.armor, grade: body.grade, delta });
      return { ok: true, player: publicPlayer(player, inventory, { includePrivate: true }), players: data.players.map((p) => publicPlayer(p, data.inventories[p.id] || emptyInventory(), { includePrivate: true })), ranking: rankingFromData(data) };
    }

    if (action === "admin-update-player") {
      if (!adminAllowed(body)) throw new Error("관리자 PIN이 올바르지 않습니다.");
      const player = findPlayerById(data, body.playerId);
      if (!player) throw new Error("학생 정보를 찾을 수 없습니다.");
      if (body.team !== undefined) player.team = String(body.team || "").trim();
      if (body.score !== undefined) player.score = Number(body.score || 0);
      if (body.exp !== undefined) player.exp = Number(body.exp || 0);
      if (body.talent !== undefined) player.talent = Number(body.talent || 0);
      player.updated_at = nowIso();
      createEvent(data, player.id, "admin_update_player", { team: player.team, score: player.score, exp: player.exp, talent: player.talent });
      return { ok: true, player: publicPlayer(player, data.inventories[player.id] || emptyInventory(), { includePrivate: true }), players: data.players.map((p) => publicPlayer(p, data.inventories[p.id] || emptyInventory(), { includePrivate: true })), ranking: rankingFromData(data) };
    }

    throw new Error("알 수 없는 API 액션입니다.");
  });
}

async function handleApiRequest(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  try {
    const query = getQuery(req);
    const action = query.get("action");
    if (!action) {
      sendError(res, 400, "action 파라미터가 필요합니다.");
      return;
    }
    const body = req.method === "GET" ? {} : await readBody(req);
    const payload = await runAction(action, body, query);
    sendJson(res, 200, payload);
  } catch (error) {
    sendError(res, 400, error.message || "요청 처리 중 오류가 발생했습니다.");
  }
}

module.exports = {
  handleApiRequest,
  runAction
};
