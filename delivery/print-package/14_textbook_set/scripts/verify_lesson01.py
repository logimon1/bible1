from __future__ import annotations

import json
import sys
from pathlib import Path

from pypdf import PdfReader


PRINT_ROOT = Path(__file__).resolve().parents[2]
SET_ROOT = PRINT_ROOT / "14_textbook_set"
OUT_DIR = SET_ROOT / "output" / "pdf"
APP_ROOT = PRINT_ROOT.parent / "app"

EXPECTED = {
    "lesson01_student_B5_print.pdf": 8,
    "lesson01_teacher_A4_office.pdf": 12,
    "lesson01_activity_cards_A4_duplex.pdf": 8,
    "lesson01_home_connection_A6_print.pdf": 2,
    "lesson01_teacher_slides_16x9.pdf": 10,
}

EXPECTED_MEDIA = {
    "lesson01_student_B5_print.pdf": (515.91, 725.67),
    "lesson01_teacher_A4_office.pdf": (595.28, 841.89),
    "lesson01_activity_cards_A4_duplex.pdf": (595.28, 841.89),
    "lesson01_home_connection_A6_print.pdf": (314.65, 436.54),
    "lesson01_teacher_slides_16x9.pdf": (720.0, 405.0),
}

REQUIRED_TEXT = {
    "lesson01_student_B5_print.pdf": [
        "답장이 짧아진 이유",
        "본문에서 중심을 찾아요",
        "사람은 적이 아닙니다",
        "확인하고, 멈추고, 선택하기",
        "우리 팀의 다음 행동",
        "내 삶에 놓고, 함께 서기",
        "이번 주, 진리로 중심 잡기",
    ],
    "lesson01_teacher_A4_office.pdf": [
        "학습목표와 수업 준비",
        "본문 이해와 신학 핵심",
        "55분 수업 지도",
        "카드 정답과 인정 답안",
        "안전·평가·수업 후 기록",
    ],
    "lesson01_activity_cards_A4_duplex.pdf": [
        "C01",
        "C12",
        "확인할 수 있는 사실",
        "아직 확인하지 않은 설명",
        "근거보다 넓게 단정한 결론",
        "교사용 정답·인쇄 안내",
    ],
    "lesson01_home_connection_A6_print.pdf": ["이번 주 함께 묻기", "보호자를 위한 듣기 순서"],
    "lesson01_teacher_slides_16x9.pdf": [
        "진리로",
        "본문을 직접 읽어요",
        "세 가지 분류",
        "카드 활동 · 17분",
        "퇴실 확인과 주간 미션",
    ],
}

FORBIDDEN_TEXT = ["mission-truth", "church-armor-rpg.example", "앞면 -", "뒷면 -"]


def box_tuple(box):
    return tuple(round(float(value), 2) for value in (box.left, box.bottom, box.right, box.top))


