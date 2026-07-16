#!/usr/bin/env python3
"""Generate the current-retreat print-ready QR package.

The script deliberately refuses placeholder and local URLs for final output.
Use --allow-local-preview with a non-final --output-root for design QA only.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urljoin, urlparse

try:
    import qrcode
    from PIL import Image
    from pypdf import PdfReader, PdfWriter
    from reportlab.lib.colors import HexColor, Color
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.units import mm
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.pdfgen import canvas
except ImportError as exc:  # pragma: no cover - concise setup failure for operators
    raise SystemExit(
        "필수 패키지가 없습니다. print-package 폴더에서 "
        "`python -m pip install -r requirements.txt`를 먼저 실행하세요.\n"
        f"원인: {exc}"
    ) from exc


ROOT = Path(__file__).resolve().parent
APP_ROOT = ROOT.parent
MANIFEST_PATH = ROOT / "qr_manifest.template.json"
ASSET_ROOT = APP_ROOT / "assets"
FONT_REGULAR_CANDIDATES = [
    Path(r"C:\Windows\Fonts\malgun.ttf"),
    Path(r"C:\Windows\Fonts\NotoSansKR-Regular.ttf"),
]
FONT_BOLD_CANDIDATES = [
    Path(r"C:\Windows\Fonts\malgunbd.ttf"),
    Path(r"C:\Windows\Fonts\NotoSansKR-Bold.ttf"),
]

INK = HexColor("#17243A")
INK_SOFT = HexColor("#42516A")
CREAM = HexColor("#FFF8EA")
PAPER = HexColor("#F3EFE5")
WHITE = HexColor("#FFFFFF")
GOLD = HexColor("#F6B942")
GOLD_DEEP = HexColor("#CE7B14")
BLUE = HexColor("#1E6E96")
BLUE_DEEP = HexColor("#0C344A")
CYAN = HexColor("#54C9D8")
FOREST = HexColor("#143D3D")
FOREST_LIGHT = HexColor("#3E8D78")
PURPLE = HexColor("#7552B8")
CORAL = HexColor("#E5684E")
MINT = HexColor("#92D8B8")
LINE = HexColor("#D8D3C8")


@dataclass(frozen=True)
class QrItem:
    code: str
    group: str
    label: str
    subtitle: str
    route: str
    badge: str
    url: str
    qr_path: Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="이번 수련회 QR 인쇄 패키지 생성")
    parser.add_argument("--base-url", default=os.getenv("RETREAT_BASE_URL", ""))
    parser.add_argument(
        "--output-root",
        default=str(ROOT / "output"),
        help="출력 루트. 최종 PDF는 이 경로의 pdf 폴더에 생성됩니다.",
    )
    parser.add_argument("--allow-local-preview", action="store_true")
    parser.add_argument("--check", action="store_true", help="PDF 생성 없이 앱 경로·에셋 점검")
    return parser.parse_args()


def choose_font(candidates: list[Path], label: str) -> Path:
    for candidate in candidates:
        if candidate.exists():
            return candidate
    raise SystemExit(f"한글 {label} 글꼴을 찾지 못했습니다: {', '.join(map(str, candidates))}")


def register_fonts() -> None:
    pdfmetrics.registerFont(TTFont("RetreatBody", str(choose_font(FONT_REGULAR_CANDIDATES, "본문"))))
    pdfmetrics.registerFont(TTFont("RetreatBold", str(choose_font(FONT_BOLD_CANDIDATES, "굵은"))))


def load_template() -> list[dict]:
    data = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    codes = [row["code"] for row in data]
    if len(codes) != len(set(codes)):
        raise SystemExit("QR 템플릿에 중복 code가 있습니다.")
    return data


def validate_app_contract(template: list[dict]) -> None:
    required_files = [
        APP_ROOT / "app.js",
        APP_ROOT / "server" / "core.js",
        APP_ROOT / "vercel.json",
        ASSET_ROOT / "ui" / "entry-armor-hero.webp",
        ASSET_ROOT / "ui" / "trial-forest-hero.webp",
        ASSET_ROOT / "ui" / "warrior-shadow.webp",
    ]
    required_files.extend((ASSET_ROOT / "armor" / f"{name}.webp") for name in [
        "helmet", "shield", "sword", "belt", "breastplate", "shoes"
    ])
    missing = [str(path) for path in required_files if not path.exists()]
    if missing:
        raise SystemExit("필수 파일이 없습니다:\n- " + "\n- ".join(missing))

    core = (APP_ROOT / "server" / "core.js").read_text(encoding="utf-8")
    app = (APP_ROOT / "app.js").read_text(encoding="utf-8")
    vercel = (APP_ROOT / "vercel.json").read_text(encoding="utf-8")

    reward_codes = [row["code"] for row in template if row["group"] in {"draw", "reward"}]
    missing_rewards = [code for code in reward_codes if f'code: "{code}"' not in core]
    if missing_rewards:
        raise SystemExit("앱 QR 보상 정의가 빠졌습니다: " + ", ".join(missing_rewards))

    route_needles = [
        ("/draw/:count", vercel),
        ("/mission/:code", vercel),
        ("/hidden/:code", vercel),
        ("/exchange/:booth", vercel),
        ("/team/:action", vercel),
        ('raw === "team-merge"', app),
        ('["qr", "draw", "mission", "hidden", "boss"]', app),
    ]
    missing_routes = [needle for needle, source in route_needles if needle not in source]
    if missing_routes:
        raise SystemExit("앱 라우팅 계약이 빠졌습니다: " + ", ".join(missing_routes))

    serialized_template = json.dumps(template, ensure_ascii=False)
    forbidden_copy = [
        "시험의 숲",
        "전신갑주 합체",
        "팀 합체",
        "담당 장비",
    ]
    stale_copy = [phrase for phrase in forbidden_copy if phrase in serialized_template]
    if stale_copy:
        raise SystemExit("QR 템플릿에 폐기된 문구가 있습니다: " + ", ".join(stale_copy))
    required_copy = ["THE WAR 공동 체크인", "전원 완료 후 역할 배분", "writable"]
    missing_copy = [phrase for phrase in required_copy if phrase not in serialized_template]
    if missing_copy:
        raise SystemExit("QR 템플릿의 현장 안내가 빠졌습니다: " + ", ".join(missing_copy))

    print(f"점검 완료: QR {len(template)}개, 보상 QR {len(reward_codes)}개, 필수 에셋 {len(required_files)}개")


def normalize_base_url(raw: str, allow_local_preview: bool, output_root: Path) -> str:
    value = raw.strip().rstrip("/")
    if not value:
        raise SystemExit("실제 배포 주소를 --base-url 또는 RETREAT_BASE_URL로 지정하세요.")
    parsed = urlparse(value)
    if parsed.scheme not in ({"http", "https"} if allow_local_preview else {"https"}):
        raise SystemExit("최종 인쇄 QR은 https 배포 주소만 사용할 수 있습니다.")
    if not parsed.netloc or parsed.username or parsed.password:
        raise SystemExit("올바른 공개 배포 주소가 아닙니다.")
    host = (parsed.hostname or "").lower()
    blocked = {"example.com", "example.org", "example.net", "example.invalid", "church-armor-rpg.example"}
    is_local = host in {"localhost", "127.0.0.1", "0.0.0.0"} or host.endswith(".local")
    if host in blocked or "placeholder" in host or "example" in host:
        raise SystemExit("예시·placeholder 주소로는 QR 인쇄물을 만들 수 없습니다.")
    if is_local and not allow_local_preview:
        raise SystemExit("로컬 주소는 최종 QR에 사용할 수 없습니다.")
    if is_local and output_root.resolve() == (ROOT / "output").resolve():
        raise SystemExit("로컬 미리보기는 --output-root를 tmp 하위로 분리하세요.")
    if parsed.path not in {"", "/"} or parsed.params or parsed.query or parsed.fragment:
        raise SystemExit("base URL에는 경로·쿼리·해시를 넣지 마세요.")
    return value


def build_url(base_url: str, route: str) -> str:
    if route == "/":
        return base_url + "/"
    return urljoin(base_url + "/", route.lstrip("/"))


def safe_name(value: str) -> str:
    return "".join(ch if ch.isalnum() or ch in "-_" else "-" for ch in value).strip("-")


def generate_qr_png(url: str, path: Path) -> None:
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=14,
        border=4,
    )
    qr.add_data(url)
    qr.make(fit=True)
    image = qr.make_image(fill_color="#10151F", back_color="white").convert("RGB")
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", optimize=True)


def create_items(template: list[dict], base_url: str, qr_dir: Path) -> list[QrItem]:
    items: list[QrItem] = []
    for row in template:
        url = build_url(base_url, row["route"])
        qr_path = qr_dir / f"{safe_name(row['code'])}.png"
        generate_qr_png(url, qr_path)
        items.append(QrItem(**row, url=url, qr_path=qr_path))
    return items


def write_generated_manifest(items: list[QrItem], qr_dir: Path) -> None:
    rows = [
        {
            "code": item.code,
            "group": item.group,
            "label": item.label,
            "route": item.route,
            "url": item.url,
            "file": item.qr_path.name,
        }
        for item in items
    ]
    (qr_dir / "qr_manifest.json").write_text(
        json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    with (qr_dir / "qr_manifest.csv").open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=["code", "group", "label", "route", "url", "file"])
        writer.writeheader()
        writer.writerows(rows)


def item_map(items: list[QrItem]) -> dict[str, QrItem]:
    return {item.code: item for item in items}


def set_alpha(c: canvas.Canvas, fill: float | None = None, stroke: float | None = None) -> None:
    if fill is not None and hasattr(c, "setFillAlpha"):
        c.setFillAlpha(fill)
    if stroke is not None and hasattr(c, "setStrokeAlpha"):
        c.setStrokeAlpha(stroke)


def reset_alpha(c: canvas.Canvas) -> None:
    set_alpha(c, 1, 1)


def rounded_panel(c: canvas.Canvas, x: float, y: float, w: float, h: float, radius: float,
                  fill, stroke=LINE, stroke_width: float = 1) -> None:
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.setLineWidth(stroke_width)
    c.roundRect(x, y, w, h, radius, fill=1, stroke=1)


def shield_mark(c: canvas.Canvas, x: float, y: float, size: float, fill=GOLD, ink=INK) -> None:
    c.setFillColor(fill)
    c.setStrokeColor(ink)
    c.setLineWidth(max(1.1, size * 0.055))
    path = c.beginPath()
    path.moveTo(x + size * 0.5, y + size)
    path.curveTo(x + size * 0.75, y + size * 0.91, x + size * 0.91, y + size * 0.89, x + size * 0.91, y + size * 0.89)
    path.curveTo(x + size * 0.91, y + size * 0.42, x + size * 0.74, y + size * 0.16, x + size * 0.5, y)
    path.curveTo(x + size * 0.26, y + size * 0.16, x + size * 0.09, y + size * 0.42, x + size * 0.09, y + size * 0.89)
    path.curveTo(x + size * 0.3, y + size * 0.91, x + size * 0.42, y + size * 0.97, x + size * 0.5, y + size)
    path.close()
    c.drawPath(path, fill=1, stroke=1)
    c.setStrokeColor(ink)
    c.setLineWidth(max(0.8, size * 0.045))
    c.line(x + size * 0.5, y + size * 0.2, x + size * 0.5, y + size * 0.77)
    c.line(x + size * 0.27, y + size * 0.51, x + size * 0.73, y + size * 0.51)


def wrap_text(text: str, font_name: str, font_size: float, max_width: float) -> list[str]:
    if not text:
        return []
    lines: list[str] = []
    for paragraph in text.splitlines():
        current = ""
        for ch in paragraph:
            candidate = current + ch
            if current and pdfmetrics.stringWidth(candidate, font_name, font_size) > max_width:
                lines.append(current.rstrip())
                current = ch.lstrip()
            else:
                current = candidate
        if current:
            lines.append(current.rstrip())
    return lines


def draw_wrapped(c: canvas.Canvas, text: str, x: float, y_top: float, width: float,
                 font="RetreatBody", size=10, color=INK_SOFT, leading: float | None = None,
                 max_lines: int | None = None) -> float:
    leading = leading or size * 1.42
    lines = wrap_text(text, font, size, width)
    if max_lines and len(lines) > max_lines:
        lines = lines[:max_lines]
        if lines:
            while lines[-1] and pdfmetrics.stringWidth(lines[-1] + "…", font, size) > width:
                lines[-1] = lines[-1][:-1]
            lines[-1] += "…"
    c.setFillColor(color)
    c.setFont(font, size)
    y = y_top
    for line in lines:
        c.drawString(x, y, line)
        y -= leading
    return y


def draw_badge(c: canvas.Canvas, text: str, x: float, y: float, bg=GOLD, fg=INK,
               font_size: float = 7.5, padding_x: float = 3.2 * mm, height: float = 7 * mm) -> float:
    width = pdfmetrics.stringWidth(text, "RetreatBold", font_size) + padding_x * 2
    c.setFillColor(bg)
    c.roundRect(x, y, width, height, height / 2, fill=1, stroke=0)
    c.setFillColor(fg)
    c.setFont("RetreatBold", font_size)
    c.drawCentredString(x + width / 2, y + (height - font_size) / 2 + 1.2, text)
    return width


def draw_qr(c: canvas.Canvas, item: QrItem, x: float, y: float, size: float,
            frame=INK, accent=GOLD) -> None:
    pad = 2.1 * mm
    c.setFillColor(WHITE)
    c.setStrokeColor(frame)
    c.setLineWidth(1.25)
    c.roundRect(x, y, size, size, 4 * mm, fill=1, stroke=1)
    c.setFillColor(accent)
    c.roundRect(x + 1.2 * mm, y + 1.2 * mm, 4.6 * mm, size - 2.4 * mm, 2.2 * mm, fill=1, stroke=0)
    c.drawImage(str(item.qr_path), x + pad + 3.2 * mm, y + pad, size - pad * 2 - 3.2 * mm,
                size - pad * 2, preserveAspectRatio=True, mask="auto")


def draw_cover_image(c: canvas.Canvas, image_path: Path, x: float, y: float, w: float, h: float,
                     radius: float = 0) -> None:
    with Image.open(image_path) as image:
        iw, ih = image.size
    scale = max(w / iw, h / ih)
    draw_w, draw_h = iw * scale, ih * scale
    dx, dy = x + (w - draw_w) / 2, y + (h - draw_h) / 2
    c.saveState()
    clip = c.beginPath()
    if radius:
        clip.roundRect(x, y, w, h, radius)
    else:
        clip.rect(x, y, w, h)
    c.clipPath(clip, stroke=0, fill=0)
    c.drawImage(str(image_path), dx, dy, draw_w, draw_h, preserveAspectRatio=True, mask="auto")
    c.restoreState()


def draw_page_background(c: canvas.Canvas, width: float, height: float, color=PAPER) -> None:
    c.setFillColor(color)
    c.rect(0, 0, width, height, fill=1, stroke=0)
    set_alpha(c, 0.08)
    c.setFillColor(BLUE)
    c.circle(width - 8 * mm, height - 10 * mm, 42 * mm, fill=1, stroke=0)
    c.setFillColor(GOLD)
    c.circle(-7 * mm, 5 * mm, 31 * mm, fill=1, stroke=0)
    reset_alpha(c)


def draw_page_header(c: canvas.Canvas, width: float, height: float, kicker: str, title: str,
                     page_no: str, dark: bool = False) -> None:
    ink = WHITE if dark else INK
    shield_mark(c, 12 * mm, height - 22.5 * mm, 10 * mm, GOLD, ink)
    c.setFillColor(ink)
    c.setFont("RetreatBold", 7.5)
    c.drawString(25 * mm, height - 15.2 * mm, kicker)
    c.setFont("RetreatBold", 21)
    c.drawString(25 * mm, height - 23.5 * mm, title)
    c.setFont("RetreatBold", 8)
    c.drawRightString(width - 12 * mm, height - 16 * mm, page_no)


def draw_footer(c: canvas.Canvas, width: float, label: str, dark: bool = False) -> None:
    color = HexColor("#D7E6EC") if dark else INK_SOFT
    c.setFillColor(color)
    c.setFont("RetreatBody", 7)
    c.drawString(12 * mm, 8.2 * mm, "전신갑주 · 이번 수련회 현장 QR")
    c.drawRightString(width - 12 * mm, 8.2 * mm, label)


def fit_url(url: str, max_chars: int = 52) -> str:
    return url if len(url) <= max_chars else url[: max_chars - 1] + "…"


def make_game_entry_pdf(path: Path, items: dict[str, QrItem]) -> None:
    width, height = A4
    c = canvas.Canvas(str(path), pagesize=A4, pageCompression=1)
    c.setTitle("수련회 게임 입장 QR")
    draw_page_background(c, width, height)
    draw_page_header(c, width, height, "ARMOR QUEST · FIELD GUIDE", "원정 시작 QR", "01 / GAME")

    cards = [
        (items["game-entry"], ASSET_ROOT / "ui" / "entry-armor-hero.webp", BLUE_DEEP, GOLD, "이름과 조만 입력하면 바로 시작"),
        (items["ranking"], ASSET_ROOT / "ui" / "entry-armor-hero.webp", PURPLE, CYAN, "장비 전투력과 우리 조 순위 확인"),
        (items["forest-entry"], ASSET_ROOT / "ui" / "trial-forest-hero.webp", FOREST, GOLD, "영적 전쟁과 여섯 미션에 도전"),
    ]
    x, w, h, gap = 12 * mm, width - 24 * mm, 69 * mm, 5 * mm
    y = height - 39 * mm - h
    for index, (item, image_path, dark, accent, note) in enumerate(cards):
        rounded_panel(c, x, y, w, h, 6 * mm, WHITE, HexColor("#C8C3B8"), 1.2)
        image_w = 65 * mm
        draw_cover_image(c, image_path, x, y, image_w, h, 6 * mm)
        set_alpha(c, 0.67)
        c.setFillColor(dark)
        c.roundRect(x, y, image_w, h, 6 * mm, fill=1, stroke=0)
        reset_alpha(c)
        shield_mark(c, x + 7 * mm, y + h - 20 * mm, 11 * mm, accent, WHITE)
        c.setFillColor(WHITE)
        c.setFont("RetreatBold", 7.5)
        c.drawString(x + 7 * mm, y + h - 26 * mm, item.badge)
        c.setFont("RetreatBold", 17)
        title_lines = wrap_text(item.label, "RetreatBold", 17, image_w - 14 * mm)
        title_y = y + h - 36 * mm
        for line in title_lines[:2]:
            c.drawString(x + 7 * mm, title_y, line)
            title_y -= 7.5 * mm

        text_x = x + image_w + 7 * mm
        qr_size = 44 * mm
        qr_x = x + w - qr_size - 6 * mm
        draw_badge(c, f"STEP {index + 1:02}", text_x, y + h - 15 * mm, accent, INK)
        c.setFillColor(INK)
        c.setFont("RetreatBold", 12)
        c.drawString(text_x, y + h - 24.5 * mm, note)
        draw_wrapped(c, item.subtitle, text_x, y + h - 31.5 * mm,
                     qr_x - text_x - 5 * mm, size=8.5, max_lines=2)
        c.setFillColor(INK_SOFT)
        c.setFont("RetreatBody", 6.6)
        c.drawString(text_x, y + 8 * mm, fit_url(item.url, 38))
        draw_qr(c, item, qr_x, y + (h - qr_size) / 2, qr_size, dark, accent)
        y -= h + gap
    draw_footer(c, width, "입장 · 랭킹 · THE WAR")
    c.save()


def make_team_checkin_pdf(path: Path, item: QrItem) -> None:
    width, height = A4
    c = canvas.Canvas(str(path), pagesize=A4, pageCompression=1)
    c.setTitle("THE WAR 공동 체크인 QR")
    draw_cover_image(c, ASSET_ROOT / "ui" / "trial-forest-hero.webp", 0, 0, width, height)
    set_alpha(c, 0.80)
    c.setFillColor(BLUE_DEEP)
    c.rect(0, 0, width, height, fill=1, stroke=0)
    reset_alpha(c)
    set_alpha(c, 0.15)
    c.setFillColor(CYAN)
    c.circle(width / 2, 183 * mm, 58 * mm, fill=1, stroke=0)
    c.setFillColor(GOLD)
    c.circle(width / 2, 183 * mm, 37 * mm, fill=1, stroke=0)
    reset_alpha(c)
    draw_page_header(c, width, height, "THE WAR · PARTY CHECK-IN", "THE WAR 공동 체크인", "02 / CHECK-IN", dark=True)

    c.setFillColor(HexColor("#D7E8EC"))
    c.setFont("RetreatBody", 9.5)
    c.drawString(25 * mm, height - 32 * mm, "팀원 모두 각자의 휴대폰으로 스캔하세요")

    center_x, center_y = width / 2, 181 * mm
    player_points = [
        (center_x - 49 * mm, center_y + 30 * mm),
        (center_x, center_y + 45 * mm),
        (center_x + 49 * mm, center_y + 30 * mm),
        (center_x - 49 * mm, center_y - 28 * mm),
        (center_x, center_y - 43 * mm),
        (center_x + 49 * mm, center_y - 28 * mm),
    ]
    c.setStrokeColor(Color(0.96, 0.73, 0.26, alpha=0.68))
    c.setLineWidth(1.2)
    c.setDash(2.5, 2.5)
    for player_x, player_y in player_points:
        c.line(player_x, player_y, center_x, center_y)
    c.setDash()

    c.setFillColor(Color(1, 1, 1, alpha=0.14))
    c.setStrokeColor(GOLD)
    c.setLineWidth(1.8)
    c.circle(center_x, center_y, 25 * mm, fill=1, stroke=1)
    c.setFillColor(WHITE)
    c.setFont("RetreatBold", 23)
    c.drawCentredString(center_x, center_y + 2 * mm, "QR")
    c.setFont("RetreatBody", 7.5)
    c.drawCentredString(center_x, center_y - 8 * mm, "모두 같은 QR")
    for index, (player_x, player_y) in enumerate(player_points, start=1):
        c.setFillColor(CREAM)
        c.setStrokeColor(GOLD)
        c.setLineWidth(1.4)
        c.circle(player_x, player_y, 13 * mm, fill=1, stroke=1)
        c.setFillColor(BLUE_DEEP)
        c.setFont("RetreatBold", 13)
        c.drawCentredString(player_x, player_y + 1 * mm, f"{index:02}")
        c.setFont("RetreatBody", 5.8)
        c.drawCentredString(player_x, player_y - 5 * mm, "PLAYER")

    draw_badge(c, "4-6 PLAYERS · 1 CHECK-IN", 70 * mm, 245 * mm, GOLD, INK, 9, 9 * mm)

    panel_x, panel_y, panel_w, panel_h = 12 * mm, 16 * mm, width - 24 * mm, 104 * mm
    rounded_panel(c, panel_x, panel_y, panel_w, panel_h, 8 * mm, CREAM, GOLD, 1.6)
    qr_size = 76 * mm
    draw_qr(c, item, panel_x + 10 * mm, panel_y + 15 * mm, qr_size, BLUE_DEEP, GOLD)

    text_x = panel_x + 98 * mm
    draw_badge(c, item.badge, text_x, panel_y + panel_h - 17 * mm, GOLD, INK, 8.2, 7 * mm)
    c.setFillColor(INK)
    c.setFont("RetreatBold", 18)
    c.drawString(text_x, panel_y + panel_h - 30 * mm, "함께 스캔하고 대기!")
    instructions = [
        ("01", "우리 조 이름 확인"),
        ("02", "파티원 모두 같은 QR 스캔"),
        ("03", "전원 완료 화면까지 대기"),
    ]
    iy = panel_y + panel_h - 45 * mm
    for number, label in instructions:
        c.setFillColor(BLUE_DEEP)
        c.circle(text_x + 4.5 * mm, iy + 2.2 * mm, 4.5 * mm, fill=1, stroke=0)
        c.setFillColor(WHITE)
        c.setFont("RetreatBold", 6.8)
        c.drawCentredString(text_x + 4.5 * mm, iy, number)
        c.setFillColor(INK)
        c.setFont("RetreatBold", 10)
        c.drawString(text_x + 13 * mm, iy, label)
        iy -= 14 * mm
    c.setFillColor(CORAL)
    c.setFont("RetreatBold", 8.2)
    c.drawString(text_x, panel_y + 15 * mm, "마지막 파티원까지 화면을 열어두세요")
    c.setFillColor(INK_SOFT)
    c.setFont("RetreatBody", 6.3)
    draw_wrapped(c, item.url, text_x, panel_y + 8 * mm, panel_x + panel_w - text_x - 7 * mm,
                 size=6.3, max_lines=2)
    draw_footer(c, width, "파티원 전원 스캔 · 전원 완료 후 역할 배분", dark=True)
    c.save()


def make_draw_pdf(path: Path, items: dict[str, QrItem]) -> None:
    width, height = landscape(A4)
    c = canvas.Canvas(str(path), pagesize=(width, height), pageCompression=1)
    c.setTitle("장비 뽑기 QR 세트")
    draw_page_background(c, width, height, HexColor("#EDEAF2"))
    draw_page_header(c, width, height, "ARMOR DRAW · REPEATABLE", "장비 뽑기 보상", "03 / DRAW")

    palette = [
        (BLUE_DEEP, CYAN, ASSET_ROOT / "armor" / "helmet.webp", "1"),
        (PURPLE, HexColor("#E39BE8"), ASSET_ROOT / "armor" / "shield.webp", "2"),
        (HexColor("#9B4C28"), GOLD, ASSET_ROOT / "armor" / "sword.webp", "3"),
    ]
    margin, gap = 12 * mm, 5 * mm
    card_y, card_h = 17 * mm, height - 48 * mm
    card_w = (width - margin * 2 - gap * 2) / 3
    for index, (dark, accent, icon, count) in enumerate(palette):
        item = items[f"draw-{count}"]
        x = margin + index * (card_w + gap)
        c.setFillColor(dark)
        c.setStrokeColor(INK)
        c.setLineWidth(1.3)
        c.roundRect(x, card_y, card_w, card_h, 7 * mm, fill=1, stroke=1)
        c.saveState()
        clip = c.beginPath()
        clip.roundRect(x, card_y, card_w, card_h, 7 * mm)
        c.clipPath(clip, stroke=0, fill=0)
        set_alpha(c, 0.12)
        c.setFillColor(accent)
        c.circle(x + card_w - 3 * mm, card_y + card_h - 4 * mm, 37 * mm, fill=1, stroke=0)
        c.circle(x + 5 * mm, card_y + 3 * mm, 25 * mm, fill=1, stroke=0)
        reset_alpha(c)
        c.restoreState()

        c.setFillColor(PAPER)
        c.circle(x, card_y + card_h * 0.54, 3.2 * mm, fill=1, stroke=0)
        c.circle(x + card_w, card_y + card_h * 0.54, 3.2 * mm, fill=1, stroke=0)
        c.setStrokeColor(Color(1, 1, 1, alpha=0.28))
        c.setDash(2, 3)
        c.line(x + 5 * mm, card_y + card_h * 0.54, x + card_w - 5 * mm, card_y + card_h * 0.54)
        c.setDash()

        draw_badge(c, item.badge, x + 7 * mm, card_y + card_h - 14 * mm, accent, INK)
        c.drawImage(str(icon), x + card_w - 34 * mm, card_y + card_h - 36 * mm,
                    27 * mm, 27 * mm, preserveAspectRatio=True, mask="auto")
        c.setFillColor(WHITE)
        c.setFont("RetreatBold", 32)
        c.drawString(x + 7 * mm, card_y + card_h - 38 * mm, count)
        c.setFont("RetreatBold", 15)
        c.drawString(x + 24 * mm, card_y + card_h - 36.5 * mm, "회 뽑기")
        c.setFont("RetreatBody", 8.5)
        c.setFillColor(HexColor("#DCE8EE"))
        c.drawString(x + 7 * mm, card_y + card_h - 46 * mm, "스캔 즉시 무작위 장비를 뽑습니다")

        qr_size = 53 * mm
        draw_qr(c, item, x + (card_w - qr_size) / 2, card_y + 18 * mm, qr_size, WHITE, accent)
        c.setFillColor(WHITE)
        c.setFont("RetreatBold", 8.5)
        c.drawCentredString(x + card_w / 2, card_y + 10 * mm, "게임 보상 횟수만큼 반복 사용")
        c.setFont("RetreatBody", 6.5)
        c.setFillColor(HexColor("#C9D9E1"))
        c.drawCentredString(x + card_w / 2, card_y + 5.5 * mm, fit_url(item.url, 43))
    draw_footer(c, width, "뽑기 1 · 2 · 3회")
    c.save()


def make_exchange_pdf(path: Path, item: QrItem, booth: int) -> None:
    width, height = A4
    c = canvas.Canvas(str(path), pagesize=A4, pageCompression=1)
    c.setTitle(f"교환소 {booth}")
    dark = BLUE_DEEP if booth == 1 else FOREST
    accent = GOLD if booth == 1 else CYAN
    icon = ASSET_ROOT / "armor" / ("shield.webp" if booth == 1 else "belt.webp")

    c.setFillColor(dark)
    c.rect(0, 0, width, height, fill=1, stroke=0)
    set_alpha(c, 0.10)
    c.setFillColor(accent)
    c.circle(width - 5 * mm, height - 10 * mm, 52 * mm, fill=1, stroke=0)
    c.circle(-10 * mm, 15 * mm, 43 * mm, fill=1, stroke=0)
    reset_alpha(c)
    draw_page_header(c, width, height, "EQUIPMENT EXCHANGE · STATION", f"교환소 {booth}", f"0{booth + 3} / EXCHANGE", dark=True)

    c.drawImage(str(icon), width - 49 * mm, height - 61 * mm, 34 * mm, 34 * mm,
                preserveAspectRatio=True, mask="auto")
    c.setFillColor(WHITE)
    c.setFont("RetreatBold", 28)
    c.drawString(15 * mm, height - 54 * mm, "장비를 바꾸고")
    c.setFillColor(accent)
    c.drawString(15 * mm, height - 66 * mm, "전신갑주를 완성하라!")
    c.setFillColor(HexColor("#D8E5EA"))
    c.setFont("RetreatBody", 10)
    c.drawString(15 * mm, height - 76 * mm, "두 학생이 함께 입장해 화면 안내에 따라 교환합니다.")

    panel_x, panel_y, panel_w, panel_h = 15 * mm, 62 * mm, width - 30 * mm, 126 * mm
    rounded_panel(c, panel_x, panel_y, panel_w, panel_h, 8 * mm, CREAM, accent, 1.6)
    qr_size = 76 * mm
    draw_qr(c, item, panel_x + 10 * mm, panel_y + 26 * mm, qr_size, dark, accent)

    text_x = panel_x + 96 * mm
    draw_badge(c, f"STATION {booth}", text_x, panel_y + panel_h - 19 * mm, accent, INK, 9, 8 * mm)
    c.setFillColor(INK)
    c.setFont("RetreatBold", 20)
    c.drawString(text_x, panel_y + panel_h - 33 * mm, f"교환소 {booth} 입장")
    instructions = [
        ("01", "두 학생이 함께 QR 스캔"),
        ("02", "각자 교환할 장비 선택"),
        ("03", "서로 확인 후 동시에 완료"),
    ]
    iy = panel_y + panel_h - 50 * mm
    for number, label in instructions:
        c.setFillColor(dark)
        c.circle(text_x + 5 * mm, iy + 2.4 * mm, 5 * mm, fill=1, stroke=0)
        c.setFillColor(WHITE)
        c.setFont("RetreatBold", 7.5)
        c.drawCentredString(text_x + 5 * mm, iy, number)
        c.setFillColor(INK)
        c.setFont("RetreatBold", 10.5)
        c.drawString(text_x + 14 * mm, iy, label)
        iy -= 17 * mm
    c.setFillColor(CORAL)
    c.setFont("RetreatBold", 8.5)
    c.drawString(text_x, panel_y + 17 * mm, "문제가 생기면 선생님을 불러주세요")
    c.setFillColor(INK_SOFT)
    c.setFont("RetreatBody", 6.7)
    draw_wrapped(c, item.url, text_x, panel_y + 10 * mm, panel_x + panel_w - text_x - 8 * mm,
                 size=6.7, max_lines=2)
    draw_footer(c, width, f"교환소 {booth} · 현장 게시용", dark=True)
    c.save()


def reward_card(c: canvas.Canvas, item: QrItem, x: float, y: float, w: float, h: float,
                dark, accent, icon: Path, note: str) -> None:
    rounded_panel(c, x, y, w, h, 5.5 * mm, WHITE, HexColor("#CFC9BD"), 1.1)
    c.setFillColor(dark)
    c.roundRect(x, y, 41 * mm, h, 5.5 * mm, fill=1, stroke=0)
    c.saveState()
    clip = c.beginPath()
    clip.roundRect(x, y, w, h, 5.5 * mm)
    c.clipPath(clip, stroke=0, fill=0)
    set_alpha(c, 0.12)
    c.setFillColor(accent)
    c.circle(x + 35 * mm, y + h - 7 * mm, 21 * mm, fill=1, stroke=0)
    reset_alpha(c)
    c.restoreState()
    c.drawImage(str(icon), x + 8 * mm, y + h - 32 * mm, 25 * mm, 25 * mm,
                preserveAspectRatio=True, mask="auto")
    c.setFillColor(WHITE)
    c.setFont("RetreatBold", 7.2)
    c.drawCentredString(x + 20.5 * mm, y + 7 * mm, item.badge)

    text_x = x + 48 * mm
    qr_size = 43 * mm
    qr_x = x + w - qr_size - 6 * mm
    draw_badge(c, note, text_x, y + h - 15 * mm, accent, INK, 7.3, 6.5 * mm)
    c.setFillColor(INK)
    c.setFont("RetreatBold", 14)
    c.drawString(text_x, y + h - 27 * mm, item.label)
    draw_wrapped(c, item.subtitle, text_x, y + h - 35 * mm, qr_x - text_x - 4 * mm,
                 size=8.3, max_lines=2)
    c.setFillColor(INK_SOFT)
    c.setFont("RetreatBody", 6.3)
    c.drawString(text_x, y + 8 * mm, fit_url(item.url, 42))
    draw_qr(c, item, qr_x, y + (h - qr_size) / 2, qr_size, dark, accent)


def make_rewards_pdf(path: Path, items: dict[str, QrItem]) -> None:
    width, height = A4
    c = canvas.Canvas(str(path), pagesize=A4, pageCompression=1)
    c.setTitle("미션 히든 최종 보상 QR")
    pages = [
        (
            "미션 완료 보상",
            "판단력 · 인내력 · 스피드 미션",
            [
                (items["mission-judgment"], BLUE_DEEP, GOLD, ASSET_ROOT / "armor" / "belt.webp", "판단력 +1"),
                (items["mission-endurance"], HexColor("#7D3D2C"), GOLD, ASSET_ROOT / "armor" / "breastplate.webp", "인내력 +1"),
                (items["mission-speed"], FOREST, MINT, ASSET_ROOT / "armor" / "shoes.webp", "스피드 +1"),
            ],
        ),
        (
            "팀 능력 미션",
            "협동력 · 지력 · 힘 미션",
            [
                (items["mission-teamwork"], PURPLE, CYAN, ASSET_ROOT / "armor" / "shield.webp", "협동력 +1"),
                (items["mission-intellect"], BLUE_DEEP, CYAN, ASSET_ROOT / "armor" / "helmet.webp", "지력 +1"),
                (items["mission-power"], HexColor("#7D3D2C"), GOLD, ASSET_ROOT / "armor" / "sword.webp", "힘 +1"),
            ],
        ),
        (
            "숨겨진 보급품",
            "찾아낸 학생에게만 공개하는 히든 QR",
            [
                (items["hidden-forest-cache-1"], FOREST, MINT, ASSET_ROOT / "armor" / "shoes.webp", "HIDDEN +2"),
                (items["hidden-forest-cache-2"], BLUE_DEEP, CYAN, ASSET_ROOT / "armor" / "helmet.webp", "HIDDEN +2"),
                (items["boss-forest"], HexColor("#733126"), GOLD, ASSET_ROOT / "armor" / "breastplate.webp", "FINAL +3"),
            ],
        ),
    ]
    for page_index, (title, subtitle, rows) in enumerate(pages, start=1):
        draw_page_background(c, width, height, HexColor("#F0EEE7"))
        draw_page_header(c, width, height, "THE WAR · MISSION REWARD", title, f"0{page_index + 5} / REWARD")
        c.setFillColor(INK_SOFT)
        c.setFont("RetreatBody", 8.5)
        c.drawString(25 * mm, height - 30.5 * mm, subtitle + " · 학생 1명당 각 QR 1회")
        x, w, h, gap = 12 * mm, width - 24 * mm, 70 * mm, 5 * mm
        y = height - 41 * mm - h
        for item, dark, accent, icon, note in rows:
            reward_card(c, item, x, y, w, h, dark, accent, icon, note)
            y -= h + gap
        draw_footer(c, width, "미션 · 히든 · 최종 보상")
        c.showPage()
    c.save()


def make_teacher_pdf(path: Path, items: dict[str, QrItem], base_url: str) -> None:
    width, height = A4
    c = canvas.Canvas(str(path), pagesize=A4, pageCompression=1)
    c.setTitle("교사용 현장 운영 QR")
    c.setFillColor(BLUE_DEEP)
    c.rect(0, 0, width, height, fill=1, stroke=0)
    draw_cover_image(c, ASSET_ROOT / "ui" / "entry-armor-hero.webp", 0, height - 93 * mm, width, 93 * mm)
    set_alpha(c, 0.72)
    c.setFillColor(BLUE_DEEP)
    c.rect(0, height - 93 * mm, width, 93 * mm, fill=1, stroke=0)
    reset_alpha(c)
    draw_page_header(c, width, height, "TEACHER ONLY · FIELD CONTROL", "교사용 운영 시트", "09 / CONTROL", dark=True)
    c.setFillColor(WHITE)
    c.setFont("RetreatBold", 23)
    c.drawString(14 * mm, height - 52 * mm, "현장 운영은 여기서")
    c.setFillColor(GOLD)
    c.drawString(14 * mm, height - 63 * mm, "한 번에 확인하세요")
    c.setFillColor(HexColor("#D8E5EA"))
    c.setFont("RetreatBody", 9)
    c.drawString(14 * mm, height - 73 * mm, "관리 PIN은 인쇄물에 기록하지 말고 담당 교사에게만 공유합니다.")

    panel_x, panel_y, panel_w, panel_h = 12 * mm, 86 * mm, width - 24 * mm, 105 * mm
    rounded_panel(c, panel_x, panel_y, panel_w, panel_h, 7 * mm, CREAM, GOLD, 1.4)
    two = [
        (items["teacher-admin"], "관리자", "학생 장비 수정 · 교환소 초기화", GOLD, BLUE_DEEP),
        (items["server-health"], "서버 상태", "ready · postgres · schemaReady · writable", CYAN, FOREST),
    ]
    col_w = panel_w / 2
    for idx, (item, label, sub, accent, dark) in enumerate(two):
        x = panel_x + idx * col_w
        if idx:
            c.setStrokeColor(LINE)
            c.line(x, panel_y + 8 * mm, x, panel_y + panel_h - 8 * mm)
        draw_badge(c, item.badge, x + 8 * mm, panel_y + panel_h - 17 * mm, accent, INK)
        c.setFillColor(INK)
        c.setFont("RetreatBold", 15)
        c.drawString(x + 8 * mm, panel_y + panel_h - 30 * mm, label)
        c.setFillColor(INK_SOFT)
        c.setFont("RetreatBody", 7.5)
        c.drawString(x + 8 * mm, panel_y + panel_h - 37 * mm, sub)
        qr_size = 51 * mm
        draw_qr(c, item, x + (col_w - qr_size) / 2, panel_y + 9 * mm, qr_size, dark, accent)
        c.setFillColor(INK_SOFT)
        c.setFont("RetreatBody", 6.2)
        c.drawCentredString(x + col_w / 2, panel_y + 4 * mm, fit_url(item.url, 39))

    c.setFillColor(WHITE)
    c.setFont("RetreatBold", 14)
    c.drawString(14 * mm, 70 * mm, "현장 시작 전 5분 점검")
    checklist = [
        "서버 상태 QR에서 ready · schemaReady · writable 확인",
        "학생 휴대폰 1대로 입장 → 뽑기 → 교환소까지 리허설",
        "보상 QR은 완료한 학생에게만 보여주고 재스캔 안내 확인",
        "교환 오류는 교사용 관리 화면에서 부스 초기화 후 재시도",
    ]
    y = 58 * mm
    for index, text in enumerate(checklist, start=1):
        c.setFillColor(GOLD)
        c.circle(18 * mm, y + 1.8 * mm, 4 * mm, fill=1, stroke=0)
        c.setFillColor(INK)
        c.setFont("RetreatBold", 7)
        c.drawCentredString(18 * mm, y, str(index))
        c.setFillColor(WHITE)
        c.setFont("RetreatBody", 9)
        c.drawString(26 * mm, y, text)
        y -= 10.5 * mm
    c.setFillColor(HexColor("#AFC7D0"))
    c.setFont("RetreatBody", 7)
    c.drawString(14 * mm, 11 * mm, fit_url(base_url, 80))
    c.drawRightString(width - 12 * mm, 11 * mm, "교사용 · 학생 게시 금지")
    c.save()


def merge_pdfs(paths: list[Path], output: Path) -> None:
    combined = PdfWriter()
    for path in paths:
        combined.append(str(path))
    combined.add_metadata({
        "/Title": "이번 수련회 QR 인쇄 패키지",
        "/Author": "전신갑주 수련회 운영팀",
        "/Subject": "게임 입장, THE WAR 체크인, 뽑기, 교환소, 미션, 교사용 운영 QR",
    })
    with output.open("wb") as handle:
        combined.write(handle)
    combined.close()


def verify_outputs(pdf_dir: Path, qr_dir: Path, expected_qrs: int) -> None:
    pdf_paths = sorted(pdf_dir.glob("*.pdf"))
    png_paths = sorted(qr_dir.glob("*.png"))
    if len(pdf_paths) != 8:
        raise SystemExit(f"PDF 개수 오류: 예상 8, 실제 {len(pdf_paths)}")
    if len(png_paths) != expected_qrs:
        raise SystemExit(f"QR PNG 개수 오류: 예상 {expected_qrs}, 실제 {len(png_paths)}")
    combined = PdfReader(str(pdf_dir / "00_retreat_qr_print_bundle.pdf"))
    if len(combined.pages) != 9:
        raise SystemExit(f"합본 페이지 오류: 예상 9, 실제 {len(combined.pages)}")
    for path in png_paths:
        with Image.open(path) as image:
            if image.width < 300 or image.width != image.height:
                raise SystemExit(f"QR 이미지 크기 오류: {path.name} {image.size}")
    print(f"검증 완료: PDF {len(pdf_paths)}개, 합본 {len(combined.pages)}쪽, QR PNG {len(png_paths)}개")


def main() -> None:
    args = parse_args()
    template = load_template()
    validate_app_contract(template)
    if args.check:
        return

    output_root = Path(args.output_root).expanduser().resolve()
    base_url = normalize_base_url(args.base_url, args.allow_local_preview, output_root)
    pdf_dir = output_root / "pdf"
    qr_dir = output_root / "qr"
    if pdf_dir.exists():
        shutil.rmtree(pdf_dir)
    if qr_dir.exists():
        shutil.rmtree(qr_dir)
    pdf_dir.mkdir(parents=True, exist_ok=True)
    qr_dir.mkdir(parents=True, exist_ok=True)

    register_fonts()
    items = create_items(template, base_url, qr_dir)
    write_generated_manifest(items, qr_dir)
    by_code = item_map(items)

    individual = [
        pdf_dir / "01_game_entry_the_war.pdf",
        pdf_dir / "02_team_war_checkin.pdf",
        pdf_dir / "03_draw_reward_set.pdf",
        pdf_dir / "04_exchange_booth_1.pdf",
        pdf_dir / "05_exchange_booth_2.pdf",
        pdf_dir / "06_mission_hidden_boss.pdf",
        pdf_dir / "07_teacher_operations.pdf",
    ]
    make_game_entry_pdf(individual[0], by_code)
    make_team_checkin_pdf(individual[1], by_code["team-merge"])
    make_draw_pdf(individual[2], by_code)
    make_exchange_pdf(individual[3], by_code["exchange-booth-1"], 1)
    make_exchange_pdf(individual[4], by_code["exchange-booth-2"], 2)
    make_rewards_pdf(individual[5], by_code)
    make_teacher_pdf(individual[6], by_code, base_url)
    merge_pdfs(individual, pdf_dir / "00_retreat_qr_print_bundle.pdf")
    verify_outputs(pdf_dir, qr_dir, len(items))
    print(f"생성 완료: {pdf_dir}")


if __name__ == "__main__":
    main()
