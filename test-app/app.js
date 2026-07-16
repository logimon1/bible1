const app = document.getElementById("app");
const toastRoot = document.getElementById("toast-root");

function createResilientStorage(storageName) {
  const memory = new Map();
  let storage = null;
  try {
    storage = window[storageName];
    const probeKey = "__armor_storage_probe__";
    storage.setItem(probeKey, "1");
    storage.removeItem(probeKey);
  } catch {
    storage = null;
  }
  return {
    getItem(key) {
      try {
        const value = storage?.getItem(key);
        if (value !== null && value !== undefined) {
          memory.set(key, value);
          return value;
        }
      } catch {}
      return memory.has(key) ? memory.get(key) : null;
    },
    setItem(key, value) {
      const text = String(value);
      memory.set(key, text);
      try { storage?.setItem(key, text); } catch {}
    },
    removeItem(key) {
      memory.delete(key);
      try { storage?.removeItem(key); } catch {}
    }
  };
}

const safeLocalStorage = createResilientStorage("localStorage");
const safeSessionStorage = createResilientStorage("sessionStorage");

const state = {
  me: null,
  team: null,
  armor: [],
  ranking: [],
  partyRanking: [],
  rankingTab: "party",
  booths: [],
  forestTrials: [],
  qrRewards: [],
  claimedQrCodes: [],
  poll: null,
  pollGeneration: 0,
  viewGeneration: 0,
  renderEpoch: 0,
  lastResults: [],
  lastQrResults: [],
  exchangeDraft: {},
  adminPlayers: [],
  adminTeams: [],
  adminActionInFlight: false,
  qrClaimInFlight: false,
  exchangeActionInFlight: false,
  startedMissionCode: null,
  teamSetupInFlight: false,
  warRoleInFlight: false,
  teamPollSignature: "",
  teamMergeTimer: null,
  warUnlockTimer: null,
  eventEndTimer: null,
  eventEndsAt: null,
  warOpen: false,
  warOpensAt: null
};

const STORAGE_PLAYER = "armor_forest_player_id";
const STORAGE_NAME = "armor_forest_name";
const STORAGE_TEAM = "armor_forest_team";
const STORAGE_PIN = "armor_forest_admin_pin";
const STORAGE_WAR_REVEAL_PREFIX = "armor_forest_war_revealed_";
const STORAGE_AUDIO_ENABLED = "armor_forest_audio_enabled";
safeLocalStorage.removeItem("armor_forest_access_code");
const GRADE_ORDER = ["S", "A", "B"];
const EQUIPMENT_POWER_VALUES = { B: 10, A: 40, S: 150 };
const LEFT_EQUIPMENT_SLOTS = ["helmet", "breastplate", "sword"];
const RIGHT_EQUIPMENT_SLOTS = ["shield", "belt", "shoes"];
const ROLE_MISSION_PROFILES = {
  belt: { icon: "✦", stat: "판단력", demon: "거짓의 마귀", style: "관찰 · 선택" },
  breastplate: { icon: "♥", stat: "인내력", demon: "낙심의 마귀", style: "균형 · 버티기" },
  shoes: { icon: "➜", stat: "스피드", demon: "추격의 마귀", style: "달리기 · 전달" },
  shield: { icon: "◆", stat: "협동력", demon: "분열의 마귀", style: "소통 · 협동" },
  helmet: { icon: "★", stat: "지력", demon: "혼란의 마귀", style: "퀴즈 · 퍼즐" },
  sword: { icon: "⚔", stat: "힘", demon: "파괴의 마귀", style: "밀기 · 당기기" }
};
const LEGACY_MISSION_ALIASES = {
  "mission-truth": "mission-judgment",
  "mission-shield": "mission-teamwork",
  "mission-sword": "mission-power"
};
let forestQrStream = null;
let forestQrTimer = null;
let forestQrSession = 0;

// Original, code-generated audio: no downloaded media, no third-party license,
// and no audio network request. Playback begins only after a user gesture.
const AUDIO_MUSIC_PATTERNS = {
  camp: {
    stepSeconds: 0.4,
    bass: [50, null, null, null, 45, null, null, null, 47, null, null, null, 43, null, null, null, 50, null, null, null, 45, null, null, null, 48, null, null, null, 47, null, null, null],
    melody: [62, null, 65, null, 69, null, 67, null, 65, null, 62, null, 60, null, 62, null, 62, null, 65, null, 70, null, 69, null, 67, null, 64, null, 65, null, 62, null],
    chords: [[50, 57, 62], [45, 52, 57], [47, 54, 59], [43, 50, 55]]
  },
  forest: {
    stepSeconds: 0.42,
    bass: [45, null, null, null, 41, null, null, null, 43, null, null, null, 40, null, null, null, 45, null, null, null, 41, null, null, null, 43, null, null, null, 44, null, null, null],
    melody: [57, null, 60, null, 64, null, 62, null, 60, null, 57, null, 55, null, 57, null, 57, null, 60, null, 65, null, 64, null, 62, null, 59, null, 60, null, 57, null],
    chords: [[45, 52, 57], [41, 48, 53], [43, 50, 55], [44, 51, 56]]
  }
};

const audioRuntime = {
  enabled: safeLocalStorage.getItem(STORAGE_AUDIO_ENABLED) !== "off",
  unlocked: false,
  context: null,
  masterGain: null,
  musicGain: null,
  sfxGain: null,
  scheduler: null,
  suspendTimer: null,
  nextNoteAt: 0,
  step: 0,
  mode: "camp"
};

function audioSupported() {
  return Boolean(window.AudioContext || window.webkitAudioContext);
}

function audioToggleButtonHtml(extraClass = "") {
  if (!audioSupported()) return "";
  const enabled = audioRuntime.enabled;
  return `<button type="button" class="audio-toggle audio-control ${enabled ? "is-on" : "is-muted"} ${extraClass}" onclick="toggleAudio(event)" aria-label="${enabled ? "배경음과 효과음 끄기" : "배경음과 효과음 켜기"}" aria-pressed="${enabled}" title="${enabled ? "소리 끄기" : "소리 켜기"}"><span aria-hidden="true">${enabled ? "♪" : "×"}</span></button>`;
}

function createAudioRuntime() {
  if (audioRuntime.context || !audioSupported()) return audioRuntime.context;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const context = new AudioContextClass();
  const masterGain = context.createGain();
  const musicGain = context.createGain();
  const sfxGain = context.createGain();
  masterGain.gain.setValueAtTime(audioRuntime.enabled ? 0.68 : 0.0001, context.currentTime);
  musicGain.gain.setValueAtTime(0.5, context.currentTime);
  sfxGain.gain.setValueAtTime(0.62, context.currentTime);
  musicGain.connect(masterGain);
  sfxGain.connect(masterGain);
  masterGain.connect(context.destination);
  audioRuntime.context = context;
  audioRuntime.masterGain = masterGain;
  audioRuntime.musicGain = musicGain;
  audioRuntime.sfxGain = sfxGain;
  return context;
}

function midiFrequency(note) {
  return 440 * (2 ** ((note - 69) / 12));
}

function scheduleAudioTone(note, when, duration, volume, type, destination) {
  const context = audioRuntime.context;
  if (!context || note === null || note === undefined) return;
  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  const attackEnd = when + Math.min(0.035, duration / 3);
  oscillator.type = type || "sine";
  oscillator.frequency.setValueAtTime(midiFrequency(note), when);
  envelope.gain.setValueAtTime(0.0001, when);
  envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), attackEnd);
  envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  oscillator.connect(envelope);
  envelope.connect(destination);
  oscillator.start(when);
  oscillator.stop(when + duration + 0.04);
  oscillator.addEventListener("ended", () => {
    oscillator.disconnect();
    envelope.disconnect();
  }, { once: true });
}

function scheduleMusicStep(stepIndex, when) {
  const pattern = AUDIO_MUSIC_PATTERNS[audioRuntime.mode] || AUDIO_MUSIC_PATTERNS.camp;
  const index = stepIndex % pattern.melody.length;
  const bassNote = pattern.bass[index];
  const melodyNote = pattern.melody[index];
  if (bassNote !== null) scheduleAudioTone(bassNote, when, pattern.stepSeconds * 3.4, 0.024, "sine", audioRuntime.musicGain);
  if (melodyNote !== null) scheduleAudioTone(melodyNote, when, pattern.stepSeconds * 1.65, 0.021, "triangle", audioRuntime.musicGain);
  if (index % 8 === 0) {
    const chord = pattern.chords[Math.floor(index / 8) % pattern.chords.length];
    chord.forEach((note, chordIndex) => scheduleAudioTone(note + 12, when + chordIndex * 0.018, pattern.stepSeconds * 7.5, 0.006, "sine", audioRuntime.musicGain));
  }
}

function pumpMusicScheduler() {
  const context = audioRuntime.context;
  if (!context || context.state !== "running" || !audioRuntime.enabled || document.hidden) return;
  const pattern = AUDIO_MUSIC_PATTERNS[audioRuntime.mode] || AUDIO_MUSIC_PATTERNS.camp;
  while (audioRuntime.nextNoteAt < context.currentTime + 1.25) {
    scheduleMusicStep(audioRuntime.step, audioRuntime.nextNoteAt);
    audioRuntime.step += 1;
    audioRuntime.nextNoteAt += pattern.stepSeconds;
  }
}

function startMusicScheduler({ restart = false } = {}) {
  const context = audioRuntime.context;
  if (!context || context.state !== "running" || !audioRuntime.enabled || !audioRuntime.unlocked || document.hidden) return;
  if (audioRuntime.scheduler && !restart) return;
  if (audioRuntime.scheduler) window.clearInterval(audioRuntime.scheduler);
  audioRuntime.nextNoteAt = context.currentTime + 0.06;
  pumpMusicScheduler();
  audioRuntime.scheduler = window.setInterval(pumpMusicScheduler, 700);
}

function stopMusicScheduler() {
  if (audioRuntime.scheduler) window.clearInterval(audioRuntime.scheduler);
  audioRuntime.scheduler = null;
}

function unlockAudio() {
  if (!audioRuntime.enabled || !audioSupported()) return;
  audioRuntime.unlocked = true;
  if (audioRuntime.suspendTimer) window.clearTimeout(audioRuntime.suspendTimer);
  audioRuntime.suspendTimer = null;
  const context = createAudioRuntime();
  if (!context) return;
  audioRuntime.masterGain.gain.cancelScheduledValues(context.currentTime);
  audioRuntime.masterGain.gain.setTargetAtTime(0.68, context.currentTime, 0.035);
  if (context.state === "suspended") {
    context.resume().then(startMusicScheduler).catch(() => {});
  } else {
    startMusicScheduler();
  }
}

function playGameSound(kind = "tap") {
  if (!audioRuntime.enabled || !audioRuntime.unlocked || !audioRuntime.context || !audioRuntime.sfxGain) return;
  const context = audioRuntime.context;
  const now = context.currentTime + 0.012;
  const sounds = {
    tap: [[74, 0, 0.055, 0.045, "sine"], [81, 0.035, 0.07, 0.025, "triangle"]],
    role: [[67, 0, 0.11, 0.055, "triangle"], [74, 0.075, 0.16, 0.065, "sine"]],
    success: [[62, 0, 0.15, 0.055, "triangle"], [67, 0.1, 0.17, 0.06, "triangle"], [74, 0.2, 0.24, 0.07, "sine"]],
    leader: [[57, 0, 0.16, 0.06, "triangle"], [64, 0.1, 0.2, 0.07, "triangle"], [69, 0.22, 0.3, 0.075, "sine"]],
    start: [[50, 0, 0.24, 0.065, "triangle"], [57, 0.12, 0.3, 0.07, "triangle"], [62, 0.25, 0.42, 0.08, "sine"], [69, 0.39, 0.55, 0.06, "sine"]],
    draw: [[62, 0, 0.12, 0.055, "triangle"], [66, 0.085, 0.13, 0.06, "triangle"], [69, 0.17, 0.16, 0.065, "triangle"], [74, 0.26, 0.28, 0.075, "sine"]],
    promotion: [[62, 0, 0.16, 0.06, "triangle"], [67, 0.1, 0.18, 0.065, "triangle"], [71, 0.2, 0.2, 0.07, "triangle"], [74, 0.3, 0.38, 0.085, "sine"], [86, 0.34, 0.5, 0.04, "sine"]],
    legendary: [[50, 0, 0.25, 0.06, "triangle"], [62, 0.1, 0.28, 0.07, "triangle"], [69, 0.23, 0.32, 0.075, "triangle"], [74, 0.37, 0.55, 0.09, "sine"], [81, 0.47, 0.7, 0.05, "sine"]],
    error: [[62, 0, 0.13, 0.05, "square"], [55, 0.11, 0.22, 0.045, "triangle"]],
    mute: [[69, 0, 0.09, 0.035, "sine"], [62, 0.07, 0.13, 0.03, "sine"]]
  };
  (sounds[kind] || sounds.tap).forEach(([note, delay, duration, volume, type]) => {
    scheduleAudioTone(note, now + delay, duration, volume, type, audioRuntime.sfxGain);
  });
}

function updateAudioToggleButtons() {
  document.querySelectorAll(".audio-control").forEach((button) => {
    button.classList.toggle("is-on", audioRuntime.enabled);
    button.classList.toggle("is-muted", !audioRuntime.enabled);
    button.setAttribute("aria-pressed", String(audioRuntime.enabled));
    button.setAttribute("aria-label", audioRuntime.enabled ? "배경음과 효과음 끄기" : "배경음과 효과음 켜기");
    button.title = audioRuntime.enabled ? "소리 끄기" : "소리 켜기";
    const icon = button.querySelector("span");
    if (icon) icon.textContent = audioRuntime.enabled ? "♪" : "×";
    const status = button.querySelector(".audio-toggle-status");
    if (status) status.textContent = audioRuntime.enabled ? "켜짐" : "꺼짐";
  });
}

function toggleAudio(event) {
  event?.preventDefault();
  event?.stopPropagation();
  if (!audioSupported()) return;
  if (audioRuntime.enabled) {
    playGameSound("mute");
    audioRuntime.enabled = false;
    safeLocalStorage.setItem(STORAGE_AUDIO_ENABLED, "off");
    stopMusicScheduler();
    const context = audioRuntime.context;
    if (context && audioRuntime.masterGain) {
      audioRuntime.masterGain.gain.cancelScheduledValues(context.currentTime);
      audioRuntime.masterGain.gain.setTargetAtTime(0.0001, context.currentTime, 0.04);
      audioRuntime.suspendTimer = window.setTimeout(() => context.suspend().catch(() => {}), 240);
    }
  } else {
    audioRuntime.enabled = true;
    safeLocalStorage.setItem(STORAGE_AUDIO_ENABLED, "on");
    unlockAudio();
    playGameSound("success");
  }
  updateAudioToggleButtons();
}

function setAudioMode(path) {
  const nextMode = path.startsWith("/forest") || path.startsWith("/team/merge") || path.startsWith("/mission") || path.startsWith("/boss") ? "forest" : "camp";
  if (nextMode === audioRuntime.mode) return;
  audioRuntime.mode = nextMode;
  audioRuntime.step = 0;
  if (audioRuntime.scheduler) startMusicScheduler({ restart: true });
}