def verify() -> list[str]:
    failures = []
    for filename, expected_pages in EXPECTED.items():
        path = OUT_DIR / filename
        if not path.exists() or path.stat().st_size < 5000:
            failures.append(f"{filename}: missing or too small")
            continue
        reader = PdfReader(str(path))
        if len(reader.pages) != expected_pages:
            failures.append(f"{filename}: expected {expected_pages} pages, got {len(reader.pages)}")
        extracted = "\n".join((page.extract_text() or "") for page in reader.pages)
        for phrase in REQUIRED_TEXT[filename]:
            if phrase not in extracted:
                failures.append(f"{filename}: missing text {phrase!r}")
        for phrase in FORBIDDEN_TEXT:
            if phrase in extracted:
                failures.append(f"{filename}: forbidden production text {phrase!r}")
        for page_number, page in enumerate(reader.pages, start=1):
            media_size = (float(page.mediabox.width), float(page.mediabox.height))
            expected_size = EXPECTED_MEDIA[filename]
            if any(abs(actual - expected) > 1.0 for actual, expected in zip(media_size, expected_size)):
                failures.append(f"{filename} p{page_number}: unexpected MediaBox {media_size}")
            if page.trimbox is None or page.bleedbox is None or page.cropbox is None:
                failures.append(f"{filename} p{page_number}: page boxes missing")
            if filename in {"lesson01_student_B5_print.pdf", "lesson01_home_connection_A6_print.pdf"}:
                if box_tuple(page.trimbox) == box_tuple(page.mediabox):
                    failures.append(f"{filename} p{page_number}: trim box must be inset for 3mm bleed")
            elif box_tuple(page.trimbox) != box_tuple(page.mediabox):
                failures.append(f"{filename} p{page_number}: office/digital trim box must equal media box")
            resources = page.get("/Resources", {})
            fonts = resources.get("/Font", {}) if resources else {}
            if not fonts:
                failures.append(f"{filename} p{page_number}: no fonts")
            if "Helvetica" in extracted:
                failures.append(f"{filename} p{page_number}: unexpected Helvetica fallback marker")
    manifest_path = OUT_DIR / "lesson01_build_manifest.json"
    if not manifest_path.exists():
        failures.append("lesson01_build_manifest.json: missing")
    else:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest.get("status") != "lesson01_master_v2":
            failures.append("manifest: status is not lesson01_master_v2")
        if float(manifest.get("illustration", {}).get("effectivePpi", 0)) < 300:
            failures.append("manifest: illustration effective PPI is below 300")
        illustrations = manifest.get("illustrations", [])
        if len(illustrations) != 2:
            failures.append(f"manifest: expected 2 illustrations, got {len(illustrations)}")
        for illustration in illustrations:
            if float(illustration.get("effectivePpi", 0)) < 300:
                failures.append(f"manifest: {illustration.get('role')} illustration is below 300 PPI")
        if manifest.get("qrPolicy", {}).get("embedded") is not False:
            failures.append("manifest: QR must remain external until the real delivery URL is set")
        if manifest.get("pageCounts") != {
            "student": 8,
            "teacher": 12,
            "cards": 8,
            "homeConnection": 2,
            "slides": 10,
        }:
            failures.append(f"manifest: unexpected page counts {manifest.get('pageCounts')}")

    curriculum = json.loads((SET_ROOT / "curriculum.json").read_text(encoding="utf-8"))
    lesson = next(item for item in curriculum["lessons"] if item["id"] == "lesson-01-truth")
    if lesson.get("status") != "master_v2_approved":
        failures.append("curriculum: lesson 01 status is not master_v2_approved")

    app_config = json.loads((APP_ROOT / "config" / "program.config.json").read_text(encoding="utf-8"))
    app_mission = next(item for item in app_config["qrSet"] if item["code"] == "mission-truth")
    print_missions = json.loads((PRINT_ROOT / "13_app_data" / "mission_set.json").read_text(encoding="utf-8"))
    print_mission = next(item for item in print_missions if item["code"] == "mission-truth")
    if app_mission["mode"] != "both" or print_mission["mode"] != "both":
        failures.append("mission-truth: app and print mode must both be 'both'")
    if app_mission["shortDescription"] != print_mission["description"]:
        failures.append("mission-truth: app and print descriptions differ")
    if app_mission["smallGroupQuestion"] != print_mission["question"]:
        failures.append("mission-truth: app and print questions differ")
    app_js = (APP_ROOT / "public" / "app.js").read_text(encoding="utf-8")
    if 'mission.mode !== mode && mission.mode !== "both"' not in app_js:
        failures.append("app QR printing does not include mode='both' missions")
    core_js = (APP_ROOT / "server" / "core.js").read_text(encoding="utf-8")
    if "거짓의 마귀" in core_js:
        failures.append("app core still uses the disallowed '거짓의 마귀' label")
    return failures


if __name__ == "__main__":
    errors = verify()
    if errors:
        for error in errors:
            print(f"[FAIL] {error}")
        sys.exit(1)
    for filename, pages in EXPECTED.items():
        print(f"[PASS] {filename}: {pages} pages")
    print("Lesson 01 PDF verification passed.")
