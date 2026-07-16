const crypto = require("crypto");

const ARMOR = [
  { code: "belt", name: "진리의 허리띠", meaning: "거짓을 분별하는 힘", ability: "판단력", stat: "판단력", warRole: "관찰자", demon: "거짓의 마귀", missionCode: "mission-judgment", missionStyle: "관찰 · 선택", mission: "상황을 빠르게 관찰하고 진짜와 가짜를 정확히 골라냅니다.", recommendation: "관찰과 판단이 빠른 팀원 추천", icon: "/assets/armor/belt.webp" },
  { code: "breastplate", name: "의의 호심경", meaning: "정죄와 죄책감에서 보호", ability: "인내력", stat: "인내력", warRole: "수호자", demon: "낙심의 마귀", missionCode: "mission-endurance", missionStyle: "균형 · 버티기", mission: "정해진 자세와 조건을 포기하지 않고 끝까지 버팁니다.", recommendation: "체력과 끈기, 집중력이 좋은 팀원 추천", icon: "/assets/armor/breastplate.webp" },
  { code: "shoes", name: "복음의 신발", meaning: "복음을 전하는 발걸음", ability: "스피드", stat: "스피드", warRole: "전령", demon: "추격의 마귀", missionCode: "mission-speed", missionStyle: "달리기 · 전달", mission: "제한 시간 안에 빠르게 달리고 목표물을 정확히 전달합니다.", recommendation: "달리기와 순발력이 좋은 팀원 추천", icon: "/assets/armor/shoes.webp" },
  { code: "shield", name: "믿음의 방패", meaning: "두려움과 의심을 막음", ability: "협동력", stat: "협동력", warRole: "탱커", demon: "분열의 마귀", missionCode: "mission-teamwork", missionStyle: "소통 · 협동", mission: "팀원과 호흡을 맞춰 목표물을 지키거나 함께 운반합니다.", recommendation: "소통과 팀워크가 좋은 팀원 추천", icon: "/assets/armor/shield.webp" },
  { code: "helmet", name: "구원의 투구", meaning: "구원의 확신과 정체성", ability: "지력", stat: "지력", warRole: "전략가", demon: "혼란의 마귀", missionCode: "mission-intellect", missionStyle: "퀴즈 · 퍼즐", mission: "제한 시간 안에 퀴즈와 암기·퍼즐 문제를 해결합니다.", recommendation: "퀴즈와 기억력에 자신 있는 팀원 추천", icon: "/assets/armor/helmet.webp" },
  { code: "sword", name: "말씀의 검", meaning: "하나님의 말씀으로 싸움", ability: "힘", stat: "힘", warRole: "돌격대", demon: "파괴의 마귀", missionCode: "mission-power", missionStyle: "밀기 · 당기기", mission: "힘을 모아 물체를 밀고 당기거나 정해진 지점까지 옮깁니다.", recommendation: "힘쓰기와 몸쓰기에 자신 있는 팀원 추천", icon: "/assets/armor/sword.webp" }
];

const ARMOR_MAP = Object.fromEntries(ARMOR.map((armor) => [armor.code, armor]));
const GRADES = ["B", "A", "S"];
const EQUIPMENT_POWER_VALUES = { B: 10, A: 40, S: 150 };
const DRAW_COUNTS = new Set([1, 2, 3]);
const UPGRADE_REQUIRED_COUNT = 3;

