const crypto = require("crypto");

const ARMOR = [
  { code: "belt", name: "진리의 허리띠", meaning: "거짓을 분별하는 힘", ability: "말씀 분별력", icon: "assets/armor/belt.png" },
  { code: "breastplate", name: "의의 호심경", meaning: "정죄와 죄책감에서 보호", ability: "의로움 방어력", icon: "assets/armor/breastplate.png" },
  { code: "shoes", name: "복음의 신발", meaning: "복음을 전하는 발걸음", ability: "복음 발걸음", icon: "assets/armor/shoes.png" },
  { code: "shield", name: "믿음의 방패", meaning: "두려움과 의심을 막음", ability: "믿음 방어력", icon: "assets/armor/shield.png" },
  { code: "helmet", name: "구원의 투구", meaning: "구원의 확신과 정체성", ability: "구원 확신력", icon: "assets/armor/helmet.png" },
  { code: "sword", name: "말씀의 검", meaning: "하나님의 말씀으로 싸움", ability: "말씀 공격력", icon: "assets/armor/sword.png" }
];

const ARMOR_MAP = Object.fromEntries(ARMOR.map((armor) => [armor.code, armor]));
const GRADES = ["B", "A", "S"];
const EQUIPMENT_POWER_VALUES = { B: 10, A: 40, S: 150 };
const DRAW_COUNTS = new Set([1, 2, 3]);
const UPGRADE_REQUIRED_COUNT = 3;

const QR_REWARDS = [
  {
    code: "mission-truth",
    type: "mission",
    title: "진리 분별 미션",
    description: "말씀과 상황 카드 중 거짓을 분별한 학생에게 지급합니다.",
    reward: { draws: 1 }
  },
  {
    code: "mission-shield",
    type: "mission",
    title: "믿음 방패 미션",
    description: "두려움 앞에서 믿음의 선택을 고백한 학생에게 지급합니다.",
    reward: { draws: 1 }
  },
  {
    code: "mission-sword",
    type: "mission",
    title: "말씀의 검 미션",
    description: "말씀 구절을 찾아 미션을 해결한 학생에게 지급합니다.",
    reward: { draws: 1 }
  },
  {
    code: "hidden-forest-cache-1",
    type: "hidden",
    title: "숨겨진 숲 보급품 1",
    description: "시련의 숲 주변 히든 QR 보상입니다.",
    reward: { draws: 2 }
  },
  {
    code: "hidden-forest-cache-2",
    type: "hidden",
    title: "숨겨진 숲 보급품 2",
    description: "시련의 숲 주변 히든 QR 보상입니다.",
    reward: { draws: 2 }
  },
  {
    code: "boss-forest",
    type: "boss",
    title: "시련의 숲 최종 보급",
    description: "메인 이벤트 직전 교사가 지급하는 최종 보상입니다.",
    reward: { draws: 3 }
  }
];

const QR_REWARD_MAP = Object.fromEntries(QR_REWARDS.map((reward) => [reward.code, reward]));

const FOREST_TRIALS = [
  { armor: "belt", demon: "거짓의 마귀", mission: "말씀과 상황 카드 중 거짓을 분별합니다.", benefit: "진리의 힌트를 먼저 볼 수 있습니다." },
  { armor: "breastplate", demon: "정죄의 마귀", mission: "정죄의 문장을 복음적 고백으로 바꿉니다.", benefit: "실패 시 격려 미션으로 감점을 막습니다." },
  { armor: "shoes", demon: "포기의 마귀", mission: "제한 시간 안에 복음 메시지를 전달합니다.", benefit: "이동/전달 제한 시간을 늘립니다." },
  { armor: "shield", demon: "두려움의 마귀", mission: "두려움 카드 앞에서 믿음의 선택을 고백합니다.", benefit: "마귀 방해를 한 번 막습니다." },
  { armor: "helmet", demon: "혼란의 마귀", mission: "구원 확신과 정체성 문장을 맞춥니다.", benefit: "섞인 보기 중 하나를 제거합니다." },
  { armor: "sword", demon: "공격의 마귀", mission: "말씀 구절을 찾아 공격을 막아냅니다.", benefit: "말씀 카드 힌트를 추가로 받습니다." }
];

function nowIso() {
  return new Date().toISOString();
}

