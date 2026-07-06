const fs = require("fs");
const path = require("path");

const CONFIG_FILE = path.resolve(process.env.PROGRAM_CONFIG_FILE || path.join(process.cwd(), "config", "program.config.json"));

function readConfigFile() {
  const raw = fs.readFileSync(CONFIG_FILE, "utf8");
  return JSON.parse(raw);
}

function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function loadProgramConfig() {
  const config = readConfigFile();
  const programMode = process.env.PROGRAM_MODE || config.programMode || "retreat";
  return {
    ...config,
    programMode,
    churchName: process.env.CHURCH_NAME || config.churchName || "샘플교회",
    eventName: process.env.EVENT_NAME || config.eventName || "전신갑주 QR RPG",
    eventStartDate: process.env.EVENT_START_DATE || config.eventStartDate || "",
    eventEndDate: process.env.EVENT_END_DATE || config.eventEndDate || "",
    participantLimit: envNumber("PARTICIPANT_LIMIT", Number(config.participantLimit || 80)),
    currentWeek: envNumber("CURRENT_WEEK", Number(config.currentWeek || 1)),
    teamMode: process.env.TEAM_MODE ? process.env.TEAM_MODE === "true" : Boolean(config.teamMode),
    qrSet: Array.isArray(config.qrSet) ? config.qrSet : [],
    equipmentSet: Array.isArray(config.equipmentSet) ? config.equipmentSet : []
  };
}

function publicProgramConfig(config = loadProgramConfig()) {
  return {
    programMode: config.programMode,
    churchName: config.churchName,
    eventName: config.eventName,
    eventStartDate: config.eventStartDate,
    eventEndDate: config.eventEndDate,
    participantLimit: config.participantLimit,
    teamMode: config.teamMode,
    currentWeek: config.currentWeek,
    rewardPolicy: config.rewardPolicy,
    missionUnlockPolicy: config.missionUnlockPolicy,
    exchangeSettings: config.exchangeSettings,
    adminSettings: {
      allowReset: Boolean(config.adminSettings?.allowReset),
      allowCsvExport: Boolean(config.adminSettings?.allowCsvExport),
      allowManualRewards: Boolean(config.adminSettings?.allowManualRewards)
    }
  };
}

function missionUrlPath(mission) {
  if (mission.code === "boss-forest") return "/boss";
  if (mission.code.startsWith("hidden-")) return `/hidden/${mission.code.replace(/^hidden-/, "")}`;
  if (mission.code.startsWith("mission-")) return `/mission/${mission.code.replace(/^mission-/, "")}`;
  return `/qr/${mission.code}`;
}

module.exports = {
  CONFIG_FILE,
  loadProgramConfig,
  missionUrlPath,
  publicProgramConfig
};
