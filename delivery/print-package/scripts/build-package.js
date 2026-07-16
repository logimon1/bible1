const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");

const root = process.cwd();
const baseUrl = process.env.DELIVERY_BASE_URL || "https://church-armor-rpg.example";

const dirs = [
  "01_brand",
  "02_qr_set/data",
  "02_qr_set/svg",
  "02_qr_set/print",
  "03_workbook_student/source",
  "03_workbook_student/print",
  "04_manual_teacher/source",
  "04_manual_teacher/print",
  "05_equipment_cards/data",
  "05_equipment_cards/print",
  "06_exchange_set/source",
  "06_exchange_set/print",
  "07_stickers/data",
  "07_stickers/print",
  "08_content_retreat",
  "09_content_monthly",
  "10_image_assets/manifest",
  "10_image_assets/prompts",
  "10_image_assets/production_svg",
  "11_print_ready",
  "12_guides",
  "13_app_data",
  "14_textbook_set"
];

const equipment = [
  {
    id: "belt",
    name: "진리의 허리띠",
    verse: "에베소서 6:14",
    color: "#b98535",
    theme: "진리",
    description: "말과 상황을 하나님의 진리로 분별하도록 돕는 장비입니다.",
    effect: "거짓 분별 미션에서 힌트 1개",
    unlockCondition: "진리 미션 완료",
    printText: "진리로 마음을 단단히 묶으세요."
  },
  {
    id: "breastplate",
    name: "의의 흉배",
    verse: "에베소서 6:14",
    color: "#d8dce2",
    theme: "의",
    description: "예수님의 의로 마음과 정체성을 지키는 장비입니다.",
    effect: "정체성 고백 미션에서 재도전 1회",
    unlockCondition: "의 미션 완료",
    printText: "예수님의 의로 마음을 지키세요."
  },
  {
    id: "shoes",
    name: "평안의 복음의 신",
    verse: "에베소서 6:15",
    color: "#49b999",
    theme: "평안",
    description: "복음의 평안을 들고 움직이게 하는 장비입니다.",
    effect: "전달/격려 미션에서 추가 달란트",
    unlockCondition: "평안 미션 완료",
    printText: "복음의 평안을 들고 걸어가세요."
  },
  {
    id: "shield",
    name: "믿음의 방패",
    verse: "에베소서 6:16",
    color: "#294c8a",
    theme: "믿음",
    description: "두려움과 의심을 믿음으로 막는 장비입니다.",
    effect: "시련의 숲 방해 1회 무효",
    unlockCondition: "믿음 미션 완료",
    printText: "믿음으로 두려움을 막으세요."
  },
  {
    id: "helmet",
    name: "구원의 투구",
    verse: "에베소서 6:17",
    color: "#e1b84b",
    theme: "구원",
    description: "구원의 확신으로 생각을 지키는 장비입니다.",
    effect: "보기 제거 또는 힌트 1개",
    unlockCondition: "구원 미션 완료",
    printText: "구원의 확신으로 생각을 지키세요."
  },
  {
    id: "sword",
    name: "성령의 검",
    verse: "에베소서 6:17",
    color: "#4a8fb8",
    theme: "말씀",
    description: "하나님의 말씀으로 선택하고 결단하게 하는 장비입니다.",
    effect: "최종 미션에서 말씀 힌트 1개",
    unlockCondition: "말씀/결단 미션 완료",
    printText: "말씀으로 오늘의 선택을 세우세요."
  }
];

