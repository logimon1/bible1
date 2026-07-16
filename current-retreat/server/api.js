const {
  ARMOR,
  DRAW_COUNTS,
  FOREST_TRIALS,
  QR_REWARDS,
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
const { getHealthSnapshot, withData } = require("./store");

const READ_ONLY_ACTIONS = new Set(["state", "qr-state", "team-state", "ranking", "booth", "admin"]);
const SUPPORTED_ACTIONS = new Set([
  "health",
  "state",
  "create-player",
  "leave-team",
  "team-roster-finalize",
  "team-leader-claim",
  "draw",
  "qr-state",
  "team-state",
  "team-war-scan",
  "team-war-role",
  "claim-qr",
  "ranking",
  "booth",
  "exchange-join",
  "exchange-select",
  "exchange-confirm",
  "exchange-cancel",
  "exchange-reset",
  "admin",
  "admin-adjust-item",
  "admin-update-player",
  "admin-reopen-team"
]);
const MAX_REQUEST_BODY_BYTES = 64 * 1024;

function parseEnvironmentTime(name, rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) return null;
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw new Error(`${name}은 ISO-8601 날짜/시간 형식이어야 합니다.`);
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(raw)) {
    throw new Error(`${name}에는 Z 또는 +09:00 같은 시간대를 반드시 포함해야 합니다.`);
  }
  return parsed;
}

function eventWindow(nowMs = Date.now()) {
  const rawEndsAt = String(process.env.EVENT_ENDS_AT || "").trim();
  if (!rawEndsAt) return { active: true, endsAt: null };
  const endsAtMs = parseEnvironmentTime("EVENT_ENDS_AT", rawEndsAt);
  return {
    active: Number(nowMs) < endsAtMs,
    endsAt: new Date(endsAtMs).toISOString()
  };
}

