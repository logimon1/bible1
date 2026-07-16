const fs = require("fs");
const path = require("path");

const root = process.cwd();

const requiredDirs = [
  "01_brand",
  "02_qr_set",
  "03_workbook_student",
  "04_manual_teacher",
  "05_equipment_cards",
  "06_exchange_set",
  "07_stickers",
  "08_content_retreat",
  "09_content_monthly",
  "10_image_assets",
  "11_print_ready",
  "12_guides",
  "13_app_data",
  "14_textbook_set"
];

const requiredFiles = [
  "00_README.md",
  "01_brand/brand_system.md",
  "01_brand/tokens.json",
  "02_qr_set/data/qr_index.json",
  "02_qr_set/data/qr_index.csv",
  "02_qr_set/print/qr_cards.html",
  "02_qr_set/qr_policy.md",
  "03_workbook_student/source/student_workbook_retreat.md",
  "03_workbook_student/source/student_workbook_monthly.md",
  "03_workbook_student/print/student_workbook.html",
  "04_manual_teacher/source/teacher_manual.md",
  "04_manual_teacher/print/teacher_manual.html",
  "05_equipment_cards/data/equipment_cards.json",
  "05_equipment_cards/print/equipment_cards.html",
  "06_exchange_set/source/exchange_rules.md",
  "06_exchange_set/print/exchange_poster.html",
  "07_stickers/data/sticker_manifest.json",
  "07_stickers/print/sticker_sheet.html",
  "08_content_retreat/retreat_content.md",
  "08_content_retreat/retreat_missions.json",
  "09_content_monthly/monthly_content.md",
  "09_content_monthly/monthly_missions.json",
  "10_image_assets/manifest/image_asset_manifest.csv",
  "10_image_assets/manifest/image_asset_manifest.json",
  "10_image_assets/prompts/ai_generation_prompts.md",
  "10_image_assets/production_svg/main_key_visual.svg",
  "10_image_assets/production_svg/workbook_cover_retreat.svg",
  "10_image_assets/production_svg/workbook_cover_monthly.svg",
  "10_image_assets/production_svg/exchange_poster_background.svg",
  "10_image_assets/production_svg/boss_symbol.svg",
  "11_print_ready/index.html",
  "11_print_ready/qr_cards.pdf",
  "11_print_ready/equipment_cards.pdf",
  "11_print_ready/student_workbook.pdf",
  "11_print_ready/teacher_manual.pdf",
  "11_print_ready/exchange_poster.pdf",
  "11_print_ready/sticker_sheet.pdf",
  "12_guides/production_roadmap.md",
  "12_guides/rehearsal_checklist.md",
  "12_guides/rehearsal_report.md",
  "12_guides/admin_operation_table.md",
  "12_guides/completion_audit.md",
  "12_guides/handoff_manifest.md",
  "13_app_data/equipment_set.json",
  "13_app_data/mission_set.json",
  "13_app_data/program_presets.json",
  "14_textbook_set/student/lesson01_truth.md",
  "14_textbook_set/teacher/lesson01_truth_teacher.md",
  "14_textbook_set/activities/lesson01_truth_cards.md",
  "14_textbook_set/activities/lesson01_home_connection.md",
  "14_textbook_set/teacher/lesson01_slides.md",
  "14_textbook_set/DESIGN_V2_KR_REFERENCE.md",
  "14_textbook_set/LESSON01_FINAL.md",
  "14_textbook_set/art/generated/lesson01_truth_editorial_v2.png",
  "14_textbook_set/art/generated/lesson01_truth_listening_spot_v2.png",
  "14_textbook_set/output/pdf/lesson01_student_B5_print.pdf",
  "14_textbook_set/output/pdf/lesson01_teacher_A4_office.pdf",
  "14_textbook_set/output/pdf/lesson01_activity_cards_A4_duplex.pdf",
  "14_textbook_set/output/pdf/lesson01_home_connection_A6_print.pdf",
  "14_textbook_set/output/pdf/lesson01_teacher_slides_16x9.pdf",
  "14_textbook_set/output/pdf/lesson01_build_manifest.json",
  "11_print_ready/lesson01_student_B5_print.pdf",
  "11_print_ready/lesson01_teacher_A4_office.pdf",
  "11_print_ready/lesson01_activity_cards_A4_duplex.pdf",
  "11_print_ready/lesson01_home_connection_A6_print.pdf",
  "11_print_ready/lesson01_teacher_slides_16x9.pdf",
  "11_print_ready/lesson01_build_manifest.json"
];

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`[PASS] ${message}`);
}

for (const dir of requiredDirs) {
  if (exists(dir)) pass(`${dir} exists`);
  else fail(`${dir} missing`);
}