const missions = [
  {
    code: "tutorial-entry",
    type: "tutorial",
    mode: "both",
    phase: "opening",
    week: 0,
    number: "T",
    title: "모험 시작 튜토리얼",
    verse: "에베소서 6:13",
    route: "/",
    description: "학생 등록, 입장코드 확인, QR 진행법을 안내합니다.",
    activity: "이름과 조를 입력하고 첫 장비 설명을 확인합니다.",
    question: "나는 이번 프로그램에서 무엇을 기대하나요?",
    reward: "기본 안내"
  },
  {
    code: "mission-truth",
    type: "mission",
    mode: "both",
    phase: "stage1",
    week: 1,
    number: "01",
    title: "진리 분별 미션",
    verse: "에베소서 6:14",
    route: "/mission/truth",
    description: "확인할 수 있는 사실과 아직 확인하지 않은 설명을 구분하고, 말씀에 맞는 다음 행동을 정합니다.",
    activity: "팀별로 문장 카드를 분류하고, 사람을 적으로 삼지 않는 확인 질문과 다음 행동을 만듭니다.",
    question: "이 상황에서 확인된 사실은 무엇이고, 사람을 적으로 삼지 않는 다음 행동은 무엇인가요?",
    reward: "장비 뽑기 1회, 달란트 10"
  },
  {
    code: "mission-righteousness",
    type: "mission",
    mode: "monthly",
    phase: "week1",
    week: 1,
    number: "02",
    title: "의의 고백 미션",
    verse: "에베소서 6:14",
    route: "/mission/righteousness",
    description: "나를 흔드는 말과 복음의 고백을 비교합니다.",
    activity: "정체성 고백 문장을 워크북에 적고 나눕니다.",
    question: "나는 어떤 말로 내 정체성을 판단하나요?",
    reward: "장비 뽑기 1회, 달란트 10"
  },
  {
    code: "mission-gospel",
    type: "mission",
    mode: "monthly",
    phase: "week2",
    week: 2,
    number: "03",
    title: "평안 전달 미션",
    verse: "에베소서 6:15",
    route: "/mission/gospel",
    description: "복음의 평안을 담은 격려 메시지를 전달합니다.",
    activity: "한 사람에게 격려 문장을 작성하고 전달합니다.",
    question: "내가 평안을 전해야 할 사람은 누구인가요?",
    reward: "장비 뽑기 1회, 달란트 12"
  },
  {
    code: "mission-faith",
    type: "mission",
    mode: "both",
    phase: "stage2",
    week: 3,
    number: "04",
    title: "믿음 선택 미션",
    verse: "에베소서 6:16",
    route: "/mission/faith",
    description: "두려움 카드 앞에서 믿음의 선택을 고백합니다.",
    activity: "상황 카드별 믿음의 반응을 팀으로 정리합니다.",
    question: "내가 믿음으로 막아야 할 불화살은 무엇인가요?",
    reward: "장비 뽑기 1회, 달란트 10"
  },
  {
    code: "mission-salvation",
    type: "mission",
    mode: "monthly",
    phase: "week3",
    week: 3,
    number: "05",
    title: "구원의 확신 미션",
    verse: "에베소서 6:17",
    route: "/mission/salvation",
    description: "구원과 정체성에 대한 말씀 문장을 완성합니다.",
    activity: "말씀 빈칸을 채우고 확신 문장을 기록합니다.",
    question: "하나님은 나를 어떤 사람으로 부르셨나요?",
    reward: "장비 뽑기 1회, 달란트 12"
  },
  {
    code: "mission-word",
    type: "mission",
    mode: "both",
    phase: "final",
    week: 4,
    number: "06",
    title: "말씀 적용 미션",
    verse: "에베소서 6:17",
    route: "/mission/word",
    description: "오늘의 선택에 적용할 말씀 구절을 찾고 결단합니다.",
    activity: "말씀 카드를 뽑아 실제 적용 문장을 작성합니다.",
    question: "이번 주 내 선택을 세울 말씀은 무엇인가요?",
    reward: "장비 뽑기 1회, 달란트 15"
  },
  {
    code: "hidden-forest-cache-1",
    type: "hidden",
    mode: "retreat",
    phase: "hidden",
    week: 0,
    number: "H1",
    title: "숨겨진 숲 보급함",
    verse: "에베소서 6:13",
    route: "/hidden/forest-cache-1",
    description: "현장 탐색 중 발견하는 보너스 QR입니다.",
    activity: "선생님이 숨긴 위치를 찾아 QR을 스캔합니다.",
    question: "어려움 속에서도 붙들어야 할 믿음은 무엇인가요?",
    reward: "장비 뽑기 2회, 달란트 10"
  },
  {
    code: "hidden-verse-cache-2",
    type: "hidden",
    mode: "retreat",
    phase: "hidden",
    week: 0,
    number: "H2",
    title: "숨겨진 말씀 조각",
    verse: "시편 119:105",
    route: "/hidden/verse-cache-2",
    description: "말씀 조각을 찾는 보너스 QR입니다.",
    activity: "QR 주변의 말씀 단서를 찾아 팀에게 공유합니다.",
    question: "말씀은 나의 길에서 어떤 빛이 되나요?",
    reward: "달란트 15"
  },
  {
    code: "exchange-booth-1",
    type: "exchange",
    mode: "retreat",
    phase: "exchange",
    week: 0,
    number: "E1",
    title: "교환소 1",
    verse: "고린도전서 12:4",
    route: "/exchange/1",
    description: "두 학생이 선생님 앞에서 장비를 교환합니다.",
    activity: "각자 최대 2개 장비를 제시하고 동시에 동의합니다.",
    question: "내가 팀을 위해 나눌 수 있는 것은 무엇인가요?",
    reward: "교환 완료"
  },
  {
    code: "exchange-booth-2",
    type: "exchange",
    mode: "retreat",
    phase: "exchange",
    week: 0,
    number: "E2",
    title: "교환소 2",
    verse: "고린도전서 12:4",
    route: "/exchange/2",
    description: "병목을 줄이기 위한 두 번째 교환소입니다.",
    activity: "교환소 1과 동일하게 운영합니다.",
    question: "공정한 교환을 위해 필요한 태도는 무엇인가요?",
    reward: "교환 완료"
  },
  {
    code: "boss-forest",
    type: "boss",
    mode: "retreat",
    phase: "boss",
    week: 4,
    number: "B",
    title: "최종 결단 미션",
    verse: "에베소서 6:13",
    route: "/boss",
    description: "전신갑주를 확인하고 마지막 결단을 고백합니다.",
    activity: "팀별로 말씀과 장비를 활용해 최종 과제를 수행합니다.",
    question: "수련회 이후 내가 지킬 한 가지 결단은 무엇인가요?",
    reward: "완주 스티커, 장비 뽑기 3회"
  }
];

const stickers = [
  ["complete", "미션 완료", "칭찬/보상"],
  ["encourage", "잘하고 있어", "격려"],
  ["truth", "진리 붙들기", "말씀 아이콘"],
  ["faith", "믿음 선택", "말씀 아이콘"],
  ["peace", "평안 전달", "말씀 아이콘"],
  ["finish", "완주", "완주 인증"],
  ["teamwork", "팀워크", "팀 보상"],
  ["bonus", "보너스 QR", "히든 QR"],
  ["hint", "힌트권", "교환소"],
  ["retry", "재도전권", "교환소"],
  ["talent", "달란트", "보상"],
  ["verse", "오늘의 말씀", "워크북 꾸미기"]
];

function ensureDir(relativePath) {
  fs.mkdirSync(path.join(root, relativePath), { recursive: true });
}

function write(relativePath, content) {
  const fullPath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, "utf8");
}