function id(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function accessCode() {
  return String(crypto.randomInt(1000, 10000));
}

function emptyInventory() {
  const inventory = {};
  for (const armor of ARMOR) {
    inventory[armor.code] = { B: 0, A: 0, S: 0 };
  }
  return inventory;
}

function cloneInventory(inventory = {}) {
  const next = emptyInventory();
  for (const armor of ARMOR) {
    const row = inventory[armor.code] || {};
    for (const grade of GRADES) {
      next[armor.code][grade] = Math.max(0, Number(row[grade] || 0));
    }
  }
  return next;
}

function normalizeArmor(counts) {
  while (counts.B >= UPGRADE_REQUIRED_COUNT) {
    counts.B -= UPGRADE_REQUIRED_COUNT;
    counts.A += 1;
  }
  while (counts.A >= UPGRADE_REQUIRED_COUNT) {
    counts.A -= UPGRADE_REQUIRED_COUNT;
    counts.S += 1;
  }
  counts.B = Math.max(0, counts.B);
  counts.A = Math.max(0, counts.A);
  counts.S = Math.max(0, counts.S);
}

function normalizeArmorWithPromotions(counts, armorCode) {
  const promotions = [];
  while (counts.B >= UPGRADE_REQUIRED_COUNT) {
    counts.B -= UPGRADE_REQUIRED_COUNT;
    counts.A += 1;
    promotions.push({ armor: armorCode, from: "B", to: "A", count: UPGRADE_REQUIRED_COUNT });
  }
  while (counts.A >= UPGRADE_REQUIRED_COUNT) {
    counts.A -= UPGRADE_REQUIRED_COUNT;
    counts.S += 1;
    promotions.push({ armor: armorCode, from: "A", to: "S", count: UPGRADE_REQUIRED_COUNT });
  }
  counts.B = Math.max(0, counts.B);
  counts.A = Math.max(0, counts.A);
  counts.S = Math.max(0, counts.S);
  return promotions;
}

function normalizeInventory(inventory) {
  const next = cloneInventory(inventory);
  for (const armor of ARMOR) {
    normalizeArmor(next[armor.code]);
  }
  return next;
}

function addItem(inventory, armorCode, grade = "B", count = 1) {
  if (!ARMOR_MAP[armorCode]) throw new Error("알 수 없는 갑주입니다.");
  if (!GRADES.includes(grade)) throw new Error("알 수 없는 등급입니다.");
  const next = cloneInventory(inventory);
  next[armorCode][grade] += Math.max(0, Number(count || 0));
  return normalizeInventory(next);
}

function addItemWithPromotions(inventory, armorCode, grade = "B", count = 1) {
  if (!ARMOR_MAP[armorCode]) throw new Error("알 수 없는 갑주입니다.");
  if (!GRADES.includes(grade)) throw new Error("알 수 없는 등급입니다.");
  const next = cloneInventory(inventory);
  next[armorCode][grade] += Math.max(0, Number(count || 0));
  const promotions = normalizeArmorWithPromotions(next[armorCode], armorCode);
  return { inventory: next, promotions };
}

function removeItems(inventory, items) {
  const next = cloneInventory(inventory);
  for (const item of items) {
    if (!ARMOR_MAP[item.armor] || !GRADES.includes(item.grade)) {
      throw new Error("교환 장비 정보가 올바르지 않습니다.");
    }
    if (next[item.armor][item.grade] <= 0) {
      throw new Error(`${ARMOR_MAP[item.armor].name} ${item.grade}급이 부족합니다.`);
    }
    next[item.armor][item.grade] -= 1;
  }
  return normalizeInventory(next);
}

function addItems(inventory, items) {
  let next = cloneInventory(inventory);
  for (const item of items) {
    next = addItem(next, item.armor, item.grade, 1);
  }
  return normalizeInventory(next);
}

function hasItems(inventory, items) {
  const needed = {};
  for (const item of items) {
    const key = `${item.armor}:${item.grade}`;
    needed[key] = (needed[key] || 0) + 1;
  }
  const owned = cloneInventory(inventory);
  return Object.entries(needed).every(([key, count]) => {
    const [armor, grade] = key.split(":");
    return (owned[armor] && owned[armor][grade] >= count);
  });
}

function sanitizeTradeItems(items) {
  if (!Array.isArray(items)) throw new Error("교환 장비를 선택해주세요.");
  const clean = items
    .filter(Boolean)
    .slice(0, 2)
    .map((item) => ({ armor: String(item.armor || ""), grade: String(item.grade || "").toUpperCase() }));
  if (!clean.length) throw new Error("최소 1개 이상의 장비를 선택해주세요.");
  for (const item of clean) {
    if (!ARMOR_MAP[item.armor] || !GRADES.includes(item.grade)) {
      throw new Error("교환 장비 정보가 올바르지 않습니다.");
    }
  }
  return clean;
}

function gradeCounts(inventory) {
  const normalized = cloneInventory(inventory);
  const counts = { B: 0, A: 0, S: 0 };
  for (const armor of ARMOR) {
    for (const grade of GRADES) {
      counts[grade] += normalized[armor.code][grade];
    }
  }
  return counts;
}

function ownedArmorCount(inventory) {
  const normalized = cloneInventory(inventory);
  return ARMOR.reduce((sum, armor) => {
    const row = normalized[armor.code];
    return sum + (row.B + row.A + row.S > 0 ? 1 : 0);
  }, 0);
}

function topGrade(inventory, armorCode) {
  const row = cloneInventory(inventory)[armorCode];
  if (!row) return null;
  if (row.S > 0) return "S";
  if (row.A > 0) return "A";
  if (row.B > 0) return "B";
  return null;
}

function collectionScore(inventory) {
  const counts = gradeCounts(inventory);
  return ownedArmorCount(inventory) * 100 + counts.S * 18 + counts.A * 8 + counts.B * 3;
}

function equipmentPower(inventory) {
  const counts = gradeCounts(inventory);
  return counts.B * EQUIPMENT_POWER_VALUES.B + counts.A * EQUIPMENT_POWER_VALUES.A + counts.S * EQUIPMENT_POWER_VALUES.S;
}

function publicPlayer(player, inventory, options = {}) {
  const normalized = normalizeInventory(inventory);
  const counts = gradeCounts(normalized);
  const view = {
    id: player.id,
    name: player.name,
    team: player.team || "",
    gender: player.gender || "male",
    talent: Number(player.talent || 0),
    exp: Number(player.exp || 0),
    score: Number(player.score || 0),
    inventory: normalized,
    gradeCounts: counts,
    collectionScore: collectionScore(normalized),
    equipmentPower: equipmentPower(normalized),
    ownedArmorCount: ownedArmorCount(normalized),
    createdAt: player.created_at,
    updatedAt: player.updated_at
  };
  if (options.includePrivate) view.accessCode = player.access_code || "";
  return view;
}

function publicQrReward(reward) {
  return {
    code: reward.code,
    type: reward.type,
    title: reward.title,
    description: reward.description,
    reward: reward.reward
  };
}

function qrRewardByCode(code) {
  return QR_REWARD_MAP[String(code || "")] || null;
}

function rankingFromData(data) {
  return data.players
    .map((player) => publicPlayer(player, data.inventories[player.id] || emptyInventory()))
    .sort((a, b) => b.equipmentPower - a.equipmentPower || b.gradeCounts.S - a.gradeCounts.S || b.gradeCounts.A - a.gradeCounts.A || b.gradeCounts.B - a.gradeCounts.B || a.name.localeCompare(b.name, "ko"))
    .map((player, index) => ({ ...player, rank: index + 1 }));
}

function ensureBooths(data) {
  data.exchangeSessions = data.exchangeSessions || {};
  for (const boothId of ["1", "2"]) {
    if (!data.exchangeSessions[boothId]) {
      data.exchangeSessions[boothId] = emptyBooth(boothId);
    }
  }
}

function emptyBooth(boothId) {
  return {
    boothId: String(boothId),
    status: "empty",
    player1Id: null,
    player2Id: null,
    player1Items: [],
    player2Items: [],
    player1Confirmed: false,
    player2Confirmed: false,
    updatedAt: nowIso(),
    expiresAt: null,
    completedAt: null
  };
}

function resetBooth(data, boothId) {
  ensureBooths(data);
  data.exchangeSessions[String(boothId)] = emptyBooth(boothId);
  return data.exchangeSessions[String(boothId)];
}

function expireBooths(data, now = new Date()) {
  ensureBooths(data);
  const expired = [];
  const nowTime = new Date(now).getTime();
  for (const boothId of Object.keys(data.exchangeSessions)) {
    const booth = data.exchangeSessions[boothId];
    if (!booth || booth.status === "empty" || booth.status === "completed" || !booth.expiresAt) continue;
    const expiresTime = new Date(booth.expiresAt).getTime();
    if (Number.isFinite(expiresTime) && expiresTime <= nowTime) {
      resetBooth(data, boothId);
      expired.push(String(boothId));
    }
  }
  return expired;
}

function boothView(data, boothId) {
  ensureBooths(data);
  const booth = data.exchangeSessions[String(boothId)] || emptyBooth(boothId);
  const getName = (playerId) => data.players.find((p) => p.id === playerId)?.name || null;
  return {
    ...booth,
    player1Name: getName(booth.player1Id),
    player2Name: getName(booth.player2Id)
  };
}

function boothsView(data) {
  ensureBooths(data);
  return ["1", "2"].map((boothId) => boothView(data, boothId));
}

function createEmptyData() {
  const data = {
    players: [],
    inventories: {},
    drawLogs: [],
    qrClaims: [],
    eventLogs: [],
    exchangeSessions: {}
  };
  ensureBooths(data);
  return data;
}

function serializeItem(item) {
  const armor = ARMOR_MAP[item.armor];
  return `${armor ? armor.name : item.armor} ${item.grade}`;
}

module.exports = {
  ARMOR,
  ARMOR_MAP,
  DRAW_COUNTS,
  EQUIPMENT_POWER_VALUES,
  FOREST_TRIALS,
  GRADES,
  QR_REWARDS,
  accessCode,
  addItem,
  addItemWithPromotions,
  addItems,
  boothView,
  boothsView,
  cloneInventory,
  createEmptyData,
  emptyBooth,
  emptyInventory,
  expireBooths,
  collectionScore,
  equipmentPower,
  hasItems,
  id,
  normalizeInventory,
  nowIso,
  ownedArmorCount,
  publicPlayer,
  publicQrReward,
  qrRewardByCode,
  rankingFromData,
  removeItems,
  resetBooth,
  sanitizeTradeItems,
  serializeItem,
  topGrade
};
