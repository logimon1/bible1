const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const scriptArg = process.argv[2];
if (!scriptArg) {
  console.error("Usage: node scripts/textbook/run-python.js <script.py>");
  process.exit(1);
}

const candidates = [
  process.env.TEXTBOOK_PYTHON,
  path.join(os.homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "python.exe"),
  process.platform === "win32" ? "python.exe" : "python3"
].filter(Boolean);

for (const candidate of candidates) {
  if (path.isAbsolute(candidate) && !fs.existsSync(candidate)) continue;
  const probe = spawnSync(candidate, ["-c", "import reportlab, pypdf, PIL"], { encoding: "utf8" });
  if (probe.status !== 0) continue;
  const result = spawnSync(candidate, [scriptArg], { stdio: "inherit", cwd: process.cwd() });
  process.exit(result.status ?? 1);
}

console.error("A Python runtime with reportlab, pypdf, and Pillow is required. Set TEXTBOOK_PYTHON to its executable path.");
process.exit(1);