function csvEscape(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function page(title, body, extraCss = "") {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Noto Sans KR", Arial, sans-serif; color: #2b2926; background: #f7f1df; }
    h1, h2, h3 { margin: 0 0 10px; letter-spacing: 0; }
    p { line-height: 1.55; margin: 6px 0; }
    .sheet { max-width: 980px; margin: 0 auto; padding: 20px; }
    .grid { display: grid; gap: 12px; }
    .two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .card { background: #fffaf0; border: 2px solid #2b2926; border-radius: 8px; padding: 14px; page-break-inside: avoid; }
    .badge { display: inline-block; padding: 4px 9px; border: 1px solid #2b2926; border-radius: 999px; background: #e9b64b; font-weight: 800; }
    .muted { color: #6b6258; font-size: 12px; }
    .qr { width: 120px; height: 120px; background: white; padding: 4px; border: 1px solid #2b2926; }
    .cut { border: 1px dashed #777; }
    table { width: 100%; border-collapse: collapse; background: #fffaf0; }
    th, td { border: 1px solid #2b2926; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #e9dfc5; }
    @media print {
      body { background: white; }
      .sheet { max-width: none; padding: 0; }
      .no-print { display: none; }
    }
    ${extraCss}
  </style>
</head>
<body>
  <main class="sheet">${body}</main>
</body>
</html>`;
}

function markdownTable(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`)
  ].join("\n");
}

function equipmentIconSvg(item) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="${item.name}">
  <rect width="512" height="512" rx="88" fill="#fff6df"/>
  <circle cx="256" cy="256" r="194" fill="${item.color}" opacity="0.18"/>
  <path d="M256 78c78 42 132 50 132 50 0 160-58 244-132 306-74-62-132-146-132-306 0 0 54-8 132-50z" fill="${item.color}" stroke="#2b2926" stroke-width="16"/>
  <path d="M176 256h160M256 156v200" stroke="#fffaf0" stroke-width="24" stroke-linecap="round"/>
  <text x="256" y="462" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="800" fill="#2b2926">${item.theme}</text>
</svg>`;
}

function keyVisualSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#173f35"/>
      <stop offset="1" stop-color="#243b69"/>
    </linearGradient>
  </defs>
  <rect width="1600" height="900" fill="url(#bg)"/>
  <circle cx="1240" cy="180" r="170" fill="#e9b64b" opacity=".2"/>
  <path d="M800 138c188 96 310 112 310 112 0 312-126 474-310 606C616 724 490 562 490 250c0 0 122-16 310-112z" fill="#f8ecd0" opacity=".12" stroke="#e9b64b" stroke-width="18"/>
  <path d="M800 240v370M640 430h320" stroke="#e9b64b" stroke-width="34" stroke-linecap="round"/>
  <text x="800" y="740" text-anchor="middle" font-family="Arial, sans-serif" font-size="72" font-weight="900" fill="#fffaf0">전신갑주 QR RPG</text>
  <text x="800" y="805" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" fill="#f8ecd0">말씀을 배우고, 미션을 수행하고, 믿음의 장비를 모으는 교회 프로그램</text>
</svg>`;
}

function stickerSvg(id, label, color = "#e9b64b") {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 360">
  <circle cx="180" cy="180" r="156" fill="${color}" stroke="#2b2926" stroke-width="10"/>
  <circle cx="130" cy="138" r="18" fill="#2b2926"/>
  <circle cx="230" cy="138" r="18" fill="#2b2926"/>
  <path d="M128 215c34 36 70 36 104 0" fill="none" stroke="#2b2926" stroke-width="14" stroke-linecap="round"/>
  <text x="180" y="306" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="900" fill="#2b2926">${label}</text>
</svg>`;
}

function cardBackgroundSvg(item) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 750 1050">
  <rect width="750" height="1050" rx="44" fill="#fffaf0"/>
  <rect x="30" y="30" width="690" height="990" rx="34" fill="${item.color}" opacity=".16" stroke="#2b2926" stroke-width="10"/>
  <circle cx="375" cy="330" r="210" fill="${item.color}" opacity=".28"/>
  <path d="M375 150c128 66 210 76 210 76 0 210-86 320-210 408-124-88-210-198-210-408 0 0 82-10 210-76z" fill="#fffaf0" opacity=".72" stroke="#2b2926" stroke-width="12"/>
  <path d="M225 790h300" stroke="#2b2926" stroke-width="8" stroke-linecap="round"/>
  <text x="375" y="860" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="900" fill="#2b2926">${item.theme}</text>
</svg>`;
}

function coverSvg(mode) {
  const isMonthly = mode === "monthly";
  const bg1 = isMonthly ? "#243b69" : "#173f35";
  const bg2 = isMonthly ? "#49b999" : "#e9b64b";
  const sub = isMonthly ? "4주 말씀 챌린지" : "수련회 현장 미션";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1240 1754">
  <defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="${bg1}"/><stop offset="1" stop-color="#2b2926"/></linearGradient></defs>
  <rect width="1240" height="1754" fill="url(#g)"/>
  <circle cx="980" cy="270" r="210" fill="${bg2}" opacity=".22"/>
  <path d="M620 310c230 118 382 138 382 138 0 420-168 640-382 812-214-172-382-392-382-812 0 0 152-20 382-138z" fill="#fffaf0" opacity=".12" stroke="${bg2}" stroke-width="18"/>
  <text x="620" y="1280" text-anchor="middle" font-family="Arial, sans-serif" font-size="88" font-weight="900" fill="#fffaf0">전신갑주 QR RPG</text>
  <text x="620" y="1370" text-anchor="middle" font-family="Arial, sans-serif" font-size="44" fill="#f8ecd0">${sub}</text>
  <text x="620" y="1510" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" fill="#f8ecd0">학생용 워크북 표지 시안 · 최종 텍스트는 편집툴에서 삽입</text>
</svg>`;
}

function exchangeBackgroundSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1240 1754">
  <rect width="1240" height="1754" fill="#f8ecd0"/>
  <rect x="90" y="120" width="1060" height="1440" rx="70" fill="#fffaf0" stroke="#2b2926" stroke-width="14"/>
  <path d="M160 390h920M160 1170h920" stroke="#b98535" stroke-width="18" stroke-linecap="round"/>
  <circle cx="310" cy="770" r="150" fill="#e9b64b" opacity=".28"/>
  <circle cx="930" cy="770" r="150" fill="#49b999" opacity=".28"/>
  <text x="620" y="250" text-anchor="middle" font-family="Arial, sans-serif" font-size="76" font-weight="900" fill="#2b2926">교환소 포스터 배경</text>
  <text x="620" y="1510" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" fill="#6b6258">QR과 가격표는 코드/편집 레이어로 배치</text>
</svg>`;
}

function bossSymbolSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800">
  <defs><linearGradient id="b" x1="0" x2="1"><stop stop-color="#173f35"/><stop offset="1" stop-color="#243b69"/></linearGradient></defs>
  <rect width="1200" height="800" fill="url(#b)"/>
  <path d="M600 90c180 92 298 108 298 108 0 302-124 454-298 584-174-130-298-282-298-584 0 0 118-16 298-108z" fill="#fffaf0" opacity=".14" stroke="#e9b64b" stroke-width="16"/>
  <path d="M600 190v380M448 378h304" stroke="#e9b64b" stroke-width="32" stroke-linecap="round"/>
  <text x="600" y="695" text-anchor="middle" font-family="Arial, sans-serif" font-size="54" font-weight="900" fill="#fffaf0">최종 결단 미션 상징</text>
</svg>`;
}

function writeBrand() {
  write("00_README.md", `# 전신갑주 QR RPG 올인원 세트

이 폴더는 교회 납품용 패키지 산출물입니다. 앱 단품이 아니라 QR, 교재, 매뉴얼, 장비카드, 교환소, 스티커, 콘텐츠, 이미지 지침, 인쇄물, 운영 가이드를 함께 제공합니다.

> 현재 상태: 기존 2쪽 학생 워크북과 1쪽 교사용 운영표는 QR 운영 키트입니다. 판매용 공과책은 14_textbook_set에서 차시별로 확정하며, 1과는 국내 청소년 공과 레퍼런스를 반영한 학생책 8쪽·교사용 12쪽·활동카드 8쪽·가정연계 2쪽·슬라이드 10쪽의 마스터 V2.0으로 완성했습니다.

## 7단계 산출 상태

1. 제품 골격 확정: \`01_brand\`, \`12_guides\`
2. 콘텐츠 원고 제작: \`08_content_retreat\`, \`09_content_monthly\`
3. 기능성 자산 제작: \`02_qr_set\`, \`13_app_data\`
4. 핵심 비주얼 제작: \`10_image_assets\`, 벡터 플레이스홀더와 AI 생성 지침
5. 인쇄물 편집: \`03_workbook_student\`, \`04_manual_teacher\`, \`05_equipment_cards\`, \`06_exchange_set\`, \`07_stickers\`, \`11_print_ready\`
6. 현장 리허설: \`12_guides/rehearsal_checklist.md\`
7. 납품 패키지화: \`12_guides/handoff_manifest.md\`

## 공과책 세트

- 1과 확정 원고: 14_textbook_set/student, teacher, activities
- 1과 인쇄 PDF: 14_textbook_set/output/pdf
- 납품용 복사본: 11_print_ready/lesson01_*.pdf
- 재생성/검증: npm run build:lesson01, npm run verify:lesson01

## 재생성

\`\`\`bash
npm install
npm run build
npm run verify
\`\`\`
`);

  write("01_brand/brand_system.md", `# 브랜드 시스템

## 제품 정의
전신갑주 QR RPG는 에베소서 6장을 기반으로 학생들이 QR 미션을 수행하며 장비를 수집하고, 말씀을 적용하고, 팀과 함께 결단하는 교회 납품용 교육 게임 패키지입니다.

## 브랜드 톤
- 교회 친화적이고 과하게 자극적이지 않습니다.
- 청소년에게는 보드게임/RPG처럼 재미있게 느껴져야 합니다.
- 작은 인쇄물에서도 식별 가능한 실루엣과 색상을 우선합니다.
- QR 스캔 안정성과 운영 편의성이 그래픽 장식보다 우선입니다.

## 컬러
${markdownTable(["토큰", "값", "용도"], [
  ["forest", "#173f35", "수련회/숲/메인 배경"],
  ["navy", "#243b69", "한 달 모드/신뢰감"],
  ["gold", "#e9b64b", "보상/완주/강조"],
  ["cream", "#f8ecd0", "종이/워크북 배경"],
  ["ink", "#2b2926", "본문/테두리"],
  ["mint", "#49b999", "평안/성장"],
  ["coral", "#d86a4a", "주의/이벤트"]
])}

## 장비별 색상
${markdownTable(["장비", "색상", "의미"], equipment.map((item) => [item.name, item.color, item.theme]))}
`);

  write("01_brand/tokens.json", JSON.stringify({
    colors: {
      forest: "#173f35",
      navy: "#243b69",
      gold: "#e9b64b",
      cream: "#f8ecd0",
      ink: "#2b2926",
      mint: "#49b999",
      coral: "#d86a4a"
    },
    typography: {
      display: "Noto Sans KR 900",
      body: "Noto Sans KR 400/700",
      printMinimumBodySize: "9pt",
      qrCardTitleMinimum: "16pt"
    },
    print: {
      bleed: "3mm for print shop",
      qrMinimum: "30mm",
      qrSafeZone: "4 modules"
    }
  }, null, 2));

  write("01_brand/logo-mark.svg", keyVisualSvg());
}

async function writeQrSet() {
  const qrRows = [];
  for (const mission of missions) {
    const url = `${baseUrl}${mission.route}`;
    const svg = await QRCode.toString(url, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 2,
      width: 360,
      color: { dark: "#000000", light: "#ffffff" }
    });
    write(`02_qr_set/svg/${mission.code}.svg`, svg);
    qrRows.push({ ...mission, url });
  }

  write("02_qr_set/data/qr_index.json", JSON.stringify(qrRows, null, 2));
  write("02_qr_set/data/qr_index.csv", [
    ["code", "number", "type", "mode", "phase", "week", "title", "url", "reward"].map(csvEscape).join(","),
    ...qrRows.map((row) => [row.code, row.number, row.type, row.mode, row.phase, row.week, row.title, row.url, row.reward].map(csvEscape).join(","))
  ].join("\n"));

  const cards = qrRows.map((mission) => `<article class="card cut">
    <div class="badge">${mission.number}</div>
    <h2>${mission.title}</h2>
    <p>${mission.description}</p>
    <p class="muted">${mission.verse} · ${mission.mode} · ${mission.phase}${mission.week ? ` · ${mission.week}주차` : ""}</p>
    <img class="qr" src="../svg/${mission.code}.svg" alt="${mission.title} QR">
    <p class="muted">${mission.url}</p>
  </article>`).join("\n");
  write("02_qr_set/print/qr_cards.html", page("QR 카드 세트", `<h1>QR 카드 세트</h1><p class="no-print">브라우저 인쇄에서 A4, 배경 그래픽 켜기, 여백 기본값을 사용합니다.</p><section class="grid two">${cards}</section>`));

  write("02_qr_set/qr_policy.md", `# QR 제작 원칙

- QR 본체는 AI 이미지로 만들지 않습니다.
- 이 폴더의 QR은 \`qrcode\` 라이브러리로 생성한 SVG입니다.
- QR 주변 카드 디자인만 편집/장식합니다.
- 인쇄 시 QR 본체는 최소 30mm 이상을 유지합니다.
- 중앙 로고 삽입은 기본 패키지에서는 사용하지 않습니다.
`);
}

function writeWorkbook() {
  const missionRows = missions.filter((mission) => mission.type === "mission").map((mission) => [mission.number, mission.title, mission.verse, mission.question]);
  write("03_workbook_student/source/student_workbook_retreat.md", `# 학생용 워크북 - 수련회 세트

## 표지
전신갑주 QR RPG: 시련의 숲

## 사용법
1. 휴대폰 기본 카메라로 QR을 찍습니다.
2. 이름, 조, 입장코드를 확인합니다.
3. 미션을 완료하고 보상을 받습니다.
4. 장비를 모으고 필요한 경우 교환소를 이용합니다.
5. 마지막 결단 미션을 기록합니다.

## 전신갑주 소개
${equipment.map((item) => `- **${item.name}**: ${item.description}`).join("\n")}

## 미션 기록
${markdownTable(["번호", "미션", "본문", "기록 질문"], missionRows)}

## 최종 결단
- 내가 붙들 말씀:
- 내가 내려놓을 것:
- 수련회 이후 실천할 한 가지:
`);

  write("03_workbook_student/source/student_workbook_monthly.md", `# 학생용 워크북 - 한 달 세트

## 4주 진행표
${markdownTable(["주차", "주제", "핵심 장비", "완료 체크"], [
  ["1주차", "진리 / 의", "허리띠, 흉배", "□"],
  ["2주차", "평안", "복음의 신", "□"],
  ["3주차", "믿음 / 구원", "방패, 투구", "□"],
  ["4주차", "말씀 / 결단", "성령의 검", "□"]
])}

## 주차별 기록
각 주차마다 말씀, 적용, 실천, 나눔 질문을 기록합니다.

${missions.filter((mission) => mission.mode === "monthly" || mission.mode === "both").filter((mission) => mission.type === "mission").map((mission) => `### ${mission.week}주차 · ${mission.title}
- 본문: ${mission.verse}
- 목표: ${mission.description}
- 나눔 질문: ${mission.question}
- 이번 주 실천:
- 완료 체크: □
`).join("\n")}
`);

  const pages = equipment.map((item) => `<article class="card">
    <h2>${item.name}</h2>
    <p><strong>${item.verse}</strong></p>
    <p>${item.description}</p>
    <p>기록: ________________________________________________</p>
    <p>적용: ________________________________________________</p>
  </article>`).join("");
  write("03_workbook_student/print/student_workbook.html", page("학생용 워크북", `<h1>학생용 워크북</h1><section class="grid two">${pages}</section><section class="card"><h2>최종 결단</h2><p>내가 붙들 말씀:</p><p style="height:80px;border-bottom:1px solid #999"></p><p>이번 프로그램 이후 실천할 한 가지:</p><p style="height:80px;border-bottom:1px solid #999"></p></section>`));
}

function writeManual() {
  write("04_manual_teacher/source/teacher_manual.md", `# 교사용 운영 매뉴얼

## 프로그램 개요
전신갑주 QR RPG는 학생들이 QR 미션을 수행하면서 에베소서 6장의 전신갑주를 배우는 참여형 성경교육 프로그램입니다.

## 사전 준비
1. 앱 배포 URL을 확정합니다.
2. QR 카드 출력 후 실제 휴대폰 카메라로 스캔 테스트합니다.
3. 관리자 PIN과 비상 담당자를 정합니다.
4. 학생 조 편성을 준비합니다.
5. 교환소 위치와 운영 교사를 정합니다.

## 운영 순서
${markdownTable(["순서", "수련회", "한 달"], [
  ["1", "오프닝/튜토리얼", "1주차 오리엔테이션"],
  ["2", "일반 QR 미션", "주차별 QR 오픈"],
  ["3", "히든 QR/교환소", "소그룹 나눔"],
  ["4", "보스전/결단", "4주차 완주/결단"]
])}

## 교환소 운영
- 교환소 QR은 1번과 2번을 동시에 운영합니다.
- 한 교환소에는 학생 2명만 입장합니다.
- 학생은 최대 2칸까지 장비를 제시합니다.
- 양쪽 확인 후 서버가 교환을 처리합니다.
- 문제가 생기면 관리자 화면에서 교환소를 초기화합니다.

## 비상 플랜
- QR이 안 찍히면 직접 URL 접속 또는 예비 QR 사용.
- 동명이인은 입장코드로 확인.
- 보상 오류는 관리자 수동 지급/회수.
- 인터넷이 불안정하면 조별 대표 기기로 진행.
`);

  write("04_manual_teacher/print/teacher_manual.html", page("교사용 운영 매뉴얼", `<h1>교사용 운영 매뉴얼</h1>
  <section class="card"><h2>현장 30분 전 체크</h2><ul><li>QR 스캔 테스트</li><li>관리자 접속 테스트</li><li>교환소 담당자 확인</li><li>예비 QR 출력</li><li>보상 기준 공유</li></ul></section>
  <section class="card"><h2>운영 순서</h2><table><tr><th>단계</th><th>할 일</th><th>담당</th></tr><tr><td>오프닝</td><td>학생 등록/튜토리얼</td><td>사회자</td></tr><tr><td>미션</td><td>QR 미션 운영</td><td>조 담당</td></tr><tr><td>교환소</td><td>교환 질서 관리</td><td>교환소 담당</td></tr><tr><td>마무리</td><td>랭킹/결단/완주</td><td>전체</td></tr></table></section>`));
}

function writeEquipmentCards() {
  write("05_equipment_cards/data/equipment_cards.json", JSON.stringify(equipment, null, 2));
  const cards = equipment.map((item) => `<article class="card cut">
    <img src="../../10_image_assets/production_svg/equipment_illustration_${item.id}.svg" alt="${item.name}" style="width:96px;height:96px">
    <h2>${item.name}</h2>
    <p><strong>${item.verse}</strong></p>
    <p>${item.description}</p>
    <p><strong>획득:</strong> ${item.unlockCondition}</p>
    <p><strong>효과:</strong> ${item.effect}</p>
  </article>`).join("\n");
  write("05_equipment_cards/print/equipment_cards.html", page("장비카드 6종", `<h1>장비카드 6종</h1><section class="grid three">${cards}</section>`));
}

function writeExchangeSet() {
  write("06_exchange_set/source/exchange_rules.md", `# 교환소 운영 규칙

## 기본 규칙
- 교환소는 1번과 2번을 운영합니다.
- 학생 2명이 동시에 입장해야 합니다.
- 각 학생은 장비 최대 2개를 제시할 수 있습니다.
- 1개만 제시해도 교환 가능합니다.
- 같은 장비라도 등급이 다르면 동시에 제시할 수 있습니다.

## 가격표 예시
${markdownTable(["항목", "가격", "비고"], [
  ["힌트권", "달란트 10", "교사 확인 후 지급"],
  ["재도전권", "달란트 15", "미션 1회 한정"],
  ["장비 뽑기 1회", "달란트 20", "운영 상황에 따라 조절"],
  ["팀 보너스", "달란트 30", "팀 미션 성공 시"]
])}
`);

  write("06_exchange_set/print/exchange_poster.html", page("교환소 포스터", `<section class="card" style="text-align:center">
    <h1 style="font-size:54px">전신갑주 교환소</h1>
    <p style="font-size:22px">선생님 앞에서 공정하게 교환합니다.</p>
    <div class="grid two">
      <article class="card"><h2>교환소 1</h2><img class="qr" src="../../02_qr_set/svg/exchange-booth-1.svg"></article>
      <article class="card"><h2>교환소 2</h2><img class="qr" src="../../02_qr_set/svg/exchange-booth-2.svg"></article>
    </div>
    <h2>규칙</h2>
    <p>두 명 입장 · 최대 2칸 제시 · 양쪽 동의 후 완료 · 문제 발생 시 선생님 호출</p>
  </section>`));
}

function writeStickers() {
  const manifest = stickers.map(([id, label, use], index) => ({ id, label, use, file: `../print/sticker_${id}.svg`, priority: index < 6 ? "P1" : "P2" }));
  write("07_stickers/data/sticker_manifest.json", JSON.stringify(manifest, null, 2));
  const colors = ["#e9b64b", "#49b999", "#f8ecd0", "#d86a4a", "#9fb8d9", "#d8dce2"];
  stickers.forEach(([id, label], index) => {
    write(`07_stickers/print/sticker_${id}.svg`, stickerSvg(id, label, colors[index % colors.length]));
  });
  const sheet = stickers.map(([id, label]) => `<article class="card cut" style="text-align:center"><img src="sticker_${id}.svg" style="width:92px;height:92px"><p><strong>${label}</strong></p></article>`).join("");
  write("07_stickers/print/sticker_sheet.html", page("스티커 시트", `<h1>스티커 시트</h1><p class="muted">정식 제작 시 반칼선은 별도 레이어로 제작합니다.</p><section class="grid three">${sheet}</section>`));
}

function writeContent() {
  write("08_content_retreat/retreat_content.md", `# 수련회 세트 콘텐츠

## 운영 흐름
오프닝 → 1단계 미션 → 2단계 미션 → 장비 획득 → 히든 QR → 교환소 → 보스전 → 회고/결단

${missions.filter((mission) => mission.mode === "retreat" || mission.mode === "both").map((mission) => `## ${mission.number}. ${mission.title}
- 유형: ${mission.type}
- 본문: ${mission.verse}
- 목표: ${mission.description}
- 활동: ${mission.activity}
- 나눔 질문: ${mission.question}
- 보상: ${mission.reward}
- 앱 연계: ${mission.route}
- 인쇄물 연계: QR 카드, 워크북 미션 기록, 교사용 진행표
`).join("\n")}
`);

  write("08_content_retreat/retreat_missions.json", JSON.stringify(missions.filter((mission) => mission.mode === "retreat" || mission.mode === "both"), null, 2));

  write("09_content_monthly/monthly_content.md", `# 한 달 세트 콘텐츠

## 운영 흐름
1주차 진리/의 → 2주차 평안 → 3주차 믿음/구원 → 4주차 말씀/결단

${missions.filter((mission) => mission.mode === "monthly" || mission.mode === "both").filter((mission) => mission.type === "mission" || mission.type === "tutorial" || mission.type === "boss").map((mission) => `## ${mission.week}주차 · ${mission.title}
- 본문: ${mission.verse}
- 목표: ${mission.description}
- QR 미션: ${mission.route}
- 활동: ${mission.activity}
- 소그룹 질문: ${mission.question}
- 보상: ${mission.reward}
- 워크북 연계: 주차 기록, 실천 체크, 결단 문장
`).join("\n")}
`);

  write("09_content_monthly/monthly_missions.json", JSON.stringify(missions.filter((mission) => mission.mode === "monthly" || mission.mode === "both"), null, 2));
}

function writeImageAssets() {
  const assetRows = [
    ["main_key_visual", "포스터/표지", "A3/16:9", "no", "AI image", "P1", 2],
    ["equipment_illustrations", "카드/앱/스티커", "1:1 2048px", "yes", "AI image", "P0", 6],
    ["equipment_icons", "UI/QR 카드", "SVG 1:1", "yes", "vector", "P0", 6],
    ["workbook_cover", "학생용 교재", "B5/A4", "no", "AI image + layout", "P1", 2],
    ["exchange_poster_bg", "교환소 포스터", "A3", "no", "AI image", "P1", 1],
    ["sticker_characters", "스티커", "1:1", "yes", "AI image", "P1", 12],
    ["boss_symbol", "보스전/결단", "4:3", "no", "AI image", "P2", 2],
    ["qr_codes", "QR 기능 자산", "SVG", "no", "code generation", "P0", missions.length]
  ];
  write("10_image_assets/manifest/image_asset_manifest.csv", [
    ["asset", "usage", "size", "transparent", "method", "priority", "quantity"].map(csvEscape).join(","),
    ...assetRows.map((row) => row.map(csvEscape).join(","))
  ].join("\n"));
  write("10_image_assets/manifest/image_asset_manifest.json", JSON.stringify(assetRows.map(([asset, usage, size, transparent, method, priority, quantity]) => ({ asset, usage, size, transparent, method, priority, quantity })), null, 2));

  write("10_image_assets/prompts/ai_generation_prompts.md", `# AI 이미지 생성 실행 지침

중요: QR 본체, 긴 텍스트 페이지, 체크리스트, 재단선, 반칼선은 AI 이미지로 생성하지 않습니다. AI 이미지는 보조 비주얼에만 사용합니다.

## 1. 장비 일러스트 6종
- 목적: 장비카드, 앱, 스티커, 워크북 공통 사용
- 수량: 6
- 권장: 2048x2048, 배경 제거 용이한 단색 배경
- 스타일: 선명한 평면 일러스트, 보드게임 카드 느낌, 청소년 친화적, 인쇄 친화적
- 포함: 각 장비의 뚜렷한 실루엣, ${equipment.map((item) => item.name).join(", ")}
- 피해야 할 요소: 다크 판타지, 폭력성, 과도한 금속 디테일, 텍스트

## 2. 메인 키비주얼
- 목적: 행사 포스터, 표지, 소개 페이지
- 수량: 세로형 1, 가로형 1
- 권장: A3 세로, 16:9 가로
- 스타일: 밝고 힘 있는 말씀 모험, 교회 친화적 RPG
- 포함: 방패형 실루엣, 장비 6종 상징, 빛, 여정
- 피해야 할 요소: 괴물 공포, 전쟁 장면, 실제 QR, 텍스트

## 3. 스티커 캐릭터 12종
- 목적: 칭찬, 보상, 완주, 워크북 꾸미기
- 수량: 12
- 권장: 1024x1024, 투명 후처리 가능한 단색 배경
- 스타일: 귀엽지만 유치하지 않은 캐릭터 스티커
- 포함: 기쁨, 격려, 팀워크, 말씀, 완주, 힌트권
- 피해야 할 요소: 과한 일본풍, 과장된 표정, 텍스트 깨짐

## 4. 교환소 포스터 배경
- 목적: A3 포스터 배경
- 수량: 1
- 권장: A3 세로
- 스타일: 보드게임 상점/게시판 느낌, 따뜻한 교회 행사 분위기
- 포함: 카드 교환 공간, 달란트 상징, 장비 아이콘 배치 여백
- 피해야 할 요소: QR 본체, 가격표 텍스트, 복잡한 배경
`);
}

function writeProductionVisuals() {
  equipment.forEach((item) => {
    write(`10_image_assets/production_svg/equipment_illustration_${item.id}.svg`, equipmentIconSvg(item));
    write(`10_image_assets/production_svg/card_background_${item.id}.svg`, cardBackgroundSvg(item));
  });

  write("10_image_assets/production_svg/main_key_visual.svg", keyVisualSvg());
  write("10_image_assets/production_svg/workbook_cover_retreat.svg", coverSvg("retreat"));
  write("10_image_assets/production_svg/workbook_cover_monthly.svg", coverSvg("monthly"));
  write("10_image_assets/production_svg/exchange_poster_background.svg", exchangeBackgroundSvg());
  write("10_image_assets/production_svg/boss_symbol.svg", bossSymbolSvg());
}

function writePrintReady() {
  const links = [
    ["QR 카드", "../02_qr_set/print/qr_cards.html"],
    ["학생용 워크북", "../03_workbook_student/print/student_workbook.html"],
    ["교사용 매뉴얼", "../04_manual_teacher/print/teacher_manual.html"],
    ["장비카드", "../05_equipment_cards/print/equipment_cards.html"],
    ["교환소 포스터", "../06_exchange_set/print/exchange_poster.html"],
    ["스티커 시트", "../07_stickers/print/sticker_sheet.html"],
    ["1과 학생책 B5", "lesson01_student_B5_print.pdf"],
    ["1과 교사용 지도서 A4", "lesson01_teacher_A4_office.pdf"],
    ["1과 활동카드 A4 양면", "lesson01_activity_cards_A4_duplex.pdf"],
    ["1과 가정연계 A6", "lesson01_home_connection_A6_print.pdf"],
    ["1과 교사용 슬라이드", "lesson01_teacher_slides_16x9.pdf"]
  ];
  write("11_print_ready/index.html", page("인쇄용 산출물 인덱스", `<h1>인쇄용 산출물</h1><section class="grid two">${links.map(([label, href]) => `<article class="card"><h2>${label}</h2><p><a href="${href}">${href}</a></p></article>`).join("")}</section>`));
}

function writeGuides() {
  write("12_guides/production_roadmap.md", `# 제작 로드맵

## 1단계 제품 골격 확정
브랜드, 상품 라인업, 공통/모드별 요소를 확정했습니다.

## 2단계 콘텐츠 원고 제작
수련회와 한 달 모드의 미션, 말씀, 활동, 질문, 보상을 작성했습니다.

## 3단계 기능성 자산 제작
QR SVG, QR 인덱스, 앱 연동 JSON을 생성했습니다.

## 4단계 핵심 비주얼 제작
벡터 플레이스홀더와 AI 이미지 생성 프롬프트를 준비했습니다. 최종 납품 전 AI 생성 이미지 또는 디자이너 일러스트로 교체합니다.

## 5단계 인쇄물 편집
워크북, 매뉴얼, 장비카드, 교환소 포스터, 스티커 시트를 print-ready HTML로 편집했습니다.

## 6단계 현장 리허설
리허설 체크리스트와 QR/운영 동선을 정의했습니다.

## 7단계 납품 패키지화
폴더 구조, 앱 데이터, 인쇄물, 운영 가이드, 검증 스크립트를 묶었습니다.
`);

  write("12_guides/rehearsal_checklist.md", `# 현장 리허설 체크리스트

## 필수 테스트
- [ ] 학생 1명 신규 생성
- [ ] 같은 이름+조+입장코드 재접속
- [ ] 일반 QR 완료
- [ ] 같은 QR 재접속 시 중복 보상 방지
- [ ] 히든 QR 완료
- [ ] 교환소 1에서 2명 교환
- [ ] 교환소 2 예비 테스트
- [ ] 관리자 화면 참가자 확인
- [ ] CSV 다운로드
- [ ] QR 카드 인쇄 후 휴대폰 기본 카메라 스캔
- [ ] 인터넷이 느릴 때 버튼 중복 클릭 안내

## 비상 대응
- QR 인식 실패: 예비 QR 또는 URL 직접 입력
- 동명이인: 입장코드 확인
- 보상 오류: 관리자 수동 지급/회수
- 교환소 병목: 2개 교환소 운영
- 휴대폰 없는 학생: 조장 또는 교사용 기기 사용
`);

  write("12_guides/handoff_manifest.md", `# 납품 패키지 인수인계서

## 포함 산출물
${dirs.map((dir) => `- ${dir}`).join("\n")}

## 납품 전 교체해야 할 값
- \`DELIVERY_BASE_URL\`: 실제 Vercel 배포 URL
- 교회명
- 행사명
- 행사 날짜
- 관리자 PIN
- QR 미션 수량과 제목
- 교회 사용 성경 번역본과 인용 정책
- 교회 보호 담당자와 비상 절차

## 납품 방법
1. 앱 배포 URL 확정
2. \`DELIVERY_BASE_URL=https://실제주소 npm run build\`
3. \`npm run verify\`
4. \`02_qr_set/print/qr_cards.html\`에서 인쇄/PDF 저장
5. \`11_print_ready/index.html\`에서 전체 인쇄물 확인
6. 14_textbook_set/output/pdf의 1과 PDF와 빌드 manifest 확인
7. 교사용 매뉴얼과 리허설 체크리스트 전달
`);
}

function writeAdminOperationTable() {
  const rows = [
    ["학생 등록 확인", "참가자 목록에서 이름, 조, 입장코드를 확인한다.", "관리자 > 참가자", "이름과 조를 한번만 확인하고 시작합니다.", "동명이인은 입장코드로 구분한다."],
    ["이름/조 수정", "오타 또는 조 변경 요청이 있으면 즉시 수정한다.", "관리자 > 참가자 수정", "수정 후 다시 접속하면 반영됩니다.", "수정 전후를 운영 기록에 남긴다."],
    ["달란트 수동 조정", "현장 보상, 오류 보정, 페널티를 수동으로 반영한다.", "관리자 > 달란트 조정", "선생님 확인 후 달란트를 조정합니다.", "사유를 메모하고 CSV로 백업한다."],
    ["장비 수동 지급/회수", "휴대폰 오류 또는 교사 보상 지급 시 장비를 직접 조정한다.", "관리자 > 장비 현황", "장비가 바로 반영됐는지 확인해 주세요.", "지급/회수 로그를 확인한다."],
    ["QR 중복 완료 확인", "같은 학생이 같은 QR을 다시 열었을 때 완료 기록만 확인한다.", "관리자 > 미션 완료 내역", "이미 완료한 미션은 보상이 다시 지급되지 않습니다.", "중복 보상 의심 시 거래 기록을 확인한다."],
    ["교환소 초기화", "교환이 멈추거나 학생이 이탈하면 해당 교환소만 초기화한다.", "관리자 > 교환소 1/2", "현재 교환소를 초기화하고 다시 입장합니다.", "1번과 2번 교환소를 분산 운영한다."],
    ["CSV 다운로드", "행사 중간과 종료 시 참가자/보상/완료 기록을 내려받는다.", "관리자 > CSV", "기록 백업 후 다음 순서를 진행합니다.", "인터넷이 불안정하면 먼저 CSV를 저장한다."],
    ["전체 데이터 초기화", "리허설 데이터 삭제 또는 새 행사 시작 전에만 실행한다.", "관리자 > 초기화", "운영자만 실행합니다.", "실제 행사 중에는 실행하지 않는다."],
    ["월간 주차 확인", "이번 주에 열린 미션과 잠긴 미션을 확인한다.", "관리자 > 월간 진행률", "이번 주 미션만 완료할 수 있습니다.", "오픈 주차를 잘못 설정하면 즉시 수정한다."],
    ["인쇄물 확인", "QR 카드, 장비카드, 교환소 포스터, 체크리스트를 배치 전 확인한다.", "인쇄물 PDF/HTML", "스캔 테스트 후 부착합니다.", "QR이 흐리면 원본 PDF로 재출력한다."]
  ];

  write("12_guides/admin_operation_table.md", `# 관리자 운영표

이 문서는 교사가 관리자 화면을 보면서 바로 따라 할 수 있는 현장 운영표입니다. 앱 화면 명칭은 납품 교회별 UI 문구에 맞게 조정할 수 있지만, 처리 순서는 유지합니다.

${markdownTable(["상황", "관리자 행동", "앱/화면", "현장 멘트", "비상 조치"], rows)}

## 운영 원칙
- 보상 지급, 회수, 교환소 초기화는 반드시 교사 확인 후 실행합니다.
- QR 보상은 학생이 여러 번 접속해도 중복 지급되지 않는 것을 기본 전제로 운영합니다.
- 행사 중간에는 CSV 다운로드로 최소 1회 백업합니다.
- 전체 초기화는 리허설 종료 후 또는 새 행사 시작 전만 사용합니다.
`);
}

function writeRehearsalReport() {
  const rows = [
    ["학생 2명 생성", "delivery/app smoke", "통과", "학생 A/B 생성과 재접속 흐름 확인"],
    ["QR 보상 지급", "delivery/app smoke", "통과", "미션 완료 후 보상 반영 확인"],
    ["QR 중복 방지", "delivery/app smoke", "통과", "같은 QR 재접속 시 중복 보상 차단"],
    ["교환소 흐름", "delivery/app smoke", "통과", "두 학생 교환 처리와 인벤토리 갱신 확인"],
    ["관리자 확인", "delivery/app smoke", "통과", "참가자/보상/상태 조회 흐름 확인"],
    ["인쇄물 생성", "delivery/print-package npm.cmd run check", "통과", "PDF 6종과 print-ready HTML 생성"],
    ["QR SVG 생성", "delivery/print-package npm.cmd run check", "통과", "QR index와 SVG 파일 연결 확인"]
  ];

  write("12_guides/rehearsal_report.md", `# 현장 리허설 실행 보고서

이 문서는 6단계 현장 리허설을 납품 전 검증 항목으로 고정하기 위한 보고서입니다. 자동 검증은 통과했지만, 실제 휴대폰 카메라와 출력물 스캔은 행사 URL 확정 후 반드시 한 번 더 진행합니다.

## 자동 검증 증거
- 앱 기능 검증: \`delivery/app\` 폴더에서 \`npm.cmd run smoke\`
- 패키지 산출물 검증: \`delivery/print-package\` 폴더에서 \`npm.cmd run check\`
- QR/미션 동기화 검증: 앱 설정의 미션 코드와 납품 QR index 코드 비교

${markdownTable(["시나리오", "검증 방법", "상태", "비고"], rows)}

## 실제 현장 리허설에서 남은 확인
- 실제 Vercel 주소로 \`DELIVERY_BASE_URL=https://실제배포주소 npm.cmd run build\`를 실행한 뒤 QR을 다시 출력합니다.
- 학생 휴대폰 2대와 교사용 휴대폰 1대로 기본 카메라 스캔을 확인합니다.
- QR 카드 1장, 히든 QR 1장, 교환소 QR 1장을 실제 출력물로 스캔합니다.
- 관리자 PIN, 데이터 초기화, CSV 다운로드를 교사가 직접 실행해 봅니다.
- 인터넷이 느린 환경에서 버튼 연타 시 중복 보상이 막히는지 확인합니다.
`);
}

function writeAppData() {
  write("13_app_data/equipment_set.json", JSON.stringify(equipment, null, 2));
  write("13_app_data/mission_set.json", JSON.stringify(missions, null, 2));
  write("13_app_data/program_presets.json", JSON.stringify({
    retreat: {
      programMode: "retreat",
      eventName: "전신갑주 QR RPG 수련회",
      recommendedDuration: "1~3일",
      enabledMissionCodes: missions.filter((mission) => mission.mode === "retreat" || mission.mode === "both").map((mission) => mission.code)
    },
    monthly: {
      programMode: "monthly",
      eventName: "전신갑주 QR RPG 한 달 챌린지",
      recommendedDuration: "4주",
      currentWeek: 1,
      enabledMissionCodes: missions.filter((mission) => mission.mode === "monthly" || mission.mode === "both").map((mission) => mission.code)
    }
  }, null, 2));
}

function writeCompletionAudit() {
  write("12_guides/completion_audit.md", `# 7단계 완료 검수표

## 목표
사용자가 요청한 "제안한 7단계까지 작업 모두 진행" 범위를 납품 패키지 산출물로 구현했는지 확인합니다.

## 검수 결과
${markdownTable(["단계", "요구", "증거 파일"], [
  ["1", "제품 골격 확정", "01_brand/brand_system.md, 12_guides/production_roadmap.md"],
  ["2", "콘텐츠 원고 제작", "08_content_retreat/retreat_content.md, 09_content_monthly/monthly_content.md"],
  ["3", "기능성 자산 제작", "02_qr_set/svg/*.svg, 02_qr_set/data/qr_index.json, 13_app_data/*.json, 12_guides/admin_operation_table.md"],
  ["4", "핵심 비주얼 제작", "10_image_assets/production_svg/*.svg, 10_image_assets/prompts/ai_generation_prompts.md"],
  ["5", "인쇄물 편집/PDF 생성", "03~07 print HTML, 11_print_ready/*.pdf"],
  ["6", "현장 리허설", "12_guides/rehearsal_checklist.md, 12_guides/rehearsal_report.md"],
  ["7", "납품 패키지화", "00_README.md, 12_guides/handoff_manifest.md, npm run verify"]
])}

## 자동 검증
\`npm run check\`는 다음을 확인합니다.

- 필수 폴더 13개 존재
- QR SVG와 QR index 존재
- 수련회/한 달 콘텐츠 존재
- 관리자 운영표 존재
- 워크북/매뉴얼/장비카드/교환소/스티커 인쇄물 존재
- PDF 6종 존재 및 최소 파일 크기 확인
- 장비 6종 데이터 존재
- production SVG 핵심 비주얼 세트 존재
- 리허설 체크리스트와 리허설 실행 보고서 존재
- QR 본체를 AI 이미지로 만들지 않는 정책 명시
- 1~7단계 로드맵 문서화

## 남은 현장 검증
- 실제 Vercel 주소로 \`DELIVERY_BASE_URL\`을 지정해 QR을 다시 생성해야 합니다.
- 종이 출력 후 학생 휴대폰 기본 카메라로 QR 스캔 리허설이 필요합니다.
- 교사 1명이 관리자 화면에서 수동 지급, 교환소 초기화, CSV 다운로드를 실제로 눌러 봐야 합니다.
`);
}

async function main() {
  dirs.forEach(ensureDir);
  writeBrand();
  await writeQrSet();
  writeWorkbook();
  writeManual();
  writeEquipmentCards();
  writeExchangeSet();
  writeStickers();
  writeContent();
  writeImageAssets();
  writeProductionVisuals();
  writePrintReady();
  writeGuides();
  writeAdminOperationTable();
  writeRehearsalReport();
  writeAppData();
  writeCompletionAudit();
  console.log(`Delivery package generated under ${root}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