function route() {
  const hash = location.hash.replace(/^#/, "");
  const raw = hash || location.pathname || "/";
  const parts = raw.split("/").filter(Boolean);
  return { path: `/${parts.join("/")}`, parts };
}

function nav(path) {
  if (path === route().path) return render();
  state.viewGeneration += 1;
  history.pushState(null, "", path);
  window.scrollTo(0, 0);
  render();
}

function captureViewContext() {
  return {
    generation: state.viewGeneration,
    path: route().path,
    playerId: state.me?.id || null
  };
}

function isViewContextCurrent(context) {
  return Boolean(context)
    && context.generation === state.viewGeneration
    && context.path === route().path
    && context.playerId === (state.me?.id || null);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function toast(message, type = "success") {
  if (type === "error") playGameSound("error");
  const node = document.createElement("div");
  node.className = `toast ${type}`;
  node.textContent = message;
  toastRoot.appendChild(node);
  setTimeout(() => node.remove(), 2400);
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
      <div><span></span>전신갑주 준비</div>
    </div>
    <div class="connect-progress"><span></span></div>
  </div>`;
  document.body.appendChild(back);
}

function closeDrawModal({ returnHome = true } = {}) {
  const back = document.querySelector(".draw-modal-back");
  if (!back) return;
  const shouldReturnHome = back.dataset.returnHome === "true";
  back.remove();
  if (returnHome && shouldReturnHome && route().path !== "/") nav("/");
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

function setServerConnection(connected) {
  let banner = document.getElementById("server-connection-banner");
  if (connected) {
    banner?.remove();
    document.body.classList.remove("server-connection-lost");
    return;
  }
  document.body.classList.add("server-connection-lost");
  if (banner) return;
  banner = document.createElement("div");
  banner.id = "server-connection-banner";
  banner.setAttribute("role", "alert");
  banner.innerHTML = `<strong>서버 연결을 확인하고 있어요</strong><span>인터넷 연결을 확인한 뒤 다시 눌러주세요.</span>`;
  document.body.appendChild(banner);
}

function showDrawModal(results, promotions = [], { qrFlow = false, fullSetComplete = false } = {}) {
  closeDrawModal({ returnHome: false });
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
      <div class="draw-prize-caption">내 인벤토리에 저장</div>
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
  const modalBadge = fullSetComplete
    ? "🏆 FULL SET"
    : hasPromotions
      ? (featuredGrade === "S" ? "🌟 최고 등급 완성!" : "✨ 자동 합성 대성공!")
      : qrFlow ? `QR 스캔 완료 · ${Math.max(1, count)}회` : "QR 뽑기 완료";
  const modalTitle = fullSetComplete
    ? "전신갑주 S 풀세트 완성!"
    : hasPromotions
      ? `${featuredGrade}등급 장비가 탄생했어요!`
      : qrFlow ? `장비 ${Math.max(1, count)}회 개봉!` : (count === 1 ? "장비 획득!" : `장비 ${count}개 획득!`);
  const modalSub = fullSetComplete
    ? "6종 모두 MAX 잠금되어 중복 장비가 나오지 않아요."
    : hasPromotions
      ? (featuredGrade === "S" ? "꾸준히 모은 장비가 최고 단계로 성장했습니다." : "같은 장비 3개가 모여 한 단계 더 강해졌습니다.")
      : "내 인벤토리에 장비가 저장됐어요.";
  const drawResultDivider = hasPromotions ? `<div class="draw-result-divider"><span>이번 뽑기 ${count}개</span></div>` : "";
  const fullSetHtml = fullSetComplete ? `<div class="full-set-complete-banner"><strong>◆ S MAX × 6</strong><span>${count ? "마지막 장비까지 완성했습니다!" : "모든 장비가 이미 완성되어 있습니다."}</span></div>` : "";
  const drawCardsHtml = count ? `<div class="draw-prize-grid count-${count}">${cards}</div>` : "";
  const qrRevealHtml = qrFlow ? `<div class="draw-qr-reveal" aria-hidden="true">
    <div class="draw-qr-reveal-radiance"></div>
    <span class="draw-qr-reveal-spark spark-a">✦</span><span class="draw-qr-reveal-spark spark-b">✧</span><span class="draw-qr-reveal-spark spark-c">✦</span>
    <span class="draw-qr-reveal-orbit orbit-a">⚔</span><span class="draw-qr-reveal-orbit orbit-b">✦</span>
    <strong class="draw-qr-reveal-core">▦</strong>
  </div>` : "";
  const back = document.createElement("div");
  back.className = "draw-modal-back";
  back.dataset.returnHome = qrFlow ? "true" : "false";
  back.innerHTML = `<div class="draw-modal${qrFlow ? " qr-flow" : ""}${hasPromotions ? ` has-promotion promotion-feature-${featuredGrade}` : ""}" role="dialog" aria-modal="true" aria-live="polite" tabindex="-1">
    ${qrRevealHtml}
    <div class="draw-modal-badge">${modalBadge}</div>
    <div class="draw-modal-title">${modalTitle}</div>
    <div class="draw-modal-sub">${modalSub}</div>
    ${fullSetHtml}
    ${promotionHtml}
    ${drawResultDivider}
    ${drawCardsHtml}
    <button class="btn pink mt-16" onclick="closeDrawModal()">${qrFlow ? "메인으로" : "확인"}</button>
  </div>`;
  back.addEventListener("click", (event) => {
    if (event.target === back) closeDrawModal();
  });
  document.body.appendChild(back);
  back.querySelector(".draw-modal")?.focus({ preventScroll: true });
  playGameSound(fullSetComplete || featuredGrade === "S" ? "legendary" : hasPromotions ? "promotion" : "draw");
}

async function api(action, body = {}, method = "POST") {
  const options = method === "GET" ? {} : {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  options.signal = controller.signal;
  let response;
  try {
    response = await fetch(`/api/app?action=${encodeURIComponent(action)}`, options);
  } catch (error) {
    setServerConnection(false);
    if (location.protocol === "file:") {
      throw new Error("HTML 파일을 직접 열 수 없습니다. current-retreat 폴더의 START_LOCAL_TEST.cmd를 실행한 뒤 표시된 주소로 접속하세요.");
    }
    if (error.name === "AbortError") {
      throw new Error("수련회 앱 서버 응답 시간이 초과되었습니다. 서버 실행 창과 접속 주소를 확인하세요.");
    }
    throw new Error("수련회 앱 서버에 연결할 수 없습니다. START_LOCAL_TEST.cmd 또는 npm.cmd run start:test로 서버를 실행한 뒤, 실행 창에 표시된 주소로 접속하세요.");
  } finally {
    clearTimeout(timeout);
  }

  const contentType = response.headers.get("Content-Type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("현재 주소는 API가 없는 정적 서버입니다. Python http.server나 HTML 직접 열기 대신 START_LOCAL_TEST.cmd로 수련회 앱 서버를 실행하세요.");
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    setServerConnection(false);
    throw new Error("서버 응답을 읽을 수 없습니다. 서버 실행 창의 오류를 확인하세요.");
  }
  setServerConnection(response.status < 500);
  if (!payload.ok) {
    const requestError = new Error(payload.error || "요청 처리 중 오류가 발생했습니다.");
    requestError.code = payload.code || "";
    requestError.endsAt = payload.endsAt || null;
    requestError.warOpensAt = payload.warOpensAt || null;
    if (requestError.code === "EVENT_ENDED") {
      state.eventEndsAt = requestError.endsAt;
      window.setTimeout(() => renderEventEnded(requestError.endsAt), 0);
    }
    throw requestError;
  }
  return payload;
}

function renderEventEnded(endsAt = state.eventEndsAt) {
  clearPoll();
  closeConnectScreen();
  closeDrawModal({ returnHome: false });
  closeInfoModal();
  closeForestQrScanner({ restoreFocus: false });
  document.body.classList.remove("entry-mode", "home-mode", "player-mode", "forest-mode", "party-dashboard-mode");
  document.body.classList.add("event-ended-mode");
  const endedText = endsAt
    ? new Date(endsAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "long", timeStyle: "short" })
    : "";
  app.innerHTML = `<main class="event-ended-page">
    <section class="event-ended-card">
      <div class="event-ended-mark" aria-hidden="true">✓</div>
      <div class="event-ended-kicker">3일 운영 완료</div>
      <h1>수련회 앱 운영이 종료되었습니다</h1>
      <p>함께 전신갑주를 완성해주셔서 감사합니다.</p>
      ${endedText ? `<div class="event-ended-time">종료 시각 · ${escapeHtml(endedText)}</div>` : ""}
    </section>
  </main>`;
}

function setMe(player) {
  state.me = player;
  if (player) {
    safeLocalStorage.setItem(STORAGE_PLAYER, player.id);
    safeLocalStorage.setItem(STORAGE_NAME, player.name);
    safeLocalStorage.setItem(STORAGE_TEAM, player.team || "");
  }
}

function armorByCode(code) {
  return state.armor.find((armor) => armor.code === code) || { code, name: code, icon: "" };
}

function scheduleEventEnd() {
  if (state.eventEndTimer) window.clearTimeout(state.eventEndTimer);
  state.eventEndTimer = null;
  const endsAtMs = Date.parse(state.eventEndsAt || "");
  if (!Number.isFinite(endsAtMs)) return;
  const delay = endsAtMs - Date.now();
  if (delay <= 0) {
    state.eventEndTimer = window.setTimeout(() => {
      state.eventEndTimer = null;
      renderEventEnded(state.eventEndsAt);
    }, 0);
  } else if (delay <= 2147483000) {
    state.eventEndTimer = window.setTimeout(() => {
      state.eventEndTimer = null;
      renderEventEnded(state.eventEndsAt);
    }, delay + 250);
  }
}

function applyWarSchedule(payload = {}) {
  if (Object.prototype.hasOwnProperty.call(payload, "endsAt")) {
    state.eventEndsAt = payload.endsAt || null;
    scheduleEventEnd();
  }
  if (typeof payload.warOpen === "boolean") state.warOpen = payload.warOpen;
  if (Object.prototype.hasOwnProperty.call(payload, "warOpensAt")) state.warOpensAt = payload.warOpensAt || null;
}

function warOpenTimeText() {
  if (!state.warOpensAt) return "마지막 날 현장에서 공개됩니다";
  return new Date(state.warOpensAt).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit"
  });
}

function roleMissionProfile(armorCode) {
  const armor = armorByCode(armorCode);
  const fallback = ROLE_MISSION_PROFILES[armorCode] || { icon: "✦", stat: "팀워크", demon: "시험의 마귀", style: "팀 미션" };
  return {
    ...fallback,
    stat: armor.stat || fallback.stat,
    demon: armor.demon || fallback.demon,
    style: armor.missionStyle || fallback.style,
    mission: armor.mission || "진행자의 안내에 따라 미션을 수행합니다.",
    recommendation: armor.recommendation || "팀원과 상의해서 대표를 정하세요."
  };
}

function studentBottomNavHtml(path = route().path) {
  const active = path.startsWith("/party") || path.startsWith("/team")
    ? "party"
    : path.startsWith("/ranking")
      ? "ranking"
      : ["/forest", "/mission", "/boss", "/hidden", "/qr", "/draw", "/exchange"].some((prefix) => path.startsWith(prefix))
      ? "war"
      : "home";
  const item = (key, destination, icon, label) => `<button type="button" class="game-dock-item ${active === key ? "is-active" : ""}" onclick="nav('${destination}')" ${active === key ? 'aria-current="page"' : ""}><span aria-hidden="true">${icon}</span><strong>${label}</strong></button>`;
  return `<nav class="game-dock" aria-label="주 메뉴">
    ${item("home", "/", "⌂", "홈")}
    ${item("party", "/party", "♟", "우리 조")}
    ${item("war", "/forest", "⚔", "THE WAR")}
    ${item("ranking", "/ranking", "🏆", "랭킹")}
  </nav>`;
}

function topbar({ back = false, brand = "전신갑주", showLogout = false } = {}) {
  const me = state.me;
  const showStudentNav = Boolean(me && !route().path.startsWith("/admin"));
  return `<div class="topbar app-topbar">
    <div class="crest"><div class="crest-badge">⚔</div><div class="crest-text">${escapeHtml(brand)}</div></div>
    <div class="top-actions">
      ${back ? `<button class="pill back" onclick="nav('/')"><span aria-hidden="true">←</span> 뒤로가기</button>` : ""}
      ${me ? `<button type="button" class="top-settings-button" onclick="openSettingsMenu()" aria-label="설정 열기" title="설정"><span aria-hidden="true">⚙</span></button>` : audioToggleButtonHtml()}
      ${!me && !back ? `<button class="pill" onclick="nav('/admin')">교사용</button>` : ""}
    </div>
  </div>${showStudentNav ? studentBottomNavHtml() : ""}`;
}

function openSettingsMenu() {
  if (!state.me) return;
  closeInfoModal();
  const back = document.createElement("div");
  back.className = "info-modal-back settings-modal-back";
  back.dataset.returnFocusSelector = ".top-settings-button";
  back.innerHTML = `<div class="info-modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-dialog-title">
    <button type="button" class="modal-close" aria-label="설정 닫기" onclick="closeInfoModal()">×</button>
    <div class="settings-modal-heading"><span aria-hidden="true">⚙</span><div><small>GAME MENU</small><h2 id="settings-dialog-title">설정</h2></div></div>
    ${audioSupported() ? `<button type="button" class="settings-menu-row settings-audio-row audio-control ${audioRuntime.enabled ? "is-on" : "is-muted"}" onclick="toggleAudio(event)" aria-label="${audioRuntime.enabled ? "배경음과 효과음 끄기" : "배경음과 효과음 켜기"}" aria-pressed="${audioRuntime.enabled}"><span class="settings-menu-icon" aria-hidden="true">${audioRuntime.enabled ? "♪" : "×"}</span><span class="settings-menu-copy"><strong>게임 사운드</strong><small>배경음과 효과음</small></span><em class="audio-toggle-status">${audioRuntime.enabled ? "켜짐" : "꺼짐"}</em></button>` : ""}
    <button type="button" class="settings-menu-row is-danger" onclick="closeInfoModal(); logout()"><span class="settings-menu-icon" aria-hidden="true">↪</span><span class="settings-menu-copy"><strong>로그아웃</strong><small>로그인 화면으로 돌아가기</small></span></button>
  </div>`;
  back.addEventListener("click", (event) => { if (event.target === back) closeInfoModal(); });
  document.body.appendChild(back);
  back.querySelector(".modal-close")?.focus({ preventScroll: true });
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

function formatNumber(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function equipmentPower(player) {
  if (player?.equipmentPower !== undefined) return Number(player.equipmentPower || 0);
  const counts = player?.gradeCounts || { B: 0, A: 0, S: 0 };
  return (counts.B || 0) * EQUIPMENT_POWER_VALUES.B + (counts.A || 0) * EQUIPMENT_POWER_VALUES.A + (counts.S || 0) * EQUIPMENT_POWER_VALUES.S;
}

function equipmentSlotHtml(player, armorCode, { interactive = true } = {}) {
  const armor = armorByCode(armorCode);
  const grade = equippedGrade(player, armorCode);
  const locked = grade === "S";
  const gradeText = locked ? "S MAX" : grade || "미보유";
  const tag = interactive ? "button" : "div";
  const action = interactive ? ` type="button" onclick="openEquipmentDetail('${armorCode}')"` : "";
  return `<${tag}${action} class="loadout-slot slot-${armorCode} ${grade ? `owned tier-${grade}` : "empty"} ${locked ? "is-maxed" : ""} ${interactive ? "" : "is-team-slot"}">
    ${locked ? `<span class="slot-max-lock" aria-label="S등급 완성, 중복 획득 잠금">◆</span>` : ""}
    <div class="slot-icon"><img src="${armor.icon}" alt="${escapeHtml(armor.name)}"></div>
    <div class="slot-copy">
      <div class="slot-top">
        <div class="slot-name">${escapeHtml(armor.name)}</div>
        <span class="slot-grade ${grade ? `grade-${grade}` : ""}">${gradeText}</span>
      </div>
    </div>
  </${tag}>`;
}

function equipmentBoardHtml(player, { interactive = true, teamMode = false, showStatus = true } = {}) {
  const leftSlots = LEFT_EQUIPMENT_SLOTS.map((armorCode) => equipmentSlotHtml(player, armorCode, { interactive })).join("");
  const rightSlots = RIGHT_EQUIPMENT_SLOTS.map((armorCode) => equipmentSlotHtml(player, armorCode, { interactive })).join("");

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
        <img class="loadout-figure" src="/assets/ui/warrior-shadow.webp" alt="${teamMode ? "조 장비" : "전신갑주"} 캐릭터 일러스트">
      </div>
      <div class="loadout-side right">${rightSlots}</div>
    </div>
    ${showStatus ? `<div class="loadout-status">
      <strong>${teamMode ? "TEAM " : ""}S MAX ${player.completedArmorCount || 0}/6</strong>
      <span>${gradeSummary(player)}</span>
    </div>` : ""}
  </div>`;
}

function openEquipmentDetail(armorCode) {
  if (!state.me) return;
  const armor = armorByCode(armorCode);
  const row = armorCounts(state.me, armorCode);
  const grade = equippedGrade(state.me, armorCode);
  const gradeClass = grade ? `tier-${grade}` : "tier-empty";

  const synthesisComplete = grade === "S" && Number(row.A || 0) === 0 && Number(row.B || 0) === 0;
  const synthesisSource = Number(row.A || 0) > 0 ? "A" : "B";
  const synthesisTarget = synthesisSource === "A" ? "S" : "A";
  const synthesisCount = Math.min(3, Number(row[synthesisSource] || 0));
  const synthesisRemaining = Math.max(0, 3 - synthesisCount);
  const synthesisSegments = Array.from({ length: 3 }, (_, index) => `<span class="${index < synthesisCount ? "filled" : ""}">${index < synthesisCount ? synthesisSource : ""}</span>`).join("");
  const synthesisTitle = synthesisComplete
    ? "S등급 완성"
    : synthesisRemaining === 0
      ? `${synthesisTarget}등급 합성 가능`
      : `${synthesisTarget}등급까지 ${synthesisRemaining}개`;
  const synthesisMeta = synthesisComplete ? "중복 획득 잠금" : `${synthesisSource}등급 ${synthesisCount}/3`;
  const back = document.createElement("div");
  back.className = "info-modal-back";
  back.dataset.returnFocusSelector = `.loadout-slot.slot-${armorCode}`;
  back._escapeHandler = (event) => {
    if (event.key === "Escape") closeInfoModal();
  };
  back.innerHTML = `<div class="info-modal equipment-info-modal ${gradeClass}" role="dialog" aria-modal="true" aria-labelledby="equipment-dialog-title">
    <div class="equipment-info-scroll">
      <div class="equipment-modal-toolbar">
        <span><b>ARMOR</b> 장비 정보</span>
        <button type="button" class="modal-close" aria-label="장비 상세 닫기" onclick="closeInfoModal()">×</button>
      </div>

      <div class="equipment-info-head equipment-detail-hero">
        <div class="equipment-info-icon"><img src="${armor.icon}" alt="${escapeHtml(armor.name)}"></div>
        <div class="equipment-info-copy">
          <div class="equipment-info-title" id="equipment-dialog-title">${escapeHtml(armor.name)}</div>
          <div class="equipment-info-sub">전신갑주 장비</div>
        </div>
        <div class="equipment-current-grade ${grade ? `grade-${grade}` : "grade-empty"}" aria-label="${grade ? `현재 ${grade}등급` : "미보유"}">
          <span>현재</span>
          <strong>${grade || "–"}</strong>
          <small>${grade ? "등급" : "미보유"}</small>
        </div>
      </div>

      <div class="equipment-meaning-card ${armorCode === "sword" ? "is-sword" : ""}">
        <span>장비 의미</span>
        <strong>${escapeHtml(armor.meaning || "")}</strong>
      </div>

      <div class="synthesis-progress-card ${synthesisComplete ? "is-complete" : `progress-to-${synthesisTarget}`}">
        <div class="synthesis-progress-summary">
          <span>합성 진행도 · ${synthesisComplete ? "최종 등급" : "다음 합성"}</span>
          <strong>${synthesisTitle}</strong>
        </div>
        <div class="synthesis-progress-count">${synthesisMeta}</div>
        ${synthesisComplete ? "" : `<div class="synthesis-segments" role="img" aria-label="${synthesisSource}등급 장비 3개 중 ${synthesisCount}개 보유">${synthesisSegments}</div>`}
      </div>
    </div>
  </div>`;
  back.addEventListener("click", (event) => {
    if (event.target === back) closeInfoModal();
  });
  document.addEventListener("keydown", back._escapeHandler);
  document.body.appendChild(back);
  back.querySelector(".modal-close")?.focus({ preventScroll: true });
}

function inventoryListHtml(player) {
  return state.armor.map((armor) => {
    const row = armorCounts(player, armor.code);
    const total = armorTotal(player, armor.code);
    const locked = Number(row.S || 0) > 0;
    const gradeChips = ["S", "A", "B"]
      .filter((grade) => Number(row[grade] || 0) > 0)
      .map((grade) => `<span class="inventory-grade-chip grade-${grade} ${grade === "S" ? "is-maxed" : ""}" aria-label="${grade === "S" ? "S등급 MAX, 중복 획득 잠금" : `${grade}등급 ${row[grade]}개`}"><strong>${grade === "S" ? "◆ S" : grade}</strong><span>${grade === "S" ? "MAX" : `×${row[grade]}`}</span></span>`)
      .join("");
    return `<div class="inventory-simple-row ${total ? "owned" : "empty"} ${locked ? "is-maxed" : ""}">
      <div class="inventory-simple-icon"><img src="${armor.icon}" alt=""></div>
      <div class="inventory-simple-copy">
        <div class="inventory-simple-name">${escapeHtml(armor.name)}</div>
        <div class="inventory-simple-grades">${gradeChips || `<span class="inventory-empty-label">미보유</span>`}</div>
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
      <div class="equipment-info-title" id="inventory-dialog-title">내 인벤토리</div>
      <div class="inventory-owned-badge">S MAX ${state.me.completedArmorCount || 0}/6</div>
    </div>
    <div class="inventory-simple-list">${inventoryListHtml(state.me)}</div>
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
  state.pollGeneration += 1;
  if (state.poll) clearInterval(state.poll);
  state.poll = null;
  if (state.warUnlockTimer) window.clearTimeout(state.warUnlockTimer);
  state.warUnlockTimer = null;
}

function startPoll(fn, delay = 4000) {
  clearPoll();
  const generation = state.pollGeneration;
  let running = false;
  const jitter = Math.min(1000, Math.floor(delay * 0.25));
  const intervalDelay = delay + Math.floor(Math.random() * (jitter + 1));
  const isCurrent = () => state.pollGeneration === generation;
  state.poll = setInterval(async () => {
    if (document.hidden || running || !isCurrent()) return;
    running = true;
    try {
      await fn(isCurrent);
    } catch (error) {
      console.warn("화면 자동 갱신 중 오류", error);
    } finally {
      running = false;
    }
  }, intervalDelay);
}

async function loadState({ quiet = false } = {}) {
  const playerId = safeLocalStorage.getItem(STORAGE_PLAYER);
  const name = safeLocalStorage.getItem(STORAGE_NAME) || "";
  const team = safeLocalStorage.getItem(STORAGE_TEAM) || "";
  if (!playerId || !name || !team) {
    state.me = null;
    state.team = null;
    if (!quiet) render();
    return null;
  }
  const payload = await api("state", { playerId, name, team });
  state.armor = payload.armor;
  state.forestTrials = payload.forestTrials;
  state.qrRewards = payload.qrRewards || [];
  state.claimedQrCodes = payload.claimedQrCodes || [];
  state.ranking = payload.ranking;
  state.partyRanking = payload.partyRanking || [];
  state.booths = payload.booths;
  state.team = payload.team || null;
  applyWarSchedule(payload);
  if (payload.me) setMe(payload.me);
  if (!quiet) render();
  return payload;
}

function teamRevealStorageKey(team = state.team) {
  const sessionId = team?.war?.sessionId || team?.rosterFinalizedAt || "";
  return team?.key && sessionId ? `${STORAGE_WAR_REVEAL_PREFIX}${team.key}_${sessionId}` : "";
}

function teamRevealSeen() {
  const key = teamRevealStorageKey();
  return Boolean(key && safeLocalStorage.getItem(key) === "1");
}

function markTeamRevealSeen() {
  const key = teamRevealStorageKey();
  if (key) safeLocalStorage.setItem(key, "1");
}

function clearTeamRevealSeen() {
  const key = teamRevealStorageKey();
  if (key) safeLocalStorage.removeItem(key);
}

function logout() {
  state.viewGeneration += 1;
  const revealKey = teamRevealStorageKey();
  if (revealKey) safeLocalStorage.removeItem(revealKey);
  if (state.teamMergeTimer) window.clearTimeout(state.teamMergeTimer);
  state.teamMergeTimer = null;
  safeLocalStorage.removeItem(STORAGE_PLAYER);
  safeLocalStorage.removeItem(STORAGE_NAME);
  safeLocalStorage.removeItem(STORAGE_TEAM);
  state.me = null;
  state.team = null;
  state.lastResults = [];
  state.lastQrResults = [];
  nav("/");
}

async function createPlayer(partyMode = "auto") {
  const name = document.getElementById("player-name").value.trim();
  const team = document.getElementById("player-team").value.trim();
  const gender = "male";
  if (!name) return toast("이름을 입력해주세요.", "error");
  if (!team) return toast("조 이름을 입력해주세요.", "error");
  const viewContext = captureViewContext();
  showConnectScreen();
  try {
    const payload = await api("create-player", { name, team, gender, partyMode, resumePlayerId: safeLocalStorage.getItem(STORAGE_PLAYER) || "" });
    if (!isViewContextCurrent(viewContext)) return closeConnectScreen();
    state.armor = payload.armor;
    state.forestTrials = payload.forestTrials;
    state.qrRewards = payload.qrRewards || [];
    state.claimedQrCodes = payload.claimedQrCodes || [];
    state.ranking = payload.ranking;
    state.partyRanking = payload.partyRanking || state.partyRanking;
    state.booths = payload.booths;
    state.team = payload.team || null;
    applyWarSchedule(payload);
    setMe(payload.me);
    closeConnectScreen();
    playGameSound("success");
    nav(payload.team?.rosterFinalized ? "/" : "/team/roles");
  } catch (error) {
    closeConnectScreen();
    if (isViewContextCurrent(viewContext)) toast(error.message, "error");
  }
}

async function draw(count) {
  if (!state.me) return;
  const viewContext = captureViewContext();
  try {
    const payload = await api("draw", { playerId: state.me.id, count });
    if (!isViewContextCurrent(viewContext)) return;
    state.lastResults = payload.results;
    state.claimedQrCodes = payload.claimedQrCodes || state.claimedQrCodes;
    state.ranking = payload.ranking;
    state.partyRanking = payload.partyRanking || state.partyRanking;
    state.booths = payload.booths;
    state.team = payload.team || state.team;
    applyWarSchedule(payload);
    setMe(payload.me);
    render();
    showDrawModal(payload.results, payload.promotions || [], { fullSetComplete: Boolean(payload.fullSetComplete) });
  } catch (error) {
    toast(error.message, "error");
  }
}

function qrCodeForRoute(current = route()) {
  if (current.parts[0] === "qr" && current.parts[1]) return current.parts.slice(1).join("-");
  if (current.parts[0] === "draw" && current.parts[1]) return `draw-${current.parts.slice(1).join("-")}`;
  if (current.parts[0] === "mission" && current.parts[1]) return `mission-${current.parts.slice(1).join("-")}`;
  if (current.parts[0] === "hidden" && current.parts[1]) return `hidden-${current.parts.slice(1).join("-")}`;
  if (current.parts[0] === "boss") return "boss-forest";
  return "";
}

function qrRewardByCode(code) {
  const normalizedCode = LEGACY_MISSION_ALIASES[code] || code;
  return state.qrRewards.find((reward) => reward.code === normalizedCode);
}

function qrRewardText(reward) {
  const draws = Number(reward?.reward?.draws || 0);
  return draws ? `${draws}뽑기 보상` : "확인 보상";
}

async function claimQrReward(code, { auto = false } = {}) {
  if (!state.me) return toast("먼저 캐릭터를 등록해주세요.", "error");
  if (state.qrClaimInFlight) return;
  const viewContext = captureViewContext();
  state.qrClaimInFlight = true;
  try {
    const payload = await api("claim-qr", { playerId: state.me.id, code });
    if (!isViewContextCurrent(viewContext)) return;
    state.lastQrResults = payload.results || [];
    state.lastResults = payload.results || [];
    state.claimedQrCodes = payload.claimedQrCodes || state.claimedQrCodes;
    state.ranking = payload.ranking || state.ranking;
    state.partyRanking = payload.partyRanking || state.partyRanking;
    state.booths = payload.booths || state.booths;
    state.team = payload.team || state.team;
    applyWarSchedule(payload);
    setMe(payload.me);
    renderQr();
    if (payload.alreadyClaimed) {
      toast("이미 받은 QR 보상입니다.", "error");
    } else {
      showDrawModal(payload.results || [], payload.promotions || [], { qrFlow: auto, fullSetComplete: Boolean(payload.fullSetComplete) });
    }
  } catch (error) {
    if (!isViewContextCurrent(viewContext)) return;
    if (error.code === "THE_WAR_LOCKED") {
      state.warOpen = false;
      state.warOpensAt = error.warOpensAt || state.warOpensAt;
      renderWarLocked();
    } else if (auto) renderQr();
    toast(error.message, "error");
  } finally {
    state.qrClaimInFlight = false;
  }
}

function applyTeamSetupPayload(payload) {
  state.team = payload.team || state.team;
  applyWarSchedule(payload);
  if (payload.me) {
    setMe(payload.me);
  } else if (state.me && state.team) {
    state.me = { ...state.me, teamMemberCount: state.team.memberCount || 0 };
  }
}

async function runTeamSetupAction(action, successMessage, { goParty = false, sound = "success" } = {}) {
  if (!state.me || state.teamSetupInFlight) return;
  const viewContext = captureViewContext();
  state.teamSetupInFlight = true;
  try {
    const payload = await api(action, { playerId: state.me.id });
    if (!isViewContextCurrent(viewContext)) return;
    applyTeamSetupPayload(payload);
    clearTeamRevealSeen();
    playGameSound(sound);
    toast(successMessage);
    if (goParty) nav("/party");
    else renderTeamRoles();
  } catch (error) {
    if (!isViewContextCurrent(viewContext)) return;
    toast(error.message, "error");
    try {
      const payload = await api("team-state", { playerId: state.me.id });
      if (!isViewContextCurrent(viewContext)) return;
      applyTeamSetupPayload(payload);
      renderTeamRoles();
    } catch {}
  } finally {
    state.teamSetupInFlight = false;
  }
}

function finalizeTeamRoster() {
  const memberCount = Number(state.team?.memberCount || 0);
  if (!state.team?.isLeader) return toast("조장만 구성을 확정할 수 있어요.", "error");
  if (memberCount < 4 || memberCount > 6) return toast("조는 4~6명일 때 확정할 수 있어요.", "error");
  const memberNames = (state.team?.members || []).map((member) => member.name).join(", ");
  if (!window.confirm(`조원 ${memberCount}명을 확정할까요?\n\n${memberNames}\n\n확정 후에는 조장도 취소하거나 조원을 바꿀 수 없습니다. 오타·편성 오류는 교사에게 요청하세요.`)) return;
  runTeamSetupAction("team-roster-finalize", `${memberCount}명 조 결성 완료!`, { goParty: true, sound: "start" });
}

function claimTeamLeader() {
  if (state.team?.isLeader) return toast("이미 내가 조장입니다.");
  runTeamSetupAction("team-leader-claim", "이제 내가 조장입니다.", { sound: "leader" });
}

async function leaveTeam() {
  if (!state.me || state.team?.rosterFinalized) {
    return toast("조 명단이 확정된 뒤에는 탈퇴할 수 없습니다.", "error");
  }
  const teamName = state.me.team || "현재 조";
  if (!window.confirm(`“${teamName}” 조에서 탈퇴할까요?\n\n탈퇴 후 조 이름을 다시 입력해 다른 조에 들어갈 수 있습니다. 조가 확정되기 전까지만 가능합니다.`)) return;
  const viewContext = captureViewContext();
  state.teamSetupInFlight = true;
  try {
    const payload = await api("leave-team", { playerId: state.me.id });
    if (!isViewContextCurrent(viewContext)) return;
    state.ranking = payload.ranking || state.ranking;
    state.partyRanking = payload.partyRanking || state.partyRanking;
    clearTeamRevealSeen();
    safeLocalStorage.removeItem(STORAGE_TEAM);
    state.me = null;
    state.team = null;
    nav("/");
    toast("조에서 탈퇴했습니다. 조 이름을 다시 입력해주세요.");
  } catch (error) {
    if (isViewContextCurrent(viewContext)) toast(error.message, "error");
  } finally {
    state.teamSetupInFlight = false;
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
  startButton.classList.toggle("is-ready", Boolean(name && team));
  startButton.disabled = !(name && team);
  nameInput.closest(".entry-input-wrap")?.classList.toggle("has-value", Boolean(name));
  teamInput.closest(".entry-input-wrap")?.classList.toggle("has-value", Boolean(team));
}

function renderCreate() {
  const savedName = safeLocalStorage.getItem(STORAGE_NAME) || "";
  const savedTeam = safeLocalStorage.getItem(STORAGE_TEAM) || "";
  document.body.classList.add("entry-mode");
  app.innerHTML = `<div class="entry-shell">
    <header class="entry-topbar">
      <div class="entry-brand">
        <span class="entry-brand-mark" aria-hidden="true">⚔</span>
        <h1 id="entry-title">전신갑주를 입어라</h1>
      </div>
      <div class="entry-top-actions">${audioToggleButtonHtml("entry-audio-toggle")}<button class="entry-teacher-button" type="button" onclick="nav('/admin')">교사용</button></div>
    </header>

    <main class="entry-screen" aria-labelledby="entry-title">
      <section class="entry-hero">
        <img src="/assets/ui/entry-armor-hero.webp" alt="전신갑주를 갖춘 용사가 원정을 시작하는 일러스트" fetchpriority="high">
      </section>

      <form class="entry-card" onsubmit="event.preventDefault(); createPlayer()">
        <div class="entry-card-heading">
          <h2>용사 로그인</h2>
          <div id="entry-player-preview" class="entry-player-preview">참가 준비</div>
        </div>

        <div class="entry-field-grid">
          <div class="field entry-field">
            <label for="player-name">이름</label>
            <div class="entry-input-wrap">
              <img src="/assets/armor/helmet.webp" alt="" aria-hidden="true">
              <input id="player-name" maxlength="20" autocomplete="name" enterkeyhint="next" placeholder="이름 입력" value="${escapeHtml(savedName)}" oninput="updateEntryReadiness()">
            </div>
          </div>
          <div class="field entry-field">
            <label for="player-team">조 이름</label>
            <div class="entry-input-wrap">
              <img src="/assets/armor/shield.webp" alt="" aria-hidden="true">
              <input id="player-team" maxlength="12" autocomplete="off" enterkeyhint="go" placeholder="조 이름 입력" value="${escapeHtml(savedTeam)}" oninput="updateEntryReadiness()" required>
            </div>
          </div>
        </div>

        <button id="entry-start-button" class="entry-start-button entry-login-button" type="submit">
          <span class="entry-start-symbol" aria-hidden="true">⚔</span><span>로그인</span><span class="entry-start-arrow" aria-hidden="true">➜</span>
        </button>
        <p class="entry-auto-resume-note">이름과 조 이름으로 로그인합니다. 기존 기록이 있으면 자동으로 이어집니다.</p>
      </form>
    </main>
  </div>`;
  updateEntryReadiness();
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

function sortedPartyRanking(source = state.partyRanking) {
  return [...(source || [])].sort((a, b) => Number(b.equipmentPower || 0) - Number(a.equipmentPower || 0)
    || Number(b.memberCount || 0) - Number(a.memberCount || 0)
    || String(a.name || "").localeCompare(String(b.name || ""), "ko"));
}

function partyRankingHtml(limit = 30, source = state.partyRanking) {
  const currentKey = state.team?.key || "";
  const rows = sortedPartyRanking(source).slice(0, limit).map((party, index) => {
    const isMe = Boolean(currentKey && party.key === currentKey);
    return `<div class="rank-row party-rank-row place-${index + 1} ${isMe ? "me" : ""}">
      <div class="rank-num">${index + 1}</div>
      <div class="party-rank-copy"><div class="row-title">${escapeHtml(party.name || `${party.team || "이름 없는"} 조`)} <span class="tag">${Number(party.memberCount || 0)}명</span></div><small>명단 확정 · 전신갑주 ${Number(party.completedArmorCount || 0)}/6</small></div>
      <div class="rank-status rank-power"><span>조전투력</span><strong>${formatNumber(party.equipmentPower)}</strong></div>
    </div>`;
  }).join("");
  return rows || `<div class="notice">아직 확정된 조가 없습니다.</div>`;
}

function renderRankingList() {
  const partyActive = state.rankingTab !== "individual";
  const list = document.querySelector(".student-ranking-list");
  if (list) list.innerHTML = partyActive ? partyRankingHtml(30) : rankingHtml(30);
  document.querySelectorAll("[data-ranking-tab]").forEach((button) => {
    const active = button.dataset.rankingTab === (partyActive ? "party" : "individual");
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  const note = document.querySelector(".ranking-tab-note");
  if (note) note.textContent = partyActive ? "명단 확정이 끝난 조만 표시됩니다." : "현재 참가자 개인 장비전투력 순위입니다.";
}

function selectRankingTab(tab) {
  state.rankingTab = tab === "individual" ? "individual" : "party";
  renderRankingList();
}

function partyMemberGridHtml(team = state.team) {
  return `<div class="party-member-grid">${(team?.members || []).map((member) => {
    const isMe = member.id === state.me?.id;
    return `<button type="button" class="party-member-button ${isMe ? "is-me" : ""}" onclick="openPartyMemberDetail('${member.id}')" aria-label="${escapeHtml(`${member.name}, ${member.isLeader ? "조장, " : ""}전투력 ${formatNumber(member.equipmentPower)}, 조원 정보 열기`)}">
      <span class="party-member-avatar">${escapeHtml(member.name.slice(0, 1))}</span>
      <span class="party-member-copy"><strong><span>이름: ${escapeHtml(member.name)}</span>${member.isLeader ? `<b class="party-member-leader">조장</b>` : ""}${isMe ? `<b class="party-member-me">나</b>` : ""}</strong><small>${member.isLeader ? "조장" : "조원"}${isMe ? " · 나" : ""}</small></span>
      <em><small>전투력:</small><b>${formatNumber(member.equipmentPower)}</b></em>
      <i class="party-member-arrow" aria-hidden="true">›</i>
    </button>`;
  }).join("")}</div>`;
}

function openPartyMemberDetail(memberId) {
  const member = state.team?.members?.find((item) => item.id === memberId);
  if (!member) return;
  const back = document.createElement("div");
  back.className = "info-modal-back";
  back.innerHTML = `<div class="info-modal party-member-modal" role="dialog" aria-modal="true" aria-labelledby="party-member-dialog-title">
    <button type="button" class="modal-close" aria-label="조원 정보 닫기" onclick="closeInfoModal()">×</button>
    <div class="party-member-modal-head"><span>${escapeHtml(member.name.slice(0, 1))}</span><div><small>${member.isLeader ? "조장" : "조원"}</small><h2 id="party-member-dialog-title">${escapeHtml(member.name)}</h2></div><strong>${formatNumber(member.equipmentPower)}<small>전투력</small></strong></div>
    <div class="party-member-inventory-title">보유 장비</div>
    <div class="inventory-simple-list">${inventoryListHtml(member)}</div>
  </div>`;
  back.addEventListener("click", (event) => { if (event.target === back) closeInfoModal(); });
  document.body.appendChild(back);
  back.querySelector(".modal-close")?.focus({ preventScroll: true });
}

function renderHome() {
  if (!state.me) return renderCreate();
  const me = state.me;
  document.body.classList.add("home-mode");
  app.innerHTML = `<div class="home-page">
    ${topbar({ brand: "내 캐릭터" })}

    <section class="home-character-hero" aria-label="${escapeHtml(me.name)}, ${escapeHtml(me.team || "조 미정")}, 전투력 ${formatNumber(equipmentPower(me))}">
      <div class="home-character-identity"><h1>${escapeHtml(me.name)}</h1><span><i aria-hidden="true">♟</i><b>조</b>${escapeHtml(me.team || "미정")}</span></div>
      <div class="home-character-power"><span aria-hidden="true">⚡</span><div><small>전투력</small><strong>${formatNumber(equipmentPower(me))}</strong></div></div>
    </section>

    <section class="home-loadout-card">
      <div class="home-loadout-heading"><div><span>MY ARMOR</span><h2>나의 전신갑주</h2></div><p>장비를 눌러 등급과 보유 현황을 확인하세요.</p></div>
      ${equipmentBoardHtml(me, { showStatus: false })}
      <div class="home-equipment-actions" aria-label="내 장비 메뉴">
        <button type="button" class="home-equipment-action inventory-button" onclick="openInventoryModal()"><span aria-hidden="true">▦</span><strong>인벤토리</strong><small>보유 장비 전체 보기</small></button>
        <button type="button" class="home-equipment-action qr-scan-button" onclick="openForestQrScanner()"><span aria-hidden="true">📷</span><strong>QR 스캔</strong><small>보상·장비뽑기 획득</small></button>
      </div>
    </section>
  </div>`;
  startPoll(async (isCurrent) => {
    const playerId = state.me?.id;
    if (!playerId) return;
    try {
      const payload = await api("state", { playerId });
      if (!isCurrent() || route().path !== "/" || state.me?.id !== playerId) return;
      state.team = payload.team || state.team;
      state.ranking = payload.ranking || state.ranking;
      state.partyRanking = payload.partyRanking || state.partyRanking;
      applyWarSchedule(payload);
      setMe(payload.me);
      renderHome();
    } catch {}
  }, 10000);
}

function renderParty() {
  if (!state.me) return renderCreate();
  const me = state.me;
  const team = state.team || { members: [], armorProgress: [] };
  const partyPower = Number(team.character?.equipmentPower || 0);
  const memberCount = team.members?.length || 0;
  document.body.classList.add("player-mode", "party-dashboard-mode");
  app.innerHTML = `<div class="student-page party-dashboard-page">
    ${topbar({ brand: "우리 조" })}

    <section class="party-dashboard-hero" aria-label="조 전투력 ${formatNumber(partyPower)}">
      <div class="party-dashboard-art"><img src="/assets/ui/entry-armor-hero.webp" alt=""></div>
      <div class="party-dashboard-copy"><small>PARTY POWER</small><span>${escapeHtml(team.name || `${me.team} 조`)}</span><p>조 전투력</p><h1>${formatNumber(partyPower)}</h1></div>
      <div class="party-dashboard-stats"><span><small>조원</small><strong>${memberCount}명</strong></span><span><small>내 전투력</small><strong>${formatNumber(equipmentPower(me))}</strong></span></div>
    </section>

    <section class="home-section party-member-section party-dashboard-section">
      <div class="home-section-heading"><div><small>MEMBERS</small><h2>조원</h2></div><span>${memberCount}명</span></div>
      ${partyMemberGridHtml(team)}
    </section>
  </div>`;
  startPoll(async (isCurrent) => {
    const playerId = state.me?.id;
    if (!playerId) return;
    try {
      const payload = await api("state", { playerId });
      if (!isCurrent() || route().path !== "/party" || state.me?.id !== playerId) return;
      state.team = payload.team || state.team;
      state.ranking = payload.ranking || state.ranking;
      state.partyRanking = payload.partyRanking || state.partyRanking;
      applyWarSchedule(payload);
      setMe(payload.me);
      renderParty();
    } catch {}
  }, 10000);
}

function teamRosterPollSignature(team) {
  return JSON.stringify({
    members: (team?.members || []).map((member) => [member.id, member.name, member.isLeader, member.equipmentPower]),
    rosterFinalized: Boolean(team?.rosterFinalized)
  });
}

function startTeamRosterPoll() {
  state.teamPollSignature = teamRosterPollSignature(state.team);
  startPoll(async (isCurrent) => {
    const playerId = state.me?.id;
    if (route().path !== "/team/roles" || !playerId) return;
    try {
      const payload = await api("team-state", { playerId });
      if (!isCurrent() || route().path !== "/team/roles" || state.me?.id !== playerId) return;
      const nextSignature = teamRosterPollSignature(payload.team);
      state.team = payload.team;
      state.me = { ...state.me, teamMemberCount: payload.team.memberCount || 0 };
      if (nextSignature !== state.teamPollSignature) renderTeamRoles();
    } catch {
      setServerConnection(false);
    }
  }, 3000);
}

function teamRosterRowsHtml(team, { waiting = false } = {}) {
  return (team?.members || []).map((member) => `<div class="team-role-member ${member.id === state.me?.id ? "is-me" : ""}">
    <span class="team-role-member-avatar">${escapeHtml(member.name.slice(0, 1))}</span>
    <span class="team-role-member-copy"><strong>${escapeHtml(member.name)}${member.isLeader ? " · 조장" : ""}</strong><small>${waiting ? "원정 준비 완료" : `장비전투력 ${formatNumber(member.equipmentPower)}`}</small></span>
    <em>${member.id === state.me?.id ? "나" : member.isLeader ? "LEADER" : "READY"}</em>
  </div>`).join("");
}

function renderPartyLobby(team) {
  const memberCount = Number(team.memberCount || 0);
  const rosterReady = memberCount >= 4 && memberCount <= 6;
  const overCapacity = memberCount > 6;
  const partyName = state.me?.team || "우리 조";
  app.innerHTML = `<div class="student-page party-lobby-page">
    ${topbar({ brand: "원정대 결성", showLogout: true })}
    <section class="party-lobby-hero">
      <div class="party-lobby-hero-art"><img src="/assets/ui/entry-armor-hero.webp" alt=""></div>
      <div class="party-lobby-hero-copy"><span>우리 조 이름</span><h1>${escapeHtml(partyName)}</h1><p>최소 4명 · 최대 6명</p></div>
      <div class="party-lobby-count"><small>현재</small><strong>${memberCount}명</strong></div>
    </section>

    <section class="party-lobby-invite" aria-label="조 이름 ${escapeHtml(partyName)}을 입력하세요">
      <span class="party-lobby-invite-icon" aria-hidden="true">⌨</span>
      <p><span>조 이름</span><strong>“${escapeHtml(partyName)}”</strong><span>을 입력하세요</span></p>
    </section>

    <section class="party-lobby-roster">
      <div class="home-section-heading"><h2>현재 조원</h2><span>${memberCount}명</span></div>
      <div class="team-role-roster-list">${teamRosterRowsHtml(team, { waiting: true }) || `<p class="notice">조원을 기다리는 중입니다.</p>`}</div>
    </section>

    ${team.isLeader
      ? `<button type="button" class="party-lobby-start ${rosterReady ? "is-ready" : ""}" onclick="finalizeTeamRoster()" ${rosterReady ? "" : "disabled"}><span aria-hidden="true">✓</span><strong>${overCapacity ? "최대 인원은 6명이에요" : rosterReady ? `${memberCount}명으로 조 결성` : "최소 4명이 모이면 시작"}</strong><em>${rosterReady ? "결성 후 바로 장비를 모을 수 있어요" : "최대 6명까지 참가할 수 있어요"}</em></button>`
      : `<button type="button" class="party-leader-claim" onclick="claimTeamLeader()"><span aria-hidden="true">♛</span><strong>내가 조장 맡기</strong><em>누구나 바로 맡을 수 있어요</em></button>`}
    <button type="button" class="party-lobby-leave" onclick="leaveTeam()">조 탈퇴 · 조 이름 다시 입력</button>
  </div>`;
  startTeamRosterPoll();
}

function renderTeamRoles() {
  if (!state.me) return renderCreate();
  const team = state.team || { members: [], armorProgress: [] };
  const memberCount = Number(team.memberCount || 0);
  const rosterFinalized = Boolean(team.rosterFinalized);
  document.body.classList.add("player-mode");
  if (!rosterFinalized) return renderPartyLobby(team);
  app.innerHTML = `<div class="student-page party-roster-complete-page">
    ${topbar({ back: true, brand: "조 명단" })}
    <section class="party-roster-complete-hero">
      <span>PARTY ASSEMBLED</span>
      <h1>조 결성 완료</h1>
      <p>${escapeHtml(state.me.team || "우리 조")} · ${memberCount}명이 함께 장비를 모읍니다.</p>
      <strong>${memberCount}<small>/6</small></strong>
    </section>
    <section class="simple-party-members">
      <div class="home-section-heading"><h2>확정된 조원</h2><span>${memberCount}명</span></div>
      <div class="team-role-roster-list">${teamRosterRowsHtml(team)}</div>
      <p class="notice">조 명단이 확정되었습니다. 각자의 장비를 충분히 준비하세요. 역할은 마지막 날 THE WAR에서 현장 배분합니다.</p>
    </section>
    <button type="button" class="team-role-home-button is-complete" onclick="nav('/party')">조 현황 보기</button>
  </div>`;
  startTeamRosterPoll();
}

function renderRanking() {
  document.body.classList.add("player-mode");
  app.innerHTML = `<div class="student-page ranking-page">
    ${topbar({ back: true })}
    <section class="student-panel ranking-panel">
      <div class="student-page-heading">
        <span class="student-heading-icon" aria-hidden="true">🏆</span>
        <div><h1>실시간 랭킹</h1></div>
      </div>
      <div class="ranking-tabs" role="tablist" aria-label="랭킹 종류">
        <button type="button" role="tab" data-ranking-tab="party" aria-controls="ranking-list" aria-selected="true" onclick="selectRankingTab('party')"><span aria-hidden="true">♟</span><strong>조 전투력</strong></button>
        <button type="button" role="tab" data-ranking-tab="individual" aria-controls="ranking-list" aria-selected="false" onclick="selectRankingTab('individual')"><span aria-hidden="true">⚡</span><strong>개인 전투력</strong></button>
      </div>
      <div id="ranking-list" class="student-ranking-list">${state.rankingTab === "individual" ? rankingHtml(30) : partyRankingHtml(30)}</div>
    </section>
  </div>`;
  startPoll(async (isCurrent) => {
    try {
      const payload = await api("ranking", {}, "GET");
      if (!isCurrent() || route().path !== "/ranking") return;
      state.ranking = payload.ranking;
      state.partyRanking = payload.partyRanking || state.partyRanking;
      renderRankingList();
    } catch {}
  }, 30000);
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
  if (state.exchangeActionInFlight) return;
  const viewContext = captureViewContext();
  state.exchangeActionInFlight = true;
  try {
    const payload = await api("exchange-join", { boothId, playerId: state.me.id });
    if (!isViewContextCurrent(viewContext)) return;
    setMe(payload.me);
    state.booths = payload.booths;
    renderExchange(boothId, payload.booth);
  } catch (error) {
    if (isViewContextCurrent(viewContext)) toast(error.message, "error");
  } finally {
    state.exchangeActionInFlight = false;
  }
}

async function selectExchange(boothId) {
  if (state.exchangeActionInFlight) return;
  const viewContext = captureViewContext();
  state.exchangeActionInFlight = true;
  try {
    saveExchangeDraft(boothId);
    const items = selectedExchangeItems();
    const payload = await api("exchange-select", { boothId, playerId: state.me.id, items });
    if (!isViewContextCurrent(viewContext)) return;
    setMe(payload.me);
    state.booths = payload.booths;
    state.exchangeDraft[String(boothId)] = itemValues(currentBoothItems(payload.booth));
    renderExchange(boothId, payload.booth);
    toast("교환 장비를 올렸습니다.");
  } catch (error) {
    if (isViewContextCurrent(viewContext)) toast(error.message, "error");
  } finally {
    state.exchangeActionInFlight = false;
  }
}

async function confirmExchange(boothId) {
  if (state.exchangeActionInFlight) return;
  const viewContext = captureViewContext();
  state.exchangeActionInFlight = true;
  try {
    const payload = await api("exchange-confirm", { boothId, playerId: state.me.id });
    if (!isViewContextCurrent(viewContext)) return;
    setMe(payload.me);
    state.booths = payload.booths;
    if (payload.booth.status === "completed") delete state.exchangeDraft[String(boothId)];
    renderExchange(boothId, payload.booth);
    toast(payload.booth.status === "completed" ? "교환 완료!" : "동의 완료. 상대 확인을 기다립니다.");
  } catch (error) {
    if (isViewContextCurrent(viewContext)) toast(error.message, "error");
  } finally {
    state.exchangeActionInFlight = false;
  }
}

async function cancelExchange(boothId) {
  if (state.exchangeActionInFlight) return;
  const viewContext = captureViewContext();
  state.exchangeActionInFlight = true;
  try {
    const payload = await api("exchange-cancel", { boothId, playerId: state.me.id });
    if (!isViewContextCurrent(viewContext)) return;
    state.booths = payload.booths;
    delete state.exchangeDraft[String(boothId)];
    renderExchange(boothId, payload.booth);
    toast("교환소를 비웠습니다.");
  } catch (error) {
    if (isViewContextCurrent(viewContext)) toast(error.message, "error");
  } finally {
    state.exchangeActionInFlight = false;
  }
}

function renderBoothPlayer(label, name, items, confirmed, active) {
  const itemText = items && items.length ? items.map((item) => `${armorByCode(item.armor).name} ${item.grade}`).join(" + ") : "장비 미선택";
  return `<div class="exchange-slot ${active ? "active" : ""} ${confirmed ? "confirmed" : ""}">
    <div class="exchange-player-head"><div class="row-title">${label}: ${name ? escapeHtml(name) : "대기 중"}</div><span>${confirmed ? "동의 완료" : "확인 대기"}</span></div>
    <div class="row-sub">${escapeHtml(itemText)}</div>
  </div>`;
}

function renderExchange(boothId, boothOverride = null) {
  if (!state.me) return renderCreate();
  document.body.classList.add("player-mode");
  const booth = boothOverride || state.booths.find((item) => String(item.boothId) === String(boothId)) || { boothId, status: "empty", player1Items: [], player2Items: [] };
  const joined = booth.player1Id === state.me.id || booth.player2Id === state.me.id;
  const completed = booth.status === "completed";
  if (joined && document.getElementById("trade-slot-1")) saveExchangeDraft(boothId);
  if (!joined || booth.status === "completed") delete state.exchangeDraft[String(boothId)];
  const selectedValues = exchangeSelectedValues(boothId, booth);
  app.innerHTML = `<div class="student-page exchange-page">
    ${topbar({ back: true })}
    <section class="student-panel exchange-main-panel">
      <div class="student-page-heading">
        <span class="student-heading-icon" aria-hidden="true"><img src="/assets/armor/shield.webp" alt=""></span>
        <div><h1>교환소 ${boothId}</h1><p>선생님 앞에서 안전하게 교환하세요</p></div>
      </div>
      <div class="notice">선생님 앞에서 두 학생이 같은 교환소 QR에 입장한 뒤, 각자 최대 2칸까지 장비를 올리고 동시에 동의합니다.</div>
      <div class="exchange-status mt-12">
        ${renderBoothPlayer("1번", booth.player1Name, booth.player1Items, booth.player1Confirmed, booth.player1Id === state.me.id)}
        ${renderBoothPlayer("2번", booth.player2Name, booth.player2Items, booth.player2Confirmed, booth.player2Id === state.me.id)}
      </div>
      ${completed ? `<div class="notice mt-12">교환이 완료되었습니다. 다음 두 학생은 새 교환을 시작하세요.</div><button class="btn pink mt-12" onclick="joinExchange('${boothId}')">새 교환 시작</button>` : joined ? `<div class="field"><label>내가 줄 장비</label><div class="item-picker"><select id="trade-slot-1" onchange="saveExchangeDraft('${boothId}')">${itemOptions(state.me, selectedValues[0])}</select><select id="trade-slot-2" onchange="saveExchangeDraft('${boothId}')">${itemOptions(state.me, selectedValues[1])}</select></div></div>
        <div class="btn-row two"><button class="btn purple" onclick="selectExchange('${boothId}')">장비 올리기</button><button class="btn pink" onclick="confirmExchange('${boothId}')">동의하기</button></div>
        <button class="btn danger mt-12" onclick="cancelExchange('${boothId}')">교환 취소/초기화</button>` : `<button class="btn pink mt-12" onclick="joinExchange('${boothId}')">교환소 ${boothId} 입장</button>`}
    </section>
    <section class="student-panel exchange-inventory-panel">
      <div class="student-section-heading"><h2>내 장비</h2><span>교환 가능 장비</span></div>
      <div class="inventory-simple-list inline-inventory-list">${inventoryListHtml(state.me)}</div>
    </section>
  </div>`;
  startPoll(async (isCurrent) => {
    try {
      const payload = await api("booth", { boothId });
      if (!isCurrent() || route().parts[0] !== "exchange" || route().parts[1] !== String(boothId)) return;
      const wasCompleted = state.booths.find((item) => String(item.boothId) === String(boothId))?.status === "completed";
      state.booths = payload.booths;
      if (!wasCompleted && payload.booth?.status === "completed" && state.me) {
        const fresh = await api("state", { playerId: state.me.id });
        if (!isCurrent() || route().parts[0] !== "exchange" || route().parts[1] !== String(boothId)) return;
        if (fresh.me) setMe(fresh.me);
        state.team = fresh.team || state.team;
      }
      if (!exchangeSelectFocused()) renderExchange(boothId, payload.booth);
    } catch {}
  }, 8000);
}

function forestQrRoute(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) return "";
  if (raw === "team-merge") return "/team/merge";
  if (state.team?.rosterFinalized && !state.team?.war?.allScanned) {
    try {
      const checkInUrl = new URL(raw, `${location.origin}/`);
      const checkInPath = checkInUrl.pathname.length > 1 ? checkInUrl.pathname.replace(/\/$/, "") : checkInUrl.pathname;
      if (checkInUrl.origin === location.origin && !checkInUrl.username && !checkInUrl.password && !checkInUrl.search && !checkInUrl.hash && checkInPath === "/team/merge") {
        return "/team/merge";
      }
    } catch {}
    return "";
  }
  const directReward = qrRewardByCode(raw);
  if (directReward) {
    if (raw.startsWith("draw-")) return `/draw/${raw.replace(/^draw-/, "")}`;
    if (raw === "boss-forest") return "/boss";
    if (raw.startsWith("mission-")) return `/mission/${raw.replace(/^mission-/, "")}`;
    if (raw.startsWith("hidden-")) return `/hidden/${raw.replace(/^hidden-/, "")}`;
    return `/qr/${raw}`;
  }
  let scannedUrl;
  try {
    scannedUrl = new URL(raw, `${location.origin}/`);
  } catch {
    return "";
  }
  if (scannedUrl.origin !== location.origin || scannedUrl.username || scannedUrl.password || scannedUrl.search || scannedUrl.hash) return "";
  const path = scannedUrl.pathname.length > 1 ? scannedUrl.pathname.replace(/\/$/, "") : scannedUrl.pathname;
  if (path === "/team/merge") return path;
  if (!/^(?:\/(?:qr|draw|mission|hidden)\/[a-z0-9-]+|\/boss)$/i.test(path)) return "";
  const parts = path.split("/").filter(Boolean);
  const code = qrCodeForRoute({ path, parts });
  return qrRewardByCode(code) ? path : "";
}

function closeForestQrScanner({ restoreFocus = true } = {}) {
  forestQrSession += 1;
  if (forestQrTimer) window.clearTimeout(forestQrTimer);
  forestQrTimer = null;
  if (forestQrStream) forestQrStream.getTracks().forEach((track) => track.stop());
  forestQrStream = null;
  const back = document.querySelector(".forest-qr-back");
  if (!back) return;
  const video = back.querySelector("video");
  video?.pause();
  if (video) video.srcObject = null;
  if (back._escapeHandler) document.removeEventListener("keydown", back._escapeHandler);
  back.remove();
  if (restoreFocus) document.querySelector(".forest-qr-button")?.focus({ preventScroll: true });
}

async function openForestQrScanner() {
  closeForestQrScanner({ restoreFocus: false });
  const session = ++forestQrSession;
  const checkInOnly = Boolean(state.team?.rosterFinalized && !state.team?.war?.allScanned);
  const back = document.createElement("div");
  back.className = "forest-qr-back";
  back._escapeHandler = (event) => {
    if (event.key === "Escape") closeForestQrScanner();
  };
  back.innerHTML = `<div class="forest-qr-modal" role="dialog" aria-modal="true" aria-labelledby="forest-qr-title">
    <button type="button" class="forest-qr-close" aria-label="QR 스캐너 닫기" onclick="closeForestQrScanner()">×</button>
    <div class="forest-qr-modal-mark" aria-hidden="true">▦</div>
    <h2 id="forest-qr-title">QR 스캔</h2>
    <p id="forest-qr-status" role="status" aria-live="polite">카메라를 준비하는 중...</p>
    <div class="forest-camera-frame">
      <video playsinline muted aria-label="QR 스캔 카메라 화면"></video>
      <div class="forest-camera-corners" aria-hidden="true"></div>
    </div>
    <div class="forest-qr-fallback">카메라 사용이 어렵다면 휴대폰 기본 카메라로 ${checkInOnly ? "THE WAR" : "미션"} QR을 스캔하세요.</div>
  </div>`;
  back.addEventListener("click", (event) => {
    if (event.target === back) closeForestQrScanner();
  });
  document.addEventListener("keydown", back._escapeHandler);
  document.body.appendChild(back);
  back.querySelector(".forest-qr-close")?.focus({ preventScroll: true });

  const status = back.querySelector("#forest-qr-status");
  const video = back.querySelector("video");
  if (!window.isSecureContext || !("BarcodeDetector" in window) || !navigator.mediaDevices?.getUserMedia) {
    back.classList.add("is-fallback");
    status.textContent = "이 기기에서는 기본 카메라 앱을 이용해주세요.";
    return;
  }

  let pendingStream = null;
  try {
    if (typeof BarcodeDetector.getSupportedFormats === "function") {
      const formats = await BarcodeDetector.getSupportedFormats();
      if (!formats.includes("qr_code")) throw new Error("qr_code_not_supported");
      if (session !== forestQrSession || !document.body.contains(back)) return;
    }
    const detector = new BarcodeDetector({ formats: ["qr_code"] });
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    pendingStream = stream;
    if (session !== forestQrSession || !document.body.contains(back)) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    forestQrStream = stream;
    video.srcObject = stream;
    await video.play();
    status.textContent = "QR을 사각형 안에 맞춰주세요.";
    const scan = async () => {
      if (session !== forestQrSession || !document.body.contains(back)) return;
      try {
        const codes = await detector.detect(video);
        if (session !== forestQrSession || !document.body.contains(back)) return;
        const rawValue = codes[0]?.rawValue || "";
        if (rawValue) {
          const destination = forestQrRoute(rawValue);
          if (destination) {
            closeForestQrScanner({ restoreFocus: false });
            nav(destination);
            return;
          }
          status.textContent = checkInOnly ? "THE WAR 시작 QR을 스캔해주세요." : "이 앱에서 사용하는 QR이 아닙니다.";
        }
      } catch {}
      if (session !== forestQrSession || !document.body.contains(back)) return;
      forestQrTimer = window.setTimeout(scan, 350);
    };
    scan();
  } catch {
    pendingStream?.getTracks().forEach((track) => track.stop());
    if (forestQrStream === pendingStream) forestQrStream = null;
    if (video) video.srcObject = null;
    back.classList.add("is-fallback");
    status.textContent = "카메라 권한을 허용하거나 기본 카메라 앱을 이용해주세요.";
  }
}

window.addEventListener("pagehide", () => closeForestQrScanner({ restoreFocus: false }));
document.addEventListener("visibilitychange", () => {
  if (document.hidden) closeForestQrScanner({ restoreFocus: false });
});

function renderWarLocked() {
  const lockedPath = route().path;
  document.body.classList.add("player-mode", "forest-mode");
  app.innerHTML = `<div class="student-page challenge-page war-locked-page">
    ${topbar({ back: true, brand: "THE WAR" })}
    <section class="war-locked-card" aria-labelledby="war-locked-title">
      <img class="war-locked-art" src="/assets/ui/trial-forest-hero.webp" alt="마지막 날을 기다리는 THE WAR">
      <div class="war-locked-runes" aria-hidden="true"><span>✦</span><span>◆</span><span>✦</span></div>
      <div class="war-locked-content">
        <span class="war-locked-kicker">THE WAR · SEALED</span>
        <h1 id="war-locked-title">THE WAR<br>영적 전쟁이 시작됩니다</h1>
        <p>마지막 날, 모든 조원이 함께 준비를 마치고 영적 전쟁에 맞서세요.</p>
        <div class="war-locked-time"><small>공개 시간</small><strong>${escapeHtml(warOpenTimeText())}</strong><span>그때까지 각자의 장비를 준비하세요</span></div>
        <button type="button" onclick="nav('/party')"><span aria-hidden="true">⚔</span><strong>조 준비 확인하기</strong><i aria-hidden="true">➜</i></button>
      </div>
    </section>
  </div>`;
  const refreshLockState = async (isCurrent) => {
    const playerId = state.me?.id;
    if (!playerId) return;
    try {
      const payload = await api("state", { playerId });
      if (!isCurrent() || route().path !== lockedPath || state.me?.id !== playerId) return;
      applyWarSchedule(payload);
      if (payload.me) setMe(payload.me);
      state.team = payload.team || state.team;
      if (state.warOpen) render();
    } catch {}
  };
  startPoll(refreshLockState, 30000);
  const generation = state.pollGeneration;
  const opensAtMs = Date.parse(state.warOpensAt || "");
  const unlockDelay = opensAtMs - Date.now();
  if (Number.isFinite(opensAtMs) && unlockDelay >= 0 && unlockDelay <= 2147483000) {
    state.warUnlockTimer = window.setTimeout(() => {
      state.warUnlockTimer = null;
      refreshLockState(() => state.pollGeneration === generation);
    }, unlockDelay + 250);
  }
}

function warRoleAssignmentHtml(team) {
  const war = team?.war || {};
  const assignments = new Map((war.assignments || []).map((assignment) => [assignment.armor, assignment]));
  const myRoleCount = Number(war.myRoleCount || 0);
  const assignedCount = Number(war.assignedCount || 0);
  return `<section class="forest-panel war-role-briefing war-role-assignment" aria-labelledby="war-role-title">
    <div class="war-role-heading">
      <div><span>ROLE ASSIGNMENT · 6</span><h2 id="war-role-title">가장 자신 있는 파트를 맡으세요</h2></div>
      <p>모든 조원이 1개씩 맡고, 4~5명 조는 필요한 사람이 최대 2개까지 맡을 수 있어요.</p>
    </div>
    <div class="war-role-progress" aria-label="역할 배분 현황">
      <span>내 담당 <strong>${myRoleCount}<small>/2</small></strong></span>
      <span>전체 배분 <strong>${assignedCount}<small>/6</small></strong></span>
    </div>
    <div class="war-role-grid">${state.armor.map((armor, index) => {
      const profile = roleMissionProfile(armor.code);
      const assignment = assignments.get(armor.code);
      const isMine = assignment?.playerId === state.me?.id;
      const isTaken = Boolean(assignment?.playerId && !isMine);
      const atLimit = !isMine && !isTaken && myRoleCount >= 2;
      const actionLabel = isMine ? "담당 해제" : isTaken ? `${assignment.playerName} 담당` : atLimit ? "최대 2개 선택" : "내가 담당";
      return `<article class="war-role-card role-${armor.code} ${isMine ? "is-mine" : ""} ${isTaken ? "is-assigned" : ""}">
        <div class="war-role-card-top"><span>0${index + 1}</span><img src="${armor.icon}" alt=""></div>
        <div class="war-role-name"><small>${escapeHtml(profile.stat)}</small><h3>${escapeHtml(armor.warRole || profile.stat)}</h3></div>
        <strong class="war-role-equipment">${escapeHtml(armor.name)}</strong>
        <p>${escapeHtml(profile.recommendation)}</p>
        <div class="war-role-tags"><span>${escapeHtml(profile.style)}</span><em>${isMine ? "내 담당 파트" : assignment?.playerName ? `${escapeHtml(assignment.playerName)} 담당` : "선택 가능"}</em></div>
        <button type="button" class="war-role-claim-button" onclick="toggleWarRole('${armor.code}')" ${isTaken || atLimit || state.warRoleInFlight ? "disabled" : ""}>${escapeHtml(actionLabel)}</button>
      </article>`;
    }).join("")}</div>
    <div class="war-role-team-status">${(war.members || []).map((member) => {
      const memberAssignments = (war.assignments || []).filter((assignment) => assignment.playerId === member.id);
      return `<div class="${member.id === state.me?.id ? "is-me" : ""}"><span>${escapeHtml(member.name)}</span><strong>${memberAssignments.length ? memberAssignments.map((assignment) => escapeHtml(assignment.armorName)).join(" · ") : "선택 중"}</strong><em>${memberAssignments.length}/2</em></div>`;
    }).join("")}</div>
    <div class="war-role-tip ${war.rolesComplete ? "is-complete" : ""}"><span aria-hidden="true">${war.rolesComplete ? "✓" : "✦"}</span><p><strong>${war.rolesComplete ? "파트 배분 완료!" : "6개 파트를 모두 나눠 맡아주세요."}</strong> ${war.rolesComplete ? "이제 맡은 역할로 미션에 도전하세요." : "다른 조원이 선택하면 모든 화면에 바로 반영됩니다."}</p></div>
  </section>`;
}

function teamMembersHtml(team) {
  return `<div class="team-member-grid">${(team?.members || []).map((member) => {
    const assignedNames = (team?.war?.assignments || []).filter((assignment) => assignment.playerId === member.id).map((assignment) => assignment.armorName);
    return `<div class="team-member-card ${member.id === state.me?.id ? "is-me" : ""}">
      <div class="team-member-avatar">${escapeHtml(member.name.slice(0, 1))}</div>
      <div><strong>${escapeHtml(member.name)}</strong><span>${member.isLeader ? "조장 · " : ""}${assignedNames.length ? assignedNames.map(escapeHtml).join(" · ") : "파트 선택 중"}</span></div>
      <em>${assignedNames.length}/2</em>
    </div>`;
  }).join("")}</div>`;
}

function teamMissionGridHtml(team) {
  return `<div class="forest-test-grid team-test-grid">${state.armor.map((armor, index) => {
    const profile = roleMissionProfile(armor.code);
    const assignment = team?.war?.assignments?.find((item) => item.armor === armor?.code);
    const ready = Boolean(assignment?.playerId);
    return `<div class="forest-test-card ${ready ? "is-ready" : "is-preparing"}">
      <span class="forest-test-icon" aria-hidden="true">${profile.icon}</span>
      <span class="forest-test-number">0${index + 1}</span>
      <strong>${escapeHtml(armor.warRole || profile.stat)}</strong>
      <b class="forest-test-stat">${escapeHtml(profile.stat)} · ${escapeHtml(profile.style)}</b>
      <small>${escapeHtml(armor?.name || "")} · ${escapeHtml(profile.demon)}</small>
      <em>${ready ? `${escapeHtml(assignment.playerName)} 담당` : "담당 미정"}</em>
    </div>`;
  }).join("")}</div>`;
}

function teamWarScanRowsHtml(team) {
  return (team?.war?.members || []).map((member) => `<div class="war-scan-member ${member.scanned ? "is-scanned" : ""} ${member.id === state.me?.id ? "is-me" : ""}">
    <span>${escapeHtml(member.name.slice(0, 1))}</span>
    <strong>${escapeHtml(member.name)}${member.id === state.me?.id ? " · 나" : ""}</strong>
    <em>${member.scanned ? "스캔 완료 ✓" : "기다리는 중"}</em>
  </div>`).join("");
}

function showTeamWarReveal(team) {
  clearPoll();
  if (state.teamMergeTimer) window.clearTimeout(state.teamMergeTimer);
  const snapshot = team?.war?.assembly;
  const partyPower = Number(snapshot?.character?.equipmentPower ?? team?.character?.equipmentPower ?? 0);
  app.innerHTML = `<div class="student-page team-merge-page">
    ${topbar({ back: true, brand: "THE WAR" })}
    <section class="team-merge-stage" aria-live="polite">
      <img class="team-merge-vision" src="/assets/ui/team-merge-vision-v1.png" alt="빛으로 완성되는 전신갑주">
      <div class="team-merge-vignette" aria-hidden="true"></div>
      <div class="team-merge-seal" aria-hidden="true"></div>
      <div class="team-merge-orbit">${state.armor.map((armor, index) => `<span style="--orbit-index:${index}"><img src="${armor.icon}" alt=""></span>`).join("")}</div>
      <div class="team-merge-flash" aria-hidden="true"></div>
      <div class="team-merge-sparks" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>
      <div class="team-merge-copy">
        <div class="team-merge-kicker">${escapeHtml(team?.name || state.me.team)} · 전원 스캔 완료</div>
        <div class="team-merge-phase"><span>01 장비 집결</span><span>02 빛의 융합</span><span>03 전신갑주 완성</span></div>
        <h1>모든 장비 계산 완료!</h1>
        <p>조의 힘이 깨어났습니다. 이제 각자 가장 자신 있는 파트를 맡으세요.</p>
        <div class="team-merge-power"><small>PARTY POWER</small><strong>${formatNumber(partyPower)}</strong></div>
        <div class="team-merge-progress"><span></span></div>
        <button id="team-merge-confirm" class="team-merge-confirm" type="button" onclick="finishTeamWarReveal()" disabled>장비 계산 중...</button>
      </div>
    </section>
  </div>`;
  playGameSound("legendary");
  state.teamMergeTimer = window.setTimeout(() => {
    state.teamMergeTimer = null;
    const confirm = document.getElementById("team-merge-confirm");
    if (!confirm) return;
    confirm.disabled = false;
    confirm.textContent = "확인 · 역할 배정으로";
  }, 5900);
}

function finishTeamWarReveal() {
  const confirm = document.getElementById("team-merge-confirm");
  if (confirm?.disabled || state.teamMergeTimer) return;
  markTeamRevealSeen();
  nav("/forest");
}

function startTeamWarScanPoll() {
  startPoll(async (isCurrent) => {
    const playerId = state.me?.id;
    if (route().path !== "/team/merge" || !playerId) return;
    try {
      const payload = await api("team-state", { playerId });
      if (!isCurrent() || route().path !== "/team/merge" || state.me?.id !== playerId) return;
      state.team = payload.team;
      state.me = { ...state.me, teamMemberCount: payload.team.memberCount || 0 };
      if (payload.team?.war?.allScanned) {
        showTeamWarReveal(payload.team);
        return;
      }
      const count = document.querySelector(".war-scan-count strong");
      const rows = document.querySelector(".war-scan-members");
      if (count) count.textContent = `${payload.team?.war?.scannedCount || 0}/${payload.team?.war?.requiredCount || payload.team?.memberCount || 0}`;
      if (rows) rows.innerHTML = teamWarScanRowsHtml(payload.team);
    } catch {
      setServerConnection(false);
    }
  }, 3000);
}

async function renderTeamMerge() {
  document.body.classList.add("player-mode", "forest-mode");
  if (!state.me) return renderCreate();
  if (!state.warOpen) return renderWarLocked();
  const viewContext = captureViewContext();
  const activeRenderEpoch = state.renderEpoch;
  const isMergeViewCurrent = () => isViewContextCurrent(viewContext) && activeRenderEpoch === state.renderEpoch;
  const playerId = state.me.id;
  if (state.teamMergeTimer) window.clearTimeout(state.teamMergeTimer);
  app.innerHTML = `<div class="student-page team-merge-page">${topbar({ back: true, brand: "THE WAR" })}<div class="loading">조 스캔 상태 확인 중...</div></div>`;
  try {
    const current = await api("team-state", { playerId });
    if (!isMergeViewCurrent()) return;
    state.team = current.team;
    state.me = { ...state.me, teamMemberCount: current.team.memberCount || 0 };
    if (!current.team.rosterFinalized) {
      app.innerHTML = `<div class="student-page team-merge-page">
        ${topbar({ back: true, brand: "THE WAR" })}
        <section class="team-merge-role-block">
          <div class="team-merge-gate-mark" aria-hidden="true">⚑</div>
          <span>조 준비 전</span><h1>조 결성부터 완료해주세요</h1>
          <p>조원 4~6명이 참가한 뒤 조장이 명단을 확정해주세요.</p>
          <strong>${current.team.memberCount || 0}명 참가</strong>
          <button type="button" onclick="nav('/team/roles')">조 명단으로 <span>➜</span></button>
        </section>
      </div>`;
      return;
    }

    const payload = await api("team-war-scan", { playerId });
    if (!isMergeViewCurrent()) return;
    state.team = payload.team;
    applyWarSchedule(payload);
    if (payload.me) setMe(payload.me);
    if (payload.team?.war?.allScanned) {
      showTeamWarReveal(payload.team);
      return;
    }

    const war = payload.team?.war || {};
    app.innerHTML = `<div class="student-page team-merge-page war-scan-waiting-page">
      ${topbar({ back: true, brand: "THE WAR" })}
      <section class="war-scan-waiting" aria-live="polite">
        <div class="war-scan-radar" aria-hidden="true"><span>▦</span></div>
        <small>PARTY CHECK-IN</small>
        <h1>조원 스캔 대기 중</h1>
        <p>모든 조원이 같은 QR을 스캔하면 다음 단계가 자동으로 열립니다.</p>
        <div class="war-scan-count"><span>스캔 완료</span><strong>${war.scannedCount || 0}/${war.requiredCount || payload.team.memberCount || 0}</strong></div>
        <div class="war-scan-members">${teamWarScanRowsHtml(payload.team)}</div>
        <div class="war-scan-note"><span aria-hidden="true">✦</span><p>이 화면을 그대로 열어두세요.<br>마지막 조원이 스캔하면 함께 시작됩니다.</p></div>
      </section>
    </div>`;
    startTeamWarScanPoll();
  } catch (error) {
    if (!isMergeViewCurrent()) return;
    if (error.code === "THE_WAR_LOCKED") {
      state.warOpen = false;
      state.warOpensAt = error.warOpensAt || state.warOpensAt;
      renderWarLocked();
      return;
    }
    app.innerHTML = `<div class="student-page team-merge-page">${topbar({ back: true, brand: "THE WAR" })}<section class="team-merge-role-block"><div class="team-merge-gate-mark" aria-hidden="true">!</div><h1>스캔을 확인하지 못했습니다</h1><p>${escapeHtml(error.message)}</p><button type="button" onclick="nav('/forest')">THE WAR로 돌아가기</button></section></div>`;
    toast(error.message, "error");
  }
}

function teamWarAssignmentSignature(team) {
  return JSON.stringify({
    phase: team?.war?.phase || "",
    scannedCount: team?.war?.scannedCount || 0,
    assignments: (team?.war?.assignments || []).map((assignment) => [assignment.armor, assignment.playerId]),
    rolesComplete: Boolean(team?.war?.rolesComplete)
  });
}

function startTeamWarAssignmentPoll() {
  state.teamPollSignature = teamWarAssignmentSignature(state.team);
  startPoll(async (isCurrent) => {
    const playerId = state.me?.id;
    if (route().path !== "/forest" || !playerId) return;
    try {
      const payload = await api("team-state", { playerId });
      if (!isCurrent() || route().path !== "/forest" || state.me?.id !== playerId) return;
      const nextSignature = teamWarAssignmentSignature(payload.team);
      state.team = payload.team;
      state.me = { ...state.me, teamMemberCount: payload.team.memberCount || 0 };
      if (nextSignature !== state.teamPollSignature) renderForest();
    } catch {
      setServerConnection(false);
    }
  }, 4000);
}

async function toggleWarRole(armorCode) {
  if (!state.me || state.warRoleInFlight) return;
  const viewContext = captureViewContext();
  const playerId = state.me.id;
  const current = state.team?.war?.assignments?.find((assignment) => assignment.armor === armorCode);
  const selected = current?.playerId !== state.me.id;
  state.warRoleInFlight = true;
  try {
    const payload = await api("team-war-role", { playerId, armorCode, selected });
    if (!isViewContextCurrent(viewContext)) return;
    state.team = payload.team;
    applyWarSchedule(payload);
    if (payload.me) setMe(payload.me);
    playGameSound(payload.team?.war?.rolesComplete ? "success" : "role");
  } catch (error) {
    if (isViewContextCurrent(viewContext)) toast(error.message, "error");
  } finally {
    state.warRoleInFlight = false;
    if (isViewContextCurrent(viewContext)) renderForest();
  }
}

function renderForest() {
  document.body.classList.add("player-mode", "forest-mode");
  if (!state.me) return renderCreate();
  if (!state.warOpen) return renderWarLocked();
  const team = state.team;
  if (!team?.rosterFinalized) {
    app.innerHTML = `<div class="student-page challenge-page forest-entry-page team-merge-gate-page">
      ${topbar({ back: true, brand: "THE WAR" })}
      <section class="forest-hero-card forest-war-intro" aria-labelledby="forest-page-title">
        <img src="/assets/ui/trial-forest-hero.webp" alt="THE WAR 영적 전쟁">
        <div class="forest-hero-copy">
          <span>THE WAR · OPEN</span>
          <h1 id="forest-page-title">THE WAR<br>영적 전쟁이 시작됩니다</h1>
          <p>먼저 우리 조의 명단을 완성하세요.</p>
        </div>
      </section>
      <section class="forest-panel team-merge-gate-card">
        <div class="team-merge-gate-mark" aria-hidden="true">⚑</div>
        <h2>조 결성이 먼저예요</h2><p>조원 4~6명이 참가한 뒤 조장이 명단을 확정해주세요.</p>
        <div class="team-ready-summary"><strong>${team?.memberCount || 0}명 참가</strong><span>최소 4명 · 최대 6명</span></div>
        <button type="button" class="forest-qr-button" onclick="nav('/team/roles')"><span class="forest-qr-button-icon" aria-hidden="true">⚔</span><span>조 명단으로</span><span aria-hidden="true">➜</span></button>
      </section>
    </div>`;
    return;
  }

  const war = team.war || {};
  if (!war.allScanned) {
    app.innerHTML = `<div class="student-page challenge-page forest-entry-page team-merge-gate-page war-scan-entry-page">
      ${topbar({ back: true, brand: "THE WAR" })}
      <section class="forest-hero-card" aria-labelledby="forest-page-title">
        <img src="/assets/ui/trial-forest-hero.webp" alt="THE WAR 영적 전쟁">
        <div class="forest-hero-copy">
          <span>THE WAR · OPEN</span>
          <h1 id="forest-page-title">THE WAR<br>영적 전쟁이 시작됩니다</h1>
          <p>모든 조원이 준비됐다면 함께 QR을 스캔하세요.</p>
        </div>
      </section>
      <section class="forest-panel team-merge-gate-card war-scan-entry-card">
        <div class="team-merge-gate-mark" aria-hidden="true">▦</div>
        <h2>조원 모두 스캔해주세요</h2>
        <p>각자의 휴대폰으로 같은 QR을 스캔하면 다음 단계가 열립니다.</p>
        <button type="button" class="forest-qr-button" onclick="openForestQrScanner()">
          <span class="forest-qr-button-icon" aria-hidden="true">▦</span><span>QR 스캔하기</span><span aria-hidden="true">➜</span>
        </button>
      </section>
    </div>`;
    return;
  }

  if (!teamRevealSeen()) {
    nav("/team/merge");
    return;
  }

  const revealedCharacter = war.assembly?.character || team.character;
  const partyPower = Number(revealedCharacter?.equipmentPower || 0);
  const rolesComplete = Boolean(war.rolesComplete);
  app.innerHTML = `<div class="student-page challenge-page forest-entry-page team-forest-page">
    ${topbar({ back: true, brand: "THE WAR" })}
    <section class="forest-hero-card team-forest-hero" aria-labelledby="forest-page-title">
      <img src="/assets/ui/trial-forest-hero.webp" alt="THE WAR 출정 화면">
      <div class="forest-hero-copy">
        <span>ALL MEMBERS READY · ${team?.memberCount || 1}명</span>
        <h1 id="forest-page-title">파트를 정하고 출정하세요</h1>
        <p>조 전투력 ${formatNumber(partyPower)} · 한 사람당 1~2개 파트</p>
      </div>
    </section>

    ${warRoleAssignmentHtml(team)}

    ${rolesComplete ? `<section class="forest-panel team-character-panel">
      <div class="forest-panel-heading"><div><span class="forest-step">02</span><h2>조 장비 계산 결과</h2></div><strong>${formatNumber(partyPower)}</strong></div>
      ${revealedCharacter ? equipmentBoardHtml(revealedCharacter, { interactive: false, teamMode: true }) : ""}
    </section>

    <section class="forest-panel team-roster-panel">
      <div class="forest-panel-heading"><div><span class="forest-step">03</span><h2>출정 조원</h2></div><strong>${team?.memberCount || 1}명</strong></div>
      ${teamMembersHtml(team)}
    </section>

    <section class="forest-panel forest-themes-panel">
      <div class="forest-panel-heading"><div><span class="forest-step">04</span><h2>여섯 가지 영적 전투</h2></div><strong>6</strong></div>
      ${teamMissionGridHtml(team)}
    </section>

    <section class="forest-scan-panel">
      <div class="forest-scan-glow" aria-hidden="true">✦</div>
      <span class="forest-step">05</span><h2>미션 QR 스캔</h2><p>각자 맡은 파트의 역할로 여섯 미션에 도전하세요.</p>
      <button type="button" class="forest-qr-button" onclick="openForestQrScanner()">
        <span class="forest-qr-button-icon" aria-hidden="true">▦</span><span>미션 QR 스캔하기</span><span aria-hidden="true">➜</span>
      </button>
    </section>` : ""}
  </div>`;
  startTeamWarAssignmentPoll();
}

function startMissionTrial(code) {
  state.startedMissionCode = code;
  renderQr();
}

function renderMissionQr(reward, code, claimed, pageTopbar) {
  const armor = armorByCode(reward.armor);
  const profile = roleMissionProfile(reward.armor);
  const assignment = state.team?.war?.assignments?.find((item) => item.armor === reward.armor);
  const representativeName = assignment?.playerName || "담당 조원";
  const started = state.startedMissionCode === code;
  const missionIndex = Math.max(0, state.armor.findIndex((item) => item.code === reward.armor)) + 1;
  const statusHtml = claimed
    ? `<div class="mission-encounter-result is-complete"><span>✓</span><div><strong>시험 완료!</strong><small>보상 획득까지 완료했습니다.</small></div></div>`
    : started
      ? `<div class="mission-encounter-result is-active"><span>⚔</span><div><strong>미션 진행 중</strong><small>진행자의 안내에 따라 시험을 수행하세요.</small></div></div>`
      : `<div class="mission-encounter-result"><span>!</span><div><strong>대표 준비</strong><small>${escapeHtml(representativeName)}님이 앞으로 나와주세요.</small></div></div>`;
  const actionHtml = claimed
    ? `<button type="button" class="mission-encounter-button is-complete" onclick="nav('/forest')">THE WAR로 돌아가기</button>`
    : started
      ? `<button type="button" class="mission-encounter-button reward" onclick="claimQrReward('${escapeHtml(code)}', { auto: false })">미션 완료 · 보상 받기 <span>+1뽑</span></button><p class="mission-encounter-caution">진행자가 성공을 확인한 뒤 눌러주세요.</p>`
      : `<button type="button" class="mission-encounter-button" onclick="startMissionTrial('${escapeHtml(code)}')">미션 시작 <span>➜</span></button>`;
  app.innerHTML = `<div class="student-page reward-page mission-encounter-page">
    ${pageTopbar}
    <section class="mission-encounter-hero">
      <span>THE WAR MISSION · 0${missionIndex}</span>
      <div class="mission-demon-mark" aria-hidden="true">${profile.icon}</div>
      <h1>${escapeHtml(profile.demon)} 출현!</h1>
      <p><strong>${escapeHtml(profile.stat)}</strong>으로 맞서는 시험입니다.</p>
    </section>
    <section class="mission-representative-card">
      <img src="${armor.icon}" alt="">
      <div><span>${escapeHtml(armor.name)}</span><strong>${escapeHtml(armor.warRole || profile.stat)} · ${escapeHtml(representativeName)}</strong><small>이 파트를 맡은 대표가 도전합니다</small></div>
      <em>${escapeHtml(profile.stat)}</em>
    </section>
    <section class="mission-brief-card">
      <div class="mission-brief-heading"><span>MISSION</span><strong>${escapeHtml(profile.style)}</strong></div>
      <p>${escapeHtml(reward.description || profile.mission)}</p>
      ${statusHtml}
      ${actionHtml}
    </section>
  </div>`;
}

function renderQr() {
  document.body.classList.add("player-mode");
  const code = qrCodeForRoute();
  const reward = qrRewardByCode(code);
  const repeatable = Boolean(reward?.repeatable);
  const claimed = !repeatable && state.claimedQrCodes.includes(code);
  const pageTopbar = topbar({ back: true });
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
  if (!state.warOpen && ["mission", "boss"].includes(reward.type)) {
    renderWarLocked();
    return;
  }
  if (["mission", "boss"].includes(reward.type) && (!state.team?.war?.allScanned || !state.team?.war?.rolesComplete)) {
    nav("/forest");
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
  if (reward.type === "mission") {
    renderMissionQr(reward, code, claimed, pageTopbar);
    return;
  }
  if (reward.type === "draw") {
    const drawCount = Math.max(1, Math.min(3, Number(reward.reward?.draws || 1)));
    app.innerHTML = `<div class="student-page reward-page equipment-draw-page">
      ${pageTopbar}
      <section class="student-panel equipment-draw-panel" aria-label="장비 뽑기">
        <h1>장비 뽑기</h1>
        <div class="equipment-draw-buttons">
          <button type="button" class="btn pink equipment-draw-button" data-draw-count="${drawCount}" onclick="claimQrReward('${escapeHtml(code)}', { auto: true })">장비 ${drawCount}회 뽑기</button>
        </div>
      </section>
    </div>`;
    return;
  }
  app.innerHTML = `<div class="student-page reward-page">
    ${pageTopbar}
    <section class="student-panel reward-main-panel">
      <div class="student-page-heading">
        <span class="student-heading-icon" aria-hidden="true">✦</span>
        <div><h1>QR 보상</h1><p>${repeatable ? "스캔할 때마다 뽑기 가능" : claimed ? "획득 완료" : "새 보상을 확인하세요"}</p></div>
      </div>
      <div class="qr-reward-card ${claimed ? "claimed" : ""}">
        <div class="qr-type">${escapeHtml(reward.type)}</div>
        <div class="qr-title">${escapeHtml(reward.title)}</div>
        <div class="row-sub">${escapeHtml(reward.description)}</div>
        <div class="qr-prize">${escapeHtml(qrRewardText(reward))}</div>
        <div class="qr-status">${repeatable ? "반복 뽑기 가능" : claimed ? "이미 획득 완료" : "아직 받지 않음"}</div>
      </div>
      <button class="btn ${claimed ? "cream" : "pink"} mt-12" onclick="claimQrReward('${escapeHtml(code)}', { auto: ${repeatable ? "true" : "false"} })">${repeatable ? "장비 뽑기 다시 시도" : claimed ? "획득 여부 다시 확인" : "보상 받기"}</button>
    </section>
    <section class="student-panel reward-inventory-panel">
      <div class="student-section-heading"><h2>내 장비</h2><span>보유 현황</span></div>
      <div class="inventory-simple-list inline-inventory-list">${inventoryListHtml(state.me)}</div>
    </section>
  </div>`;
}

function renderAdminLogin() {
  app.innerHTML = `${topbar({ back: true })}
    <div class="panel pin">
      <div class="section-label pink">교사용 관리</div>
      <div class="field"><label>교사 PIN</label><input id="admin-pin" type="password" placeholder="서버 실행 때 정한 PIN" value="${escapeHtml(safeSessionStorage.getItem(STORAGE_PIN) || "")}"></div>
      <div class="field-hint">현장/LAN·배포에서는 운영자가 설정한 값입니다. 이 PC의 로컬 테스트는 비워도 됩니다.</div>
      <button class="btn pink mt-12" onclick="loadAdmin()">관리자 화면 열기</button>
    </div>`;
}

async function loadAdmin() {
  const viewContext = captureViewContext();
  const pin = document.getElementById("admin-pin")?.value ?? safeSessionStorage.getItem(STORAGE_PIN) ?? "";
  safeSessionStorage.setItem(STORAGE_PIN, pin);
  try {
    const payload = await api("admin", { pin });
    if (!isViewContextCurrent(viewContext)) return;
    renderAdmin(payload);
  } catch (error) {
    if (isViewContextCurrent(viewContext)) toast(error.message, "error");
  }
}

async function resetBoothAdmin(boothId) {
  if (state.adminActionInFlight) return;
  const viewContext = captureViewContext();
  state.adminActionInFlight = true;
  try {
    await api("exchange-reset", { boothId, pin: safeSessionStorage.getItem(STORAGE_PIN) || "" });
    if (!isViewContextCurrent(viewContext)) return;
    toast(`교환소 ${boothId} 초기화 완료`);
    await loadAdmin();
  } catch (error) {
    if (isViewContextCurrent(viewContext)) toast(error.message, "error");
  } finally {
    state.adminActionInFlight = false;
  }
}

async function adminReopenTeam(teamKey) {
  if (state.adminActionInFlight) return;
  const team = state.adminTeams.find((item) => item.key === teamKey);
  if (!team?.canEmergencyReopen) {
    return toast("THE WAR QR 스캔이 시작된 조는 명단을 다시 열 수 없습니다.", "error");
  }
  if (!window.confirm(`${team.name}의 확정 명단을 비상 재개방할까요?\n\n재개방 후 조원을 수정하고 다시 확정해야 합니다. 아직 THE WAR QR 스캔 전인 조만 가능합니다.`)) return;
  const viewContext = captureViewContext();
  state.adminActionInFlight = true;
  try {
    await api("admin-reopen-team", { pin: safeSessionStorage.getItem(STORAGE_PIN) || "", teamKey });
    if (!isViewContextCurrent(viewContext)) return;
    toast(`${team.name} 명단을 비상 재개방했습니다.`);
    await loadAdmin();
  } catch (error) {
    if (isViewContextCurrent(viewContext)) toast(error.message, "error");
  } finally {
    state.adminActionInFlight = false;
  }
}

async function adminAdjustItem() {
  if (state.adminActionInFlight) return;
  const viewContext = captureViewContext();
  const playerId = document.getElementById("admin-player").value;
  const armor = document.getElementById("admin-armor").value;
  const grade = document.getElementById("admin-grade").value;
  const delta = Number(document.getElementById("admin-delta").value || 0);
  state.adminActionInFlight = true;
  try {
    await api("admin-adjust-item", { pin: safeSessionStorage.getItem(STORAGE_PIN) || "", playerId, armor, grade, delta });
    if (!isViewContextCurrent(viewContext)) return;
    toast("장비 수정 완료");
    await loadAdmin();
  } catch (error) {
    if (isViewContextCurrent(viewContext)) toast(error.message, "error");
  } finally {
    state.adminActionInFlight = false;
  }
}

function syncAdminPlayerEditor() {
  const playerId = document.getElementById("admin-profile-player")?.value;
  const player = state.adminPlayers.find((item) => item.id === playerId);
  const nameInput = document.getElementById("admin-player-name");
  const teamInput = document.getElementById("admin-player-team");
  if (nameInput) nameInput.value = player?.name || "";
  if (teamInput) teamInput.value = player?.team || "";
}

async function adminUpdatePlayerIdentity() {
  if (state.adminActionInFlight) return;
  const viewContext = captureViewContext();
  const playerId = document.getElementById("admin-profile-player")?.value;
  const name = document.getElementById("admin-player-name")?.value.trim();
  const team = document.getElementById("admin-player-team")?.value.trim();
  if (!playerId || !name || !team) return toast("학생, 이름, 조 이름을 모두 확인해주세요.", "error");
  state.adminActionInFlight = true;
  try {
    await api("admin-update-player", { pin: safeSessionStorage.getItem(STORAGE_PIN) || "", playerId, name, team });
    if (!isViewContextCurrent(viewContext)) return;
    toast("학생 이름과 조를 수정했습니다.");
    await loadAdmin();
  } catch (error) {
    if (isViewContextCurrent(viewContext)) toast(error.message, "error");
  } finally {
    state.adminActionInFlight = false;
  }
}

function renderAdmin(payload) {
  state.armor = payload.armor || state.armor;
  state.qrRewards = payload.qrRewards || state.qrRewards;
  state.adminPlayers = payload.players || [];
  state.adminTeams = payload.teams || [];
  const playerOptions = payload.players.map((player) => `<option value="${player.id}">${escapeHtml(player.name)} ${player.team ? `(${escapeHtml(player.team)})` : ""}</option>`).join("");
  const firstPlayer = payload.players[0] || { name: "", team: "" };
  const armorOptions = state.armor.map((armor) => `<option value="${armor.code}">${escapeHtml(armor.name)}</option>`).join("");
  const adminRanking = rankingHtml(payload.ranking.length || 30, payload.ranking);
  const emergencyTeamRows = state.adminTeams.map((team) => {
    const members = (team.memberNames || []).map(escapeHtml).join(", ");
    const status = team.canEmergencyReopen ? "THE WAR QR 스캔 전 · 재개방 가능" : "THE WAR QR 스캔 시작 · 영구 잠금";
    return `<div class="booth-row admin-finalized-team">
      <div class="rank-num">♟</div>
      <div><div class="row-title">${escapeHtml(team.name)} <span class="tag">${Number(team.memberCount || 0)}명</span></div><div class="row-sub">조장: ${escapeHtml(team.leaderName || "-")} · ${members} · ${status}</div></div>
      <button type="button" class="pill danger" data-team-key="${escapeHtml(team.key)}" onclick="adminReopenTeam(this.dataset.teamKey)" ${team.canEmergencyReopen ? "" : "disabled"}>비상 재개방</button>
    </div>`;
  }).join("") || `<div class="notice">확정된 조가 없습니다.</div>`;
  const baseUrl = location.origin;
  const qrLinks = [`<div class="qr-admin-link team-merge-admin-link"><strong>THE WAR 공동 체크인</strong><span>${escapeHtml(baseUrl + "/team/merge")}</span></div>`, ...(state.qrRewards || []).map((reward) => {
    const path = reward.code.startsWith("draw-")
      ? `/draw/${reward.code.replace(/^draw-/, "")}`
      : reward.code.startsWith("hidden-")
        ? `/hidden/${reward.code.replace(/^hidden-/, "")}`
        : reward.code.startsWith("mission-")
          ? `/mission/${reward.code.replace(/^mission-/, "")}`
          : reward.code === "boss-forest" ? "/boss" : `/qr/${reward.code}`;
    return `<div class="qr-admin-link"><strong>${escapeHtml(reward.title)}</strong><span>${escapeHtml(baseUrl + path)}</span></div>`;
  })].join("");
  app.innerHTML = `${topbar({ back: true })}
    <div class="panel pin">
      <div class="section-label pink">교사용 관리</div>
      <div class="booth-row"><div class="rank-num">1</div><div><div class="row-title">교환소 1</div><div class="row-sub">${escapeHtml(payload.booths[0]?.status || "empty")}</div></div><button class="pill danger" onclick="resetBoothAdmin('1')">초기화</button></div>
      <div class="booth-row"><div class="rank-num">2</div><div><div class="row-title">교환소 2</div><div class="row-sub">${escapeHtml(payload.booths[1]?.status || "empty")}</div></div><button class="pill danger" onclick="resetBoothAdmin('2')">초기화</button></div>
      <div class="notice mt-12">교환소 링크: <strong>${baseUrl}/exchange/1</strong><br><strong>${baseUrl}/exchange/2</strong></div>
      <div class="notice mt-12">학생은 이름과 조 이름만 입력합니다. 같은 이름·조는 기존 캐릭터로 자동 연결됩니다.</div>
    </div>
    <div class="panel pin">
      <div class="section-label pink">확정 조 비상 처리</div>
      <p class="field-hint">학생과 조장은 확정 명단을 취소할 수 없습니다. 조 편성 오류는 교사만 THE WAR 첫 QR 스캔 전에 재개방할 수 있습니다. 스캔이 시작된 조는 영구 잠금입니다.</p>
      ${emergencyTeamRows}
    </div>
    <div class="panel pin">
      <div class="section-label sun">학생 이름 · 조 수정</div>
      <p class="field-hint">오타나 잘못 들어온 조를 현장에서 바로 고칩니다. 확정 조는 THE WAR 첫 QR 스캔 전 비상 재개방한 뒤 수정할 수 있습니다.</p>
      <div class="admin-controls">
        <select id="admin-profile-player" onchange="syncAdminPlayerEditor()">${playerOptions}</select>
        <div class="admin-grid"><input id="admin-player-name" maxlength="20" placeholder="학생 이름" value="${escapeHtml(firstPlayer.name)}"><input id="admin-player-team" maxlength="12" placeholder="조 이름" value="${escapeHtml(firstPlayer.team)}"></div>
        <button class="btn purple" onclick="adminUpdatePlayerIdentity()">이름 · 조 수정</button>
      </div>
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
  const renderEpoch = ++state.renderEpoch;
  closeForestQrScanner({ restoreFocus: false });
  clearPoll();
  document.body.classList.remove("entry-mode", "home-mode", "player-mode", "forest-mode", "party-dashboard-mode", "event-ended-mode");
  const current = route();
  setAudioMode(current.path);
  if (state.teamMergeTimer && !(current.parts[0] === "team" && current.parts[1] === "merge")) {
    window.clearTimeout(state.teamMergeTimer);
    state.teamMergeTimer = null;
  }
  if (!state.armor.length) {
    app.innerHTML = `<div class="loading">전신갑주 불러오는 중...</div>`;
    try {
      await loadState({ quiet: true });
      if (renderEpoch !== state.renderEpoch || current.path !== route().path) return;
    } catch (error) {
      if (renderEpoch !== state.renderEpoch || current.path !== route().path) return;
      if (error.code === "EVENT_ENDED") return renderEventEnded(error.endsAt);
      app.innerHTML = `${topbar()}<div class="panel pin"><div class="section-label pink">서버 연결 실패</div><p>${escapeHtml(error.message)}</p><button class="btn pink mt-12" onclick="location.reload()">연결 다시 시도</button></div>`;
      return;
    }
  }
  if (current.parts[0] === "ranking") return renderRanking();
  if (current.parts[0] === "exchange") return renderExchange(current.parts[1] || "1");
  if (current.parts[0] === "party") return renderParty();
  if (current.parts[0] === "team" && current.parts[1] === "roles") return renderTeamRoles();
  if (current.parts[0] === "team" && current.parts[1] === "merge") return renderTeamMerge();
  if (current.parts[0] === "forest") return renderForest();
  if (["qr", "draw", "mission", "hidden", "boss"].includes(current.parts[0])) return renderQr();
  if (current.parts[0] === "admin") return renderAdminLogin();
  return renderHome();
}

window.nav = nav;
window.logout = logout;
window.closeDrawModal = closeDrawModal;
window.finishTeamWarReveal = finishTeamWarReveal;
window.closeInfoModal = closeInfoModal;
window.openSettingsMenu = openSettingsMenu;
window.closeConnectScreen = closeConnectScreen;
window.createPlayer = createPlayer;
window.updateEntryReadiness = updateEntryReadiness;
window.draw = draw;
window.selectRankingTab = selectRankingTab;
window.openPartyMemberDetail = openPartyMemberDetail;
window.finalizeTeamRoster = finalizeTeamRoster;
window.claimTeamLeader = claimTeamLeader;
window.leaveTeam = leaveTeam;
window.claimQrReward = claimQrReward;
window.toggleAudio = toggleAudio;
window.startMissionTrial = startMissionTrial;
window.openEquipmentDetail = openEquipmentDetail;
window.openInventoryModal = openInventoryModal;
window.toggleWarRole = toggleWarRole;
window.openForestQrScanner = openForestQrScanner;
window.closeForestQrScanner = closeForestQrScanner;
window.joinExchange = joinExchange;
window.saveExchangeDraft = saveExchangeDraft;
window.selectExchange = selectExchange;
window.confirmExchange = confirmExchange;
window.cancelExchange = cancelExchange;
window.loadAdmin = loadAdmin;
window.resetBoothAdmin = resetBoothAdmin;
window.adminReopenTeam = adminReopenTeam;
window.adminAdjustItem = adminAdjustItem;
window.syncAdminPlayerEditor = syncAdminPlayerEditor;
window.adminUpdatePlayerIdentity = adminUpdatePlayerIdentity;

function handleBrowserNavigation() {
  state.viewGeneration += 1;
  render();
}

window.addEventListener("hashchange", handleBrowserNavigation);
window.addEventListener("popstate", handleBrowserNavigation);
document.addEventListener("pointerdown", (event) => {
  const button = event.target.closest?.("button");
  if (!button || button.disabled || button.classList.contains("audio-control")) return;
  unlockAudio();
  playGameSound("tap");
}, { passive: true });
document.addEventListener("visibilitychange", () => {
  const context = audioRuntime.context;
  if (!context) return;
  if (document.hidden) {
    stopMusicScheduler();
    context.suspend().catch(() => {});
  } else if (audioRuntime.enabled && audioRuntime.unlocked) {
    context.resume().then(startMusicScheduler).catch(() => {});
  }
});

/* =====================================================================
   [TEST BUILD ONLY] 개발용 테스트 패널
   원본(current-retreat)에는 없는, 테스트 버전 전용 플로팅 도구.
   로그인·솔로 조확정·뽑기·QR보상·THE WAR입장·장비합치기·미션·이동을
   물리 QR/다인원 없이 혼자 실행할 수 있게 해준다.
   ===================================================================== */
function mountTestPanel() {
  if (document.getElementById("test-panel")) return;
  const ARMOR_CODES = ["belt", "breastplate", "shoes", "shield", "helmet", "sword"];
  const MISSIONS = [
    ["mission-judgment", "판단·허리띠"], ["mission-endurance", "인내·호심경"], ["mission-speed", "스피드·신발"],
    ["mission-teamwork", "협동·방패"], ["mission-intellect", "지력·투구"], ["mission-power", "힘·검"]
  ];

  const style = document.createElement("style");
  style.textContent = `
    #test-panel{position:fixed;right:10px;bottom:10px;z-index:99999;width:270px;max-height:82vh;
      display:flex;flex-direction:column;font-family:system-ui,sans-serif;color:#eafff6;
      background:rgba(10,20,26,.96);border:2px solid #35c08a;border-radius:14px;
      box-shadow:0 10px 30px rgba(0,0,0,.5);overflow:hidden;font-size:12px}
    #test-panel .tp-head{display:flex;align-items:center;justify-content:space-between;gap:6px;
      padding:8px 10px;background:linear-gradient(90deg,#187a55,#0d3a2a);cursor:pointer;font-weight:800}
    #test-panel .tp-body{padding:8px 9px 11px;overflow-y:auto}
    #test-panel.collapsed .tp-body{display:none}
    #test-panel .tp-status{background:#06110e;border:1px solid #2b7;border-radius:8px;padding:6px 8px;margin-bottom:8px;line-height:1.5;font-size:11px}
    #test-panel h4{margin:9px 0 5px;font-size:11px;color:#7fe3bd;letter-spacing:.02em;text-transform:uppercase}
    #test-panel .tp-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px}
    #test-panel .tp-grid.three{grid-template-columns:1fr 1fr 1fr}
    #test-panel button.tp-btn{appearance:none;border:1px solid #2f8f6b;border-radius:8px;
      background:#12352a;color:#eafff6;padding:7px 6px;font-size:11px;font-weight:700;cursor:pointer;line-height:1.2}
    #test-panel button.tp-btn:hover{background:#1c5741}
    #test-panel button.tp-btn.wide{grid-column:1/-1}
    #test-panel button.tp-btn.gold{background:#7a5a12;border-color:#c79b34}
    #test-panel button.tp-btn.gold:hover{background:#9c7620}
    #test-panel button.tp-btn.red{background:#5a1f1f;border-color:#a24}
    #test-panel .tp-fab{position:fixed;right:10px;bottom:10px;z-index:99998;width:46px;height:46px;border-radius:50%;
      border:2px solid #35c08a;background:#0d3a2a;color:#fff;font-size:20px;cursor:pointer;display:none}
    #test-panel.hidden{display:none}
    #test-panel-fab{position:fixed;right:10px;bottom:10px;z-index:99998;width:46px;height:46px;border-radius:50%;
      border:2px solid #35c08a;background:#0d3a2a;color:#fff;font-size:20px;cursor:pointer;display:none;box-shadow:0 6px 18px rgba(0,0,0,.5)}
  `;
  document.head.appendChild(style);

  const root = document.createElement("div");
  root.id = "test-panel";
  root.innerHTML = `
    <div class="tp-head" data-act="toggle"><span>🧪 TEST 패널</span><span data-act="hide" title="숨기기">✕</span></div>
    <div class="tp-body">
      <div class="tp-status" id="tp-status">로그인 필요</div>

      <h4>빠른 시작</h4>
      <div class="tp-grid">
        <button class="tp-btn gold wide" data-act="random-four">랜덤 4명 조 확정하기</button>
      </div>

      <h4>장비 뽑기</h4>
      <div class="tp-grid">
        <button class="tp-btn" data-act="draw" data-n="1">뽑기 ×1</button>
        <button class="tp-btn" data-act="draw" data-n="3">뽑기 ×3</button>
      </div>

      <h4>QR 보상 · 미션 수행</h4>
      <div class="tp-grid">
        ${MISSIONS.map(([code, label]) => `<button class="tp-btn" data-act="qr" data-code="${code}">${label}</button>`).join("")}
      </div>
      <div class="tp-grid three" style="margin-top:5px">
        <button class="tp-btn" data-act="qr" data-code="draw-1">뽑기QR1</button>
        <button class="tp-btn" data-act="qr" data-code="draw-2">뽑기QR2</button>
        <button class="tp-btn" data-act="qr" data-code="draw-3">뽑기QR3</button>
        <button class="tp-btn" data-act="qr" data-code="hidden-forest-cache-1">히든1</button>
        <button class="tp-btn" data-act="qr" data-code="hidden-forest-cache-2">히든2</button>
        <button class="tp-btn gold" data-act="qr" data-code="boss-forest">보스</button>
      </div>

      <h4>THE WAR</h4>
      <div class="tp-grid">
        <button class="tp-btn wide" data-act="war-scan">조원 전체 스캔 → 장비 합치기</button>
        <button class="tp-btn wide" data-act="war-roles">역할 6종 조원 자동 배정</button>
      </div>

      <h4>이동</h4>
      <div class="tp-grid three">
        <button class="tp-btn" data-act="nav" data-path="/">홈</button>
        <button class="tp-btn" data-act="nav" data-path="/party">우리 조</button>
        <button class="tp-btn" data-act="nav" data-path="/forest">THE WAR</button>
        <button class="tp-btn" data-act="nav" data-path="/team/roles">역할</button>
        <button class="tp-btn" data-act="nav" data-path="/ranking">랭킹</button>
        <button class="tp-btn" data-act="nav" data-path="/exchange">교환소</button>
      </div>

      <h4>기타</h4>
      <div class="tp-grid">
        <button class="tp-btn" data-act="refresh">상태 새로고침</button>
        <button class="tp-btn red" data-act="logout">로그아웃</button>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const fab = document.createElement("button");
  fab.id = "test-panel-fab";
  fab.textContent = "🧪";
  fab.title = "TEST 패널 열기";
  fab.addEventListener("click", () => { root.classList.remove("hidden"); fab.style.display = "none"; });
  document.body.appendChild(fab);

  const statusEl = root.querySelector("#tp-status");
  function refreshStatus() {
    const me = state.me;
    if (!me || !me.id) { statusEl.textContent = "로그인 필요 (상단 폼으로 로그인)"; return; }
    const t = state.team || {};
    const g = me.gradeCounts || { S: 0, A: 0, B: 0 };
    statusEl.innerHTML = `👤 <b>${escapeHtml(me.name || "")}</b> · ${escapeHtml(me.team || "조없음")}<br>`
      + `조확정 ${t.rosterFinalized ? "✅" : "❌"} · 전투력 <b>${me.equipmentPower || 0}</b><br>`
      + `S${g.S || 0} / A${g.A || 0} / B${g.B || 0}`;
  }

  function requireMe() {
    if (!state.me || !state.me.id) { toast("먼저 상단 폼으로 로그인하세요", "error"); return null; }
    return state.me;
  }
  async function afterAction() {
    try { await loadState({ quiet: true }); } catch (e) {}
    render();
    refreshStatus();
  }

  root.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const action = btn.dataset.act;

    if (action === "toggle") { if (e.target.dataset.act === "hide") return; root.classList.toggle("collapsed"); return; }
    if (action === "hide") { root.classList.add("hidden"); fab.style.display = "block"; return; }
    if (action === "nav") { nav(btn.dataset.path); setTimeout(refreshStatus, 60); return; }
    if (action === "refresh") { await afterAction(); toast("상태 새로고침"); return; }
    if (action === "logout") { logout(); return; }

    const me = requireMe();
    if (!me) return;
    btn.disabled = true;
    try {
      if (action === "random-four") {
        const teamState = await api("team-state", { playerId: me.id });
        const memberCount = Number(teamState.team?.memberCount || 0);
        if (teamState.team?.rosterFinalized) {
          toast("이미 확정된 조입니다.");
        } else {
          const suffix = `${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 5)}`;
          for (let index = memberCount; index < 4; index += 1) {
            await api("create-player", {
              name: `테스트조원-${suffix}-${index + 1}`,
              team: me.team,
              partyMode: "join"
            });
          }
          await api("team-leader-claim", { playerId: me.id });
          await api("team-roster-finalize", { playerId: me.id });
          toast("랜덤 4명 조 확정 완료 — 합치기 테스트를 시작하세요.", "success");
        }
      } else if (action === "draw") {
        const n = Number(btn.dataset.n || 1);
        const r = await api("draw", { playerId: me.id, count: n });
        const res = (r && r.results) || [];
        toast(`뽑기 ${res.length}회 · ${res.map((x) => x.armorName).join(", ") || "풀 없음(완성)"}`);
      } else if (action === "qr") {
        const code = btn.dataset.code;
        const r = await api("claim-qr", { playerId: me.id, code });
        const res = (r && r.results) || [];
        toast(`QR「${code}」${res.length ? ` · 뽑기 ${res.length}회` : " 처리됨"}`);
      } else if (action === "war-scan") {
        const teamState = await api("team-state", { playerId: me.id });
        const members = teamState.team?.war?.members || [];
        if (!teamState.team?.rosterFinalized || !members.length) {
          throw new Error("먼저 랜덤 4명 조 확정을 완료해주세요.");
        }
        let payload = null;
        for (const member of members) {
          payload = await api("team-war-scan", { playerId: member.id });
        }
        if (!payload?.team?.war?.allScanned) throw new Error("조원 전체 스캔 처리에 실패했습니다.");
        state.team = payload.team;
        if (payload.me) setMe(payload.me);
        applyWarSchedule(payload);
        toast("조원 전체 스캔 완료 — 장비 합치기를 시작합니다.", "success");
        showTeamWarReveal(payload.team);
        return;
      } else if (action === "war-roles") {
        const teamState = await api("team-state", { playerId: me.id });
        const members = teamState.team?.war?.members || [];
        if (!teamState.team?.war?.allScanned || !members.length) {
          throw new Error("먼저 조원 전체 스캔을 완료해주세요.");
        }
        const roleCounts = new Map(members.map((member) => [member.id, 0]));
        const assignments = teamState.team?.war?.assignments || [];
        for (const assignment of assignments) {
          if (assignment.playerId) roleCounts.set(assignment.playerId, (roleCounts.get(assignment.playerId) || 0) + 1);
        }
        let payload = null;
        for (const code of ARMOR_CODES) {
          if (assignments.some((assignment) => assignment.armor === code && assignment.playerId)) continue;
          const assignee = [...members].sort((a, b) => (roleCounts.get(a.id) || 0) - (roleCounts.get(b.id) || 0))[0];
          payload = await api("team-war-role", { playerId: assignee.id, armorCode: code, selected: true });
          roleCounts.set(assignee.id, (roleCounts.get(assignee.id) || 0) + 1);
        }
        state.team = payload?.team || teamState.team;
        toast("6개 역할을 조원에게 자동 배정했습니다.", "success");
      }
      await afterAction();
    } catch (err) {
      toast((err && err.message) ? err.message : "오류", "error");
    } finally {
      btn.disabled = false;
    }
  });

  refreshStatus();
  // 로그인/상태 변화가 패널에 반영되도록 주기적으로 상태만 갱신
  setInterval(refreshStatus, 1500);
}

render();
mountTestPanel();
