const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

const root = process.cwd();
const outDir = path.join(root, "11_print_ready");
const baseUrl = (process.env.DELIVERY_BASE_URL || "https://church-armor-rpg.example").replace(/\/+$/, "");
const fontRegular = "C:\\Windows\\Fonts\\malgun.ttf";
const fontBold = "C:\\Windows\\Fonts\\malgunbd.ttf";

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function ensureOut() {
  fs.mkdirSync(outDir, { recursive: true });
}

function createDoc(fileName, options = {}) {
  ensureOut();
  const doc = new PDFDocument({
    size: options.size || "A4",
    layout: options.layout || "portrait",
    margin: options.margin || 42,
    info: {
      Title: options.title || fileName,
      Author: "전신갑주 QR RPG"
    }
  });
  const stream = fs.createWriteStream(path.join(outDir, fileName));
  doc.pipe(stream);
  if (fs.existsSync(fontRegular)) doc.registerFont("body", fontRegular);
  if (fs.existsSync(fontBold)) doc.registerFont("bold", fontBold);
  doc.font(fs.existsSync(fontRegular) ? "body" : "Helvetica");
  return { doc, stream };
}

function done(doc, stream) {
  doc.end();
  return new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
}

function title(doc, text, size = 24) {
  doc.font(fs.existsSync(fontBold) ? "bold" : "Helvetica-Bold").fontSize(size).fillColor("#2b2926").text(text);
  doc.moveDown(0.5);
  doc.font(fs.existsSync(fontRegular) ? "body" : "Helvetica").fontSize(10).fillColor("#2b2926");
}

function sectionTitle(doc, text) {
  doc.moveDown(0.5);
  doc.font(fs.existsSync(fontBold) ? "bold" : "Helvetica-Bold").fontSize(14).fillColor("#173f35").text(text);
  doc.font(fs.existsSync(fontRegular) ? "body" : "Helvetica").fontSize(10).fillColor("#2b2926");
}

function card(doc, x, y, w, h, heading, lines = [], accent = "#e9b64b") {
  doc.roundedRect(x, y, w, h, 8).fillAndStroke("#fffaf0", "#2b2926");
  doc.rect(x, y, w, 28).fill(accent);
  doc.font(fs.existsSync(fontBold) ? "bold" : "Helvetica-Bold").fontSize(12).fillColor("#2b2926").text(heading, x + 10, y + 8, { width: w - 20, height: 18 });
  doc.font(fs.existsSync(fontRegular) ? "body" : "Helvetica").fontSize(8.5).fillColor("#2b2926");
  let cy = y + 38;
  for (const line of lines) {
    doc.text(String(line), x + 10, cy, { width: w - 20, height: 24 });
    cy += 24;
  }
}

async function qrPng(text, size = 260) {
  return QRCode.toBuffer(text, {
    type: "png",
    errorCorrectionLevel: "M",
    margin: 2,
    width: size,
    color: { dark: "#000000", light: "#ffffff" }
  });
}

async function makeQrCards() {
  const qrIndex = readJson("02_qr_set/data/qr_index.json");
  const { doc, stream } = createDoc("qr_cards.pdf", { title: "QR 카드 세트" });
  title(doc, "QR 카드 세트");
  const cols = 2;
  const w = 245;
  const h = 230;
  const gap = 18;
  let index = 0;
  for (const qr of qrIndex) {
    if (index > 0 && index % 4 === 0) doc.addPage();
    const slot = index % 4;
    const x = 42 + (slot % cols) * (w + gap);
    const y = 92 + Math.floor(slot / cols) * (h + gap);
    card(doc, x, y, w, h, `${qr.number} · ${qr.title}`, [qr.description, `${qr.verse} · ${qr.mode}`, qr.url], "#e9b64b");
    const png = await qrPng(qr.url, 220);
    doc.image(png, x + w - 112, y + h - 112, { width: 96, height: 96 });
    index += 1;
  }
  await done(doc, stream);
}

async function makeEquipmentCards() {
  const equipment = readJson("13_app_data/equipment_set.json");
  const { doc, stream } = createDoc("equipment_cards.pdf", { title: "장비카드 6종" });
  title(doc, "장비카드 6종");
  const w = 160;
  const h = 220;
  const gap = 18;
  equipment.forEach((item, index) => {
    const x = 42 + (index % 3) * (w + gap);
    const y = 92 + Math.floor(index / 3) * (h + gap);
    card(doc, x, y, w, h, item.name, [item.verse, item.description, `획득: ${item.unlockCondition}`, `효과: ${item.effect}`], item.color);
  });
  await done(doc, stream);
}