function warWindow(nowMs = Date.now()) {
  const rawOpensAt = String(process.env.THE_WAR_OPENS_AT || "").trim();
  const endsAtMs = parseEnvironmentTime("EVENT_ENDS_AT", process.env.EVENT_ENDS_AT);
  let opensAtMs = null;
  if (rawOpensAt) {
    opensAtMs = parseEnvironmentTime("THE_WAR_OPENS_AT", rawOpensAt);
  } else {
    const schedule = eventWindow(nowMs);
    if (schedule.endsAt) {
      const koreaOffsetMs = 9 * 60 * 60 * 1000;
      const koreaEndDate = new Date(Date.parse(schedule.endsAt) + koreaOffsetMs);
      opensAtMs = Date.UTC(
        koreaEndDate.getUTCFullYear(),
        koreaEndDate.getUTCMonth(),
        koreaEndDate.getUTCDate()
      ) - koreaOffsetMs;
    }
  }
  if (endsAtMs !== null && opensAtMs !== null && opensAtMs >= endsAtMs) {
    throw new Error("THE_WAR_OPENS_AT은 EVENT_ENDS_AT보다 이른 시각이어야 합니다.");
  }
  return {
    open: opensAtMs === null || Number(nowMs) >= opensAtMs,
    opensAt: opensAtMs === null ? null : new Date(opensAtMs).toISOString()
  };
}

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
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_REQUEST_BODY_BYTES) {
      const error = new Error("요청 데이터가 너무 큽니다.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
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
    const lanExposed = ["0.0.0.0", "::"].includes(String(process.env.HOST || ""));
    if (process.env.NODE_ENV === "production" || process.env.DATABASE_URL || lanExposed) {
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
  const cleanTeam = normalizedTeamKey(team);
  return data.players.filter((player) => player.name.trim() === cleanName && normalizedTeamKey(player.team) === cleanTeam);
}

function findPlayerByIdentity(data, { name, team = "" }) {
  return findPlayersByNameTeam(data, name, team)[0] || null;
}

function isServiceError(error) {
  const code = String(error?.code || "");
  if (["40001", "40P01", "53300", "55P03", "57014", "57P01", "57P02", "57P03", "08000", "08001", "08003", "08006", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ENETUNREACH"].includes(code)) return true;
  return /database|postgres|connection|timeout|lock|서버 저장소|데이터베이스/i.test(String(error?.message || ""));
}

function normalizedTeamKey(value) {
  const compact = String(value || "").trim().toLowerCase().replace(/\s+/g, "");
  const numeric = compact.match(/^(\d+)조?$/);
  return numeric ? `${Number(numeric[1])}조` : compact;
}

function validatePlayerText(value, label, maxLength) {
  const clean = String(value || "").trim();
  if (!clean) throw new Error(`${label}을(를) 입력해주세요.`);
  if (clean.length > maxLength) throw new Error(`${label}은(는) ${maxLength}자 이내로 입력해주세요.`);
  if (/[\u0000-\u001f\u007f]/.test(clean)) throw new Error(`${label}에 사용할 수 없는 문자가 포함되어 있습니다.`);
  return clean;
}

function validateAdminInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || number > 1000000) {
    throw new Error(`${label}은(는) 0부터 1000000 사이의 정수여야 합니다.`);
  }
  return number;
}

function defaultTeamSetting() {
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

function teamSettingFor(data, team) {
  const key = normalizedTeamKey(team);
  const current = key && data.teamSettings?.[key];
  return { ...defaultTeamSetting(), ...(current || {}) };
}

function allTeamMembersFor(data, player) {
  const key = normalizedTeamKey(player?.team);
  if (!player || !key) return player ? [player] : [];
  return data.players
    .filter((member) => normalizedTeamKey(member.team) === key)
    .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")) || a.id.localeCompare(b.id));
}

function teamLeaderFor(data, player) {
  const members = allTeamMembersFor(data, player);
  const setting = teamSettingFor(data, player?.team);
  return members.find((member) => member.id === setting.leaderPlayerId) || members[0] || player || null;
}

function claimTeamLeader(data, player) {
  const teamKey = normalizedTeamKey(player?.team);
  if (!teamKey) throw new Error("조 이름을 먼저 입력해주세요.");
  const members = allTeamMembersFor(data, player);
  if (!members.some((member) => member.id === player.id)) throw new Error("이 조의 조원만 조장을 신청할 수 있습니다.");
  const previousLeader = teamLeaderFor(data, player);
  data.teamSettings = data.teamSettings || {};
  data.teamSettings[teamKey] = {
    ...teamSettingFor(data, player.team),
    leaderPlayerId: player.id
  };
  player.updated_at = nowIso();
  createEvent(data, player.id, "team_leader_claimed", {
    teamKey,
    team: player.team,
    previousLeaderPlayerId: previousLeader?.id || null,
    previousLeaderName: previousLeader?.name || ""
  });
}

function assertTeamLeader(data, player) {
  const leader = teamLeaderFor(data, player);
  if (!leader || leader.id !== player?.id) {
    throw new Error(`조장 ${leader?.name || ""}만 확정할 수 있습니다.`.trim());
  }
  return leader;
}

function teamMembersFor(data, player) {
  const allMembers = allTeamMembersFor(data, player);
  const setting = teamSettingFor(data, player?.team);
  if (!setting.rosterFinalized || !setting.rosterMemberIds.length) return allMembers;
  const byId = new Map(allMembers.map((member) => [member.id, member]));
  return setting.rosterMemberIds.map((id) => byId.get(id)).filter(Boolean);
}

function rawArmorProgress(inventory, armorCode) {
  const row = normalizeInventory(inventory || emptyInventory())[armorCode] || { B: 0, A: 0, S: 0 };
  return row.S > 0 ? 9 : Math.min(8, Number(row.B || 0) + Number(row.A || 0) * 3);
}

function finalizeTeamRoster(data, player) {
  const teamKey = normalizedTeamKey(player?.team);
  if (!teamKey) throw new Error("팀을 먼저 입력해주세요.");
  const current = teamSettingFor(data, player.team);
  if (current.rosterFinalized) return;
  assertTeamLeader(data, player);
  const members = allTeamMembersFor(data, player);
  if (members.length < 4 || members.length > 6) {
    throw new Error("팀원 4~6명이 모두 로그인한 뒤 명단을 확정해주세요.");
  }
  const finalizedAt = nowIso();
  data.teamSettings = data.teamSettings || {};
  data.teamSettings[teamKey] = {
    ...current,
    leaderPlayerId: teamLeaderFor(data, player)?.id || player.id,
    rosterFinalized: true,
    rosterMemberIds: members.map((member) => member.id),
    rosterFinalizedAt: finalizedAt,
    warSessionId: id("war"),
    warScannedPlayerIds: [],
    warScanCompletedAt: null,
    warAssemblySnapshot: null,
    warRoleAssignments: {},
    warRolesCompletedAt: null
  };
  createEvent(data, player.id, "team_roster_finalized", {
    teamKey,
    team: player.team,
    memberIds: members.map((member) => member.id),
    memberCount: members.length,
    warSessionId: data.teamSettings[teamKey].warSessionId
  });
}

function adminReopenTeamRoster(data, teamKey) {
  const normalizedKey = normalizedTeamKey(teamKey);
  if (!normalizedKey) throw new Error("다시 열 조를 선택해주세요.");
  const player = data.players.find((member) => normalizedTeamKey(member.team) === normalizedKey);
  if (!player) throw new Error("조 정보를 찾을 수 없습니다.");
  const current = teamSettingFor(data, player.team);
  if (!current.rosterFinalized) throw new Error("아직 확정되지 않은 조입니다.");
  if ((current.warScannedPlayerIds || []).length || current.warScanCompletedAt || Object.keys(current.warRoleAssignments || {}).length) {
    throw new Error("THE WAR QR 스캔이 시작된 조는 명단을 다시 열 수 없습니다.");
  }
  data.teamSettings = data.teamSettings || {};
  data.teamSettings[normalizedKey] = {
    ...defaultTeamSetting(),
    leaderPlayerId: teamLeaderFor(data, player)?.id || player.id
  };
  createEvent(data, null, "admin_team_roster_reopened", {
    teamKey: normalizedKey,
    team: player.team,
    leaderPlayerId: teamLeaderFor(data, player)?.id || player.id
  });
}

function leaveTeam(data, player) {
  if (!player) throw new Error("학생 정보를 찾을 수 없습니다.");
  const teamKey = normalizedTeamKey(player.team);
  if (!teamKey) throw new Error("현재 소속된 조가 없습니다.");
  const current = teamSettingFor(data, player.team);
  if (current.rosterFinalized) {
    throw new Error("조 명단이 확정된 뒤에는 탈퇴할 수 없습니다. 편성 오류는 교사에게 문의해주세요.");
  }

  const formerTeam = player.team;
  const remainingMembers = allTeamMembersFor(data, player).filter((member) => member.id !== player.id);
  const nextLeader = remainingMembers.find((member) => member.id === current.leaderPlayerId) || remainingMembers[0] || null;
  data.teamSettings = data.teamSettings || {};
  if (nextLeader) {
    data.teamSettings[teamKey] = {
      ...current,
      leaderPlayerId: nextLeader.id
    };
  } else {
    delete data.teamSettings[teamKey];
  }

  player.team = "";
  player.updated_at = nowIso();
  createEvent(data, player.id, "team_member_left", {
    teamKey,
    team: formerTeam,
    remainingMemberIds: remainingMembers.map((member) => member.id),
    nextLeaderPlayerId: nextLeader?.id || null
  });
  return { formerTeam, remainingMemberCount: remainingMembers.length, nextLeaderName: nextLeader?.name || "" };
}

function assertWarOpen() {
  const war = warWindow();
  if (war.open) return;
  const error = new Error("THE WAR는 마지막 날 공개됩니다.");
  error.code = "THE_WAR_LOCKED";
  error.opensAt = war.opensAt;
  throw error;
}

function assertFinalizedWarMember(data, player) {
  const teamKey = normalizedTeamKey(player?.team);
  const setting = teamSettingFor(data, player?.team);
  if (!teamKey || !setting.rosterFinalized) throw new Error("조 명단을 먼저 확정해주세요.");
  if (!setting.rosterMemberIds.includes(player.id)) throw new Error("확정된 조원만 참여할 수 있습니다.");
  return { teamKey, setting };
}

function warSnapshotFromSummary(summary, calculatedAt = nowIso()) {
  return {
    calculatedAt,
    character: summary.character,
    armorProgress: summary.armorProgress
  };
}

function markTeamWarScan(data, player) {
  assertWarOpen();
  const { teamKey, setting } = assertFinalizedWarMember(data, player);
  const rosterIds = [...setting.rosterMemberIds];
  const rosterSet = new Set(rosterIds);
  const sessionId = setting.warSessionId || id("war");
  const scannedIds = [...new Set((setting.warScannedPlayerIds || []).filter((playerId) => rosterSet.has(playerId)))];
  const alreadyScanned = scannedIds.includes(player.id);
  if (!alreadyScanned) scannedIds.push(player.id);
  const allScanned = rosterIds.length >= 4 && rosterIds.every((playerId) => scannedIds.includes(playerId));
  const completedAt = allScanned ? (setting.warScanCompletedAt || nowIso()) : null;
  let nextSetting = {
    ...setting,
    warSessionId: sessionId,
    warScannedPlayerIds: scannedIds,
    warScanCompletedAt: completedAt
  };
  data.teamSettings[teamKey] = nextSetting;

  let assemblySnapshot = setting.warAssemblySnapshot || null;
  if (allScanned && !assemblySnapshot) {
    assemblySnapshot = warSnapshotFromSummary(teamSummary(data, player), completedAt);
    nextSetting = { ...nextSetting, warAssemblySnapshot: assemblySnapshot };
    data.teamSettings[teamKey] = nextSetting;
  }
  if (!alreadyScanned) {
    createEvent(data, player.id, "team_war_scanned", {
      teamKey,
      team: player.team,
      warSessionId: sessionId,
      memberId: player.id,
      scannedCount: scannedIds.length,
      requiredCount: rosterIds.length,
      completedAt,
      assemblySnapshot: allScanned ? assemblySnapshot : null
    });
  }
}

function setTeamWarRole(data, player, armorCode, selected) {
  assertWarOpen();
  const { teamKey, setting } = assertFinalizedWarMember(data, player);
  const armor = ARMOR.find((item) => item.code === String(armorCode || ""));
  if (!armor) throw new Error("담당할 장비가 올바르지 않습니다.");
  const rosterIds = [...setting.rosterMemberIds];
  const rosterSet = new Set(rosterIds);
  const scannedIds = [...new Set((setting.warScannedPlayerIds || []).filter((playerId) => rosterSet.has(playerId)))];
  if (!setting.warScanCompletedAt || !rosterIds.every((playerId) => scannedIds.includes(playerId))) {
    throw new Error("모든 조원이 QR 스캔을 마친 뒤 역할을 정할 수 있습니다.");
  }

  const assignments = {};
  for (const [code, ownerId] of Object.entries(setting.warRoleAssignments || {})) {
    if (ARMOR.some((item) => item.code === code) && rosterSet.has(ownerId)) assignments[code] = ownerId;
  }
  const ownerId = assignments[armor.code] || null;
  if (setting.warRolesCompletedAt) {
    if (selected && ownerId === player.id) return;
    throw new Error("역할 배분이 완료되어 변경할 수 없습니다.");
  }
  if (selected) {
    if (ownerId === player.id) return;
    if (ownerId) {
      const owner = data.players.find((member) => member.id === ownerId);
      throw new Error(`${owner?.name || "다른 조원"}님이 이미 맡은 파트입니다.`);
    }
    const myCount = Object.values(assignments).filter((playerId) => playerId === player.id).length;
    if (myCount >= 2) throw new Error("한 사람은 최대 2개 파트까지 맡을 수 있습니다.");
    assignments[armor.code] = player.id;
    const assignedOwners = new Set(Object.values(assignments));
    const membersWithoutRole = rosterIds.filter((playerId) => !assignedOwners.has(playerId)).length;
    const remainingParts = ARMOR.length - Object.keys(assignments).length;
    if (remainingParts < membersWithoutRole) {
      throw new Error("모든 조원이 최소 1개 파트를 맡을 수 있도록 남겨주세요.");
    }
  } else {
    if (!ownerId) return;
    if (ownerId !== player.id) throw new Error("다른 조원의 담당 파트는 해제할 수 없습니다.");
    delete assignments[armor.code];
  }

  const roleCounts = new Map(rosterIds.map((playerId) => [playerId, 0]));
  for (const owner of Object.values(assignments)) roleCounts.set(owner, (roleCounts.get(owner) || 0) + 1);
  const rolesComplete = Object.keys(assignments).length === ARMOR.length
    && rosterIds.every((playerId) => roleCounts.get(playerId) >= 1 && roleCounts.get(playerId) <= 2);
  const completedAt = rolesComplete ? (setting.warRolesCompletedAt || nowIso()) : null;
  data.teamSettings[teamKey] = {
    ...setting,
    warRoleAssignments: assignments,
    warRolesCompletedAt: completedAt
  };
  createEvent(data, player.id, "team_war_role_updated", {
    teamKey,
    team: player.team,
    warSessionId: setting.warSessionId,
    armorCode: armor.code,
    selected: Boolean(selected),
    assignedPlayerId: selected ? player.id : null,
    completedAt
  });
}

function teamSummary(data, player) {
  if (!player) return null;
  const members = teamMembersFor(data, player);
  const teamInventory = emptyInventory();
  const armorProgress = ARMOR.map((armor) => {
    const progress = Math.min(9, members.reduce((sum, member) => sum + rawArmorProgress(data.inventories[member.id], armor.code), 0));
    const contributors = members
      .filter((member) => rawArmorProgress(data.inventories[member.id], armor.code) > 0)
      .map((member) => member.name);
    if (progress >= 9) teamInventory[armor.code].S = 1;
    else {
      teamInventory[armor.code].A = Math.floor(progress / 3);
      teamInventory[armor.code].B = progress % 3;
    }
    const grade = progress >= 9 ? "S" : progress >= 3 ? "A" : progress > 0 ? "B" : "";
    return {
      armor: armor.code,
      armorName: armor.name,
      grade,
      progress,
      required: 9,
      completed: progress >= 9,
      contributors
    };
  });
  const character = publicPlayer({
    id: `team_${normalizedTeamKey(player.team) || player.id}`,
    name: player.team ? `${player.team} 조` : `${player.name} 조`,
    team: player.team || "",
    gender: "male",
    talent: 0,
    exp: 0,
    score: 0,
    created_at: player.created_at,
    updated_at: player.updated_at
  }, teamInventory);
  const setting = teamSettingFor(data, player.team);
  const leader = teamLeaderFor(data, player);
  const rosterIds = setting.rosterFinalized ? setting.rosterMemberIds.filter((playerId) => members.some((member) => member.id === playerId)) : [];
  const rosterSet = new Set(rosterIds);
  const scannedIds = [...new Set((setting.warScannedPlayerIds || []).filter((playerId) => rosterSet.has(playerId)))];
  const allScanned = rosterIds.length >= 4 && rosterIds.every((playerId) => scannedIds.includes(playerId));
  const memberById = new Map(members.map((member) => [member.id, member]));
  const assignmentRows = ARMOR.map((armor) => {
    const assignedPlayerId = setting.warRoleAssignments?.[armor.code];
    const assignedPlayer = rosterSet.has(assignedPlayerId) ? memberById.get(assignedPlayerId) : null;
    return {
      armor: armor.code,
      armorName: armor.name,
      warRole: armor.warRole || "",
      playerId: assignedPlayer?.id || null,
      playerName: assignedPlayer?.name || ""
    };
  });
  const assignedRows = assignmentRows.filter((assignment) => assignment.playerId);
  const roleCounts = new Map(rosterIds.map((playerId) => [playerId, 0]));
  for (const assignment of assignedRows) roleCounts.set(assignment.playerId, (roleCounts.get(assignment.playerId) || 0) + 1);
  const rolesComplete = allScanned
    && assignedRows.length === ARMOR.length
    && rosterIds.every((playerId) => roleCounts.get(playerId) >= 1 && roleCounts.get(playerId) <= 2);
  const warSchedule = warWindow();
  const warPhase = !warSchedule.open
    ? "locked"
    : !setting.rosterFinalized
      ? "roster"
      : !allScanned
        ? "scan"
        : rolesComplete
          ? "ready"
          : "assign";
  return {
    key: normalizedTeamKey(player.team) || player.id,
    name: player.team ? `${player.team} 조` : `${player.name} 조`,
    memberCount: members.length,
    leaderPlayerId: leader?.id || null,
    leaderName: leader?.name || "",
    isLeader: leader?.id === player.id,
    ready: character.completedArmorCount === ARMOR.length,
    rosterFinalized: Boolean(setting.rosterFinalized),
    rosterMemberIds: setting.rosterMemberIds || [],
    rosterFinalizedAt: setting.rosterFinalizedAt || null,
    war: {
      sessionId: setting.warSessionId || null,
      phase: warPhase,
      scannedCount: scannedIds.length,
      requiredCount: rosterIds.length,
      meScanned: scannedIds.includes(player.id),
      allScanned,
      scanCompletedAt: allScanned ? (setting.warScanCompletedAt || null) : null,
      assembly: allScanned ? (setting.warAssemblySnapshot || { calculatedAt: null, character, armorProgress }) : null,
      assignments: assignmentRows,
      assignedCount: assignedRows.length,
      myRoleCount: roleCounts.get(player.id) || 0,
      rolesComplete,
      rolesCompletedAt: rolesComplete ? (setting.warRolesCompletedAt || null) : null,
      members: members.map((member) => ({
        id: member.id,
        name: member.name,
        scanned: scannedIds.includes(member.id),
        assignedArmorCodes: assignmentRows.filter((assignment) => assignment.playerId === member.id).map((assignment) => assignment.armor)
      }))
    },
    character,
    armorProgress,
    members: members.map((member) => {
      const memberView = publicPlayer(member, data.inventories[member.id] || emptyInventory());
      return {
        id: member.id,
        name: member.name,
        isLeader: member.id === leader?.id,
        inventory: memberView.inventory,
        gradeCounts: memberView.gradeCounts,
        equipmentPower: memberView.equipmentPower,
        completedArmorCount: memberView.completedArmorCount
      };
    })
  };
}

function partyRankingFromData(data) {
  const rows = [];
  const seen = new Set();
  for (const player of data.players) {
    const key = normalizedTeamKey(player.team);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const summary = teamSummary(data, player);
    if (!summary?.rosterFinalized) continue;
    rows.push({
      key: summary.key,
      name: summary.name,
      team: player.team || "",
      memberCount: summary.memberCount,
      equipmentPower: Number(summary.character?.equipmentPower || 0),
      completedArmorCount: Number(summary.character?.completedArmorCount || 0),
      rosterFinalizedAt: summary.rosterFinalizedAt || null,
      leaderName: summary.leaderName || ""
    });
  }
  return rows
    .sort((a, b) => b.equipmentPower - a.equipmentPower || b.memberCount - a.memberCount || a.name.localeCompare(b.name, "ko"))
    .map((party, index) => ({ ...party, rank: index + 1 }));
}

function finalizedTeamsFromData(data) {
  const rows = [];
  const seen = new Set();
  for (const player of data.players) {
    const key = normalizedTeamKey(player.team);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const summary = teamSummary(data, player);
    if (!summary?.rosterFinalized) continue;
    const setting = teamSettingFor(data, player.team);
    const scanStarted = Boolean((setting.warScannedPlayerIds || []).length || setting.warScanCompletedAt || Object.keys(setting.warRoleAssignments || {}).length);
    rows.push({
      key: summary.key,
      name: summary.name,
      team: player.team || "",
      memberCount: summary.memberCount,
      memberNames: summary.members.map((member) => member.name),
      leaderName: summary.leaderName || "",
      scanStarted,
      canEmergencyReopen: !scanStarted
    });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

function statePayload(data, player) {
  const me = player ? publicPlayer(player, data.inventories[player.id] || emptyInventory()) : null;
  const summary = player ? teamSummary(data, player) : null;
  if (me) me.teamMemberCount = summary.memberCount;
  const war = warWindow();
  const schedule = eventWindow();
  return {
    ok: true,
    active: schedule.active,
    endsAt: schedule.endsAt,
    warOpen: war.open,
    warOpensAt: war.opensAt,
    armor: ARMOR,
    forestTrials: FOREST_TRIALS,
    qrRewards: QR_REWARDS.filter((reward) => !reward.legacy).map(publicQrReward),
    claimedQrCodes: player ? (data.qrClaims || []).filter((claim) => claim.playerId === player.id).map((claim) => claim.qrCode) : [],
    me,
    team: summary,
    ranking: rankingFromData(data),
    partyRanking: partyRankingFromData(data),
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

function assertWarRewardOpen(reward) {
  if (!reward || !["mission", "boss"].includes(reward.type)) return;
  assertWarOpen();
}

function assertWarTeamReady(data, player, reward) {
  if (!reward || !["mission", "boss"].includes(reward.type)) return;
  if (!player) throw new Error("먼저 조원으로 로그인해주세요.");
  const summary = teamSummary(data, player);
  if (!summary?.war?.allScanned) throw new Error("모든 조원이 THE WAR QR 스캔을 마쳐야 합니다.");
  if (!summary?.war?.rolesComplete) throw new Error("6개 파트의 담당을 모두 정한 뒤 미션에 도전하세요.");
}

function grantRandomDraws(data, player, count) {
  const summaryBeforeDraw = teamSummary(data, player);
  if (!summaryBeforeDraw.rosterFinalized) {
    throw new Error("조원 4~6명이 모이고 조장이 명단을 확정한 뒤 뽑아주세요.");
  }
  let inventory = normalizeInventory(data.inventories[player.id] || emptyInventory());
  const results = [];
  const promotions = [];
  for (let i = 0; i < count; i += 1) {
    // 개인 기준 뽑기 풀: 내가 이미 S로 완성한 장비만 제외(중복 획득 잠금).
    // 조(팀) 합산 진행도는 THE WAR에서만 공개되므로 뽑기 풀에 반영하지 않는다.
    const availableArmor = ARMOR.filter((armor) => inventory[armor.code].S < 1);
    if (!availableArmor.length) break;
    const armor = availableArmor[Math.floor(Math.random() * availableArmor.length)];
    const grant = addItemWithPromotions(inventory, armor.code, "B", 1);
    inventory = grant.inventory;
    data.inventories[player.id] = inventory;
    results.push({
      armor: armor.code,
      armorName: armor.name,
      grade: "B"
    });
    promotions.push(...grant.promotions.map((promotion) => ({
      ...promotion,
      armorName: ARMOR.find((item) => item.code === promotion.armor)?.name || promotion.armor
    })));
  }
  data.inventories[player.id] = inventory;
  player.updated_at = nowIso();
  const summaryAfterDraw = teamSummary(data, player);
  const fullSetComplete = summaryAfterDraw.ready;
  return { results, promotions, fullSetComplete };
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
  if (current.status === "completed") throw new Error("이미 완료된 교환입니다. 새 교환을 시작해주세요.");
  const clean = sanitizeTradeItems(items);
  const inventory = data.inventories[playerId] || emptyInventory();
  if (!hasItems(inventory, clean)) throw new Error("선택한 장비를 보유하고 있지 않습니다.");
  current.player1Confirmed = false;
  current.player2Confirmed = false;
  if (current.player1Id === playerId) {
    current.player1Items = clean;
  } else {
    current.player2Items = clean;
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
  if (current.status === "completed") return current;
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
        team: query.get("team") || body.team || ""
      };
      const player = (body.playerId ? findPlayerById(data, body.playerId) : null) || findPlayerByIdentity(data, identity);
      return statePayload(data, player);
    }

    if (action === "create-player") {
      const name = validatePlayerText(body.name, "이름", 20);
      const team = validatePlayerText(body.team, "조 이름", 12);
      const partyMode = ["create", "join"].includes(String(body.partyMode || "")) ? String(body.partyMode) : "auto";
      let player = findPlayerByIdentity(data, { name, team });
      if (!player) {
        const existingTeamMember = data.players.find((member) => normalizedTeamKey(member.team) === normalizedTeamKey(team));
        if (partyMode === "create" && existingTeamMember) {
          throw new Error("이미 존재하는 조입니다. 조 참가를 눌러주세요.");
        }
        if (partyMode === "join" && !existingTeamMember) {
          throw new Error("조를 찾을 수 없습니다. 이름을 확인하거나 새 조를 만들어주세요.");
        }
        if (existingTeamMember && teamSummary(data, existingTeamMember).rosterFinalized) {
          throw new Error("이미 구성원이 확정된 조입니다. 조명을 확인하거나 선생님에게 문의해주세요.");
        }
        if (existingTeamMember && allTeamMembersFor(data, existingTeamMember).length >= 6) {
          throw new Error("이 조는 최대 인원 6명이 모두 참가했습니다. 조명을 확인하거나 선생님에게 문의해주세요.");
        }
        const previousPlayer = body.resumePlayerId ? findPlayerById(data, body.resumePlayerId) : null;
        if (previousPlayer && !normalizedTeamKey(previousPlayer.team) && previousPlayer.name.trim() === name) {
          previousPlayer.team = team;
          previousPlayer.gender = body.gender === "female" ? "female" : "male";
          previousPlayer.updated_at = nowIso();
          player = previousPlayer;
          createEvent(data, player.id, "player_rejoined", { team: player.team, partyMode, isLeader: !existingTeamMember });
        } else {
          player = {
            id: id("p"),
            name,
            team,
            gender: body.gender === "female" ? "female" : "male",
            talent: 0,
            exp: 0,
            score: 0,
            created_at: nowIso(),
            updated_at: nowIso()
          };
          data.players.push(player);
          data.inventories[player.id] = emptyInventory();
          createEvent(data, player.id, "player_created", { team: player.team, partyMode, isLeader: !existingTeamMember });
        }
      } else {
        createEvent(data, player.id, "player_resumed", { team: player.team });
      }
      return statePayload(data, player);
    }

    if (action === "leave-team") {
      const player = findPlayerById(data, body.playerId);
      const result = leaveTeam(data, player);
      return { ok: true, ...result, ranking: rankingFromData(data), partyRanking: partyRankingFromData(data) };
    }

    if (action === "team-roster-finalize") {
      const player = findPlayerById(data, body.playerId);
      if (!player) throw new Error("학생 정보를 찾을 수 없습니다.");
      finalizeTeamRoster(data, player);
      return statePayload(data, player);
    }

    if (action === "team-leader-claim") {
      const player = findPlayerById(data, body.playerId);
      if (!player) throw new Error("학생 정보를 찾을 수 없습니다.");
      claimTeamLeader(data, player);
      return statePayload(data, player);
    }

    if (action === "draw") {
      const player = findPlayerById(data, body.playerId);
      if (!player) throw new Error("학생 정보를 찾을 수 없습니다.");
      const count = Number(body.count || 0);
      if (!DRAW_COUNTS.has(count)) throw new Error("1뽑기, 2뽑기, 3뽑기만 가능합니다.");
      const { results, promotions, fullSetComplete } = grantRandomDraws(data, player, count);
      data.drawLogs.push({ id: id("draw"), playerId: player.id, drawCount: results.length, result: { requestedCount: count, results, promotions, fullSetComplete }, createdAt: nowIso() });
      createEvent(data, player.id, "draw", { requestedCount: count, count: results.length, results, promotions, fullSetComplete });
      return { ...statePayload(data, player), results, promotions, fullSetComplete };
    }

    if (action === "qr-state") {
      const reward = validateQrReward(body.code || query.get("code"));
      assertWarRewardOpen(reward);
      const player = body.playerId ? findPlayerById(data, body.playerId) : null;
      assertWarTeamReady(data, player, reward);
      const claim = player ? (data.qrClaims || []).find((item) => item.playerId === player.id && item.qrCode === reward.code) : null;
      return {
        ...statePayload(data, player),
        qrReward: publicQrReward(reward),
        claimed: reward.repeatable ? false : Boolean(claim),
        claim: reward.repeatable ? null : claim
      };
    }

    if (action === "team-state") {
      const player = findPlayerById(data, body.playerId);
      if (!player) throw new Error("학생 정보를 찾을 수 없습니다.");
      return { ok: true, team: teamSummary(data, player) };
    }

    if (action === "team-war-scan") {
      const player = findPlayerById(data, body.playerId);
      if (!player) throw new Error("학생 정보를 찾을 수 없습니다.");
      markTeamWarScan(data, player);
      return statePayload(data, player);
    }

    if (action === "team-war-role") {
      const player = findPlayerById(data, body.playerId);
      if (!player) throw new Error("학생 정보를 찾을 수 없습니다.");
      setTeamWarRole(data, player, body.armorCode, body.selected === true);
      return statePayload(data, player);
    }

    if (action === "claim-qr") {
      const reward = validateQrReward(body.code || query.get("code"));
      assertWarRewardOpen(reward);
      const player = findPlayerById(data, body.playerId);
      if (!player) throw new Error("학생 정보를 찾을 수 없습니다.");
      assertWarTeamReady(data, player, reward);
      const existing = (data.qrClaims || []).find((claim) => claim.playerId === player.id && claim.qrCode === reward.code);
      if (existing && !reward.repeatable) {
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
      const { results, promotions, fullSetComplete } = grantRandomDraws(data, player, drawCount);
      const claim = {
        id: id("qr"),
        playerId: player.id,
        qrCode: reward.code,
        reward: { ...reward.reward, results, promotions, fullSetComplete },
        createdAt: nowIso()
      };
      if (!reward.repeatable) {
        data.qrClaims = data.qrClaims || [];
        data.qrClaims.push(claim);
      }
      data.drawLogs.push({ id: id("draw"), playerId: player.id, drawCount: results.length, result: { source: "qr", qrCode: reward.code, requestedCount: drawCount, results, promotions, fullSetComplete }, createdAt: nowIso() });
      createEvent(data, player.id, "qr_claim", { qrCode: reward.code, reward: reward.reward, requestedCount: drawCount, count: results.length, results, promotions, fullSetComplete });
      return { ...statePayload(data, player), qrReward: publicQrReward(reward), claimed: !reward.repeatable, repeatable: Boolean(reward.repeatable), claim, results, promotions, fullSetComplete };
    }

    if (action === "ranking") {
      return { ok: true, ranking: rankingFromData(data), partyRanking: partyRankingFromData(data) };
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
      const booth = data.exchangeSessions[boothId];
      if (!booth || (booth.player1Id !== player.id && booth.player2Id !== player.id)) {
        throw new Error("교환소 참여자만 교환을 취소할 수 있습니다.");
      }
      resetBooth(data, boothId);
      createEvent(data, player.id, "exchange_cancel", { boothId });
      return { ...statePayload(data, player), booth: boothView(data, boothId) };
    }

    if (action === "exchange-reset") {
      if (!adminAllowed(body)) throw new Error("교사 PIN이 올바르지 않습니다.");
      const boothId = validateBoothId(body.boothId);
      resetBooth(data, boothId);
      createEvent(data, null, "exchange_reset", { boothId });
      return { ok: true, booths: boothsView(data) };
    }

    if (action === "admin") {
      if (!adminAllowed(body)) throw new Error("교사 PIN이 올바르지 않습니다.");
      return {
        ok: true,
        armor: ARMOR,
        qrRewards: QR_REWARDS.filter((reward) => !reward.legacy).map(publicQrReward),
        ranking: rankingFromData(data),
        players: data.players.map((player) => publicPlayer(player, data.inventories[player.id] || emptyInventory(), { includePrivate: true })),
        teams: finalizedTeamsFromData(data),
        booths: boothsView(data),
        logs: data.eventLogs.slice(-80).reverse()
      };
    }

    if (action === "admin-reopen-team") {
      if (!adminAllowed(body)) throw new Error("교사 PIN이 올바르지 않습니다.");
      adminReopenTeamRoster(data, body.teamKey);
      return {
        ok: true,
        teams: finalizedTeamsFromData(data),
        players: data.players.map((player) => publicPlayer(player, data.inventories[player.id] || emptyInventory(), { includePrivate: true })),
        ranking: rankingFromData(data)
      };
    }

    if (action === "admin-adjust-item") {
      if (!adminAllowed(body)) throw new Error("교사 PIN이 올바르지 않습니다.");
      const player = findPlayerById(data, body.playerId);
      if (!player) throw new Error("학생 정보를 찾을 수 없습니다.");
      const delta = Number(body.delta || 0);
      if (!delta) throw new Error("변경 수량을 입력해주세요.");
      if (!Number.isInteger(delta) || Math.abs(delta) > 99) throw new Error("변경 수량은 -99부터 99 사이의 정수만 가능합니다.");
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
      if (!adminAllowed(body)) throw new Error("교사 PIN이 올바르지 않습니다.");
      const player = findPlayerById(data, body.playerId);
      if (!player) throw new Error("학생 정보를 찾을 수 없습니다.");
      const nextName = body.name === undefined ? player.name : validatePlayerText(body.name, "이름", 20);
      const nextTeam = body.team === undefined ? player.team : validatePlayerText(body.team, "조 이름", 12);
      if (normalizedTeamKey(nextTeam) !== normalizedTeamKey(player.team)) {
        const currentSummary = teamSummary(data, player);
        if (currentSummary.rosterFinalized) throw new Error("확정된 조의 명단을 먼저 다시 연 뒤 조를 변경해주세요.");
        const targetMember = data.players.find((member) => member.id !== player.id && normalizedTeamKey(member.team) === normalizedTeamKey(nextTeam));
        if (targetMember) {
          const targetSummary = teamSummary(data, targetMember);
          if (targetSummary.rosterFinalized) throw new Error("대상 조의 명단이 이미 확정되었습니다.");
          if (allTeamMembersFor(data, targetMember).length >= 6) throw new Error("대상 조는 최대 인원 6명이 모두 참가했습니다.");
        }
      }
      const duplicate = data.players.find((member) => (
        member.id !== player.id
        && member.name.trim() === nextName
        && normalizedTeamKey(member.team) === normalizedTeamKey(nextTeam)
      ));
      if (duplicate) throw new Error("같은 이름과 조 이름을 사용하는 학생이 이미 있습니다.");
      player.name = nextName;
      player.team = nextTeam;
      if (body.score !== undefined) player.score = validateAdminInteger(body.score, "점수");
      if (body.exp !== undefined) player.exp = validateAdminInteger(body.exp, "경험치");
      if (body.talent !== undefined) player.talent = validateAdminInteger(body.talent, "달란트");
      player.updated_at = nowIso();
      createEvent(data, player.id, "admin_update_player", { name: player.name, team: player.team, score: player.score, exp: player.exp, talent: player.talent });
      return { ok: true, player: publicPlayer(player, data.inventories[player.id] || emptyInventory(), { includePrivate: true }), players: data.players.map((p) => publicPlayer(p, data.inventories[p.id] || emptyInventory(), { includePrivate: true })), ranking: rankingFromData(data) };
    }

    throw new Error("알 수 없는 API 액션입니다.");
  }, {
    readOnly: READ_ONLY_ACTIONS.has(action),
    includeHistory: action === "admin"
  });
}

async function handleApiRequest(req, res) {
  let action = "";
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (!["GET", "POST"].includes(req.method || "")) {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    sendError(res, 405, "지원하지 않는 요청 방식입니다.");
    return;
  }
  try {
    const query = getQuery(req);
    action = query.get("action");
    if (!action) {
      sendError(res, 400, "action 파라미터가 필요합니다.");
      return;
    }
    if (!SUPPORTED_ACTIONS.has(action)) {
      sendError(res, 400, "알 수 없는 API 액션입니다.");
      return;
    }
    const schedule = eventWindow();
    if (action === "health") {
      const adminConfigured = Boolean(String(process.env.ADMIN_PIN || "").trim());
      if ((process.env.NODE_ENV === "production" || process.env.VERCEL === "1") && !adminConfigured) {
        const error = new Error("운영 환경에 ADMIN_PIN이 설정되지 않았습니다.");
        error.code = "SERVER_CONFIG_INVALID";
        throw error;
      }
      const snapshot = await getHealthSnapshot();
      const war = warWindow();
      const health = {
        ok: true,
        service: "current-retreat-api",
        status: schedule.active ? "ready" : "ended",
        active: schedule.active,
        endsAt: schedule.endsAt,
        warOpen: war.open,
        warOpensAt: war.opensAt,
        storage: snapshot.storage,
        players: snapshot.players,
        schemaReady: snapshot.schemaReady,
        writable: snapshot.writable,
        databaseId: snapshot.databaseId,
        adminConfigured,
        time: new Date().toISOString()
      };
      sendJson(res, 200, health);
      return;
    }
    if (!schedule.active) {
      sendJson(res, 410, {
        ok: false,
        code: "EVENT_ENDED",
        error: "이번 수련회 앱의 3일 운영이 종료되었습니다.",
        endsAt: schedule.endsAt
      });
      return;
    }

    const body = req.method === "GET" ? {} : await readBody(req);
    const payload = await runAction(action, body, query);
    sendJson(res, 200, payload);
  } catch (error) {
    const serviceError = action === "health" || isServiceError(error);
    const status = Number(error?.statusCode || (serviceError ? 503 : 400));
    if (status >= 500) {
      console.error("current-retreat-api error", { action, code: error?.code || "", message: error?.message || String(error) });
    }
    if (error?.code === "THE_WAR_LOCKED") {
      sendJson(res, status, { ok: false, code: error.code, error: error.message, warOpensAt: error.opensAt || null });
      return;
    }
    sendError(res, status, serviceError ? "서버 연결이 잠시 불안정합니다. 잠시 후 다시 시도해주세요." : (error.message || "요청 처리 중 오류가 발생했습니다."));
  }
}

module.exports = {
  eventWindow,
  handleApiRequest,
  isServiceError,
  runAction,
  warWindow
};
