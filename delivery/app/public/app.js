const app = document.getElementById("app");
const toastRoot = document.getElementById("toast-root");

const state = {
  me: null,
  program: null,
  armor: [],
  ranking: [],
  teamRanking: [],
  booths: [],
  forestTrials: [],
  qrRewards: [],
  claimedQrCodes: [],
  monthlyProgress: null,
  adminPayload: null,
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
      <div><span></span>전신갑주 원정 준비</div>
    </div>
    <div class="connect-progress"><span></span></div>
  </div>`;
  document.body.appendChild(back);
}

function closeDrawModal() {
  document.querySelector(".draw-modal-back")?.remove();
}

function closeInfoModal() {
  const back = document.querySelector(".info-modal-back");
  const returnFocusSelector = back?.dataset.returnFocusSelector;
  const escapeHandler = back?._escapeHandler;
  if (escapeHandler) document.removeEventListener("keydown", escapeHandler);
  back?.remove();
  if (returnFocusSelector) {
    setTimeout(() => document.querySelector(returnFocusSelector)?.focus({ preventScroll: true }), 0);
  }
}

function showDrawModal(results, promotions = []) {
  closeDrawModal();
  const count = results.length;
  const featuredPromotion = promotions.find((promotion) => promotion.to === "S") || promotions[promotions.length - 1];
  const featuredGrade = featuredPromotion?.to === "S" ? "S" : "A";
  const hasPromotions = promotions.length > 0;
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
  const promotionHtml = hasPromotions ? `<div class="promotion-panel">
    <div class="promotion-title">✨ 자동 합성 대성공! ✨</div>
    <div class="promotion-title-sub">3개를 모은 보람! 더 강한 새 등급이 탄생했어요.</div>
    <div class="promotion-list">${promotions.map((promotion, index) => {
      const armor = armorByCode(promotion.armor);
      const fromGrade = promotion.from === "A" ? "A" : "B";
      const toGrade = promotion.to === "S" ? "S" : "A";
      const ingredientCount = Number.isInteger(promotion.count) && promotion.count > 0 ? promotion.count : 3;
      const fromBadges = Array.from({ length: ingredientCount }, () => `<span class="grade-badge grade-${fromGrade}">${fromGrade}</span>`).join('<span class="promotion-plus">+</span>');
      const resultLabel = toGrade === "S" ? "최고 등급!" : "등급 완성!";
      const successLabel = toGrade === "S" ? "최고 단계 달성!" : "등급 상승!";
      return `<div class="promotion-row promotion-to-${toGrade}" style="--delay:${index * 110}ms">
        <div class="promotion-icon-wrap">
          <img src="${armor.icon}" alt="${escapeHtml(armor.name)}">
        </div>
        <div class="promotion-info">
          <div class="promotion-success-label">${successLabel}</div>
          <div class="promotion-name">${escapeHtml(armor.name)}</div>
          <div class="promotion-formula" role="img" aria-label="${fromGrade}등급 ${ingredientCount}개를 ${toGrade}등급으로 합성">${fromBadges}<span class="promotion-arrow">→</span></div>
        </div>
        <div class="promotion-result-grade grade-${toGrade}" role="img" aria-label="${toGrade}등급 완성">
          <strong>${toGrade}</strong>
          <span>${resultLabel}</span>
        </div>
      </div>`;
    }).join("")}</div>
  </div>` : "";
  const modalBadge = hasPromotions
    ? (featuredGrade === "S" ? "🌟 최고 등급 완성!" : "✨ 자동 합성 대성공!")
    : "장비 획득";
  const modalTitle = hasPromotions
    ? `${featuredGrade}등급 장비가 탄생했어요!`
    : (count === 1 ? "새 갑주를 얻었습니다!" : `${count}연속 뽑기 결과`);
  const modalSub = hasPromotions
    ? (featuredGrade === "S" ? "꾸준히 모은 장비가 최고 단계로 성장했습니다." : "같은 장비 3개가 모여 한 단계 더 강해졌습니다.")
    : "새 전신갑주 장비가 추가되었습니다.";
  const drawResultDivider = hasPromotions ? `<div class="draw-result-divider"><span>이번 뽑기 ${count}개</span></div>` : "";
  const back = document.createElement("div");
  back.className = "draw-modal-back";
  back.innerHTML = `<div class="draw-modal${hasPromotions ? ` has-promotion promotion-feature-${featuredGrade}` : ""}" role="dialog" aria-modal="true" aria-live="polite" tabindex="-1">
    <div class="draw-modal-badge">${modalBadge}</div>
    <div class="draw-modal-title">${modalTitle}</div>
    <div class="draw-modal-sub">${modalSub}</div>
    ${promotionHtml}
    ${drawResultDivider}
    <div class="draw-prize-grid count-${count}">${cards}</div>
    <button class="btn pink mt-16" onclick="closeDrawModal()">확인</button>
  </div>`;
  back.addEventListener("click", (event) => {
    if (event.target === back) closeDrawModal();
  });
  document.body.appendChild(back);
  back.querySelector(".draw-modal")?.focus({ preventScroll: true });
}

async function api(action, body = {}, method = "POST") {
  const options = method === "GET" ? {} : {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  options.signal = controller.signal;
  let response;
  try {
    response = await fetch(`/api/app?action=${encodeURIComponent(action)}`, options);
  } catch (error) {
    if (location.protocol === "file:") {
      throw new Error("HTML 파일을 직접 열 수 없습니다. delivery/app 폴더에서 npm.cmd run dev를 실행한 뒤 표시된 주소로 접속하세요.");
    }
    if (error.name === "AbortError") {
      throw new Error("수련회 앱 서버 응답 시간이 초과되었습니다. 서버 실행 창과 접속 주소를 확인하세요.");
    }
    throw new Error("납품 수련회 앱 서버에 연결할 수 없습니다. delivery/app 폴더에서 npm.cmd run dev를 실행한 뒤, 표시된 주소로 접속하세요.");
  } finally {
    clearTimeout(timeout);
  }

  const contentType = response.headers.get("Content-Type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("현재 주소는 API가 없는 정적 서버입니다. 정적 서버나 HTML 직접 열기 대신 delivery/app에서 npm.cmd run dev를 실행하세요.");
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("서버 응답을 읽을 수 없습니다. 서버 실행 창의 오류를 확인하세요.");
  }
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

function programBannerHtml() {
  const program = state.program;
  if (!program) return "";
  const modeLabel = program.programMode === "monthly" ? "한 달 챌린지" : "수련회 세트";
  const dates = [program.eventStartDate, program.eventEndDate].filter(Boolean).join(" ~ ");
  return `<div class="program-banner">
    <div class="program-mode">${modeLabel}</div>
    <div><strong>${escapeHtml(program.churchName || "")}</strong> · ${escapeHtml(program.eventName || "")}</div>
    ${dates ? `<span>${escapeHtml(dates)}</span>` : ""}
  </div>`;
}

function isRetreatMode() {
  return state.program?.programMode !== "monthly";
}

function syncRetreatTheme(current = route()) {
  const theme = document.getElementById("retreat-theme");
  if (!theme) return;
  const isStudentExperience = current.parts[0] !== "admin" && current.parts[0] !== "monthly";
  theme.disabled = !(isRetreatMode() && isStudentExperience);
}

function topbar({ back = false, brand = "전신갑주", logoutLabel = "로그아웃" } = {}) {
  const me = state.me;
  return `<div class="topbar">
    <div class="crest"><div class="crest-badge">⚔</div><div class="crest-text">${escapeHtml(brand)}</div></div>
    <div class="top-actions">
      ${back ? `<button class="pill" onclick="nav('/')">내 캐릭터</button>` : ""}
      ${me ? `<button class="pill danger" onclick="logout()">${escapeHtml(logoutLabel)}</button>` : `<button class="pill" onclick="nav('/admin')">교사용</button>`}
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
        <path class="connector" d="M82 170 L178 106"></path>
        <path class="connector" d="M82 258 L118 218"></path>
        <path class="connector" d="M278 82 L248 150"></path>
        <path class="connector" d="M278 170 L198 148"></path>
        <path class="connector" d="M278 258 L205 310"></path>
        <circle class="connector-dot" cx="178" cy="34" r="3.5"></circle>
        <circle class="connector-dot" cx="178" cy="106" r="3.5"></circle>
        <circle class="connector-dot" cx="118" cy="218" r="3.5"></circle>
        <circle class="connector-dot" cx="248" cy="150" r="3.5"></circle>
        <circle class="connector-dot" cx="198" cy="148" r="3.5"></circle>
        <circle class="connector-dot" cx="205" cy="310" r="3.5"></circle>
      </svg>
      <div class="loadout-side left">${leftSlots}</div>
      <div class="loadout-center">
        <img class="loadout-figure" src="/assets/ui/warrior-shadow.png" alt="전신갑주 그림자 일러스트">
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
  const gradeClass = grade ? `tier-${grade}` : "tier-empty";
  const shortBenefits = { B: "기본 도전", A: "힌트 1개", S: "재도전/방해 무효" };
  const currentBenefit = grade ? shortBenefits[grade] : "미보유";
  const nextGrade = grade === "B" ? "A" : grade === "A" ? "S" : "";
  const gradeRoadmap = ["B", "A", "S"].map((gradeCode) => {
    const count = Number(row[gradeCode] || 0);
    const isCurrent = grade === gradeCode;
    const isNext = nextGrade === gradeCode;
    const status = isCurrent ? "현재" : count > 0 ? "보유" : isNext ? "다음" : "미보유";
    return `<div class="equipment-grade-step grade-${gradeCode} ${isCurrent ? "is-current" : ""} ${isNext ? "is-next" : ""} ${count ? "is-owned" : ""}" aria-label="${gradeCode}등급 ${count}개, ${status}">
      <div class="equipment-grade-step-top"><strong>${gradeCode}</strong><span>${count}개</span></div>
      <div class="equipment-grade-step-benefit">${shortBenefits[gradeCode]}</div>
      ${isCurrent ? `<div class="equipment-grade-step-status">현재</div>` : ""}
    </div>`;
  }).join("");

  const synthesisComplete = grade === "S" && Number(row.A || 0) === 0 && Number(row.B || 0) === 0;
  const synthesisSource = Number(row.A || 0) > 0 ? "A" : "B";
  const synthesisTarget = synthesisSource === "A" ? "S" : "A";
  const synthesisCount = Math.min(3, Number(row[synthesisSource] || 0));
  const synthesisRemaining = Math.max(0, 3 - synthesisCount);
  const synthesisSegments = Array.from({ length: 3 }, (_, index) => `<span class="${index < synthesisCount ? "filled" : ""}">${index < synthesisCount ? synthesisSource : ""}</span>`).join("");
  const synthesisTitle = synthesisComplete
    ? "S등급 완성"
    : synthesisRemaining === 0
      ? `${synthesisTarget}등급 합성 준비 완료`
      : `${synthesisTarget}등급까지 ${synthesisSource} ${synthesisRemaining}개`;
  const back = document.createElement("div");
  back.className = "info-modal-back";
  back.dataset.returnFocusSelector = `.loadout-slot.slot-${armorCode}`;
  back._escapeHandler = (event) => {
    if (event.key === "Escape") closeInfoModal();
  };
  back.innerHTML = `<div class="info-modal equipment-info-modal ${gradeClass}" role="dialog" aria-modal="true" aria-labelledby="equipment-dialog-title" aria-describedby="equipment-dialog-summary">
    <button type="button" class="modal-close" aria-label="장비 상세 닫기" onclick="closeInfoModal()">×</button>
    <div class="equipment-info-scroll">
      <div class="equipment-info-head equipment-detail-hero">
        <div class="equipment-info-icon"><img src="${armor.icon}" alt="${escapeHtml(armor.name)}"></div>
        <div class="equipment-info-copy">
          <div class="equipment-info-title" id="equipment-dialog-title">${escapeHtml(armor.name)}</div>
          <div class="equipment-current-effect" id="equipment-dialog-summary"><strong>${escapeHtml(currentBenefit)}</strong></div>
        </div>
        <div class="equipment-current-grade ${grade ? `grade-${grade}` : "grade-empty"}" aria-label="${grade ? `현재 ${grade}등급` : "미보유"}">
          <strong>${grade || "?"}</strong>
        </div>
      </div>

      <div class="synthesis-progress-card ${synthesisComplete ? "is-complete" : `progress-to-${synthesisTarget}`}">
        <div class="synthesis-progress-title">${synthesisTitle}</div>
        ${synthesisComplete ? "" : `<div class="synthesis-segments" role="img" aria-label="${synthesisSource}등급 장비 3개 중 ${synthesisCount}개 보유">${synthesisSegments}</div>`}
      </div>

      <div class="equipment-quick-facts">
        <div class="equipment-quick-fact meaning-fact">
          <div class="equipment-quick-icon" aria-hidden="true">✦</div>
          <div><span>의미</span><strong>${escapeHtml(armor.meaning || "")}</strong></div>
        </div>
        <div class="equipment-quick-fact trial-fact" aria-label="맞서는 도전: ${trial ? `${escapeHtml(trial.demon)}. ${escapeHtml(trial.mission)}` : "연결된 도전 없음"}">
          <div class="equipment-quick-icon" aria-hidden="true">⚔</div>
          <div><span>상대</span><strong>${trial ? escapeHtml(trial.demon) : "도전 없음"}</strong></div>
        </div>
      </div>

      <div class="equipment-roadmap-head"><span>등급 효과</span></div>
      <div class="equipment-grade-roadmap">${gradeRoadmap}</div>
    </div>
  </div>`;
  back.addEventListener("click", (event) => {
    if (event.target === back) closeInfoModal();
  });
  document.addEventListener("keydown", back._escapeHandler);
  document.body.appendChild(back);
  back.querySelector(".modal-close")?.focus({ preventScroll: true });
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
  back.dataset.returnFocusSelector = ".inventory-button";
  back._escapeHandler = (event) => {
    if (event.key === "Escape") closeInfoModal();
  };
  back.innerHTML = `<div class="info-modal inventory-info-modal" role="dialog" aria-modal="true" aria-labelledby="inventory-dialog-title">
    <button type="button" class="modal-close" aria-label="인벤토리 닫기" onclick="closeInfoModal()">×</button>
    <div class="inventory-modal-head">
      <div>
        <div class="equipment-info-title" id="inventory-dialog-title">내 인벤토리</div>
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
  document.addEventListener("keydown", back._escapeHandler);
  document.body.appendChild(back);
  back.querySelector(".modal-close")?.focus({ preventScroll: true });
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
  state.program = payload.program;
  state.armor = payload.armor;
  state.forestTrials = payload.forestTrials;
  state.qrRewards = payload.qrRewards || [];
  state.claimedQrCodes = payload.claimedQrCodes || [];
  state.teamRanking = payload.teamRanking || [];
  state.monthlyProgress = payload.monthlyProgress || null;
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
  const accessCode = document.getElementById("player-code")?.value.trim() || "";
  const gender = "male";
  if (!name) return toast("이름을 입력해주세요.", "error");
  if (accessCode && !/^\d{4}$/.test(accessCode)) return toast("재접속 코드는 4자리 숫자입니다.", "error");
  showConnectScreen();
  try {
    const payload = await api("create-player", { name, team, gender, accessCode });
    state.armor = payload.armor;
    state.program = payload.program;
    state.forestTrials = payload.forestTrials;
    state.qrRewards = payload.qrRewards || [];
    state.claimedQrCodes = payload.claimedQrCodes || [];
    state.teamRanking = payload.teamRanking || [];
    state.monthlyProgress = payload.monthlyProgress || null;
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
    state.monthlyProgress = payload.monthlyProgress || state.monthlyProgress;
    state.teamRanking = payload.teamRanking || state.teamRanking;
    state.ranking = payload.ranking || state.ranking;
    state.booths = payload.booths || state.booths;
    setMe(payload.me);
    renderQr();
    if (payload.locked) {
      toast(payload.lockMessage || "아직 열리지 않은 미션입니다.", "error");
    } else if (payload.alreadyClaimed) {
      toast("이미 받은 QR 보상입니다.", "error");
    } else {
      showDrawModal(payload.results || [], payload.promotions || []);
    }
  } catch (error) {
    toast(error.message, "error");
  }
}

function updateEntryReadiness() {
  const nameInput = document.getElementById("player-name");
  const teamInput = document.getElementById("player-team");
  const preview = document.getElementById("entry-player-preview");
  const startButton = document.getElementById("entry-start-button");
  if (!nameInput || !teamInput || !preview || !startButton) return;

  const name = nameInput.value.trim();
  const team = teamInput.value.trim();
  preview.textContent = [name, team].filter(Boolean).join(" · ") || "참가 준비";
  preview.classList.toggle("active", Boolean(name));
  startButton.classList.toggle("is-ready", Boolean(name));
  nameInput.closest(".entry-input-wrap")?.classList.toggle("has-value", Boolean(name));
  teamInput.closest(".entry-input-wrap")?.classList.toggle("has-value", Boolean(team));
}

function renderMonthlyCreate() {
  app.innerHTML = `${topbar()}${programBannerHtml()}<div class="title">전신갑주를 입어라</div>
    <div class="subtitle">하나님의 전신갑주를 입어라!</div>
    <div class="panel pin">
      <div class="section-label pink">캐릭터 등록</div>
      <div class="field"><label>이름</label><input id="player-name" maxlength="20" placeholder="학생 이름" value="${escapeHtml(localStorage.getItem(STORAGE_NAME) || "")}"></div>
      <div class="field"><label>조</label><input id="player-team" maxlength="12" placeholder="예: 1조" value="${escapeHtml(localStorage.getItem(STORAGE_TEAM) || "")}"></div>
      <div class="field"><label>4자리 재접속 코드</label><input id="player-code" maxlength="4" inputmode="numeric" pattern="[0-9]*" placeholder="이어할 때만 입력" value="${escapeHtml(localStorage.getItem(STORAGE_CODE) || "")}"></div>
      <button class="btn pink" onclick="createPlayer()">⚔️ 모험 시작</button>
    </div>`;
}

function renderCreate() {
  if (!isRetreatMode()) return renderMonthlyCreate();
  const savedAccessCode = localStorage.getItem(STORAGE_CODE) || "";
  const savedName = localStorage.getItem(STORAGE_NAME) || "";
  const savedTeam = localStorage.getItem(STORAGE_TEAM) || "";
  document.body.classList.add("entry-mode");
  app.innerHTML = `<div class="entry-shell">
    <header class="entry-topbar">
      <div class="entry-brand">
        <span class="entry-brand-mark" aria-hidden="true">⚔</span>
        <h1 id="entry-title">전신갑주를 입어라</h1>
      </div>
      <button class="entry-teacher-button" type="button" onclick="nav('/admin')">교사용</button>
    </header>

    <div class="entry-program-identity">
      <strong>${escapeHtml(state.program?.churchName || "우리 교회")}</strong>
      <span>${escapeHtml(state.program?.eventName || "수련회")}</span>
    </div>

    <main class="entry-screen" aria-labelledby="entry-title">
      <section class="entry-hero">
        <img src="/assets/ui/entry-armor-hero.png" alt="전신갑주를 갖춘 용사가 원정을 시작하는 일러스트" fetchpriority="high">
      </section>

      <form class="entry-card" onsubmit="event.preventDefault(); createPlayer()">
        <div class="entry-card-heading">
          <h2>용사 등록</h2>
          <div id="entry-player-preview" class="entry-player-preview">참가 준비</div>
        </div>

        <div class="entry-field-grid">
          <div class="field entry-field">
            <label for="player-name">이름</label>
            <div class="entry-input-wrap">
              <img src="/assets/armor/helmet.png" alt="" aria-hidden="true">
              <input id="player-name" maxlength="20" autocomplete="name" enterkeyhint="next" placeholder="이름 입력" value="${escapeHtml(savedName)}" oninput="updateEntryReadiness()">
            </div>
          </div>
          <div class="field entry-field">
            <label for="player-team">조</label>
            <div class="entry-input-wrap">
              <img src="/assets/armor/shield.png" alt="" aria-hidden="true">
              <input id="player-team" maxlength="12" autocomplete="off" enterkeyhint="go" placeholder="예: 1조" value="${escapeHtml(savedTeam)}" oninput="updateEntryReadiness()">
            </div>
          </div>
        </div>

        <button id="entry-start-button" class="entry-start-button" type="submit">
          <span class="entry-start-symbol" aria-hidden="true">⚔</span>
          <span>원정 시작</span>
          <span class="entry-start-arrow" aria-hidden="true">➜</span>
        </button>

        <details class="reconnect-details entry-reconnect" ${savedAccessCode ? "open" : ""}>
          <summary><span>기존 캐릭터 이어하기</span></summary>
          <div class="reconnect-body">
            <div class="field"><label for="player-code">4자리 재접속 코드</label><input id="player-code" maxlength="4" inputmode="numeric" pattern="[0-9]*" placeholder="예: 4821" value="${escapeHtml(savedAccessCode)}"></div>
            <div class="field-hint">처음이면 비워두세요. 다른 기기에서 이어할 때만 사용합니다.</div>
          </div>
        </details>
      </form>
    </main>
  </div>`;
  updateEntryReadiness();
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
  const rows = sortedRanking(source).slice(0, limit).map((player, index) => `<div class="rank-row place-${index + 1} ${state.me && player.id === state.me.id ? "me" : ""}">
    <div class="rank-num">${index + 1}</div>
    <div><div class="row-title">${escapeHtml(player.name)} ${player.team ? `<span class="tag">${escapeHtml(player.team)}</span>` : ""}</div></div>
    <div class="rank-status rank-power"><span>장비전투력</span><strong>${formatNumber(equipmentPower(player))}</strong></div>
  </div>`).join("");
  return rows || `<div class="notice">아직 랭킹에 표시할 학생이 없습니다.</div>`;
}

function teamRankingHtml(limit = 10) {
  const rows = [...(state.teamRanking || [])].slice(0, limit).map((team) => `<div class="rank-row">
    <div class="rank-num">${team.rank}</div>
    <div><div class="row-title">${escapeHtml(team.team)}</div><div class="row-sub">참가 ${team.participants}명 · 완료 ${team.completedMissions}개</div></div>
    <div class="rank-status rank-power"><span>달란트</span><strong>${formatNumber(team.talent)}</strong></div>
  </div>`).join("");
  return rows || `<div class="notice">팀 랭킹 데이터가 없습니다.</div>`;
}

function monthlySummaryHtml() {
  if (state.program?.programMode !== "monthly" || !state.monthlyProgress) return "";
  const weeks = state.monthlyProgress.weeks.map((week) => `<div class="week-chip ${week.locked ? "locked" : ""}">
    <strong>${week.weekIndex}주차</strong>
    <span>${week.locked ? "잠금" : `${week.completed}/${week.total}`}</span>
  </div>`).join("");
  return `<div class="panel pin">
    <div class="section-label mint">이번 달 진행률</div>
    <div class="monthly-progress-head"><strong>${state.monthlyProgress.completed}/${state.monthlyProgress.total}</strong><span>완료</span></div>
    <div class="week-chip-row">${weeks}</div>
    <button class="btn mint mt-12" onclick="nav('/monthly')">이번 주 미션 보기</button>
  </div>`;
}

function renderMonthlyHome() {
  if (!state.me) return renderCreate();
  const me = state.me;
  app.innerHTML = `${topbar()}${programBannerHtml()}
    <div class="panel hero">
      <div class="profile-name">${escapeHtml(me.name)}</div>
      <div class="profile-meta">${me.team ? `<span class="tag">${escapeHtml(me.team)}</span>` : ""}<span class="tag">달란트 ${formatNumber(me.talent || 0)}</span><span class="tag">갑주 ${me.ownedArmorCount}/6</span>${me.accessCode ? `<span class="tag">재접속 ${escapeHtml(me.accessCode)}</span>` : ""}</div>
      ${equipmentBoardHtml(me)}
    </div>
    ${monthlySummaryHtml()}
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
      <button class="btn purple" onclick="nav('/team-ranking')">팀 랭킹</button>
      <button class="btn mint" onclick="nav('/forest')">⚔️ 갑주 도전</button>
      ${state.program?.programMode === "monthly" ? `<button class="btn mint" onclick="nav('/monthly')">월간 미션</button>` : ""}
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

function renderHome() {
  if (!isRetreatMode()) return renderMonthlyHome();
  if (!state.me) return renderCreate();
  const me = state.me;
  document.body.classList.add("home-mode");
  app.innerHTML = `<div class="home-page">
    ${topbar({ brand: "전신갑주를 입어라", logoutLabel: "나가기" })}
    ${programBannerHtml()}

    <div class="home-art-banner">
      <img src="/assets/ui/entry-armor-hero.png" alt="전신갑주를 갖춘 용사" fetchpriority="high">
    </div>

    <section class="home-player-card" aria-label="내 캐릭터 정보">
      <div class="home-player-avatar" aria-hidden="true"><img src="/assets/armor/helmet.png" alt=""></div>
      <div class="home-player-copy">
        <div class="profile-name">${escapeHtml(me.name)}</div>
        <div class="home-player-team">${escapeHtml(me.team || "조 미지정")} · 달란트 ${formatNumber(me.talent || 0)}</div>
      </div>
      ${me.accessCode ? `<div class="home-access-code" title="다른 기기에서 이어할 때 사용"><span>재접속</span><strong>${escapeHtml(me.accessCode)}</strong></div>` : ""}
    </section>

    <section class="home-section home-loadout-card">
      <div class="home-section-heading"><h2>내 전신갑주</h2><span>장비 ${me.ownedArmorCount}/6</span></div>
      ${equipmentBoardHtml(me)}
    </section>

    <section class="home-section home-draw-card">
      <div class="home-section-heading"><h2>장비 뽑기</h2><span>자동 합성</span></div>
      <div class="btn-row home-draw-buttons">
        <button class="btn" aria-label="1회 뽑기" onclick="draw(1)">1회</button>
        <button class="btn" aria-label="2회 뽑기" onclick="draw(2)">2회</button>
        <button class="btn" aria-label="3회 뽑기" onclick="draw(3)">3회</button>
      </div>
      ${drawResultsHtml()}
    </section>

    <nav class="home-nav-grid" aria-label="게임 메뉴">
      <button class="home-menu-button" onclick="nav('/ranking')"><span class="home-menu-icon">🏆</span><span>개인 랭킹</span></button>
      <button class="home-menu-button team" onclick="nav('/team-ranking')"><span class="home-menu-icon">🛡️</span><span>조 랭킹</span></button>
      <button class="home-menu-button accent" onclick="nav('/forest')"><span class="home-menu-icon"><img src="/assets/armor/sword.png" alt="" aria-hidden="true"></span><span>갑주 도전</span></button>
      <button class="home-menu-button compact" onclick="nav('/exchange/1')"><span class="home-menu-icon"><img src="/assets/armor/shield.png" alt="" aria-hidden="true"></span><span>교환소 1</span></button>
      <button class="home-menu-button compact" onclick="nav('/exchange/2')"><span class="home-menu-icon"><img src="/assets/armor/belt.png" alt="" aria-hidden="true"></span><span>교환소 2</span></button>
    </nav>

    <section class="home-section home-ranking-card">
      <div class="home-section-heading"><h2>실시간 랭킹</h2><span>장비전투력</span></div>
      ${rankingHtml(5)}
    </section>
  </div>`;
  startPoll(async () => {
    try {
      await loadState({ quiet: true });
      if (route().path === "/") renderHome();
    } catch {}
  }, 5000);
}

function renderMonthlyRanking() {
  app.innerHTML = `${topbar({ back: true })}${programBannerHtml()}
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

function renderRanking() {
  if (!isRetreatMode()) return renderMonthlyRanking();
  document.body.classList.add("player-mode");
  app.innerHTML = `<div class="student-page ranking-page">
    ${topbar({ back: true, logoutLabel: "나가기" })}
    <section class="student-panel ranking-panel">
      <div class="student-page-heading">
        <span class="student-heading-icon" aria-hidden="true">🏆</span>
        <div><h1>실시간 랭킹</h1><p>장비전투력 순위</p></div>
      </div>
      <div class="student-ranking-list">${rankingHtml(30)}</div>
    </section>
  </div>`;
  startPoll(async () => {
    try {
      await loadState({ quiet: true });
      if (route().path === "/ranking") renderRanking();
    } catch {}
  }, 4000);
}

function renderMonthlyTeamRanking() {
  app.innerHTML = `${topbar({ back: true })}${programBannerHtml()}
    <div class="panel pin">
      <div class="section-label sun">팀 랭킹</div>
      ${teamRankingHtml(30)}
    </div>`;
  startPoll(async () => {
    try {
      await loadState({ quiet: true });
      if (route().path === "/team-ranking") renderTeamRanking();
    } catch {}
  }, 4000);
}

function renderTeamRanking() {
  if (!isRetreatMode()) return renderMonthlyTeamRanking();
  document.body.classList.add("player-mode");
  app.innerHTML = `<div class="student-page ranking-page team-ranking-page">
    ${topbar({ back: true, logoutLabel: "나가기" })}
    <section class="student-panel ranking-panel">
      <div class="student-page-heading">
        <span class="student-heading-icon" aria-hidden="true">🛡️</span>
        <div><h1>조 랭킹</h1><p>함께 모은 달란트 순위</p></div>
      </div>
      <div class="student-ranking-list">${teamRankingHtml(30)}</div>
    </section>
  </div>`;
  startPoll(async () => {
    try {
      await loadState({ quiet: true });
      if (route().path === "/team-ranking") renderTeamRanking();
    } catch {}
  }, 4000);
}

function renderMonthly() {
  const currentWeek = Number(state.program?.currentWeek || 1);
  const missions = state.qrRewards.filter((mission) => mission.phase !== "hidden");
  const rows = missions.map((mission) => {
    const claimed = state.claimedQrCodes.includes(mission.code);
    const locked = state.program?.programMode === "monthly" && Number(mission.weekIndex || 0) > currentWeek;
    return `<div class="mission-row ${locked ? "locked" : ""}">
      <div class="mission-week">${mission.weekIndex || "-" }주차</div>
      <div class="mission-main">
        <div class="row-title">${escapeHtml(mission.title)}</div>
        <div class="row-sub">${escapeHtml(mission.shortDescription || mission.description || "")}</div>
        <div class="row-sub mt-8">나눔 질문: ${escapeHtml(mission.smallGroupQuestion || "소그룹에서 함께 나눕니다.")}</div>
      </div>
      <div class="mission-state">${locked ? "잠금" : claimed ? "완료" : "진행"}</div>
    </div>`;
  }).join("");
  app.innerHTML = `${topbar({ back: true })}${programBannerHtml()}
    ${monthlySummaryHtml()}
    <div class="panel pin">
      <div class="section-label mint">주차별 미션</div>
      <div class="notice">이번 주 미션을 먼저 진행하세요. 다음 주 미션은 운영 정책에 따라 잠금 처리됩니다.</div>
      <div class="mission-list mt-12">${rows}</div>
    </div>`;
}

function qrPrintBaseUrl() {
  const configured = String(state.program?.deliveryBaseUrl || "").trim();
  return (configured || location.origin).replace(/\/+$/, "");
}

function absoluteUrl(path) {
  try {
    return new URL(path, `${qrPrintBaseUrl()}/`).toString();
  } catch {
    return `${qrPrintBaseUrl()}${String(path || "").startsWith("/") ? "" : "/"}${path || ""}`;
  }
}

function qrImage(url, { margin = 4, width = 512 } = {}) {
  return `/api/app?action=qr-svg&margin=${margin}&width=${width}&text=${encodeURIComponent(url)}`;
}

function qrPrintOptions() {
  const query = new URLSearchParams(location.search);
  const layout = query.get("layout") === "cards" ? "cards" : "book";
  const requestedMode = query.get("mode") || "current";
  const mode = ["current", "all", "retreat", "monthly"].includes(requestedMode) ? requestedMode : "current";
  return { layout, mode, includeHidden: query.get("hidden") === "1" };
}

function qrPrintModeValue(options = qrPrintOptions()) {
  return options.mode === "current" ? (state.program?.programMode || "retreat") : options.mode;
}

function qrPrintMissions(options = qrPrintOptions()) {
  const mode = qrPrintModeValue(options);
  return (state.qrRewards || []).filter((mission) => {
    if (mode !== "all" && mission.mode !== mode && mission.mode !== "both") return false;
    if (!options.includeHidden && mission.type === "hidden") return false;
    return true;
  });
}

function qrPrintTypeLabel(mission) {
  return mission.type === "hidden" ? "HIDDEN" : mission.type === "boss" ? "FINAL" : "MISSION";
}

function qrPrintModeLabel(mode) {
  return mode === "monthly" ? "월간 챌린지" : "수련회";
}

function qrPrintRewardLabel(mission) {
  const draws = Number(mission.reward?.draws || 0);
  const talent = Number(mission.reward?.talent || 0);
  return [draws ? `${draws}회 뽑기` : "", talent ? `달란트 ${talent}` : ""].filter(Boolean).join(" + ") || "확인 보상";
}

function qrPrintPath(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function qrPrintDateLabel() {
  const start = String(state.program?.eventStartDate || "").replaceAll("-", ".");
  const end = String(state.program?.eventEndDate || "").replaceAll("-", ".");
  return [start, end].filter(Boolean).join(" - ") || "행사 일정 별도 안내";
}

function qrPrintArmorClass(mission) {
  return ["belt", "breastplate", "shoes", "shield", "helmet", "sword"].includes(mission.armor) ? mission.armor : "default";
}

function qrPrintMissionIndexHtml(missions) {
  return missions.map((mission, index) => {
    const armor = armorByCode(mission.armor);
    return `<div class="qr-book-index-row type-${mission.type}">
      <span class="qr-index-number">${String(index + 1).padStart(2, "0")}</span>
      <img src="${armor.icon}" alt="">
      <div><strong>${escapeHtml(mission.title)}</strong><small>${escapeHtml(qrPrintTypeLabel(mission))} · ${escapeHtml(qrPrintModeLabel(mission.mode))}</small></div>
    </div>`;
  }).join("");
}

function qrBookMissionPageHtml(mission, index, pageNumber, pageTotal) {
  const armor = armorByCode(mission.armor);
  const url = absoluteUrl(mission.urlPath || `/qr/${mission.code}`);
  const armorClass = qrPrintArmorClass(mission);
  const teacherLabel = mission.type === "hidden" ? `<div class="qr-teacher-ribbon">교사용 · 학생 배포 금지</div>` : "";
  return `<section class="qr-book-sheet qr-book-mission theme-${armorClass} type-${mission.type}">
    ${teacherLabel}
    <header class="qr-book-mission-head">
      <div class="qr-book-chapter"><span>${qrPrintTypeLabel(mission)}</span><strong>${String(index + 1).padStart(2, "0")}</strong></div>
      <div class="qr-book-mode">${escapeHtml(qrPrintModeLabel(mission.mode))}${mission.weekIndex ? ` · ${mission.weekIndex}주차` : ""}</div>
    </header>
    <div class="qr-book-armor-visual" aria-hidden="true"><img src="${armor.icon}" alt=""></div>
    <main class="qr-book-mission-body">
      <div class="qr-book-armor-name">${escapeHtml(armor.name || "전신갑주 미션")}</div>
      <h2>${escapeHtml(mission.title)}</h2>
      <p class="qr-book-mission-copy">${escapeHtml(mission.shortDescription || mission.description || "")}</p>
      <div class="qr-book-verse"><span>ARMOR VERSE</span><strong>${escapeHtml(mission.verse || "말씀 구절")}</strong></div>
      <div class="qr-book-scan-block">
        <div class="qr-safe-frame"><i></i><img class="print-qr" src="${qrImage(url)}" alt="${escapeHtml(mission.title)} QR"></div>
        <div class="qr-scan-copy"><span>SCAN TO START</span><strong>QR을 스캔하고<br>미션을 시작하세요</strong><small>${escapeHtml(qrPrintPath(url))}</small></div>
      </div>
      <div class="qr-book-question"><span>함께 나눌 질문</span><p>${escapeHtml(mission.smallGroupQuestion || "미션을 마친 뒤 함께 느낀 점을 나눠보세요.")}</p></div>
      <div class="qr-book-reward"><span>MISSION REWARD</span><strong>${escapeHtml(qrPrintRewardLabel(mission))}</strong></div>
    </main>
    <footer class="qr-book-footer"><span>${escapeHtml(state.program?.churchName || "")}</span><strong>${pageNumber} / ${pageTotal}</strong><span>${escapeHtml(mission.code)}</span></footer>
  </section>`;
}

function qrBookBlankPageHtml(pageNumber, pageTotal, index) {
  return `<section class="qr-book-sheet qr-book-notes">
    <div class="qr-notes-mark">✦</div>
    <p>FIELD NOTES ${String(index + 1).padStart(2, "0")}</p>
    <h2>오늘의 갑주 기록</h2>
    <div class="qr-note-lines">${Array.from({ length: 9 }, () => "<span></span>").join("")}</div>
    <footer class="qr-book-footer"><span>${escapeHtml(state.program?.churchName || "")}</span><strong>${pageNumber} / ${pageTotal}</strong><span>ARMOR MISSION BOOK</span></footer>
  </section>`;
}

function qrBookHtml(missions) {
  const basePageCount = missions.length + 3;
  const blankCount = (4 - (basePageCount % 4)) % 4;
  const pageTotal = basePageCount + blankCount;
  const missionPages = missions.map((mission, index) => qrBookMissionPageHtml(mission, index, index + 3, pageTotal)).join("");
  const blankPages = Array.from({ length: blankCount }, (_, index) => qrBookBlankPageHtml(missions.length + 3 + index, pageTotal, index)).join("");
  return `<div class="qr-print-stage qr-book-stage">
    <section class="qr-book-sheet qr-book-cover">
      <div class="qr-cover-grid"></div>
      <header><span>${escapeHtml(state.program?.churchName || "CHURCH")}</span><strong>QR MISSION BOOK</strong></header>
      <div class="qr-cover-title"><p>WHOLE ARMOR ADVENTURE</p><h1>전신갑주<br><em>미션북</em></h1><div>스캔하고, 도전하고,<br>나만의 갑주를 완성하라</div></div>
      <img class="qr-cover-hero" src="/assets/ui/entry-armor-hero.png" alt="전신갑주 용사">
      <div class="qr-cover-meta"><span>${escapeHtml(qrPrintDateLabel())}</span><strong>${missions.length} MISSIONS · ${state.armor.length} ARMORS</strong></div>
    </section>
    <section class="qr-book-sheet qr-book-guide">
      <header class="qr-guide-head"><span>FIELD GUIDE</span><strong>02 / ${pageTotal}</strong></header>
      <h1>원정 시작 전<br><em>3가지만 기억하세요</em></h1>
      <div class="qr-guide-steps">
        <div><b>01</b><strong>카메라 열기</strong><span>휴대폰 기본 카메라로 QR을 비춥니다.</span></div>
        <div><b>02</b><strong>이름과 조 확인</strong><span>내 캐릭터로 접속했는지 확인합니다.</span></div>
        <div><b>03</b><strong>미션 시작</strong><span>선생님의 안내에 따라 도전하고 보상을 받습니다.</span></div>
      </div>
      <div class="qr-guide-index"><h2>MISSION INDEX</h2>${qrPrintMissionIndexHtml(missions)}</div>
      <div class="qr-guide-note">QR이 열리지 않으면 선생님에게 카드 하단의 경로를 보여주세요.</div>
      <footer class="qr-book-footer"><span>${escapeHtml(state.program?.eventName || "")}</span><strong>02 / ${pageTotal}</strong><span>${escapeHtml(qrPrintBaseUrl())}</span></footer>
    </section>
    ${missionPages}
    ${blankPages}
    <section class="qr-book-sheet qr-book-back">
      <img src="/assets/ui/warrior-shadow.png" alt="" aria-hidden="true">
      <div class="qr-back-copy"><span>MISSION COMPLETE</span><h1>전신갑주를<br>끝까지 입어라</h1><p>모든 QR을 스캔한 뒤에도<br>말씀과 믿음의 선택은 계속됩니다.</p></div>
      <div class="qr-back-check"><span>□ 모든 QR 실물 스캔 확인</span><span>□ 최종 배포 주소 확인</span><span>□ 히든 QR 회수 확인</span></div>
      <footer><strong>${escapeHtml(state.program?.churchName || "")}</strong><span>${escapeHtml(state.program?.eventName || "")}</span><small>${escapeHtml(qrPrintBaseUrl())}</small></footer>
    </section>
  </div>`;
}

function qrCardPackCardHtml(mission, index) {
  const armor = armorByCode(mission.armor);
  const url = absoluteUrl(mission.urlPath || `/qr/${mission.code}`);
  const armorClass = qrPrintArmorClass(mission);
  return `<article class="qr-pack-card theme-${armorClass} type-${mission.type}">
    ${mission.type === "hidden" ? `<div class="qr-pack-secret">교사용 · 배포 금지</div>` : ""}
    <header><div><span>${qrPrintTypeLabel(mission)}</span><strong>${String(index + 1).padStart(2, "0")}</strong></div><em>${escapeHtml(qrPrintModeLabel(mission.mode))}</em></header>
    <div class="qr-pack-title"><img src="${armor.icon}" alt=""><div><small>${escapeHtml(armor.name || "전신갑주")}</small><h2>${escapeHtml(mission.title)}</h2></div></div>
    <p>${escapeHtml(mission.shortDescription || mission.description || "")}</p>
    <div class="qr-pack-scan"><div class="qr-safe-frame"><i></i><img class="print-qr" src="${qrImage(url)}" alt="${escapeHtml(mission.title)} QR"></div><div><span>SCAN</span><strong>미션 시작</strong><small>${escapeHtml(qrPrintPath(url))}</small></div></div>
    <div class="qr-pack-bottom"><span>${escapeHtml(mission.verse || "")}</span><strong>${escapeHtml(qrPrintRewardLabel(mission))}</strong></div>
    <footer><span>${escapeHtml(state.program?.churchName || "")}</span><small>${escapeHtml(mission.code)}</small></footer>
  </article>`;
}

function qrCardPackNoteHtml(index) {
  const isChecklist = index % 2 === 1;
  return `<article class="qr-pack-note-card">
    <header><span>FIELD NOTE</span><strong>${String(index + 1).padStart(2, "0")}</strong></header>
    <div class="qr-pack-note-mark">✦</div>
    <h2>${isChecklist ? "현장 QR 체크" : "QR 배치 기록"}</h2>
    <p>${isChecklist ? "인쇄 후 실제 휴대폰으로 모든 QR을 한 번씩 확인하세요." : "히든 미션과 보스 QR의 설치 위치를 기록하세요."}</p>
    <div class="qr-pack-note-lines">
      ${isChecklist ? `<span>□ 최종 배포 주소</span><span>□ 실물 스캔 완료</span><span>□ 히든 QR 회수</span><span>□ 예비 카드 보관</span>` : `<span><b>설치 위치</b></span><span><b>담당 교사</b></span><span><b>설치 시간</b></span><span><b>회수 확인</b></span>`}
    </div>
    <footer><strong>${escapeHtml(state.program?.churchName || "")}</strong><small>QR MISSION FIELD NOTE</small></footer>
  </article>`;
}

function qrCardPackHtml(missions) {
  const sheetCount = Math.max(1, Math.ceil(missions.length / 4));
  const sheets = [];
  for (let offset = 0; offset < missions.length; offset += 4) {
    const sheetMissions = missions.slice(offset, offset + 4);
    const cards = sheetMissions.map((mission, index) => qrCardPackCardHtml(mission, offset + index)).join("");
    const notes = Array.from({ length: 4 - sheetMissions.length }, (_, index) => qrCardPackNoteHtml(index)).join("");
    const sheetNumber = Math.floor(offset / 4) + 1;
    sheets.push(`<section class="qr-card-sheet"><div class="qr-card-sheet-label">QR CARD PACK · ${String(sheetNumber).padStart(2, "0")} / ${String(sheetCount).padStart(2, "0")}</div><div class="qr-card-grid">${cards}${notes}</div></section>`);
  }
  return `<div class="qr-print-stage qr-card-stage">${sheets.join("") || `<section class="qr-card-sheet qr-empty-sheet">출력할 QR 미션이 없습니다.</section>`}</div>`;
}

function applyQrPrintPageSize(layout) {
  let rule = document.getElementById("qr-print-page-rule");
  if (!rule) {
    rule = document.createElement("style");
    rule.id = "qr-print-page-rule";
    document.head.appendChild(rule);
  }
  rule.textContent = `@media print { @page { size: ${layout === "cards" ? "A4 portrait" : "A5 portrait"}; margin: 0; } }`;
}

function setQrPrintOption(key, value) {
  const url = new URL(location.href);
  if (value === "" || value === false || value === null) url.searchParams.delete(key);
  else url.searchParams.set(key, String(value));
  history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  renderPrintQr();
}

function isLocalPrintBaseUrl() {
  try {
    return ["localhost", "127.0.0.1", "::1"].includes(new URL(qrPrintBaseUrl()).hostname);
  } catch {
    return true;
  }
}

function updatePrintQrStatus() {
  const images = [...document.querySelectorAll(".qr-print-template .print-qr")];
  const ready = images.filter((image) => image.complete && image.naturalWidth > 0).length;
  const failed = images.filter((image) => image.complete && image.naturalWidth === 0).length;
  const status = document.getElementById("qr-print-status");
  const button = document.getElementById("qr-print-button");
  const localBase = isLocalPrintBaseUrl();
  if (status) {
    status.textContent = failed ? `QR ${failed}개 로딩 실패` : `QR ${ready}/${images.length} 준비 완료`;
    status.className = `qr-print-status ${failed ? "error" : ready === images.length && images.length ? "ready" : "loading"}`;
  }
  if (button) button.disabled = localBase || failed > 0 || !images.length || ready !== images.length;
  for (const image of images) {
    if (image.dataset.statusBound) continue;
    image.dataset.statusBound = "1";
    image.addEventListener("load", updatePrintQrStatus, { once: true });
    image.addEventListener("error", updatePrintQrStatus, { once: true });
  }
  return { ready, total: images.length, failed, localBase };
}

function printQrTemplate() {
  const status = updatePrintQrStatus();
  if (status.localBase) return toast("실제 배포 주소를 DELIVERY_BASE_URL에 설정한 뒤 인쇄해주세요.", "error");
  if (status.failed || status.ready !== status.total) return toast("모든 QR이 준비된 뒤 다시 시도해주세요.", "error");
  window.print();
}

function renderPrintQr() {
  const options = qrPrintOptions();
  const missions = qrPrintMissions(options);
  const localBase = isLocalPrintBaseUrl();
  const modeValue = qrPrintModeValue(options);
  applyQrPrintPageSize(options.layout);
  app.innerHTML = `<div class="print-page qr-print-template" data-layout="${options.layout}">
    <div class="print-toolbar qr-print-toolbar">
      <button class="btn cream" onclick="nav('/admin')">관리자</button>
      <div class="qr-layout-switch" role="group" aria-label="인쇄 형식">
        <button type="button" class="${options.layout === "book" ? "active" : ""}" aria-pressed="${options.layout === "book"}" onclick="setQrPrintOption('layout','book')">A5 테마북</button>
        <button type="button" class="${options.layout === "cards" ? "active" : ""}" aria-pressed="${options.layout === "cards"}" onclick="setQrPrintOption('layout','cards')">A4 카드팩</button>
      </div>
      <label class="qr-print-select"><span>출력 범위</span><select onchange="setQrPrintOption('mode',this.value)">
        <option value="current" ${options.mode === "current" ? "selected" : ""}>현재 모드 (${qrPrintModeLabel(state.program?.programMode)})</option>
        <option value="all" ${options.mode === "all" ? "selected" : ""}>전체 미션</option>
        <option value="retreat" ${options.mode === "retreat" ? "selected" : ""}>수련회</option>
        <option value="monthly" ${options.mode === "monthly" ? "selected" : ""}>월간</option>
      </select></label>
      <label class="qr-hidden-toggle"><input type="checkbox" ${options.includeHidden ? "checked" : ""} onchange="setQrPrintOption('hidden',this.checked?'1':'')"><span>히든 QR 포함</span><small>교사용</small></label>
      <button id="qr-print-button" class="btn pink" onclick="printQrTemplate()" disabled>인쇄 / PDF</button>
    </div>
    <div class="qr-print-control-panel">
      <div><span>PRINT FORMAT</span><strong>${options.layout === "book" ? "A5 테마북 · 4의 배수 자동 구성" : "A4 카드팩 · 면당 4장"}</strong></div>
      <div><span>OUTPUT</span><strong>${qrPrintModeLabel(modeValue)} · QR ${missions.length}개</strong></div>
      <div><span>BASE URL</span><strong>${escapeHtml(qrPrintBaseUrl())}</strong></div>
      <div id="qr-print-status" class="qr-print-status loading" aria-live="polite">QR 0/${missions.length} 준비 중</div>
    </div>
    ${localBase ? `<div class="qr-print-origin-warning"><strong>인쇄 잠금</strong><span>현재 QR 주소가 로컬입니다. <code>DELIVERY_BASE_URL</code>에 실제 배포 주소를 설정해야 인쇄할 수 있습니다.</span></div>` : ""}
    <div class="qr-print-preview-note">${options.layout === "book" ? "프린터에서 A5·양면·짧은쪽 넘김을 선택하면 테마북으로 제본할 수 있습니다." : "A4 100% 실제 크기로 출력한 뒤 카드 외곽 절취선을 따라 재단하세요."}</div>
    ${options.layout === "book" ? qrBookHtml(missions) : qrCardPackHtml(missions)}
  </div>`;
  setTimeout(updatePrintQrStatus, 0);
}

function renderPrintEquipment() {
  const cards = state.armor.map((armor, index) => `<article class="print-card equipment-print-card">
    <div class="print-number">${index + 1}</div>
    <img src="${armor.icon}" alt="">
    <h2>${escapeHtml(armor.name)}</h2>
    <p class="print-verse">${escapeHtml(armor.verse || "")}</p>
    <p>${escapeHtml(armor.description || armor.meaning || "")}</p>
    <p><strong>효과</strong> ${escapeHtml(armor.effect || armor.ability || "")}</p>
    <p class="row-sub">${escapeHtml(armor.printText || "")}</p>
  </article>`).join("");
  app.innerHTML = `<div class="print-page">
    <div class="print-toolbar"><button class="btn cream" onclick="nav('/admin')">관리자</button><button class="btn pink" onclick="window.print()">인쇄/PDF</button></div>
    <h1>전신갑주 장비카드</h1>
    <div class="print-grid">${cards}</div>
  </div>`;
}

function renderPrintExchange() {
  app.innerHTML = `<div class="print-page">
    <div class="print-toolbar"><button class="btn cream" onclick="nav('/admin')">관리자</button><button class="btn pink" onclick="window.print()">인쇄/PDF</button></div>
    <section class="print-poster">
      <h1>전신갑주 교환소</h1>
      <p>선생님 앞에서 두 학생이 같은 교환소 QR에 입장합니다.</p>
      <div class="print-grid">
        <article class="print-card"><h2>교환소 1</h2><img class="print-qr" src="${qrImage(absoluteUrl('/exchange/1'))}" alt="QR"><small>${escapeHtml(absoluteUrl('/exchange/1'))}</small></article>
        <article class="print-card"><h2>교환소 2</h2><img class="print-qr" src="${qrImage(absoluteUrl('/exchange/2'))}" alt="QR"><small>${escapeHtml(absoluteUrl('/exchange/2'))}</small></article>
      </div>
      <ol><li>각자 최대 2칸 장비를 올립니다.</li><li>서로 확인 후 동의합니다.</li><li>문제 발생 시 교사가 관리자에서 교환소를 초기화합니다.</li></ol>
    </section>
  </div>`;
}

function renderPrintChecklist() {
  const items = [
    "QR이 안 찍히면 URL을 직접 입력하거나 교사용 휴대폰으로 대신 접속합니다.",
    "학생 이름을 잘못 입력했으면 관리자에서 이름/팀을 수정합니다.",
    "동명이인은 4자리 재접속 코드로 구분합니다.",
    "보상이 중복 지급된 것 같으면 미션 완료 내역과 보상 거래 기록을 확인합니다.",
    "인터넷이 불안정하면 관리자 수동 지급으로 처리하고 나중에 기록을 맞춥니다.",
    "휴대폰 없는 학생은 교사 기기에서 해당 학생 이름으로 접속해 진행합니다.",
    "교환소가 꼬이면 관리자에서 교환소 초기화를 누릅니다.",
    "전체 리허설 데이터 삭제는 RESET 입력 후 전체 초기화를 실행합니다."
  ];
  app.innerHTML = `<div class="print-page">
    <div class="print-toolbar"><button class="btn cream" onclick="nav('/admin')">관리자</button><button class="btn pink" onclick="window.print()">인쇄/PDF</button></div>
    <section class="print-poster">
      <h1>현장 비상 체크리스트</h1>
      <ul class="checklist-print">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </section>
  </div>`;
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

function renderMonthlyExchange(boothId, boothOverride = null) {
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

function renderExchange(boothId, boothOverride = null) {
  if (!isRetreatMode()) return renderMonthlyExchange(boothId, boothOverride);
  if (!state.me) return renderCreate();
  document.body.classList.add("player-mode");
  const booth = boothOverride || state.booths.find((item) => String(item.boothId) === String(boothId)) || { boothId, status: "empty", player1Items: [], player2Items: [] };
  const joined = booth.player1Id === state.me.id || booth.player2Id === state.me.id;
  if (joined && document.getElementById("trade-slot-1")) saveExchangeDraft(boothId);
  if (!joined || booth.status === "completed") delete state.exchangeDraft[String(boothId)];
  const selectedValues = exchangeSelectedValues(boothId, booth);
  app.innerHTML = `<div class="student-page exchange-page">
    ${topbar({ back: true, logoutLabel: "나가기" })}
    <section class="student-panel exchange-main-panel">
      <div class="student-page-heading">
        <span class="student-heading-icon" aria-hidden="true"><img src="/assets/armor/shield.png" alt=""></span>
        <div><h1>교환소 ${boothId}</h1><p>선생님 앞에서 안전하게 교환하세요</p></div>
      </div>
      <div class="notice">선생님 앞에서 두 학생이 같은 교환소 QR에 입장한 뒤, 각자 최대 2칸까지 장비를 올리고 동시에 동의합니다.</div>
      <div class="exchange-status mt-12">
        ${renderBoothPlayer("1번", booth.player1Name, booth.player1Items, booth.player1Confirmed, booth.player1Id === state.me.id)}
        ${renderBoothPlayer("2번", booth.player2Name, booth.player2Items, booth.player2Confirmed, booth.player2Id === state.me.id)}
      </div>
      ${joined ? `<div class="field"><label>내가 줄 장비</label><div class="item-picker"><select id="trade-slot-1" onchange="saveExchangeDraft('${boothId}')">${itemOptions(state.me, selectedValues[0])}</select><select id="trade-slot-2" onchange="saveExchangeDraft('${boothId}')">${itemOptions(state.me, selectedValues[1])}</select></div></div>
        <div class="btn-row two"><button class="btn purple" onclick="selectExchange('${boothId}')">장비 올리기</button><button class="btn pink" onclick="confirmExchange('${boothId}')">동의하기</button></div>
        <button class="btn danger mt-12" onclick="cancelExchange('${boothId}')">교환 취소/초기화</button>` : `<button class="btn pink mt-12" onclick="joinExchange('${boothId}')">교환소 ${boothId} 입장</button>`}
    </section>
    <section class="student-panel exchange-inventory-panel">
      <div class="student-section-heading"><h2>내 장비</h2><span>교환 가능 장비</span></div>
      ${inventoryHtml(state.me)}
    </section>
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

function renderMonthlyForest() {
  app.innerHTML = `${topbar({ back: true })}
    <div class="panel pin">
      <div class="section-label mint">갑주 도전 메인 장비</div>
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

function renderForest() {
  if (!isRetreatMode()) return renderMonthlyForest();
  document.body.classList.add("player-mode");
  app.innerHTML = `<div class="student-page challenge-page">
    ${topbar({ back: true, logoutLabel: "나가기" })}
    <section class="student-panel challenge-main-panel">
      <div class="student-page-heading">
        <span class="student-heading-icon" aria-hidden="true"><img src="/assets/armor/sword.png" alt=""></span>
        <div><h1>갑주 도전</h1><p>사용할 장비를 최대 2개 선택하세요</p></div>
      </div>
      ${forestSelectorHtml()}
      ${forestMainHtml()}
      <div class="benefit-table">
        <div class="benefit"><strong>B</strong><br>기본 도전</div>
        <div class="benefit"><strong>A</strong><br>힌트 1개</div>
        <div class="benefit"><strong>S</strong><br>재도전 또는 방해 무효</div>
      </div>
    </section>
    <section class="student-panel challenge-catalog-panel">
      <div class="student-section-heading"><h2>장비별 도전</h2><span>6가지 갑주</span></div>
      <div class="trial-grid compact">${state.forestTrials.map((trial) => {
      const armor = armorByCode(trial.armor);
      const grade = state.me ? (["S", "A", "B"].find((g) => state.me.inventory?.[trial.armor]?.[g] > 0) || "") : "";
      return `<div class="trial-card">
        <div class="trial-head"><img src="${armor.icon}" alt="${escapeHtml(armor.name)}"><div><div class="trial-title">${escapeHtml(trial.demon)}</div><div class="row-sub">${escapeHtml(armor.name)} · ${grade ? `${grade}급` : "미보유"}</div></div></div>
        <div>${escapeHtml(trial.mission)}</div>
        <div class="row-sub mt-8">베네핏: ${escapeHtml(trial.benefit)}</div>
      </div>`;
    }).join("")}</div>
    </section>
  </div>`;
}

function renderMonthlyQr() {
  const code = qrCodeForRoute();
  const reward = qrRewardByCode(code);
  const claimed = state.claimedQrCodes.includes(code);
  const locked = state.program?.programMode === "monthly" && Number(reward?.weekIndex || 0) > Number(state.program?.currentWeek || 1);
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
          <div class="qr-type">${escapeHtml(reward.type)}${reward.weekIndex ? ` · ${reward.weekIndex}주차` : ""}</div>
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
        <div class="qr-status">${locked ? "아직 열리지 않은 미션입니다" : claimed ? "이미 획득 완료" : "아직 받지 않음"}</div>
      </div>
      <button class="btn ${locked ? "cream" : claimed ? "cream" : "pink"} mt-12" onclick="claimQrReward('${escapeHtml(code)}')">${locked ? "잠금 상태 확인" : claimed ? "획득 여부 다시 확인" : "보상 받기"}</button>
    </div>
    <div class="panel pin">
      <div class="section-label mint">내 장비</div>
      ${inventoryHtml(state.me)}
    </div>`;
}

function renderQr() {
  if (!isRetreatMode()) return renderMonthlyQr();
  document.body.classList.add("player-mode");
  const code = qrCodeForRoute();
  const reward = qrRewardByCode(code);
  const claimed = state.claimedQrCodes.includes(code);
  const pageTopbar = topbar({ back: true, logoutLabel: "나가기" });
  if (!reward) {
    app.innerHTML = `<div class="student-page reward-page">
      ${pageTopbar}
      <section class="student-panel reward-main-panel">
        <div class="student-page-heading">
          <span class="student-heading-icon" aria-hidden="true">!</span>
          <div><h1>QR 확인 실패</h1><p>등록된 보상을 찾을 수 없습니다</p></div>
        </div>
        <div class="notice">등록되지 않은 QR입니다. 선생님에게 QR 주소를 확인해주세요.</div>
      </section>
    </div>`;
    return;
  }
  if (!state.me) {
    app.innerHTML = `<div class="student-page reward-page">
      ${pageTopbar}
      <section class="student-panel reward-main-panel">
        <div class="student-page-heading">
          <span class="student-heading-icon" aria-hidden="true">✦</span>
          <div><h1>QR 보상</h1><p>캐릭터 등록 후 받을 수 있습니다</p></div>
        </div>
        <div class="qr-reward-card">
          <div class="qr-type">${escapeHtml(reward.type)}</div>
          <div class="qr-title">${escapeHtml(reward.title)}</div>
          <div class="row-sub">${escapeHtml(reward.description)}</div>
          <div class="qr-prize">${escapeHtml(qrRewardText(reward))}</div>
        </div>
        <div class="notice mt-12">캐릭터를 먼저 등록한 뒤 QR을 다시 열어주세요.</div>
        <button class="btn pink mt-12" onclick="nav('/')">캐릭터 등록</button>
      </section>
    </div>`;
    return;
  }
  app.innerHTML = `<div class="student-page reward-page">
    ${pageTopbar}
    <section class="student-panel reward-main-panel">
      <div class="student-page-heading">
        <span class="student-heading-icon" aria-hidden="true">✦</span>
        <div><h1>QR 보상</h1><p>${claimed ? "획득 완료" : "새 보상을 확인하세요"}</p></div>
      </div>
      <div class="qr-reward-card ${claimed ? "claimed" : ""}">
        <div class="qr-type">${escapeHtml(reward.type)}</div>
        <div class="qr-title">${escapeHtml(reward.title)}</div>
        <div class="row-sub">${escapeHtml(reward.description)}</div>
        <div class="qr-prize">${escapeHtml(qrRewardText(reward))}</div>
        <div class="qr-status">${claimed ? "이미 획득 완료" : "아직 받지 않음"}</div>
      </div>
      <button class="btn ${claimed ? "cream" : "pink"} mt-12" onclick="claimQrReward('${escapeHtml(code)}')">${claimed ? "획득 여부 다시 확인" : "보상 받기"}</button>
    </section>
    <section class="student-panel reward-inventory-panel">
      <div class="student-section-heading"><h2>내 장비</h2><span>보유 현황</span></div>
      ${inventoryHtml(state.me)}
    </section>
  </div>`;
}

function renderAdminLogin() {
  app.innerHTML = `${topbar({ back: true })}
    <div class="panel pin">
      <div class="section-label pink">교사용 관리</div>
      <div class="field"><label>교사 PIN</label><input id="admin-pin" type="password" placeholder="배포 환경변수 ADMIN_PIN" value="${escapeHtml(sessionStorage.getItem(STORAGE_PIN) || "")}"></div>
      <div class="field-hint">납품 배포에서는 운영자가 설정한 PIN입니다. 개발 PC에서 ADMIN_PIN을 설정하지 않았다면 비워둘 수 있습니다.</div>
      <button class="btn pink mt-12" onclick="loadAdmin()">관리자 화면 열기</button>
    </div>`;
}

async function loadAdmin() {
  const pin = document.getElementById("admin-pin")?.value ?? sessionStorage.getItem(STORAGE_PIN) ?? "";
  sessionStorage.setItem(STORAGE_PIN, pin);
  try {
    const payload = await api("admin", { pin });
    renderAdmin(payload);
  } catch (error) {
    toast(error.message, "error");
  }
}

async function resetBoothAdmin(boothId) {
  try {
    const payload = await api("exchange-reset", { boothId, pin: sessionStorage.getItem(STORAGE_PIN) || "" });
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
    await api("admin-adjust-item", { pin: sessionStorage.getItem(STORAGE_PIN) || "", playerId, armor, grade, delta });
    toast("장비 수정 완료");
    loadAdmin();
  } catch (error) {
    toast(error.message, "error");
  }
}

async function adminUpdatePlayer() {
  const playerId = document.getElementById("admin-player").value;
  const name = document.getElementById("admin-name").value;
  const team = document.getElementById("admin-team").value;
  const active = document.getElementById("admin-active").checked;
  try {
    const payload = await api("admin-update-player", { pin: sessionStorage.getItem(STORAGE_PIN) || "", playerId, name, team, active });
    toast("참가자 수정 완료");
    renderAdmin(payload);
  } catch (error) {
    toast(error.message, "error");
  }
}

async function adminAdjustTalent() {
  const playerId = document.getElementById("admin-player").value;
  const delta = Number(document.getElementById("admin-talent-delta").value || 0);
  try {
    const payload = await api("admin-adjust-talent", { pin: sessionStorage.getItem(STORAGE_PIN) || "", playerId, delta });
    toast("달란트 수정 완료");
    renderAdmin(payload);
  } catch (error) {
    toast(error.message, "error");
  }
}

async function adminExportCsv() {
  try {
    const payload = await api("admin-export-csv", { pin: sessionStorage.getItem(STORAGE_PIN) || "" });
    const blob = new Blob([payload.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = payload.filename || "participants.csv";
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    toast(error.message, "error");
  }
}

async function adminResetData() {
  const confirmText = document.getElementById("admin-reset-confirm").value;
  try {
    const payload = await api("admin-reset-data", { pin: sessionStorage.getItem(STORAGE_PIN) || "", confirm: confirmText });
    toast("전체 데이터 초기화 완료");
    renderAdmin(payload);
  } catch (error) {
    toast(error.message, "error");
  }
}

function renderAdmin(payload) {
  state.adminPayload = payload;
  state.armor = payload.armor || state.armor;
  state.qrRewards = payload.qrRewards || state.qrRewards;
  state.program = payload.program || state.program;
  state.teamRanking = payload.teamRanking || state.teamRanking;
  const playerOptions = payload.players.map((player) => `<option value="${player.id}">${escapeHtml(player.name)} ${player.team ? `(${escapeHtml(player.team)})` : ""}</option>`).join("");
  const firstPlayer = payload.players[0] || {};
  const armorOptions = state.armor.map((armor) => `<option value="${armor.code}">${escapeHtml(armor.name)}</option>`).join("");
  const adminRanking = rankingHtml(payload.ranking.length || 30, payload.ranking);
  const baseUrl = location.origin;
  const qrLinks = (state.qrRewards || []).map((reward) => {
    const path = reward.urlPath || (reward.code === "boss-forest" ? "/boss" : `/qr/${reward.code}`);
    return `<div class="qr-admin-link"><strong>${escapeHtml(reward.title)}</strong><span>${escapeHtml(baseUrl + path)}</span></div>`;
  }).join("");
  const missionRows = (payload.missionStats || []).map((mission) => `<div class="mission-row ${mission.locked ? "locked" : ""}">
    <div class="mission-week">${mission.weekIndex || "-"}</div>
    <div class="mission-main"><div class="row-title">${escapeHtml(mission.title)}</div><div class="row-sub">${escapeHtml(mission.shortDescription || mission.description || "")}</div></div>
    <div class="mission-state">${mission.locked ? "잠금" : `${mission.completedCount}명`}</div>
  </div>`).join("");
  app.innerHTML = `${topbar({ back: true })}
    ${programBannerHtml()}
    <div class="panel pin">
      <div class="section-label pink">교사 관리자</div>
      <div class="admin-stat-grid">
        <div><strong>${payload.players.length}</strong><span>참가자</span></div>
        <div><strong>${payload.program?.programMode || "-"}</strong><span>운영 모드</span></div>
        <div><strong>${payload.duplicateCompletions?.length || 0}</strong><span>중복 기록</span></div>
      </div>
      <div class="booth-row"><div class="rank-num">1</div><div><div class="row-title">교환소 1</div><div class="row-sub">${escapeHtml(payload.booths[0]?.status || "empty")}</div></div><button class="pill danger" onclick="resetBoothAdmin('1')">초기화</button></div>
      <div class="booth-row"><div class="rank-num">2</div><div><div class="row-title">교환소 2</div><div class="row-sub">${escapeHtml(payload.booths[1]?.status || "empty")}</div></div><button class="pill danger" onclick="resetBoothAdmin('2')">초기화</button></div>
      <div class="notice mt-12">교환소 링크: <strong>${baseUrl}/exchange/1</strong><br><strong>${baseUrl}/exchange/2</strong></div>
    </div>
    <div class="panel pin">
      <div class="section-label sun">참가자 관리</div>
      <div class="admin-controls">
        <select id="admin-player" onchange="syncAdminPlayerFields()">${playerOptions}</select>
        <div class="admin-grid"><input id="admin-name" value="${escapeHtml(firstPlayer.name || "")}" placeholder="이름"><input id="admin-team" value="${escapeHtml(firstPlayer.team || "")}" placeholder="팀"></div>
        <label class="admin-check"><input id="admin-active" type="checkbox" ${firstPlayer.active !== false ? "checked" : ""}> 활성 참가자</label>
        <button class="btn purple" onclick="adminUpdatePlayer()">참가자 수정</button>
        <div class="admin-grid"><input id="admin-talent-delta" type="number" value="10" step="1"><button class="btn mint" onclick="adminAdjustTalent()">달란트 조정</button></div>
      </div>
    </div>
    <div class="panel pin">
      <div class="section-label mint">학생 장비 수동 수정</div>
      <div class="admin-controls">
        <div class="admin-grid"><select id="admin-armor">${armorOptions}</select><select id="admin-grade"><option>B</option><option>A</option><option>S</option></select></div>
        <div class="admin-grid"><input id="admin-delta" type="number" value="1" step="1"><button class="btn purple" onclick="adminAdjustItem()">수정 적용</button></div>
      </div>
    </div>
    <div class="panel pin"><div class="section-label mint">팀별 점수</div>${teamRankingHtml(30)}</div>
    <div class="panel pin"><div class="section-label sun">미션 완료 현황</div><div class="mission-list">${missionRows}</div></div>
    <div class="panel pin"><div class="section-label sun">전체 랭킹</div>${adminRanking}</div>
    <div class="panel pin"><div class="section-label mint">QR 보상 링크</div><div class="qr-admin-list">${qrLinks}</div></div>
    <div class="panel pin">
      <div class="section-label pink">납품 출력/데이터</div>
      <div class="nav-grid">
        <button class="btn cream" onclick="nav('/admin/print/qr')">QR 카드 출력</button>
        <button class="btn cream" onclick="nav('/admin/print/equipment')">장비카드 출력</button>
        <button class="btn cream" onclick="nav('/admin/print/exchange')">교환소 포스터</button>
        <button class="btn cream" onclick="nav('/admin/print/checklist')">비상 체크리스트</button>
      </div>
      <button class="btn mint mt-12" onclick="adminExportCsv()">CSV 다운로드</button>
      <div class="admin-grid mt-12"><input id="admin-reset-confirm" placeholder="RESET 입력"><button class="btn danger" onclick="adminResetData()">전체 초기화</button></div>
    </div>
    <div class="panel pin"><div class="section-label pink">최근 로그</div>${payload.logs.map((log) => `<div class="log-row"><div class="rank-num">•</div><div><div class="row-title">${escapeHtml(log.action)}</div><div class="row-sub">${escapeHtml(JSON.stringify(log.detail || {}))}</div></div><div class="tiny">${new Date(log.createdAt).toLocaleTimeString("ko-KR")}</div></div>`).join("") || `<div class="notice">로그 없음</div>`}</div>`;
}

function syncAdminPlayerFields() {
  const playerId = document.getElementById("admin-player")?.value;
  const player = (state.adminPayload?.players || []).find((item) => item.id === playerId);
  if (!player) return;
  const nameInput = document.getElementById("admin-name");
  const teamInput = document.getElementById("admin-team");
  const activeInput = document.getElementById("admin-active");
  if (nameInput) nameInput.value = player.name || "";
  if (teamInput) teamInput.value = player.team || "";
  if (activeInput) activeInput.checked = player.active !== false;
}

async function render() {
  clearPoll();
  document.body.classList.remove("entry-mode", "home-mode", "player-mode", "print-mode");
  document.getElementById("qr-print-page-rule")?.remove();
  const current = route();
  if (!state.armor.length) {
    app.innerHTML = `<div class="loading">전신갑주 불러오는 중...</div>`;
    try {
      await loadState({ quiet: true });
    } catch (error) {
      document.getElementById("retreat-theme")?.setAttribute("disabled", "");
      app.innerHTML = `${topbar()}<div class="panel pin"><div class="section-label pink">서버 연결 실패</div><p>${escapeHtml(error.message)}</p><button class="btn pink mt-12" onclick="location.reload()">연결 다시 시도</button></div>`;
      return;
    }
  }
  syncRetreatTheme(current);
  if (current.parts[0] === "admin" && current.parts[1] === "print") {
    document.body.classList.add("print-mode");
    if (current.parts[2] === "qr") return renderPrintQr();
    if (current.parts[2] === "equipment") return renderPrintEquipment();
    if (current.parts[2] === "exchange") return renderPrintExchange();
    if (current.parts[2] === "checklist") return renderPrintChecklist();
  }
  if (current.parts[0] === "ranking") return renderRanking();
  if (current.parts[0] === "team-ranking") return renderTeamRanking();
  if (current.parts[0] === "monthly") return renderMonthly();
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
window.updateEntryReadiness = updateEntryReadiness;
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
window.adminUpdatePlayer = adminUpdatePlayer;
window.adminAdjustTalent = adminAdjustTalent;
window.adminExportCsv = adminExportCsv;
window.adminResetData = adminResetData;
window.syncAdminPlayerFields = syncAdminPlayerFields;
window.setQrPrintOption = setQrPrintOption;
window.printQrTemplate = printQrTemplate;

window.addEventListener("hashchange", render);
window.addEventListener("popstate", render);
render();
