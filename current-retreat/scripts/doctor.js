const fs = require("fs/promises");
const path = require("path");
const { eventWindow, warWindow } = require("../server/api");
const { getHealthSnapshot, shouldUsePostgres } = require("../server/store");

const root = path.resolve(__dirname, "..");
const productionCheck = process.argv.includes("--production");

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

async function requireFile(relativePath) {
  const stat = await fs.stat(path.join(root, relativePath));
  requireValue(stat.isFile() && stat.size > 0, `${relativePath} 파일이 없거나 비어 있습니다.`);
}

async function main() {
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  requireValue(nodeMajor >= 18, "Node.js 18 이상이 필요합니다.");

  for (const relativePath of [
    "index.html",
    "app.js",
    "styles.css",
    "schema.sql",
    "vercel.json",
    "api/app.js",
    "print-package/generate_print_package.py",
    "print-package/qr_manifest.template.json",
    "assets/ui/entry-armor-hero.webp",
    "assets/ui/trial-forest-hero.webp",
    "assets/armor/belt.webp",
    "assets/armor/breastplate.webp",
    "assets/armor/shoes.webp",
    "assets/armor/shield.webp",
    "assets/armor/helmet.webp",
    "assets/armor/sword.webp"
  ]) await requireFile(relativePath);

  const vercel = JSON.parse(await fs.readFile(path.join(root, "vercel.json"), "utf8"));
  requireValue(vercel.outputDirectory === "public", "vercel.json outputDirectory는 public이어야 합니다.");
  const rewriteSources = new Set((vercel.rewrites || []).map((rule) => rule.source));
  for (const source of ["/party", "/ranking", "/forest", "/team/:action", "/exchange/:booth", "/draw/:count", "/mission/:code*", "/hidden/:code*", "/boss", "/admin"]) {
    requireValue(rewriteSources.has(source), `Vercel SPA rewrite가 누락됐습니다: ${source}`);
  }

  const schema = await fs.readFile(path.join(root, "schema.sql"), "utf8");
  requireValue(/current-retreat-v2/.test(schema), "schema.sql에 current-retreat DB 식별자가 없습니다.");
  for (const table of ["app_metadata", "players", "inventory", "draw_logs", "qr_claims", "exchange_sessions", "event_logs"]) {
    requireValue(new RegExp(`create table if not exists ${table}\\b`, "i").test(schema), `schema.sql에 ${table} 테이블이 없습니다.`);
  }

  const printTemplateText = await fs.readFile(path.join(root, "print-package", "qr_manifest.template.json"), "utf8");
  const printTemplate = JSON.parse(printTemplateText);
  requireValue(Array.isArray(printTemplate) && printTemplate.length === 20, "인쇄 QR 템플릿은 20개 항목이어야 합니다.");
  for (const phrase of ["시험의 숲", "전신갑주 합체", "팀 합체", "담당 장비"]) {
    requireValue(!printTemplateText.includes(phrase), `인쇄 QR 템플릿에 폐기된 문구가 있습니다: ${phrase}`);
  }
  for (const phrase of ["THE WAR 공동 체크인", "전원 완료 후 역할 배분", "writable"]) {
    requireValue(printTemplateText.includes(phrase), `인쇄 QR 템플릿의 현장 안내가 빠졌습니다: ${phrase}`);
  }

  if (productionCheck) {
    requireValue(Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL), "운영 점검에는 DATABASE_URL 또는 POSTGRES_URL이 필요합니다.");
    requireValue(Boolean(String(process.env.ADMIN_PIN || "").trim()), "운영 점검에는 ADMIN_PIN이 필요합니다.");
    requireValue(Boolean(String(process.env.THE_WAR_OPENS_AT || "").trim()), "운영 점검에는 THE_WAR_OPENS_AT이 필요합니다.");
    requireValue(Boolean(String(process.env.EVENT_ENDS_AT || "").trim()), "운영 점검에는 EVENT_ENDS_AT이 필요합니다.");
  }

  eventWindow();
  warWindow();

  let storageMessage = "로컬 파일 DB 구성";
  if (shouldUsePostgres()) {
    const snapshot = await getHealthSnapshot();
    requireValue(snapshot.storage === "postgres", "운영 DB가 Postgres로 연결되지 않았습니다.");
    requireValue(snapshot.schemaReady && snapshot.writable, "운영 DB 스키마 또는 쓰기 권한이 준비되지 않았습니다.");
    requireValue(snapshot.databaseId === "current-retreat-v2", "이번 수련회 전용 DB 식별자가 일치하지 않습니다.");
    storageMessage = `Postgres 준비 완료 · 현재 학생 ${snapshot.players}명`;
  } else if (productionCheck) {
    throw new Error("운영 점검에서 Postgres 연결을 확인하지 못했습니다.");
  }

  console.log(`Doctor passed: ${storageMessage}`);
  if (!productionCheck && !process.env.THE_WAR_OPENS_AT) console.warn("안내: THE_WAR_OPENS_AT이 비어 있어 로컬에서는 THE WAR가 즉시 열립니다.");
  if (!productionCheck && !process.env.EVENT_ENDS_AT) console.warn("안내: EVENT_ENDS_AT이 비어 있어 자동 운영 종료가 비활성화됩니다.");
}

main().catch((error) => {
  console.error(`Doctor failed: ${error.message}`);
  process.exit(1);
});
