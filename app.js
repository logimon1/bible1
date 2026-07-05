const app = document.getElementById("app");
const toastRoot = document.getElementById("toast-root");

const state = {
  me: null,
  armor: [],
  ranking: [],
  booths: [],
  forestTrials: [],
  qrRewards: [],
  claimedQrCodes: [],
  poll: null,
  lastResults: [],
  lastQrResults: [],
  exchangeDraft: {},
  selectedForestArmors: []
};

const STORAGE_PLAYER = "armor_forest_player_id";
const STORAGE_NAME = "armor_forest_name";
const STORAGE_TEAM = "armor_forest_team";
const STORAGE_CODE = "armor_forest_access_code";
const STORAGE_PIN = "armor_forest_admin_pin";
const GRADE_ORDER = ["S", "A", "B"];
const EQUIPMENT_POWER_VALUES = { B: 10, A: 40, S: 150 };
const LEFT_EQUIPMENT_SLOTS = ["helmet", "breastplate", "sword"];
const RIGHT_EQUIPMENT_SLOTS = ["shield", "belt", "shoes"];

function route() {
  const hash = location.hash.replace(/^#/, "");
  const raw = hash || location.pathname || "/";
  const parts = raw.split("/").filter(Boolean);
  return { path: `/${parts.join("/")}`, parts };
}

function nav(path) {
  if (path === route().path) return render();
  history.pushState(null, "", path);
  render();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function toast(message, type = "success") {
  const node = document.createElement("div");
  node.className = `toast ${type}`;
  node.textContent = message;
  toastRoot.appendChild(node);
  setTimeout(() => node.remove(), 2400);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function closeConnectScreen() {
  document.querySelector(".connect-back")?.remove();
}

function showConnectScreen() {
  closeConnectScreen();
  const back = document.createElement("div");
  back.className = "connect-back";
  back.innerHTML = `<div class="connect-screen">
    <div class="connect-mark">⚔</div>
    <div class="connect-title">중고등부 수련회 시스템에 접속합니다</div>
    <div class="connect-lines">
      <div><span></span>학생 정보 확인</div>
      <div><span></span>전신갑주 데이터 동기화</div>
      <div><span></span>시련의 숲 입장 준비</div>
    </div>
    <div class="connect-progress"><span></span></div>
  </div>`;
  document.body.appendChild(back);
}

function closeDrawModal() {
  document.querySelector(".draw-modal-back")?.remove();
}

function closeInfoModal() {
  document.querySelector(".info-modal-back")?.remove();
}

function showDrawModal(results, promotions = []) {
  closeDrawModal();
  const count = results.length;
  const cards = results.map((item, index) => {
    const armor = armorByCode(item.armor);
    return `<div class="draw-prize-card" style="--delay:${index * 90}ms">
      <div class="draw-prize-burst"></div>
      <div class="draw-prize-grade grade-${item.grade}">${item.grade}</div>
      <img src="${armor.icon}" alt="${escapeHtml(armor.name)}">
      <div class="draw-prize-name">${escapeHtml(armor.name)}</div>
      <div class="draw-prize-caption">획득!</div>
    </div>`;
  }).join("");
  const promotionHtml = promotions.length ? `<div class="promotion-panel">
    <div class="promotion-title">자동 합성 완료</div>
    <div class="promotion-list">${promotions.map((promotion, index) => {
      const armor = armorByCode(promotion.armor);
      const fromBadges = Array.from({ length: promotion.count || 3 }, () => `<span class="grade-badge grade-${promotion.from}">${promotion.from}</span>`).join("<span>+</span>");
      return `<div class="promotion-row" style="--delay:${(results.length + index) * 90}ms">
        <img src="${armor.icon}" alt="${escapeHtml(armor.name)}">
        <div class="promotion-info">
          <div class="promotion-name">${escapeHtml(armor.name)}</div>
          <div class="promotion-formula">${fromBadges}<span>→</span><span class="grade-badge grade-${promotion.to}">${promotion.to}</span></div>
        </div>
      </div>`;
    }).join("")}</div>
  </div>` : "";
  const back = document.createElement("div");
  back.className = "draw-modal-back";
  back.innerHTML = `<div class="draw-modal">
    <div class="draw-modal-badge">장비 획득</div>
    <div class="draw-modal-title">${count === 1 ? "새 갑주를 얻었습니다!" : `${count}연속 뽑기 결과`}</div>
    <div class="draw-modal-sub">시련의 숲을 준비할 전신갑주가 추가되었습니다.</div>
    <div class="draw-prize-grid count-${count}">${cards}</div>
    ${promotionHtml}
    <button class="btn pink mt-16" onclick="closeDrawModal()">확인</button>
  </div>`;
  back.addEventListener("click", (event) => {
    if (event.target === back) closeDrawModal();
  });
  document.body.appendChild(back);
}

async function api(action, body = {}, method = "POST") {
  const options = method === "GET" ? {} : {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  };
  const response = await fetch(`/api/app?action=${encodeURIComponent(action)}`, options);
  const payload = await response.json();
  if (!payload.ok) throw new Error(payload.error || "요청 처리 중 오류가 발생했습니다.");
  return payload;
}

function setMe(player) {
  state.me = player;
  if (player) {
    localStorage.setItem(STORAGE_PLAYER, player.id);
    localStorage.setItem(STORAGE_NAME, player.name);
    localStorage.setItem(STORAGE_TEAM, player.team || "");
    if (player.accessCode) localStorage.setItem(STORAGE_CODE, player.accessCode);
  }
}

function armorByCode(code) {
  return state.armor.find((armor) => armor.code === code) || { code, name: code, icon: "" };
}

function topbar({ back = false } = {}) {
  const me = state.me;
  return `<div class="topbar">
    <div class="crest"><div class="crest-badge">⚔</div><div class="crest-text">시련의 숲</div></div>
    <div class="top-actions">
      ${back ? `<button class="pill" onclick="nav('/')">내 캐릭터</button>` : ""}
      ${me ? `<button class="pill danger" onclick="logout()">로그아웃</button>` : `<button class="pill" onclick="nav('/admin')">교사</button>`}
    </div>
  </div>`;
}

function equippedGrade(player, armorCode) {
  const row = player?.inventory?.[armorCode] || {};
  return GRADE_ORDER.find((grade) => row[grade] > 0) || "";
}

function armorCounts(player, armorCode) {
  return player?.inventory?.[armorCode] || { B: 0, A: 0, S: 0 };
}

function armorTotal(player, armorCode) {
  const row = armorCounts(player, armorCode);
  return (row.B || 0) + (row.A || 0) + (row.S || 0);
}

function gradeBenefitText(grade) {
  return { B: "기본 도전", A: "힌트 1개", S: "재도전 1회 또는 방해 무효" }[grade] || "미보유";
}

function gradeCountChips(row) {
  return ["B", "A", "S"].map((grade) => `<span class="count-chip grade-${grade}">${grade} ${row[grade] || 0}</span>`).join("");
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function equipmentPower(player) {
  if (player?.equipmentPower !== undefined) return Number(player.equipmentPower || 0);
  const counts = player?.gradeCounts || { B: 0, A: 0, S: 0 };
  return (counts.B || 0) * EQUIPMENT_POWER_VALUES.B + (counts.A || 0) * EQUIPMENT_POWER_VALUES.A + (counts.S || 0) * EQUIPMENT_POWER_VALUES.S;
}

function inventoryPowerPanelHtml(player) {
  return `<div class="inventory-power-panel">
    <div>
      <div class="inventory-power-label">장비전투력</div>
      <div class="inventory-power-note">보유 장비 전체 누적</div>
    </div>
    <strong>${formatNumber(equipmentPower(player))}</strong>
    <div class="inventory-power-formula">
      <span class="grade-S">S급 +${EQUIPMENT_POWER_VALUES.S}</span>
      <span class="grade-A">A급 +${EQUIPMENT_POWER_VALUES.A}</span>
      <span class="grade-B">B급 +${EQUIPMENT_POWER_VALUES.B}</span>
    </div>
  </div>`;
}

function inventoryGradeCells(row) {
  return ["S", "A", "B"].map((grade) => {
    const count = row[grade] || 0;
    return `<div class="inventory-grade-cell grade-${grade} ${count ? "owned" : "empty"}">
      <span>${grade}급 +${EQUIPMENT_POWER_VALUES[grade]}</span>
      <strong>${count}</strong>
    </div>`;
  }).join("");
}

function equipmentSlotHtml(player, armorCode) {
  const armor = armorByCode(armorCode);
  const grade = equippedGrade(player, armorCode);
  const gradeText = grade || "미보유";
  return `<button type="button" class="loadout-slot slot-${armorCode} ${grade ? `owned tier-${grade}` : "empty"}" onclick="openEquipmentDetail('${armorCode}')">
    <div class="slot-icon"><img src="${armor.icon}" alt="${escapeHtml(armor.name)}"></div>
    <div class="slot-copy">
      <div class="slot-top">
        <div class="slot-name">${escapeHtml(armor.name)}</div>
        <span class="slot-grade ${grade ? `grade-${grade}` : ""}">${gradeText}</span>
      </div>
    </div>
  </button>`;
}

function equipmentBoardHtml(player) {
  const leftSlots = LEFT_EQUIPMENT_SLOTS.map((armorCode) => equipmentSlotHtml(player, armorCode)).join("");
  const rightSlots = RIGHT_EQUIPMENT_SLOTS.map((armorCode) => equipmentSlotHtml(player, armorCode)).join("");

  return `<div class="equipment-board">
    <div class="loadout-stage">
      <svg class="connector-lines" viewBox="0 0 360 340" preserveAspectRatio="none" aria-hidden="true">
        <path class="connector" d="M82 82 L178 34"></path>
        <path class="connector" d="M82 170 L178 142"></path>
        <path class="connector" d="M82 258 L118 218"></path>
        <path class="connector" d="M278 82 L248 150"></path>
        <path class="connector" d="M278 170 L198 176"></path>
        <path class="connector" d="M278 258 L205 310"></path>
        <circle class="connector-dot" cx="178" cy="34" r="3.5"></circle>
        <circle class="connector-dot" cx="178" cy="142" r="3.5"></circle>
        <circle class="connector-dot" cx="118" cy="218" r="3.5"></circle>
        <circle class="connector-dot" cx="248" cy="150" r="3.5"></circle>
        <circle class="connector-dot" cx="198" cy="176" r="3.5"></circle>
        <circle class="connector-dot" cx="205" cy="310" r="3.5"></circle>
      </svg>
      <div class="loadout-side left">${leftSlots}</div>
      <div class="loadout-center">
        <img class="loadout-figure" src="assets/ui/warrior-shadow.png" alt="전신갑주 그림자 일러스트">
      </div>
      <div class="loadout-side right">${rightSlots}</div>
    </div>
    <div class="loadout-status">
      <strong>${player.ownedArmorCount}/6</strong>
      <span>${gradeSummary(player)}</span>
      <button type="button" class="inventory-button" onclick="openInventoryModal()">인벤토리</button>
    </div>
  </div>`;
}

function openEquipmentDetail(armorCode) {
  if (!state.me) return;
  const armor = armorByCode(armorCode);
  const trial = state.forestTrials.find((item) => item.armor === armorCode);
  const row = armorCounts(state.me, armorCode);
  const grade = equippedGrade(state.me, armorCode);
  const back = document.createElement("div");
  back.className = "info-modal-back";
  back.innerHTML = `<div class="info-modal equipment-info-modal">
    <button type="button" class="modal-close" onclick="closeInfoModal()">×</button>
    <div class="equipment-info-head">
      <div class="equipment-info-icon"><img src="${armor.icon}" alt="${escapeHtml(armor.name)}"></div>
      <div>
        <div class="equipment-info-title">${escapeHtml(armor.name)}</div>
        <div class="equipment-info-sub">${grade ? `${grade}급 보유 · ${gradeBenefitText(grade)}` : "아직 보유하지 않음"}</div>
      </div>
    </div>
    <div class="count-chip-row">${gradeCountChips(row)}</div>
    <div class="info-section">
      <div class="info-label">장비 의미</div>
      <div class="info-text">${escapeHtml(armor.meaning || "")}</div>
    </div>
    <div class="info-section">
      <div class="info-label">시련의 숲</div>
      <div class="info-text">${trial ? `${escapeHtml(trial.demon)} · ${escapeHtml(trial.mission)}` : "연결된 미션 정보가 없습니다."}</div>
    </div>
    <div class="benefit-table compact">
      <div class="benefit"><strong>B</strong><br>기본 도전</div>
      <div class="benefit"><strong>A</strong><br>힌트 1개</div>
      <div class="benefit"><strong>S</strong><br>재도전/방해 무효</div>
    </div>
    <div class="notice mt-12">같은 장비 같은 등급 3개가 모이면 다음 등급으로 자동 합성됩니다.</div>
  </div>`;
  back.addEventListener("click", (event) => {
    if (event.target === back) closeInfoModal();
  });
  document.body.appendChild(back);
}

function inventorySummaryHtml(player) {
  return state.armor.map((armor) => {
    const row = armorCounts(player, armor.code);
    const total = armorTotal(player, armor.code);
    const grade = equippedGrade(player, armor.code);
    return `<div class="inventory-summary-row ${total ? "" : "empty"}">
      <div class="inventory-summary-icon"><img src="${armor.icon}" alt="${escapeHtml(armor.name)}"></div>
      <div class="inventory-summary-main">
        <div class="inventory-summary-top">
          <div class="inventory-summary-name">${escapeHtml(armor.name)}</div>
          <div class="inventory-summary-best ${grade ? `grade-${grade}` : ""}">${grade ? `최고 ${grade}급` : "미보유"}</div>
        </div>
        <div class="inventory-grade-grid">${inventoryGradeCells(row)}</div>
      </div>
    </div>`;
  }).join("");
}

function openInventoryModal() {
  if (!state.me) return;
  const back = document.createElement("div");
  back.className = "info-modal-back";
  back.innerHTML = `<div class="info-modal inventory-info-modal">
    <button type="button" class="modal-close" onclick="closeInfoModal()">×</button>
    <div class="inventory-modal-head">
      <div>
        <div class="equipment-info-title">내 인벤토리</div>
        <div class="equipment-info-sub">전체 장비 보유 현황</div>
      </div>
      <div class="inventory-owned-badge">${state.me.ownedArmorCount}/6종</div>
    </div>
    ${inventoryPowerPanelHtml(state.me)}
    <div class="inventory-grade-summary">${gradeSummary(state.me)}</div>
    <div class="inventory-summary-list">${inventorySummaryHtml(state.me)}</div>
  </div>`;
  back.addEventListener("click", (event) => {
    if (event.target === back) closeInfoModal();
  });
  document.body.appendChild(back);
}

function gradeSummary(player) {
  const counts = player?.gradeCounts || { B: 0, A: 0, S: 0 };
  return `S ${counts.S || 0} · A ${counts.A || 0} · B ${counts.B || 0}`;
}

function clearPoll() {
  if (state.poll) clearInterval(state.poll);
  state.poll = null;
}

function startPoll(fn, delay = 4000) {
  clearPoll();
  state.poll = setInterval(fn, delay);
}

async function loadState({ quiet = false } = {}) {
  const playerId = localStorage.getItem(STORAGE_PLAYER);
  const name = localStorage.getItem(STORAGE_NAME) || "";
  const team = localStorage.getItem(STORAGE_TEAM) || "";
  const accessCode = localStorage.getItem(STORAGE_CODE) || "";
  const payload = await api("state", { playerId, name, team, accessCode });
  state.armor = payload.armor;
  state.forestTrials = payload.forestTrials;
  state.qrRewards = payload.qrRewards || [];
  state.claimedQrCodes = payload.claimedQrCodes || [];
  state.ranking = payload.ranking;
  state.booths = payload.booths;
  if (payload.me) setMe(payload.me);
  if (!quiet) render();
  return payload;
}

function logout() {
  localStorage.removeItem(STORAGE_PLAYER);
  localStorage.removeItem(STORAGE_NAME);
  localStorage.removeItem(STORAGE_TEAM);
  localStorage.removeItem(STORAGE_CODE);
  state.me = null;
  state.lastResults = [];
  state.lastQrResults = [];
  nav("/");
}

async function createPlayer() {
  const name = document.getElementById("player-name").value.trim();
  const team = document.getElementById("player-team").value.trim();
  const accessCode = document.getElementById("player-code").value.trim();
  const gender = "male";
  if (!name) return toast("이름을 입력해주세요.", "error");
  showConnectScreen();
  try {
    const payload = await api("create-player", { name, team, gender, accessCode });
    state.armor = payload.armor;
    state.forestTrials = payload.forestTrials;
    state.qrRewards = payload.qrRewards || [];
    state.claimedQrCodes = payload.claimedQrCodes || [];
    state.ranking = payload.ranking;
    state.booths = payload.booths;
    setMe(payload.me);
    await wait(1500);
    closeConnectScreen();
    nav("/");
    render();
  } catch (error) {
    closeConnectScreen();
    toast(error.message, "error");
  }
}

async function draw(count) {
  if (!state.me) return;
  try {
    const payload = await api("draw", { playerId: state.me.id, count });
    state.lastResults = payload.results;
    state.claimedQrCodes = payload.claimedQrCodes || state.claimedQrCodes;
    state.ranking = payload.ranking;
    state.booths = payload.booths;
    setMe(payload.me);
    render();
    showDrawModal(payload.results, payload.promotions || []);
  } catch (error) {
    toast(error.message, "error");
  }
}

function qrCodeForRoute(current = route()) {
  if (current.parts[0] === "qr" && current.parts[1]) return current.parts.slice(1).join("-");
  if (current.parts[0] === "mission" && current.parts[1]) return `mission-${current.parts.slice(1).join("-")}`;
  if (current.parts[0] === "hidden" && current.parts[1]) return `hidden-${current.parts.slice(1).join("-")}`;
  if (current.parts[0] === "boss") return "boss-forest";
  return "";
}

function qrRewardByCode(code) {
  return state.qrRewards.find((reward) => reward.code === code);
}

function qrRewardText(reward) {
  const draws = Number(reward?.reward?.draws || 0);
  return draws ? `${draws}뽑기 보상` : "확인 보상";
}

async function claimQrReward(code) {
  if (!state.me) return toast("먼저 캐릭터를 등록해주세요.", "error");
  try {
    const payload = await api("claim-qr", { playerId: state.me.id, code });
    state.lastQrResults = payload.results || [];
    state.lastResults = payload.results || [];
    state.claimedQrCodes = payload.claimedQrCodes || state.claimedQrCodes;
    state.ranking = payload.ranking || state.ranking;
    state.booths = payload.booths || state.booths;
    setMe(payload.me);
    renderQr();
    if (payload.alreadyClaimed) {
      toast("이미 받은 QR 보상입니다.", "error");
    } else {
      showDrawModal(payload.results || [], payload.promotions || []);
    }
  } catch (error) {
    toast(error.message, "error");
  }
}

function renderCreate() {
  app.innerHTML = `${topbar()}<div class="title">시련의 숲<br/>전신갑주 전략전</div>
    <div class="subtitle">하나님의 전신갑주를 입어라!</div>
    <div class="panel pin">
      <div class="section-label pink">캐릭터 등록</div>
      <div class="field"><label>이름</label><input id="player-name" maxlength="20" placeholder="학생 이름" value="${escapeHtml(localStorage.getItem(STORAGE_NAME) || "")}"></div>
      <div class="field"><label>조</label><input id="player-team" maxlength="12" placeholder="예: 1조" value="${escapeHtml(localStorage.getItem(STORAGE_TEAM) || "")}"></div>
      <div class="field"><label>입장코드</label><input id="player-code" maxlength="8" inputmode="numeric" placeholder="재접속할 때만 입력" value="${escapeHtml(localStorage.getItem(STORAGE_CODE) || "")}"></div>
      <button class="btn pink" onclick="createPlayer()">⚔️ 모험 시작</button>
    </div>`;
}

function inventoryHtml(player) {
  const inventory = player?.inventory || {};
  return `<div class="armor-grid">${state.armor.map((armor) => {
    const row = inventory[armor.code] || { B: 0, A: 0, S: 0 };
    const total = row.B + row.A + row.S;
    const badges = ["B", "A", "S"].filter((grade) => row[grade] > 0).map((grade) => `<span class="grade-badge grade-${grade}">${grade}${row[grade] > 1 ? `x${row[grade]}` : ""}</span>`).join("");
    return `<div class="armor-cell ${total ? "" : "empty"}">
      <img src="${armor.icon}" alt="${escapeHtml(armor.name)}">
      <div class="armor-name">${escapeHtml(armor.name)}</div>
      <div class="grade-stack">${badges || `<span class="tiny">미보유</span>`}</div>
    </div>`;
  }).join("")}</div>`;
}

function drawResultsHtml() {
  if (!state.lastResults.length) return "";
  return `<div class="draw-results">${state.lastResults.map((item) => {
    const armor = armorByCode(item.armor);
    return `<div class="draw-result"><img src="${armor.icon}" alt="${escapeHtml(armor.name)}"><div><div class="row-title">${escapeHtml(armor.name)} ${item.grade}</div></div></div>`;
  }).join("")}</div>`;
}

function sortedRanking(source = state.ranking) {
  return [...(source || [])].sort((a, b) => equipmentPower(b) - equipmentPower(a) || (b.gradeCounts?.S || 0) - (a.gradeCounts?.S || 0) || (b.gradeCounts?.A || 0) - (a.gradeCounts?.A || 0) || (b.gradeCounts?.B || 0) - (a.gradeCounts?.B || 0) || a.name.localeCompare(b.name, "ko"));
}

function rankingHtml(limit = 10, source = state.ranking) {
  const rows = sortedRanking(source).slice(0, limit).map((player, index) => `<div class="rank-row ${state.me && player.id === state.me.id ? "me" : ""}">
    <div class="rank-num">${index + 1}</div>
    <div><div class="row-title">${escapeHtml(player.name)} ${player.team ? `<span class="tag">${escapeHtml(player.team)}</span>` : ""}</div></div>
    <div class="rank-status rank-power"><span>장비전투력</span><strong>${formatNumber(equipmentPower(player))}</strong></div>
  </div>`).join("");
  return rows || `<div class="notice">아직 랭킹에 표시할 학생이 없습니다.</div>`;
}

function renderHome() {
  if (!state.me) return renderCreate();
  const me = state.me;
  app.innerHTML = `${topbar()}
    <div class="panel hero">
      <div class="profile-name">${escapeHtml(me.name)}</div>
      <div class="profile-meta">${me.team ? `<span class="tag">${escapeHtml(me.team)}</span>` : ""}<span class="tag">갑주 ${me.ownedArmorCount}/6</span>${me.accessCode ? `<span class="tag">입장코드 ${escapeHtml(me.accessCode)}</span>` : ""}</div>
      ${equipmentBoardHtml(me)}
    </div>
    <div class="panel pin">
      <div class="section-label sun">랜덤 장비 박스</div>
      <div class="btn-row">
        <button class="btn" onclick="draw(1)">1뽑기</button>
        <button class="btn" onclick="draw(2)">2뽑기</button>
        <button class="btn" onclick="draw(3)">3뽑기</button>
      </div>
      ${drawResultsHtml()}
    </div>
    <div class="nav-grid">
      <button class="btn purple" onclick="nav('/ranking')">🏆 랭킹</button>
      <button class="btn mint" onclick="nav('/forest')">🌲 시련의 숲</button>
      <button class="btn cream" onclick="nav('/exchange/1')">교환소 1</button>
      <button class="btn cream" onclick="nav('/exchange/2')">교환소 2</button>
    </div>
    <div class="panel pin mt-16">
      <div class="section-label mint">실시간 랭킹</div>
      ${rankingHtml(5)}
    </div>`;
  startPoll(async () => {
    try {
      await loadState({ quiet: true });
      if (route().path === "/") renderHome();
    } catch {}
  }, 5000);
}

function renderRanking() {
  app.innerHTML = `${topbar({ back: true })}
    <div class="panel pin">
      <div class="section-label sun">실시간 랭킹</div>
      ${rankingHtml(30)}
    </div>`;
  startPoll(async () => {
    try {
      await loadState({ quiet: true });
      if (route().path === "/ranking") renderRanking();
    } catch {}
  }, 4000);
}

function itemOptions(player, selectedValue = "") {
  const options = [`<option value="">선택 안 함</option>`];
  const inventory = player?.inventory || {};
  for (const armor of state.armor) {
    for (const grade of ["B", "A", "S"]) {
      const count = inventory[armor.code]?.[grade] || 0;
      if (count > 0) {
        const value = `${armor.code}:${grade}`;
        options.push(`<option value="${value}" ${selectedValue === value ? "selected" : ""}>${armor.name} ${grade}${count > 1 ? ` x${count}` : ""}</option>`);
      }
    }
  }
  return options.join("");
}

function selectedExchangeValues() {
  return ["trade-slot-1", "trade-slot-2"].map((id) => document.getElementById(id)?.value || "");
}

function saveExchangeDraft(boothId) {
  state.exchangeDraft[String(boothId)] = selectedExchangeValues();
}

function itemValues(items = []) {
  return items.map((item) => `${item.armor}:${item.grade}`);
}

function currentBoothItems(booth) {
  if (!state.me || !booth) return [];
  if (booth.player1Id === state.me.id) return booth.player1Items || [];
  if (booth.player2Id === state.me.id) return booth.player2Items || [];
  return [];
}

function exchangeSelectedValues(boothId, booth) {
  const draft = state.exchangeDraft[String(boothId)];
  const values = draft || itemValues(currentBoothItems(booth));
  return [values[0] || "", values[1] || ""];
}

function exchangeSelectFocused() {
  return ["trade-slot-1", "trade-slot-2"].includes(document.activeElement?.id);
}

function selectedExchangeItems() {
  return selectedExchangeValues().filter(Boolean).map((value) => {
    const [armor, grade] = value.split(":");
    return { armor, grade };
  });
}

async function joinExchange(boothId) {
  try {
    const payload = await api("exchange-join", { boothId, playerId: state.me.id });
    setMe(payload.me);
    state.booths = payload.booths;
    renderExchange(boothId, payload.booth);
  } catch (error) {
    toast(error.message, "error");
  }
}

async function selectExchange(boothId) {
  try {
    saveExchangeDraft(boothId);
    const items = selectedExchangeItems();
    const payload = await api("exchange-select", { boothId, playerId: state.me.id, items });
    setMe(payload.me);
    state.booths = payload.booths;
    state.exchangeDraft[String(boothId)] = itemValues(currentBoothItems(payload.booth));
    renderExchange(boothId, payload.booth);
    toast("교환 장비를 올렸습니다.");
  } catch (error) {
    toast(error.message, "error");
  }
}

async function confirmExchange(boothId) {
  try {
    const payload = await api("exchange-confirm", { boothId, playerId: state.me.id });
    setMe(payload.me);
    state.booths = payload.booths;
    if (payload.booth.status === "completed") delete state.exchangeDraft[String(boothId)];
    renderExchange(boothId, payload.booth);
    toast(payload.booth.status === "completed" ? "교환 완료!" : "동의 완료. 상대 확인을 기다립니다.");
  } catch (error) {
    toast(error.message, "error");
  }
}

async function cancelExchange(boothId) {
  try {
    const payload = await api("exchange-cancel", { boothId, playerId: state.me.id });
    state.booths = payload.booths;
    delete state.exchangeDraft[String(boothId)];
    renderExchange(boothId, payload.booth);
    toast("교환소를 비웠습니다.");
  } catch (error) {
    toast(error.message, "error");
  }
}

function renderBoothPlayer(label, name, items, confirmed, active) {
  const itemText = items && items.length ? items.map((item) => `${armorByCode(item.armor).name} ${item.grade}`).join(" + ") : "장비 미선택";
  return `<div class="exchange-slot ${active ? "active" : ""}">
    <div class="row-title">${label}: ${name ? escapeHtml(name) : "대기 중"}</div>
    <div class="row-sub">${escapeHtml(itemText)} · ${confirmed ? "동의 완료" : "확인 대기"}</div>
  </div>`;
}

function renderExchange(boothId, boothOverride = null) {
  if (!state.me) return renderCreate();
  const booth = boothOverride || state.booths.find((item) => String(item.boothId) === String(boothId)) || { boothId, status: "empty", player1Items: [], player2Items: [] };
  const joined = booth.player1Id === state.me.id || booth.player2Id === state.me.id;
  if (joined && document.getElementById("trade-slot-1")) saveExchangeDraft(boothId);
  if (!joined || booth.status === "completed") delete state.exchangeDraft[String(boothId)];
  const selectedValues = exchangeSelectedValues(boothId, booth);
  app.innerHTML = `${topbar({ back: true })}
    <div class="panel pin">
      <div class="section-label pink">교환소 ${boothId}</div>
      <div class="notice">선생님 앞에서 두 학생이 같은 교환소 QR에 입장한 뒤, 각자 최대 2칸까지 장비를 올리고 동시에 동의합니다.</div>
      <div class="exchange-status mt-12">
        ${renderBoothPlayer("1번", booth.player1Name, booth.player1Items, booth.player1Confirmed, booth.player1Id === state.me.id)}
        ${renderBoothPlayer("2번", booth.player2Name, booth.player2Items, booth.player2Confirmed, booth.player2Id === state.me.id)}
      </div>
      ${joined ? `<div class="field"><label>내가 줄 장비</label><div class="item-picker"><select id="trade-slot-1" onchange="saveExchangeDraft('${boothId}')">${itemOptions(state.me, selectedValues[0])}</select><select id="trade-slot-2" onchange="saveExchangeDraft('${boothId}')">${itemOptions(state.me, selectedValues[1])}</select></div></div>
        <div class="btn-row two"><button class="btn purple" onclick="selectExchange('${boothId}')">장비 올리기</button><button class="btn pink" onclick="confirmExchange('${boothId}')">동의하기</button></div>
        <button class="btn danger mt-12" onclick="cancelExchange('${boothId}')">교환 취소/초기화</button>` : `<button class="btn pink mt-12" onclick="joinExchange('${boothId}')">교환소 ${boothId} 입장</button>`}
    </div>
    <div class="panel pin">
      <div class="section-label mint">내 장비</div>
      ${inventoryHtml(state.me)}
    </div>`;
  startPoll(async () => {
    try {
      const payload = await api("booth", { boothId });
      state.booths = payload.booths;
      if (route().parts[0] === "exchange" && route().parts[1] === String(boothId) && !exchangeSelectFocused()) renderExchange(boothId, payload.booth);
    } catch {}
  }, 3500);
}

function selectForestArmor(armorCode) {
  const selected = state.selectedForestArmors.filter(Boolean);
  if (selected.includes(armorCode)) {
    state.selectedForestArmors = selected.filter((code) => code !== armorCode);
  } else if (selected.length >= 2) {
    toast("장비는 2개까지 선택할 수 있어요. 먼저 하나를 빼주세요.", "error");
    return;
  } else {
    state.selectedForestArmors = [...selected, armorCode];
  }
  renderForest();
}

function clearForestSlot(slotIndex) {
  state.selectedForestArmors = state.selectedForestArmors.filter(Boolean).filter((_, index) => index !== (slotIndex === 1 ? 1 : 0));
  renderForest();
}

function forestSlots() {
  const selected = state.selectedForestArmors.filter(Boolean).slice(0, 2);
  return [selected[0] || "", selected[1] || ""];
}

function forestArmorGrade(armorCode) {
  return state.me ? (["S", "A", "B"].find((grade) => state.me.inventory?.[armorCode]?.[grade] > 0) || "") : "";
}

function forestSelectorHtml() {
  const slots = forestSlots();
  return `<div class="forest-selector">${state.armor.map((armor) => {
    const grade = forestArmorGrade(armor.code);
    const selected = slots.includes(armor.code);
    return `<button type="button" class="forest-choice ${selected ? "selected" : ""}" onclick="selectForestArmor('${armor.code}')">
      <img src="${armor.icon}" alt="${escapeHtml(armor.name)}">
      <span>${escapeHtml(armor.name)}</span>
      <em class="${grade ? `grade-${grade}` : ""}">${grade ? `${grade}급` : "미보유"}</em>
    </button>`;
  }).join("")}</div>`;
}

function forestMainHtml() {
  const slots = forestSlots();
  return `<div class="forest-main-list">${slots.map((armorCode, index) => {
    if (!armorCode) {
      return `<div class="forest-main-card forest-slot-card empty">
        <div class="forest-slot-action">
          <span class="forest-slot-index">${index + 1}</span>
          <span>
            <strong>대기 슬롯</strong>
            <em>아래 장비를 누르면 들어옵니다</em>
          </span>
        </div>
      </div>`;
    }
    const armor = armorByCode(armorCode);
    const trial = state.forestTrials.find((item) => item.armor === armorCode);
    const grade = forestArmorGrade(armorCode);
    return `<div class="forest-main-card forest-slot-card">
      <div class="forest-main-head">
        <div class="forest-main-icon"><img src="${armor.icon}" alt="${escapeHtml(armor.name)}"></div>
        <div>
          <div class="forest-main-title">${escapeHtml(armor.name)}</div>
          <div class="forest-main-sub">내 등급 ${grade ? `${grade}급` : "미보유"} · ${gradeBenefitText(grade)}</div>
        </div>
        <div class="forest-grade-badge ${grade ? `grade-${grade}` : ""}">${grade ? `${grade}급` : "미보유"}</div>
      </div>
      <div class="forest-slot-buttons">
        <button type="button" onclick="clearForestSlot(${index})">비우기</button>
      </div>
      <div class="forest-mission-box">
        <div class="info-label">${trial ? escapeHtml(trial.demon) : "시련 정보"}</div>
        <div class="info-text">${trial ? escapeHtml(trial.mission) : "연결된 미션 정보가 없습니다."}</div>
        <div class="row-sub mt-8">베네핏: ${trial ? escapeHtml(trial.benefit) : gradeBenefitText(grade)}</div>
      </div>
    </div>`;
  }).join("")}</div>`;
}

function renderForest() {
  app.innerHTML = `${topbar({ back: true })}
    <div class="panel pin">
      <div class="section-label mint">시련의 숲 메인 장비</div>
      <div class="notice">이번 시련에서 보여줄 전신갑주를 최대 2개까지 선택하세요. 선택한 장비의 미션과 내 등급 베네핏이 크게 표시됩니다.</div>
      ${forestSelectorHtml()}
      ${forestMainHtml()}
      <div class="benefit-table">
        <div class="benefit"><strong>B</strong><br>기본 도전</div>
        <div class="benefit"><strong>A</strong><br>힌트 1개</div>
        <div class="benefit"><strong>S</strong><br>재도전 또는 방해 무효</div>
      </div>
    </div>
    <div class="trial-grid compact">${state.forestTrials.map((trial) => {
      const armor = armorByCode(trial.armor);
      const grade = state.me ? (["S", "A", "B"].find((g) => state.me.inventory?.[trial.armor]?.[g] > 0) || "") : "";
      return `<div class="trial-card">
        <div class="trial-head"><img src="${armor.icon}" alt="${escapeHtml(armor.name)}"><div><div class="trial-title">${escapeHtml(trial.demon)}</div><div class="row-sub">${escapeHtml(armor.name)} · ${grade ? `${grade}급` : "미보유"}</div></div></div>
        <div>${escapeHtml(trial.mission)}</div>
        <div class="row-sub mt-8">베네핏: ${escapeHtml(trial.benefit)}</div>
      </div>`;
    }).join("")}</div>`;
}

function renderQr() {
  const code = qrCodeForRoute();
  const reward = qrRewardByCode(code);
  const claimed = state.claimedQrCodes.includes(code);
  if (!reward) {
    app.innerHTML = `${topbar({ back: true })}
      <div class="panel pin">
        <div class="section-label pink">QR 확인 실패</div>
        <div class="notice">등록되지 않은 QR입니다. 선생님에게 QR 주소를 확인해주세요.</div>
      </div>`;
    return;
  }
  if (!state.me) {
    app.innerHTML = `${topbar({ back: true })}
      <div class="panel pin">
        <div class="section-label sun">QR 보상 대기</div>
        <div class="qr-reward-card">
          <div class="qr-type">${escapeHtml(reward.type)}</div>
          <div class="qr-title">${escapeHtml(reward.title)}</div>
          <div class="row-sub">${escapeHtml(reward.description)}</div>
          <div class="qr-prize">${escapeHtml(qrRewardText(reward))}</div>
        </div>
        <div class="notice mt-12">캐릭터를 먼저 등록한 뒤 QR을 다시 열어주세요.</div>
        <button class="btn pink mt-12" onclick="nav('/')">캐릭터 등록</button>
      </div>`;
    return;
  }
  app.innerHTML = `${topbar({ back: true })}
    <div class="panel pin">
      <div class="section-label sun">QR 보상</div>
      <div class="qr-reward-card ${claimed ? "claimed" : ""}">
        <div class="qr-type">${escapeHtml(reward.type)}</div>
        <div class="qr-title">${escapeHtml(reward.title)}</div>
        <div class="row-sub">${escapeHtml(reward.description)}</div>
        <div class="qr-prize">${escapeHtml(qrRewardText(reward))}</div>
        <div class="qr-status">${claimed ? "이미 획득 완료" : "아직 받지 않음"}</div>
      </div>
      <button class="btn ${claimed ? "cream" : "pink"} mt-12" onclick="claimQrReward('${escapeHtml(code)}')">${claimed ? "획득 여부 다시 확인" : "보상 받기"}</button>
    </div>
    <div class="panel pin">
      <div class="section-label mint">내 장비</div>
      ${inventoryHtml(state.me)}
    </div>`;
}

function renderAdminLogin() {
  app.innerHTML = `${topbar({ back: true })}
    <div class="panel pin">
      <div class="section-label pink">교사 관리자</div>
      <div class="field"><label>관리자 PIN</label><input id="admin-pin" type="password" placeholder="관리자 PIN" value="${escapeHtml(localStorage.getItem(STORAGE_PIN) || "")}"></div>
      <button class="btn pink" onclick="loadAdmin()">관리자 화면 열기</button>
    </div>`;
}

async function loadAdmin() {
  const pin = document.getElementById("admin-pin")?.value ?? localStorage.getItem(STORAGE_PIN) ?? "";
  localStorage.setItem(STORAGE_PIN, pin);
  try {
    const payload = await api("admin", { pin });
    renderAdmin(payload);
  } catch (error) {
    toast(error.message, "error");
  }
}

async function resetBoothAdmin(boothId) {
  try {
    const payload = await api("exchange-reset", { boothId, pin: localStorage.getItem(STORAGE_PIN) || "" });
    toast(`교환소 ${boothId} 초기화 완료`);
    loadAdmin();
  } catch (error) {
    toast(error.message, "error");
  }
}

async function adminAdjustItem() {
  const playerId = document.getElementById("admin-player").value;
  const armor = document.getElementById("admin-armor").value;
  const grade = document.getElementById("admin-grade").value;
  const delta = Number(document.getElementById("admin-delta").value || 0);
  try {
    await api("admin-adjust-item", { pin: localStorage.getItem(STORAGE_PIN) || "", playerId, armor, grade, delta });
    toast("장비 수정 완료");
    loadAdmin();
  } catch (error) {
    toast(error.message, "error");
  }
}

function renderAdmin(payload) {
  state.armor = payload.armor || state.armor;
  state.qrRewards = payload.qrRewards || state.qrRewards;
  const playerOptions = payload.players.map((player) => `<option value="${player.id}">${escapeHtml(player.name)} ${player.team ? `(${escapeHtml(player.team)})` : ""}</option>`).join("");
  const armorOptions = state.armor.map((armor) => `<option value="${armor.code}">${escapeHtml(armor.name)}</option>`).join("");
  const adminRanking = rankingHtml(payload.ranking.length || 30, payload.ranking);
  const baseUrl = location.origin;
  const qrLinks = (state.qrRewards || []).map((reward) => {
    const path = reward.code.startsWith("hidden-")
      ? `/hidden/${reward.code.replace(/^hidden-/, "")}`
      : reward.code.startsWith("mission-")
        ? `/mission/${reward.code.replace(/^mission-/, "")}`
        : reward.code === "boss-forest" ? "/boss" : `/qr/${reward.code}`;
    return `<div class="qr-admin-link"><strong>${escapeHtml(reward.title)}</strong><span>${escapeHtml(baseUrl + path)}</span></div>`;
  }).join("");
  app.innerHTML = `${topbar({ back: true })}
    <div class="panel pin">
      <div class="section-label pink">교사 관리자</div>
      <div class="booth-row"><div class="rank-num">1</div><div><div class="row-title">교환소 1</div><div class="row-sub">${escapeHtml(payload.booths[0]?.status || "empty")}</div></div><button class="pill danger" onclick="resetBoothAdmin('1')">초기화</button></div>
      <div class="booth-row"><div class="rank-num">2</div><div><div class="row-title">교환소 2</div><div class="row-sub">${escapeHtml(payload.booths[1]?.status || "empty")}</div></div><button class="pill danger" onclick="resetBoothAdmin('2')">초기화</button></div>
      <div class="notice mt-12">교환소 링크: <strong>${baseUrl}/exchange/1</strong><br><strong>${baseUrl}/exchange/2</strong></div>
    </div>
    <div class="panel pin">
      <div class="section-label mint">학생 장비 수동 수정</div>
      <div class="admin-controls">
        <select id="admin-player">${playerOptions}</select>
        <div class="admin-grid"><select id="admin-armor">${armorOptions}</select><select id="admin-grade"><option>B</option><option>A</option><option>S</option></select></div>
        <div class="admin-grid"><input id="admin-delta" type="number" value="1" step="1"><button class="btn purple" onclick="adminAdjustItem()">수정 적용</button></div>
      </div>
    </div>
    <div class="panel pin"><div class="section-label sun">전체 랭킹</div>${adminRanking}</div>
    <div class="panel pin"><div class="section-label mint">QR 보상 링크</div><div class="qr-admin-list">${qrLinks}</div></div>
    <div class="panel pin"><div class="section-label pink">최근 로그</div>${payload.logs.map((log) => `<div class="log-row"><div class="rank-num">•</div><div><div class="row-title">${escapeHtml(log.action)}</div><div class="row-sub">${escapeHtml(JSON.stringify(log.detail || {}))}</div></div><div class="tiny">${new Date(log.createdAt).toLocaleTimeString("ko-KR")}</div></div>`).join("") || `<div class="notice">로그 없음</div>`}</div>`;
}

async function render() {
  clearPoll();
  const current = route();
  if (!state.armor.length) {
    app.innerHTML = `<div class="loading">전신갑주 불러오는 중...</div>`;
    try {
      await loadState({ quiet: true });
    } catch (error) {
      app.innerHTML = `${topbar()}<div class="panel pin"><div class="section-label pink">서버 연결 실패</div><p>${escapeHtml(error.message)}</p></div>`;
      return;
    }
  }
  if (current.parts[0] === "ranking") return renderRanking();
  if (current.parts[0] === "exchange") return renderExchange(current.parts[1] || "1");
  if (current.parts[0] === "forest") return renderForest();
  if (["qr", "mission", "hidden", "boss"].includes(current.parts[0])) return renderQr();
  if (current.parts[0] === "admin") return renderAdminLogin();
  return renderHome();
}

window.nav = nav;
window.logout = logout;
window.closeDrawModal = closeDrawModal;
window.closeInfoModal = closeInfoModal;
window.closeConnectScreen = closeConnectScreen;
window.createPlayer = createPlayer;
window.draw = draw;
window.claimQrReward = claimQrReward;
window.openEquipmentDetail = openEquipmentDetail;
window.openInventoryModal = openInventoryModal;
window.selectForestArmor = selectForestArmor;
window.clearForestSlot = clearForestSlot;
window.joinExchange = joinExchange;
window.saveExchangeDraft = saveExchangeDraft;
window.selectExchange = selectExchange;
window.confirmExchange = confirmExchange;
window.cancelExchange = cancelExchange;
window.loadAdmin = loadAdmin;
window.resetBoothAdmin = resetBoothAdmin;
window.adminAdjustItem = adminAdjustItem;

window.addEventListener("hashchange", render);
window.addEventListener("popstate", render);
render();