async function makeWorkbook() {
  const equipment = readJson("13_app_data/equipment_set.json");
  const missions = readJson("13_app_data/mission_set.json");
  const { doc, stream } = createDoc("student_workbook.pdf", { title: "학생용 워크북" });
  title(doc, "학생용 워크북");
  doc.fontSize(11).text("휴대폰 기본 카메라로 QR을 스캔하고, 미션 완료 후 이 워크북에 말씀과 적용을 기록합니다.");
  sectionTitle(doc, "전신갑주 소개");
  equipment.forEach((item) => doc.text(`□ ${item.name} · ${item.description}`));
  sectionTitle(doc, "미션 기록");
  missions.filter((m) => m.type === "mission").forEach((mission) => {
    doc.moveDown(0.4);
    doc.font(fs.existsSync(fontBold) ? "bold" : "Helvetica-Bold").text(`${mission.number}. ${mission.title}`);
    doc.font(fs.existsSync(fontRegular) ? "body" : "Helvetica").text(`본문: ${mission.verse}`);
    doc.text(`질문: ${mission.question}`);
    doc.text("기록: ________________________________________________");
  });
  doc.addPage();
  title(doc, "최종 결단");
  doc.text("내가 붙들 말씀:");
  doc.moveDown(3);
  doc.text("수련회 또는 4주 챌린지 이후 실천할 한 가지:");
  doc.moveDown(3);
  doc.text("기도 제목:");
  await done(doc, stream);
}

async function makeTeacherManual() {
  const { doc, stream } = createDoc("teacher_manual.pdf", { title: "교사용 운영 매뉴얼" });
  title(doc, "교사용 운영 매뉴얼");
  sectionTitle(doc, "사전 준비");
  ["앱 배포 URL 확정", "QR 카드 출력 후 휴대폰 카메라 테스트", "관리자 PIN 확인", "학생 조 편성", "교환소 담당 교사 지정"].forEach((item) => doc.text(`□ ${item}`));
  sectionTitle(doc, "운영 순서");
  ["오프닝/튜토리얼", "일반 QR 미션", "히든 QR 또는 주차 미션", "교환소 운영", "보스전/최종 결단", "랭킹/완주 발표"].forEach((item, index) => doc.text(`${index + 1}. ${item}`));
  sectionTitle(doc, "비상 대응");
  ["QR 인식 실패: 예비 QR 또는 URL 직접 입력", "동명이인: 입장코드 확인", "보상 오류: 관리자 수동 지급/회수", "인터넷 불안정: 조장 또는 교사용 기기로 진행"].forEach((item) => doc.text(`- ${item}`));
  await done(doc, stream);
}

async function makeExchangePoster() {
  const { doc, stream } = createDoc("exchange_poster.pdf", { title: "교환소 포스터" });
  title(doc, "전신갑주 교환소", 36);
  doc.fontSize(16).text("두 학생이 선생님 앞에서 공정하게 장비를 교환합니다.", { align: "center" });
  const qr1 = await qrPng(`${baseUrl}/exchange/1`, 260);
  const qr2 = await qrPng(`${baseUrl}/exchange/2`, 260);
  doc.image(qr1, 100, 190, { width: 150, height: 150 });
  doc.image(qr2, 345, 190, { width: 150, height: 150 });
  doc.font(fs.existsSync(fontBold) ? "bold" : "Helvetica-Bold").fontSize(18).text("교환소 1", 120, 350);
  doc.text("교환소 2", 365, 350);
  sectionTitle(doc, "규칙");
  doc.fontSize(14).text("두 명 입장 · 최대 2칸 제시 · 양쪽 동의 후 완료 · 문제 발생 시 선생님 호출");
  await done(doc, stream);
}

async function makeStickerSheet() {
  const stickers = readJson("07_stickers/data/sticker_manifest.json");
  const { doc, stream } = createDoc("sticker_sheet.pdf", { title: "스티커 시트" });
  title(doc, "스티커 시트");
  const w = 150;
  const h = 105;
  stickers.forEach((sticker, index) => {
    const x = 42 + (index % 3) * (w + 20);
    const y = 92 + Math.floor(index / 3) * (h + 20);
    doc.roundedRect(x, y, w, h, 20).fillAndStroke("#fffaf0", "#2b2926");
    doc.circle(x + 75, y + 42, 28).fill(index % 2 ? "#49b999" : "#e9b64b").stroke("#2b2926");
    doc.font(fs.existsSync(fontBold) ? "bold" : "Helvetica-Bold").fontSize(11).fillColor("#2b2926").text(sticker.label, x + 8, y + 75, { width: w - 16, align: "center" });
  });
  await done(doc, stream);
}

async function main() {
  await makeQrCards();
  await makeEquipmentCards();
  await makeWorkbook();
  await makeTeacherManual();
  await makeExchangePoster();
  await makeStickerSheet();
  console.log(`PDF files generated under ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