const QR_REWARDS = [
  {
    code: "draw-1",
    type: "draw",
    title: "장비 1회 뽑기",
    description: "스캔할 때마다 장비 1회 뽑기를 진행합니다.",
    repeatable: true,
    reward: { draws: 1 }
  },
  {
    code: "draw-2",
    type: "draw",
    title: "장비 2회 뽑기",
    description: "스캔할 때마다 장비 2회 뽑기를 진행합니다.",
    repeatable: true,
    reward: { draws: 2 }
  },
  {
    code: "draw-3",
    type: "draw",
    title: "장비 3회 뽑기",
    description: "스캔할 때마다 장비 3회 뽑기를 진행합니다.",
    repeatable: true,
    reward: { draws: 3 }
  },
  {
    code: "mission-judgment",
    type: "mission",
    title: "거짓의 마귀 · 판단력 시험",
    armor: "belt",
    stat: "판단력",
    demon: "거짓의 마귀",
    missionStyle: "관찰 · 선택",
    description: "상황을 빠르게 관찰하고 진짜와 가짜를 정확히 골라냅니다.",
    reward: { draws: 1 }
  },
  {
    code: "mission-endurance",
    type: "mission",
    title: "낙심의 마귀 · 인내력 시험",
    armor: "breastplate",
    stat: "인내력",
    demon: "낙심의 마귀",
    missionStyle: "균형 · 버티기",
    description: "정해진 자세와 조건을 포기하지 않고 끝까지 버팁니다.",
    reward: { draws: 1 }
  },
  {
    code: "mission-speed",
    type: "mission",
    title: "추격의 마귀 · 스피드 시험",
    armor: "shoes",
    stat: "스피드",
    demon: "추격의 마귀",
    missionStyle: "달리기 · 전달",
    description: "제한 시간 안에 빠르게 달리고 목표물을 정확히 전달합니다.",
    reward: { draws: 1 }
  },
  {
    code: "mission-teamwork",
    type: "mission",
    title: "분열의 마귀 · 협동력 시험",
    armor: "shield",
    stat: "협동력",
    demon: "분열의 마귀",
    missionStyle: "소통 · 협동",
    description: "팀원과 호흡을 맞춰 목표물을 지키거나 함께 운반합니다.",
    reward: { draws: 1 }
  },
  {
    code: "mission-intellect",
    type: "mission",
    title: "혼란의 마귀 · 지력 시험",
    armor: "helmet",
    stat: "지력",
    demon: "혼란의 마귀",
    missionStyle: "퀴즈 · 퍼즐",
    description: "제한 시간 안에 퀴즈와 암기·퍼즐 문제를 해결합니다.",
    reward: { draws: 1 }
  },
  {
    code: "mission-power",
    type: "mission",
    title: "파괴의 마귀 · 힘 시험",
    armor: "sword",
    stat: "힘",
    demon: "파괴의 마귀",
    missionStyle: "밀기 · 당기기",
    description: "힘을 모아 물체를 밀고 당기거나 정해진 지점까지 옮깁니다.",
    reward: { draws: 1 }
  },
  {
    code: "mission-truth",
    type: "mission",
    title: "판단력 시험 (이전 QR 호환)",
    description: "거짓의 마귀 판단력 시험입니다.",
    armor: "belt",
    stat: "판단력",
    demon: "거짓의 마귀",
    legacy: true,
    reward: { draws: 1 }
  },
  {
    code: "mission-shield",
    type: "mission",
    title: "협동력 시험 (이전 QR 호환)",
    description: "분열의 마귀 협동력 시험입니다.",
    armor: "shield",
    stat: "협동력",
    demon: "분열의 마귀",
    legacy: true,
    reward: { draws: 1 }
  },
  {
    code: "mission-sword",
    type: "mission",
    title: "힘 시험 (이전 QR 호환)",
    description: "파괴의 마귀 힘 시험입니다.",
    armor: "sword",
    stat: "힘",
    demon: "파괴의 마귀",
    legacy: true,
    reward: { draws: 1 }
  },
  {
    code: "hidden-forest-cache-1",
    type: "hidden",
    title: "숨겨진 보급품 1",
    description: "행사장 곳곳의 히든 QR 보상입니다.",
    reward: { draws: 2 }
  },
  {
    code: "hidden-forest-cache-2",
    type: "hidden",
    title: "숨겨진 보급품 2",
    description: "행사장 곳곳의 히든 QR 보상입니다.",
    reward: { draws: 2 }
  },
  {
    code: "boss-forest",
    type: "boss",
    title: "전신갑주 최종 보급",
    description: "메인 이벤트 직전 교사가 지급하는 최종 보상입니다.",
    reward: { draws: 3 }
  }
];

const QR_REWARD_MAP = Object.fromEntries(QR_REWARDS.map((reward) => [reward.code, reward]));

const FOREST_TRIALS = ARMOR.map((armor) => ({
  armor: armor.code,
  armorName: armor.name,
  stat: armor.stat,
  demon: armor.demon,
  missionCode: armor.missionCode,
  missionStyle: armor.missionStyle,
  mission: armor.mission,
  recommendation: armor.recommendation
}));

function nowIso() {
  return new Date().toISOString();
}

function id(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
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
  if (counts.S > 0) {
    counts.B = 0;
    counts.A = 0;
    counts.S = 1;
  }
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
  if (counts.S > 0) {
    counts.B = 0;
    counts.A = 0;
    counts.S = 1;
  }
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

function completedArmorCount(inventory) {
  const normalized = normalizeInventory(inventory);
  return ARMOR.reduce((sum, armor) => sum + (normalized[armor.code].S > 0 ? 1 : 0), 0);
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

function publicPlayer(player, inventory) {
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
    completedArmorCount: completedArmorCount(normalized),
    createdAt: player.created_at,
    updatedAt: player.updated_at
  };
  return view;
}

function publicQrReward(reward) {
  return {
    code: reward.code,
    type: reward.type,
    title: reward.title,
    description: reward.description,
    armor: reward.armor || null,
    stat: reward.stat || null,
    demon: reward.demon || null,
    missionStyle: reward.missionStyle || null,
    repeatable: Boolean(reward.repeatable),
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
    teamSettings: {},
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