for (const file of requiredFiles) {
  if (exists(file)) pass(`${file} exists`);
  else fail(`${file} missing`);
}

for (const file of requiredFiles.filter((item) => item.endsWith(".pdf"))) {
  if (!exists(file)) continue;
  const stats = fs.statSync(path.join(root, file));
  if (stats.size > 1000) pass(`${file} has PDF content`);
  else fail(`${file} appears too small`);
}

const qrIndexPath = "02_qr_set/data/qr_index.json";
if (exists(qrIndexPath)) {
  const qrIndex = JSON.parse(read(qrIndexPath));
  if (qrIndex.length >= 10) pass("QR index has enough operational codes");
  else fail("QR index is too small");
  for (const qr of qrIndex) {
    const svgPath = `02_qr_set/svg/${qr.code}.svg`;
    if (!exists(svgPath)) fail(`QR SVG missing: ${svgPath}`);
    else if (!read(svgPath).includes("<svg")) fail(`QR SVG invalid: ${svgPath}`);
  }
}

const equipmentPath = "13_app_data/equipment_set.json";
if (exists(equipmentPath)) {
  const equipment = JSON.parse(read(equipmentPath));
  if (equipment.length === 6) pass("equipment set has 6 items");
  else fail("equipment set must have 6 items");

  for (const item of equipment) {
    const illustrationPath = `10_image_assets/production_svg/equipment_illustration_${item.id}.svg`;
    const backgroundPath = `10_image_assets/production_svg/card_background_${item.id}.svg`;
    if (!exists(illustrationPath)) fail(`production equipment illustration missing: ${illustrationPath}`);
    else if (!read(illustrationPath).includes("<svg")) fail(`production equipment illustration invalid: ${illustrationPath}`);
    else pass(`${illustrationPath} exists`);

    if (!exists(backgroundPath)) fail(`production card background missing: ${backgroundPath}`);
    else if (!read(backgroundPath).includes("<svg")) fail(`production card background invalid: ${backgroundPath}`);
    else pass(`${backgroundPath} exists`);
  }
}

const promptText = exists("10_image_assets/prompts/ai_generation_prompts.md")
  ? read("10_image_assets/prompts/ai_generation_prompts.md")
  : "";
if (promptText.includes("QR 본체") && promptText.includes("AI 이미지로 생성하지 않습니다")) {
  pass("AI image policy excludes QR bodies");
} else {
  fail("AI image policy must explicitly exclude QR bodies");
}

const roadmap = exists("12_guides/production_roadmap.md") ? read("12_guides/production_roadmap.md") : "";
for (const step of ["1단계", "2단계", "3단계", "4단계", "5단계", "6단계", "7단계"]) {
  if (roadmap.includes(step)) pass(`${step} documented`);
  else fail(`${step} missing from roadmap`);
}

const pdfScript = exists("scripts/generate-pdfs.js") ? read("scripts/generate-pdfs.js") : "";
if (pdfScript.includes("church-armor-rpg.example/exchange")) {
  fail("generate-pdfs.js must not hardcode exchange QR URLs");
} else {
  pass("PDF exchange QR URLs use DELIVERY_BASE_URL");
}

const adminTable = exists("12_guides/admin_operation_table.md") ? read("12_guides/admin_operation_table.md") : "";
if (adminTable.includes("CSV") && adminTable.includes("달란트") && adminTable.includes("교환소")) {
  pass("admin operation table covers core field operations");
} else {
  fail("admin operation table must cover CSV, talents, and exchange booths");
}

const rehearsalReport = exists("12_guides/rehearsal_report.md") ? read("12_guides/rehearsal_report.md") : "";
if (
  rehearsalReport.includes("npm.cmd run smoke") &&
  rehearsalReport.includes("npm.cmd run check") &&
  rehearsalReport.includes("학생 2명") &&
  rehearsalReport.includes("교환소") &&
  rehearsalReport.includes("인쇄물")
) {
  pass("rehearsal report records app and package smoke evidence");
} else {
  fail("rehearsal report must record app smoke, package check, two students, exchange, and print evidence");
}

const completionAudit = exists("12_guides/completion_audit.md") ? read("12_guides/completion_audit.md") : "";
if (
  completionAudit.includes("admin_operation_table.md") &&
  completionAudit.includes("production_svg") &&
  completionAudit.includes("rehearsal_report.md")
) {
  pass("completion audit links the supplemented roadmap evidence");
} else {
  fail("completion audit must link admin table, production visuals, and rehearsal report");
}

if (process.exitCode) {
  console.error("Package verification failed.");
  process.exit(process.exitCode);
}

console.log("Package verification passed.");
