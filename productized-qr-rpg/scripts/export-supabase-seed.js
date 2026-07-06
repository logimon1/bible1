const fs = require("fs");
const path = require("path");

const { loadProgramConfig } = require("../server/config");

const outputFile = path.resolve(process.env.SUPABASE_SEED_FILE || path.join(process.cwd(), "supabase.seed.sql"));
const config = loadProgramConfig();
const programId = process.env.PROGRAM_ID || "default";

function sql(value) {
  if (value === null || value === undefined || value === "") return "null";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlJson(value) {
  return `'${JSON.stringify(value || {}).replace(/'/g, "''")}'::jsonb`;
}

function dateSql(value) {
  return value ? `${sql(value)}::date` : "null";
}

const lines = [];

lines.push("-- Generated from config/program.config.json. Re-run npm run export:seed-sql after config changes.");
lines.push("begin;");
lines.push("");
lines.push(`insert into programs (id, program_mode, church_name, event_name, event_start_date, event_end_date, participant_limit, team_mode, settings)`);
lines.push(`values (${sql(programId)}, ${sql(config.programMode)}, ${sql(config.churchName)}, ${sql(config.eventName)}, ${dateSql(config.eventStartDate)}, ${dateSql(config.eventEndDate)}, ${Number(config.participantLimit || 80)}, ${config.teamMode ? "true" : "false"}, ${sqlJson({
  rewardPolicy: config.rewardPolicy,
  missionUnlockPolicy: config.missionUnlockPolicy,
  exchangeSettings: config.exchangeSettings,
  adminSettings: config.adminSettings,
  currentWeek: config.currentWeek
})})`);
lines.push("on conflict (id) do update set");
lines.push("  program_mode = excluded.program_mode,");
lines.push("  church_name = excluded.church_name,");
lines.push("  event_name = excluded.event_name,");
lines.push("  event_start_date = excluded.event_start_date,");
lines.push("  event_end_date = excluded.event_end_date,");
lines.push("  participant_limit = excluded.participant_limit,");
lines.push("  team_mode = excluded.team_mode,");
lines.push("  settings = excluded.settings,");
lines.push("  updated_at = now();");
lines.push("");

for (const equipment of config.equipmentSet || []) {
  lines.push(`insert into equipment (id, name, verse, description, effect, unlock_condition, print_text)`);
  lines.push(`values (${sql(equipment.id)}, ${sql(equipment.name)}, ${sql(equipment.verse)}, ${sql(equipment.description)}, ${sql(equipment.effect)}, ${sql(equipment.unlockCondition)}, ${sql(equipment.printText)})`);
  lines.push("on conflict (id) do update set");
  lines.push("  name = excluded.name,");
  lines.push("  verse = excluded.verse,");
  lines.push("  description = excluded.description,");
  lines.push("  effect = excluded.effect,");
  lines.push("  unlock_condition = excluded.unlock_condition,");
  lines.push("  print_text = excluded.print_text;");
  lines.push("");
}

for (const mission of config.qrSet || []) {
  lines.push(`insert into missions (code, program_id, mode, phase, week_index, title, short_description, verse, armor_code, reward, small_group_question, active)`);
  lines.push(`values (${sql(mission.code)}, ${sql(programId)}, ${sql(mission.mode || config.programMode)}, ${sql(mission.phase)}, ${Number(mission.weekIndex || 0)}, ${sql(mission.title)}, ${sql(mission.shortDescription)}, ${sql(mission.verse)}, ${sql(mission.armor)}, ${sqlJson(mission.reward)}, ${sql(mission.smallGroupQuestion)}, true)`);
  lines.push("on conflict (code) do update set");
  lines.push("  program_id = excluded.program_id,");
  lines.push("  mode = excluded.mode,");
  lines.push("  phase = excluded.phase,");
  lines.push("  week_index = excluded.week_index,");
  lines.push("  title = excluded.title,");
  lines.push("  short_description = excluded.short_description,");
  lines.push("  verse = excluded.verse,");
  lines.push("  armor_code = excluded.armor_code,");
  lines.push("  reward = excluded.reward,");
  lines.push("  small_group_question = excluded.small_group_question,");
  lines.push("  active = excluded.active;");
  lines.push("");
}

lines.push("insert into exchange_sessions (booth_id, status)");
lines.push("values (1, 'empty'), (2, 'empty')");
lines.push("on conflict (booth_id) do nothing;");
lines.push("");
lines.push("commit;");
lines.push("");

fs.writeFileSync(outputFile, lines.join("\n"), "utf8");
console.log(`Supabase seed SQL written to ${outputFile}`);
