const fs = require("fs");
const path = require("path");

const root = process.cwd();
const checks = [];

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function pass(message) {
  checks.push({ level: "PASS", message });
}

function warn(message) {
  checks.push({ level: "WARN", message });
}

function fail(message) {
  checks.push({ level: "FAIL", message });
}

function requireFile(relativePath) {
  if (exists(relativePath)) pass(`${relativePath} exists`);
  else fail(`${relativePath} is missing`);
}

function checkFiles() {
  [
    "package.json",
    "package-lock.json",
    "vercel.json",
    ".env.example",
    "schema.sql",
    "config/program.config.json",
    "public/index.html",
    "public/app.js",
    "public/styles.css",
    "api/app.js",
    "server/api.js",
    "server/core.js",
    "server/store.js"
  ].forEach(requireFile);
}

function checkPackage() {
  if (!exists("package.json")) return;
  const pkg = readJson("package.json");
  const scripts = pkg.scripts || {};
  ["dev", "check", "build", "smoke", "test", "doctor", "rehearsal"].forEach((script) => {
    if (scripts[script]) pass(`npm script ${script} exists`);
    else fail(`npm script ${script} is missing`);
  });
  if (pkg.dependencies?.pg) pass("pg dependency exists");
  else fail("pg dependency is missing");
  if (pkg.dependencies?.qrcode) pass("qrcode dependency exists");
  else fail("qrcode dependency is missing");
}

function checkVercel() {
  if (!exists("vercel.json")) return;
  const vercel = readJson("vercel.json");
  if (vercel.outputDirectory === "public") pass("vercel outputDirectory is public");
  else fail("vercel outputDirectory must be public");
  if (vercel.buildCommand === "npm run build") pass("vercel buildCommand is npm run build");
  else warn("vercel buildCommand is not npm run build");
  const rewrites = JSON.stringify(vercel.rewrites || []);
  ["/mission/:code*", "/hidden/:code*", "/exchange/:booth", "/admin/print/:page"].forEach((route) => {
    if (rewrites.includes(route)) pass(`rewrite ${route} exists`);
    else fail(`rewrite ${route} is missing`);
  });
}

function checkSchema() {
  if (!exists("schema.sql")) return;
  const schema = readText("schema.sql").toLowerCase();
  if (schema.includes("mission_completions")) pass("mission_completions table exists");
  else fail("mission_completions table is missing");
  if (schema.includes("unique (player_id, mission_code)")) pass("mission duplicate unique constraint exists");
  else fail("mission duplicate unique constraint is missing");
  if (schema.includes("exchange_sessions")) pass("exchange_sessions table exists");
  else fail("exchange_sessions table is missing");
}

function checkProgramConfig() {
  if (!exists("config/program.config.json")) return;
  const config = readJson("config/program.config.json");
  if (["retreat", "monthly"].includes(config.programMode)) pass("programMode is valid");
  else fail("programMode must be retreat or monthly");
  if (Array.isArray(config.equipmentSet) && config.equipmentSet.length === 6) pass("equipmentSet has 6 items");
  else fail("equipmentSet must have 6 items");
  if (Array.isArray(config.qrSet) && config.qrSet.length >= 6) pass("qrSet has mission data");
  else fail("qrSet must include mission data");
  if (config.missionUnlockPolicy?.lockFutureWeeks === true) pass("monthly future-week lock is enabled");
  else warn("monthly future-week lock is not enabled");
}

function checkEnvironment() {
  const productionLike = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
  if (process.env.ADMIN_PIN) pass("ADMIN_PIN is set");
  else warn("ADMIN_PIN is not set in current shell");
  if (process.env.DATABASE_URL) pass("DATABASE_URL is set");
  else if (productionLike) fail("DATABASE_URL is required for production/Vercel");
  else warn("DATABASE_URL is not set; local file DB will be used");
}

checkFiles();
checkPackage();
checkVercel();
checkSchema();
checkProgramConfig();
checkEnvironment();

for (const check of checks) {
  console.log(`[${check.level}] ${check.message}`);
}

const failed = checks.filter((check) => check.level === "FAIL");
if (failed.length) {
  console.error(`Doctor failed with ${failed.length} issue(s).`);
  process.exit(1);
}

console.log("Doctor passed.");
