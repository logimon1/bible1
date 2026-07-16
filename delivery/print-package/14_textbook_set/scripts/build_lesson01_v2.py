from __future__ import annotations

import html
import json
import re
import shutil
from pathlib import Path

from PIL import Image as PILImage
from pypdf import PdfReader, PdfWriter
from pypdf.generic import RectangleObject
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Paragraph, Table, TableStyle


PRINT_ROOT = Path(__file__).resolve().parents[2]
SET_ROOT = PRINT_ROOT / "14_textbook_set"
OUT_DIR = SET_ROOT / "output" / "pdf"
DELIVERY_DIR = PRINT_ROOT / "11_print_ready"

HERO_ART = SET_ROOT / "art" / "generated" / "lesson01_truth_editorial_v2.png"
SPOT_ART = SET_ROOT / "art" / "generated" / "lesson01_truth_listening_spot_v2.png"

FONT_REGULAR = Path(r"C:\Windows\Fonts\NotoSansKR-Regular.ttf")
FONT_MEDIUM = Path(r"C:\Windows\Fonts\NotoSansKR-Medium.ttf")
FONT_BOLD = Path(r"C:\Windows\Fonts\NotoSansKR-Bold.ttf")
FONT_SERIF_MEDIUM = Path(r"C:\Windows\Fonts\KoPubBatangMedium.ttf")
FONT_SERIF_BOLD = Path(r"C:\Windows\Fonts\KoPubBatangBold.ttf")

SANS = "NotoSansKR"
SANS_M = "NotoSansKR-Medium"
SANS_B = "NotoSansKR-Bold"
SERIF = "KoPubBatangMedium"
SERIF_B = "KoPubBatangBold"

INK = colors.HexColor("#222A33")
PAPER = colors.HexColor("#FBFAF7")
WHITE = colors.white
COBALT = colors.HexColor("#4B4ACF")
COBALT_DARK = colors.HexColor("#30358F")
LAVENDER = colors.HexColor("#E9E7FB")
SUN = colors.HexColor("#F5C84C")
SUN_PALE = colors.HexColor("#FFF3C8")
CORAL = colors.HexColor("#E9655A")
CORAL_PALE = colors.HexColor("#FCE5E1")
TEAL = colors.HexColor("#16998F")
TEAL_PALE = colors.HexColor("#DDF3F0")
VIOLET = colors.HexColor("#6959B8")
VIOLET_PALE = colors.HexColor("#ECE9F9")
SKY = colors.HexColor("#8FD5F2")
PALE_BLUE = colors.HexColor("#E7F4FA")
MUTED = colors.HexColor("#66717E")
LINE = colors.HexColor("#D7DFDE")
SOFT = colors.HexColor("#F0F3F3")
SAFETY = colors.HexColor("#FFF0B7")

B5_TRIM = (176 * mm, 250 * mm)
A6_TRIM = (105 * mm, 148 * mm)
BLEED = 3 * mm
B5_MEDIA = (B5_TRIM[0] + 2 * BLEED, B5_TRIM[1] + 2 * BLEED)
A6_MEDIA = (A6_TRIM[0] + 2 * BLEED, A6_TRIM[1] + 2 * BLEED)
SLIDE_SIZE = (720.0, 405.0)

STUDENT_FILE = OUT_DIR / "lesson01_student_B5_print.pdf"
TEACHER_FILE = OUT_DIR / "lesson01_teacher_A4_office.pdf"
CARDS_FILE = OUT_DIR / "lesson01_activity_cards_A4_duplex.pdf"
HOME_FILE = OUT_DIR / "lesson01_home_connection_A6_print.pdf"
SLIDES_FILE = OUT_DIR / "lesson01_teacher_slides_16x9.pdf"
MANIFEST_FILE = OUT_DIR / "lesson01_build_manifest.json"


def register_fonts() -> None:
    font_map = {
        SANS: FONT_REGULAR,
        SANS_M: FONT_MEDIUM,
        SANS_B: FONT_BOLD,
        SERIF: FONT_SERIF_MEDIUM,
        SERIF_B: FONT_SERIF_BOLD,
    }
    missing = [str(path) for path in font_map.values() if not path.exists()]
    if missing:
        raise FileNotFoundError(f"Required fonts are missing: {missing}")
    for name, path in font_map.items():
        pdfmetrics.registerFont(TTFont(name, str(path)))


def style(
    name: str,
    size: float,
    leading: float | None = None,
    font: str = SANS,
    color=INK,
    align: int = TA_LEFT,
    **kwargs,
) -> ParagraphStyle:
    return ParagraphStyle(
        name,
        fontName=font,
        fontSize=size,
        leading=leading or size * 1.48,
        textColor=color,
        alignment=align,
        wordWrap="CJK",
        splitLongWords=True,
        **kwargs,
    )


STYLES = {
    "s_title": style("s_title", 24, 29, SANS_B),
    "s_h2": style("s_h2", 17, 22, SANS_B),
    "s_h3": style("s_h3", 12.2, 16.5, SANS_B),
    "s_body": style("s_body", 10.2, 16.0, SANS),
    "s_body_m": style("s_body_m", 10.4, 16.2, SANS_M),
    "s_small": style("s_small", 8.7, 13.0, SANS),
    "s_caption": style("s_caption", 7.8, 11.2, SANS, MUTED),
    "s_quote": style("s_quote", 11.0, 17.2, SERIF_B, COBALT_DARK),
    "s_quote_small": style("s_quote_small", 9.7, 15.0, SERIF, COBALT_DARK),
    "t_title": style("t_title", 21, 26, SANS_B),
    "t_h2": style("t_h2", 13, 18, SANS_B),
    "t_body": style("t_body", 9.3, 14.5, SANS),
    "t_body_m": style("t_body_m", 9.5, 14.8, SANS_M),
    "t_small": style("t_small", 8.0, 12.0, SANS, MUTED),
    "center": style("center", 10.2, 15.5, SANS_M, INK, TA_CENTER),
}


def safe(text: str) -> str:
    return html.escape(text).replace("\n", "<br/>")


def draw_para(
    c: canvas.Canvas,
    text: str,
    x: float,
    top: float,
    width: float,
    pstyle: ParagraphStyle,
    max_height: float | None = None,
    raw: bool = False,
) -> float:
    content = text if raw else safe(text)
    paragraph = Paragraph(content, pstyle)
    _, height = paragraph.wrap(width, max_height or 1000 * mm)
    if max_height is not None and height > max_height + 0.1:
        raise ValueError(f"Text overflow in {pstyle.name}: {text[:80]!r} ({height:.1f}>{max_height:.1f})")
    paragraph.drawOn(c, x, top - height)
    return top - height


def box(c, x, y, w, h, fill=WHITE, stroke=None, radius=4 * mm, line_width=0.6) -> None:
    c.setFillColor(fill)
    if stroke is None:
        c.setStrokeColor(fill)
        stroke_flag = 0
    else:
        c.setStrokeColor(stroke)
        c.setLineWidth(line_width)
        stroke_flag = 1
    c.roundRect(x, y, w, h, radius, stroke=stroke_flag, fill=1)


def line(c, x1, y1, x2, y2, color=LINE, width=0.6, dash=None) -> None:
    c.setStrokeColor(color)
    c.setLineWidth(width)
    if dash:
        c.setDash(dash)
    c.line(x1, y1, x2, y2)
    c.setDash()


def draw_crop(c, path: Path, x, y, w, h, focus_x=0.5, focus_y=0.5) -> None:
    with PILImage.open(path) as source:
        image = source.convert("RGB")
        src_ratio = image.width / image.height
        dst_ratio = w / h
        if src_ratio > dst_ratio:
            new_w = int(image.height * dst_ratio)
            max_left = image.width - new_w
            left = int(max_left * min(max(focus_x, 0), 1))
            crop = image.crop((left, 0, left + new_w, image.height))
        else:
            new_h = int(image.width / dst_ratio)
            max_top = image.height - new_h
            top = int(max_top * min(max(focus_y, 0), 1))
            crop = image.crop((0, top, image.width, top + new_h))
        c.drawImage(ImageReader(crop), x, y, w, h, mask="auto")


def tag(c, text, x, y, fill, text_color=WHITE, width=None, height=7 * mm, font_size=8.2) -> float:
    if width is None:
        width = max(24 * mm, pdfmetrics.stringWidth(text, SANS_B, font_size) + 8 * mm)
    box(c, x, y, width, height, fill=fill, radius=height / 2)
    c.setFont(SANS_B, font_size)
    c.setFillColor(text_color)
    c.drawCentredString(x + width / 2, y + height / 2 - font_size * 0.34, text)
    return width


def number_badge(c, number: str, x, y, fill=SUN, text_color=INK, diameter=10 * mm, size=10) -> None:
    c.setFillColor(fill)
    c.circle(x + diameter / 2, y + diameter / 2, diameter / 2, stroke=0, fill=1)
    c.setFillColor(text_color)
    c.setFont(SANS_B, size)
    c.drawCentredString(x + diameter / 2, y + diameter / 2 - size * 0.34, number)


def checkbox(c, x, y, size=4 * mm, color=INK) -> None:
    c.setStrokeColor(color)
    c.setLineWidth(0.8)
    c.roundRect(x, y, size, size, 0.8 * mm, stroke=1, fill=0)


def write_lines(c, x, y, w, count=2, gap=7 * mm, color=LINE) -> None:
    for index in range(count):
        line(c, x, y - index * gap, x + w, y - index * gap, color=color, width=0.6)


def set_boxes(path: Path, trim_size, bleed: float = 0) -> None:
    reader = PdfReader(str(path))
    writer = PdfWriter()
    for page in reader.pages:
        media_w = float(page.mediabox.width)
        media_h = float(page.mediabox.height)
        page.mediabox = RectangleObject([0, 0, media_w, media_h])
        page.cropbox = RectangleObject([0, 0, media_w, media_h])
        page.bleedbox = RectangleObject([0, 0, media_w, media_h])
        if bleed:
            page.trimbox = RectangleObject([bleed, bleed, bleed + trim_size[0], bleed + trim_size[1]])
        else:
            page.trimbox = RectangleObject([0, 0, media_w, media_h])
        writer.add_page(page)
    writer.add_metadata(reader.metadata or {})
    temp = path.with_suffix(".boxed.pdf")
    with temp.open("wb") as handle:
        writer.write(handle)
    temp.replace(path)


def student_geometry(page_no: int):
    origin_x = BLEED
    origin_y = BLEED
    if page_no % 2 == 0:
        left = origin_x + 14 * mm
        right = origin_x + B5_TRIM[0] - 17 * mm
    else:
        left = origin_x + 17 * mm
        right = origin_x + B5_TRIM[0] - 14 * mm
    bottom = origin_y + 16 * mm
    top = origin_y + B5_TRIM[1] - 15 * mm
    return left, bottom, right - left, top - bottom


def student_base(c, page_no: int, title: str, stage: str, accent) -> tuple[float, float, float, float]:
    c.setFillColor(PAPER)
    c.rect(0, 0, B5_MEDIA[0], B5_MEDIA[1], stroke=0, fill=1)
    x, y, w, h = student_geometry(page_no)
    tag(c, f"LESSON 01 · {stage}", x, y + h - 7 * mm, accent, width=35 * mm, height=6.5 * mm, font_size=7.3)
    draw_para(c, title, x, y + h - 11 * mm, w, STYLES["s_h2"], max_height=15 * mm)
    line(c, x, y + h - 27 * mm, x + w, y + h - 27 * mm, color=accent, width=1.4)
    c.setFont(SANS_B, 8)
    c.setFillColor(MUTED)
    if page_no % 2 == 0:
        c.drawString(BLEED + 8 * mm, BLEED + 7 * mm, f"{page_no:02d}")
    else:
        c.drawRightString(BLEED + B5_TRIM[0] - 8 * mm, BLEED + 7 * mm, f"{page_no:02d}")
    return x, y, w, h - 31 * mm


def student_cover(c) -> None:
    media_w, media_h = B5_MEDIA
    c.setFillColor(LAVENDER)
    c.rect(0, 0, media_w, media_h, stroke=0, fill=1)
    # Original series motif: a tangled line becoming a straight truth line.
    c.setStrokeColor(COBALT)
    c.setLineWidth(4.5 * mm)
    c.setLineCap(1)
    c.bezier(7 * mm, 54 * mm, 35 * mm, 95 * mm, 8 * mm, 146 * mm, 55 * mm, 164 * mm)
    c.bezier(55 * mm, 164 * mm, 81 * mm, 175 * mm, 44 * mm, 205 * mm, 72 * mm, 222 * mm)
    c.line(72 * mm, 222 * mm, media_w - 8 * mm, 222 * mm)
    c.setFillColor(SUN)
    c.circle(media_w - 23 * mm, 222 * mm, 7 * mm, stroke=0, fill=1)

    art_w = 84 * mm
    art_h = 126 * mm
    art_x = media_w - BLEED - 12 * mm - art_w
    art_y = BLEED + 27 * mm
    box(c, art_x - 4 * mm, art_y - 4 * mm, art_w + 8 * mm, art_h + 8 * mm, fill=WHITE, radius=7 * mm)
    draw_crop(c, HERO_ART, art_x, art_y, art_w, art_h, focus_y=0.55)

    tag(c, "전신갑주 4주 공과 · LESSON 01", BLEED + 14 * mm, media_h - BLEED - 25 * mm, COBALT, width=58 * mm, height=7 * mm, font_size=7.5)
    draw_para(c, "진리로", BLEED + 14 * mm, media_h - BLEED - 43 * mm, 90 * mm, style("cover1", 29, 33, SANS_B, INK), max_height=36 * mm)
    draw_para(c, "중심을 잡아라", BLEED + 14 * mm, media_h - BLEED - 75 * mm, 130 * mm, style("cover2", 29, 34, SANS_B, COBALT_DARK), max_height=38 * mm)
    draw_para(c, "에베소서 6:10~14", BLEED + 15 * mm, media_h - BLEED - 111 * mm, 70 * mm, style("cover3", 11, 15, SANS_M, CORAL), max_height=16 * mm)

    core_y = BLEED + 36 * mm
    box(c, BLEED + 13 * mm, core_y, 69 * mm, 43 * mm, fill=SUN_PALE, radius=5 * mm)
    draw_para(
        c,
        "주님의 능력 안에서 진리를 붙들면, 성급히 단정하지 않고 사랑으로 다음 행동을 선택할 수 있습니다.",
        BLEED + 18 * mm,
        core_y + 35 * mm,
        59 * mm,
        STYLES["s_quote_small"],
        max_height=31 * mm,
    )
    c.setFillColor(COBALT_DARK)
    c.rect(0, 0, media_w, BLEED + 18 * mm, stroke=0, fill=1)
    c.setFillColor(WHITE)
    c.setFont(SANS_M, 8.5)
    c.drawString(BLEED + 14 * mm, BLEED + 7 * mm, "중·고등부 학생용")
    c.drawRightString(media_w - BLEED - 14 * mm, BLEED + 7 * mm, "[교회명]")
    c.showPage()


def student_page2(c) -> None:
    x, y, w, h = student_base(c, 2, "답장이 짧아진 이유", "장면 보기", CORAL)
    body_top = y + h - 4 * mm
    img_h = 58 * mm
    box(c, x + 3 * mm, body_top - img_h - 3 * mm, w - 3 * mm, img_h + 3 * mm, fill=SUN, radius=6 * mm)
    draw_crop(c, SPOT_ART, x, body_top - img_h, w - 4 * mm, img_h, focus_x=0.2, focus_y=0.52)

    bubble_top = body_top - img_h - 8 * mm
    gap = 4 * mm
    bw = (w - gap) / 2
    box(c, x, bubble_top - 34 * mm, bw, 34 * mm, fill=CORAL_PALE, radius=4 * mm)
    tag(c, "민서의 생각", x + 4 * mm, bubble_top - 9 * mm, CORAL, width=27 * mm, height=6 * mm, font_size=7)
    draw_para(c, "“분명히 나한테 화가 났어. 내가 또 분위기를 망쳤나 봐.”", x + 5 * mm, bubble_top - 13 * mm, bw - 10 * mm, STYLES["s_quote_small"], max_height=18 * mm)
    box(c, x + bw + gap, bubble_top - 34 * mm, bw, 34 * mm, fill=SUN_PALE, radius=4 * mm)
    tag(c, "친구의 질문", x + bw + gap + 4 * mm, bubble_top - 9 * mm, SUN, text_color=INK, width=27 * mm, height=6 * mm, font_size=7)
    draw_para(c, "“지금 확인할 수 있는 것은 뭐야? 아직 모르는 것은 뭘까?”", x + bw + gap + 5 * mm, bubble_top - 13 * mm, bw - 10 * mm, STYLES["s_quote_small"], max_height=18 * mm)

    lenses_top = bubble_top - 40 * mm
    draw_para(c, "네 렌즈로 천천히 살펴보세요", x, lenses_top, w, STYLES["s_h3"], max_height=10 * mm)
    lenses_top -= 12 * mm
    colors_and_text = [
        (TEAL_PALE, TEAL, "1", "사실", "직접 확인할 수 있는 것 2가지"),
        (LAVENDER, VIOLET, "2", "감정", "민서가 느꼈을 감정 1가지"),
        (SUN_PALE, SUN, "3", "아직 모르는 것", "확인하지 않은 설명 1가지"),
        (CORAL_PALE, CORAL, "4", "다음 행동", "사람을 적으로 삼지 않는 질문"),
    ]
    card_w = (w - gap) / 2
    card_h = 31 * mm
    for idx, (fill, accent, num, label, prompt) in enumerate(colors_and_text):
        col = idx % 2
        row = idx // 2
        cx = x + col * (card_w + gap)
        cy = lenses_top - (row + 1) * card_h - row * 3 * mm
        box(c, cx, cy, card_w, card_h, fill=fill, radius=4 * mm)
        number_badge(c, num, cx + 4 * mm, cy + card_h - 12 * mm, fill=accent, text_color=WHITE, diameter=8 * mm, size=8)
        draw_para(c, label, cx + 14 * mm, cy + card_h - 4 * mm, card_w - 18 * mm, STYLES["s_h3"], max_height=9 * mm)
        draw_para(c, prompt, cx + 5 * mm, cy + card_h - 15 * mm, card_w - 10 * mm, STYLES["s_small"], max_height=10 * mm)
        write_lines(c, cx + 5 * mm, cy + 6 * mm, card_w - 10 * mm, count=1)
    c.showPage()


def student_page3(c) -> None:
    x, y, w, h = student_base(c, 3, "본문에서 중심을 찾아요", "본문 탐험", COBALT)
    top = y + h - 4 * mm
    box(c, x, top - 33 * mm, w, 33 * mm, fill=COBALT, radius=5 * mm)
    draw_para(c, "에베소서 6:10~14", x + 6 * mm, top - 6 * mm, 70 * mm, style("verse_ref", 15, 19, SANS_B, WHITE), max_height=18 * mm)
    draw_para(c, "교회에서 사용하는 성경으로 ‘진리로 허리를 동여매고’까지 직접 읽습니다.", x + 6 * mm, top - 22 * mm, w - 12 * mm, style("verse_sub", 8.7, 12.5, SANS, WHITE), max_height=10 * mm)

    top -= 39 * mm
    draw_para(c, "읽으며 네 가지를 표시하세요", x, top, w, STYLES["s_h3"], max_height=10 * mm)
    top -= 12 * mm
    items = [
        ("1", "밑줄", "힘이 어디에서 오는가"),
        ("2", "네모", "갑주를 입는 목적"),
        ("3", "동그라미", "서다·맞서다·대항하다"),
        ("4", "별표", "싸움의 대상이 아닌 존재"),
    ]
    gap = 4 * mm
    card_w = (w - gap) / 2
    card_h = 33 * mm
    for idx, (num, mark, desc) in enumerate(items):
        cx = x + (idx % 2) * (card_w + gap)
        cy = top - (idx // 2 + 1) * card_h - (idx // 2) * 4 * mm
        box(c, cx, cy, card_w, card_h, fill=WHITE, stroke=LINE, radius=4 * mm)
        number_badge(c, num, cx + 4 * mm, cy + card_h - 12 * mm, fill=SUN, diameter=8 * mm, size=8)
        tag(c, mark, cx + 14 * mm, cy + card_h - 11 * mm, LAVENDER, text_color=COBALT_DARK, width=22 * mm, height=6 * mm, font_size=7)
        draw_para(c, desc, cx + 5 * mm, cy + card_h - 16 * mm, card_w - 10 * mm, STYLES["s_body_m"], max_height=14 * mm)

    checkpoint_y = y + 7 * mm
    draw_para(c, "기억할 세 가지", x, checkpoint_y + 33 * mm, w, STYLES["s_h3"], max_height=10 * mm)
    labels = [("힘의 근원", TEAL), ("사람은 적?", VIOLET), ("갑주의 목적", CORAL)]
    cell_w = (w - 2 * gap) / 3
    for idx, (label, accent) in enumerate(labels):
        cx = x + idx * (cell_w + gap)
        box(c, cx, checkpoint_y, cell_w, 28 * mm, fill=SOFT, radius=4 * mm)
        tag(c, label, cx + 3 * mm, checkpoint_y + 17 * mm, accent, width=cell_w - 6 * mm, height=6 * mm, font_size=6.8)
        write_lines(c, cx + 5 * mm, checkpoint_y + 8 * mm, cell_w - 10 * mm, count=1)
    c.showPage()


def student_page4(c) -> None:
    x, y, w, h = student_base(c, 4, "진리는 나를 설 준비시켜요", "핵심 진리", TEAL)
    top = y + h - 4 * mm
    gap = 5 * mm
    card_w = (w - gap) / 2
    card_h = 66 * mm
    box(c, x, top - card_h, card_w, card_h, fill=TEAL_PALE, radius=5 * mm)
    tag(c, "01 · 진리는 준비입니다", x + 5 * mm, top - 12 * mm, TEAL, width=44 * mm, height=7 * mm, font_size=7.4)
    draw_para(c, "복음의 참된 소식과 예수님 안의 진리를 붙들 때, 정직하고 사랑하는 행동을 선택할 준비가 됩니다.", x + 6 * mm, top - 19 * mm, card_w - 12 * mm, STYLES["s_body_m"], max_height=36 * mm)
    draw_para(c, "진리는 ‘무조건 좋게 생각하기’가 아닙니다.", x + 6 * mm, top - 54 * mm, card_w - 12 * mm, STYLES["s_caption"], max_height=12 * mm)

    x2 = x + card_w + gap
    box(c, x2, top - card_h, card_w, card_h, fill=LAVENDER, radius=5 * mm)
    tag(c, "02 · 사람은 적이 아닙니다", x2 + 5 * mm, top - 12 * mm, VIOLET, width=48 * mm, height=7 * mm, font_size=7.2)
    draw_para(c, "갈등이 생겨도 친구를 악한 사람으로 낙인찍지 않습니다. 거짓과 분열을 멈추고 진실하고 사랑하는 다음 행동을 찾습니다.", x2 + 6 * mm, top - 19 * mm, card_w - 12 * mm, STYLES["s_body_m"], max_height=36 * mm)
    draw_para(c, "잘못을 모른 척하라는 뜻도 아닙니다.", x2 + 6 * mm, top - 54 * mm, card_w - 12 * mm, STYLES["s_caption"], max_height=12 * mm)

    flow_top = top - card_h - 10 * mm
    draw_para(c, "네 단계로 다시 보기", x, flow_top, w, STYLES["s_h3"], max_height=10 * mm)
    flow_top -= 13 * mm
    steps = [
        ("1", "사실", "친구가 짧게 답했다.", TEAL, TEAL_PALE),
        ("2", "감정·의미", "서운했다. 화났다고 생각했다.", VIOLET, VIOLET_PALE),
        ("3", "아직 모름", "짧게 답한 이유.", SUN, SUN_PALE),
        ("4", "다음 행동", "조용히 이유를 물어본다.", CORAL, CORAL_PALE),
    ]
    step_gap = 3 * mm
    step_w = (w - 3 * step_gap) / 4
    step_h = 53 * mm
    for idx, (num, label, desc, accent, fill) in enumerate(steps):
        sx = x + idx * (step_w + step_gap)
        sy = flow_top - step_h
        box(c, sx, sy, step_w, step_h, fill=fill, radius=4 * mm)
        number_badge(c, num, sx + 4 * mm, sy + step_h - 12 * mm, fill=accent, text_color=WHITE, diameter=8 * mm, size=8)
        draw_para(c, label, sx + 4 * mm, sy + step_h - 16 * mm, step_w - 8 * mm, style(f"step_label_{idx}", 9.2, 12.2, SANS_B, accent, TA_CENTER), max_height=13 * mm)
        draw_para(c, desc, sx + 4 * mm, sy + step_h - 31 * mm, step_w - 8 * mm, style(f"step_desc_{idx}", 8.2, 12.5, SANS, INK, TA_CENTER), max_height=18 * mm)
        if idx < 3:
            c.setFillColor(COBALT_DARK)
            c.setFont(SANS_B, 12)
            c.drawCentredString(sx + step_w + step_gap / 2, sy + step_h / 2 - 4, "›")

    core_y = y + 3 * mm
    box(c, x, core_y, w, 25 * mm, fill=COBALT_DARK, radius=5 * mm)
    draw_para(c, "힘의 근원은 주님 · 사람은 적이 아님 · 진리는 사랑의 행동으로 이어짐", x + 7 * mm, core_y + 17 * mm, w - 14 * mm, style("core_line", 9.2, 13.5, SANS_B, WHITE, TA_CENTER), max_height=15 * mm)
    c.showPage()


def student_page5(c) -> None:
    x, y, w, h = student_base(c, 5, "확인하고, 멈추고, 선택하기", "함께 해보기", SUN)
    top = y + h - 4 * mm
    draw_para(c, "카드 문장만 보고 분류하세요. 새로운 정보가 생기면 분류가 달라질 수 있습니다.", x, top, w, STYLES["s_body_m"], max_height=13 * mm)
    top -= 18 * mm
    gap = 4 * mm
    cw = (w - 2 * gap) / 3
    categories = [
        ("✓", "확인할 수 있는 사실", TEAL, TEAL_PALE),
        ("?", "아직 확인하지 않은 설명", VIOLET, VIOLET_PALE),
        ("!", "근거보다 넓게 단정한 결론", CORAL, CORAL_PALE),
    ]
    for idx, (icon, label, accent, fill) in enumerate(categories):
        cx = x + idx * (cw + gap)
        box(c, cx, top - 39 * mm, cw, 39 * mm, fill=fill, radius=5 * mm)
        c.setFillColor(accent)
        c.circle(cx + cw / 2, top - 12 * mm, 6 * mm, stroke=0, fill=1)
        c.setFillColor(WHITE)
        c.setFont(SANS_B, 13)
        c.drawCentredString(cx + cw / 2, top - 13.8 * mm, icon)
        draw_para(c, label, cx + 4 * mm, top - 23 * mm, cw - 8 * mm, style(f"cat_{idx}", 8.7, 12.5, SANS_B, accent, TA_CENTER), max_height=14 * mm)

    top -= 47 * mm
    draw_para(c, "활동 순서", x, top, w, STYLES["s_h3"], max_height=10 * mm)
    top -= 13 * mm
    steps = [
        "카드를 알맞은 분류판에 놓습니다.",
        "문장 속 근거를 찾아 이유를 말합니다.",
        "존중하는 확인 질문 또는 사랑의 다음 행동을 만듭니다.",
        "새 정보가 생기면 분류가 어떻게 달라질지 말합니다.",
    ]
    step_h = 19 * mm
    sw = (w - gap) / 2
    for idx, text in enumerate(steps):
        sx = x + (idx % 2) * (sw + gap)
        sy = top - (idx // 2 + 1) * step_h - (idx // 2) * 3 * mm
        box(c, sx, sy, sw, step_h, fill=WHITE, stroke=LINE, radius=4 * mm)
        number_badge(c, str(idx + 1), sx + 4 * mm, sy + step_h - 11 * mm, fill=COBALT, text_color=WHITE, diameter=7 * mm, size=7)
        draw_para(c, text, sx + 14 * mm, sy + step_h - 4 * mm, sw - 18 * mm,
                  style(f"activity_step_{idx}", 7.7, 10.8, SANS_M, INK), max_height=13 * mm)

    record_y = y + 33 * mm
    box(c, x, record_y, w, 28 * mm, fill=SOFT, radius=4 * mm)
    tag(c, "우리 팀 역할", x + 5 * mm, record_y + 18 * mm, COBALT, width=28 * mm, height=6 * mm, font_size=7)
    role_labels = ["근거 찾기", "질문 만들기", "기록하기", "시간 보기"]
    rx = x + 38 * mm
    for idx, label in enumerate(role_labels):
        rw = (w - 43 * mm - 3 * 3 * mm) / 4
        box(c, rx + idx * (rw + 3 * mm), record_y + 9 * mm, rw, 14 * mm, fill=LAVENDER, radius=3 * mm)
        draw_para(c, label, rx + idx * (rw + 3 * mm) + 2 * mm, record_y + 20 * mm, rw - 4 * mm,
                  style(f"role_{idx}", 7.1, 9.2, SANS_M, COBALT_DARK, TA_CENTER), max_height=8 * mm)
        write_lines(c, rx + idx * (rw + 3 * mm) + 3 * mm, record_y + 6 * mm, rw - 6 * mm, count=1)

    box(c, x, y + 1 * mm, w, 27 * mm, fill=SAFETY, radius=4 * mm)
    tag(c, "SAFE", x + 5 * mm, y + 17 * mm, INK, width=18 * mm, height=6 * mm, font_size=7)
    draw_para(c, "실제 경험을 말하지 않아도 됩니다. 감정을 평가하지 않고, 실명·계정명·연락처·채팅 원문·사진을 공유하지 않습니다.",
              x + 28 * mm, y + 21 * mm, w - 34 * mm,
              style("student5_safe", 7.7, 10.8, SANS_M, INK), max_height=18 * mm)
    c.showPage()


def student_page6(c) -> None:
    x, y, w, h = student_base(c, 6, "우리 팀의 다음 행동", "미션과 퇴실", CORAL)
    top = y + h - 4 * mm
    gap = 5 * mm
    left_w = w * 0.58
    right_w = w - left_w - gap
    panel_h = 104 * mm
    box(c, x, top - panel_h, left_w, panel_h, fill=WHITE, stroke=LINE, radius=5 * mm)
    tag(c, "TEAM RECORD", x + 5 * mm, top - 12 * mm, COBALT, width=35 * mm, height=7 * mm, font_size=7.1)
    fields = [
        "가장 어려웠던 카드 코드",
        "처음 분류와 이유",
        "토론 후 분류와 이유",
        "존중하며 확인할 질문",
        "사람을 적으로 삼지 않는 다음 행동",
    ]
    fy = top - 22 * mm
    for idx, label in enumerate(fields):
        draw_para(c, label, x + 6 * mm, fy, left_w - 12 * mm, STYLES["s_small"], max_height=8 * mm)
        write_lines(c, x + 6 * mm, fy - 8 * mm, left_w - 12 * mm, count=1)
        fy -= 17 * mm

    rx = x + left_w + gap
    box(c, rx, top - panel_h, right_w, panel_h, fill=CORAL_PALE, radius=5 * mm)
    tag(c, "MISSION CHECK", rx + 5 * mm, top - 12 * mm, CORAL, width=34 * mm, height=7 * mm, font_size=7)
    checklist = [
        "카드 3장 이상을 근거와 함께 분류했다.",
        "존중하는 확인 질문을 만들었다.",
        "팀원의 설명을 끊지 않고 들었다.",
        "사람을 적으로 삼지 않는 다음 행동을 정했다.",
    ]
    cy = top - 26 * mm
    for item in checklist:
        checkbox(c, rx + 6 * mm, cy - 3 * mm, size=4 * mm, color=CORAL)
        draw_para(c, item, rx + 13 * mm, cy + 1 * mm, right_w - 19 * mm,
                  style("mission_item", 7.8, 11.2, SANS), max_height=15 * mm)
        cy -= 19 * mm

    exit_top = top - panel_h - 9 * mm
    draw_para(c, "퇴실 확인 3문항", x, exit_top, w, STYLES["s_h3"], max_height=10 * mm)
    exit_top -= 14 * mm
    prompts = [
        ("1", "힘의 근원은?", TEAL),
        ("2", "사람은 싸움의 대상?", VIOLET),
        ("3", "갑주의 목적은?", CORAL),
    ]
    ew = (w - 2 * gap) / 3
    for idx, (num, prompt, accent) in enumerate(prompts):
        ex = x + idx * (ew + gap)
        box(c, ex, exit_top - 34 * mm, ew, 34 * mm, fill=SOFT, radius=4 * mm)
        number_badge(c, num, ex + ew / 2 - 4 * mm, exit_top - 12 * mm, fill=accent, text_color=WHITE, diameter=8 * mm, size=8)
        draw_para(c, prompt, ex + 4 * mm, exit_top - 17 * mm, ew - 8 * mm, style(f"exit_{idx}", 8.2, 11.5, SANS_B, accent, TA_CENTER), max_height=13 * mm)
        write_lines(c, ex + 6 * mm, exit_top - 29 * mm, ew - 12 * mm, count=1)

    box(c, x, y + 1 * mm, w, 18 * mm, fill=LAVENDER, radius=4 * mm)
    draw_para(c, "완료는 교사가 실제 QR 카드 또는 종이표로 확인합니다. 앱에는 완료 여부만 남기며 개인 경험과 민감한 내용은 입력하지 않습니다.",
              x + 7 * mm, y + 14 * mm, w - 14 * mm,
              style("privacy", 7.5, 10.4, SANS_M, COBALT_DARK, TA_CENTER), max_height=12 * mm)
    c.showPage()


def student_page7(c) -> None:
    x, y, w, h = student_base(c, 7, "내 삶에 놓고, 함께 서기", "개인 적용", VIOLET)
    top = y + h - 4 * mm
    img_w = 76 * mm
    img_h = 42 * mm
    draw_crop(c, SPOT_ART, x, top - img_h, img_w, img_h, focus_x=0.15, focus_y=0.5)
    box(c, x + img_w + 4 * mm, top - img_h, w - img_w - 4 * mm, img_h, fill=LAVENDER, radius=5 * mm)
    tag(c, "LISTEN", x + img_w + 9 * mm, top - 12 * mm, VIOLET, width=23 * mm, height=6 * mm, font_size=7)
    draw_para(c, "친구가 말합니다.\n“나는 또 실패했어. 난 원래 안 돼.”", x + img_w + 9 * mm, top - 17 * mm,
              w - img_w - 14 * mm, STYLES["s_quote_small"], max_height=22 * mm)
    draw_para(c, "판단보다 먼저 무엇을 들을까요?", x + img_w + 9 * mm, top - 36 * mm,
              w - img_w - 14 * mm, STYLES["s_caption"], max_height=8 * mm)

    top -= img_h + 7 * mm
    gap = 4 * mm
    left_w = (w - gap) * 0.54
    right_w = w - gap - left_w
    draw_para(c, "작은 상황을 네 단계로 다시 보기", x, top, left_w, STYLES["s_h3"], max_height=10 * mm)
    top2 = top - 13 * mm
    stages = [
        ("1", "확인할 수 있는 사실", TEAL_PALE, TEAL),
        ("2", "감정·내가 붙인 의미", VIOLET_PALE, VIOLET),
        ("3", "아직 확인하지 못한 것", SUN_PALE, SUN),
        ("4", "말씀에 비춘 다음 행동", CORAL_PALE, CORAL),
    ]
    sh = 19 * mm
    for idx, (num, label, fill, accent) in enumerate(stages):
        sy = top2 - (idx + 1) * sh - idx * 2 * mm
        box(c, x, sy, left_w, sh, fill=fill, radius=3 * mm)
        number_badge(c, num, x + 4 * mm, sy + sh - 10 * mm, fill=accent, text_color=WHITE, diameter=6.5 * mm, size=6.5)
        draw_para(c, label, x + 12 * mm, sy + sh - 3 * mm, left_w - 17 * mm,
                  style(f"apply_{idx}", 7.7, 10.5, SANS_B, accent), max_height=9 * mm)
        write_lines(c, x + 5 * mm, sy + 5 * mm, left_w - 10 * mm, count=1)

    rx = x + left_w + gap
    draw_para(c, "도움이 되는 반응?", rx, top, right_w, STYLES["s_h3"], max_height=10 * mm)
    responses = [
        "그 정도로 뭘 힘들어해?",
        "속상했겠다. 말하고 싶다면 함께 살펴볼까?",
        "그렇게 느낀 이유를 듣고 싶어.",
        "믿음이 있으면 그런 생각 하면 안 돼.",
        "이번 결과가 너의 전부는 아니야.",
    ]
    ry = top - 15 * mm
    for idx, response in enumerate(responses):
        fill = WHITE if idx % 2 == 0 else SOFT
        box(c, rx, ry - 14 * mm, right_w, 14 * mm, fill=fill, stroke=LINE, radius=3 * mm)
        c.setStrokeColor(VIOLET)
        c.setLineWidth(0.8)
        c.circle(rx + 7 * mm, ry - 7 * mm, 3.0 * mm, stroke=1, fill=0)
        c.setFont(SANS_B, 6.5)
        c.setFillColor(VIOLET)
        c.drawCentredString(rx + 7 * mm, ry - 8 * mm, "O/X")
        draw_para(c, response, rx + 13 * mm, ry - 2 * mm, right_w - 18 * mm,
                  style(f"resp_{idx}", 7.1, 9.8, SANS), max_height=11 * mm)
        ry -= 16 * mm

    decision_y = y + 2 * mm
    box(c, x, decision_y, w, 30 * mm, fill=COBALT_DARK, radius=5 * mm)
    draw_para(c, "감정 인정 → 말할 선택권 → 사실 확인 → 작고 안전한 도움", x + 6 * mm, decision_y + 24 * mm,
              w - 12 * mm, style("listen_flow", 8.3, 11.5, SANS_B, WHITE, TA_CENTER), max_height=11 * mm)
    draw_para(c, "나는 __________________ 상황에서 성급히 단정하기 전에 __________________ 하겠습니다.",
              x + 8 * mm, decision_y + 12 * mm, w - 16 * mm,
              style("decision", 7.9, 11, SERIF, WHITE, TA_CENTER), max_height=11 * mm)
    c.showPage()


def student_page8(c) -> None:
    x, y, w, h = student_base(c, 8, "이번 주, 진리로 중심 잡기", "주간 미션", TEAL)
    top = y + h - 4 * mm
    draw_para(c, "가능한 날에 세 번 기록하세요. 못 한 날이 있어도 실패로 평가하지 않습니다.", x, top, w, STYLES["s_body_m"], max_height=13 * mm)
    top -= 18 * mm
    headers = ["사실", "감정·의미", "아직 모름", "다음 행동"]
    header_colors = [TEAL, VIOLET, SUN, CORAL]
    label_w = 11 * mm
    cell_w = (w - label_w) / 4
    row_h = 30 * mm
    header_h = 10 * mm
    for idx, header in enumerate(headers):
        hx = x + label_w + idx * cell_w
        c.setFillColor(header_colors[idx])
        c.rect(hx, top - header_h, cell_w, header_h, stroke=0, fill=1)
        draw_para(c, header, hx + 2 * mm, top - 2 * mm, cell_w - 4 * mm, style(f"logh_{idx}", 7.1, 9, SANS_B, WHITE, TA_CENTER), max_height=8 * mm)
    for row in range(3):
        ry = top - header_h - (row + 1) * row_h
        c.setFillColor(COBALT_DARK if row == 0 else (VIOLET if row == 1 else TEAL))
        c.rect(x, ry, label_w, row_h, stroke=0, fill=1)
        draw_para(c, f"LOG\n{row + 1}", x + 1 * mm, ry + row_h / 2 + 7 * mm, label_w - 2 * mm, style(f"logn_{row}", 7.5, 10, SANS_B, WHITE, TA_CENTER), max_height=20 * mm)
        for col in range(4):
            cx = x + label_w + col * cell_w
            c.setFillColor(WHITE)
            c.setStrokeColor(LINE)
            c.setLineWidth(0.5)
            c.rect(cx, ry, cell_w, row_h, stroke=1, fill=1)
            write_lines(c, cx + 3 * mm, ry + row_h - 8 * mm, cell_w - 6 * mm, count=3, gap=7 * mm)

    bottom_top = top - header_h - 3 * row_h - 7 * mm
    gap = 4 * mm
    prayer_w = w * 0.58
    family_w = w - prayer_w - gap
    box(c, x, bottom_top - 33 * mm, prayer_w, 33 * mm, fill=LAVENDER, radius=4 * mm)
    tag(c, "한 문장 기도", x + 5 * mm, bottom_top - 11 * mm, COBALT, width=29 * mm, height=6 * mm, font_size=7)
    draw_para(c, "하나님, 주님의 능력 안에서 진리를 붙들고 사람을 적으로 삼지 않으며 사랑으로 다음 행동을 선택하게 해 주세요.",
              x + 6 * mm, bottom_top - 15 * mm, prayer_w - 12 * mm,
              style("student8_prayer", 8.0, 11.5, SERIF_B, COBALT_DARK), max_height=17 * mm)
    fx = x + prayer_w + gap
    box(c, fx, bottom_top - 33 * mm, family_w, 33 * mm, fill=SUN_PALE, radius=4 * mm)
    tag(c, "가족 질문", fx + 5 * mm, bottom_top - 11 * mm, SUN, text_color=INK, width=24 * mm, height=6 * mm, font_size=7)
    draw_para(c, "확인하기 전에 단정했다가, 확인한 뒤 생각이 달라진 일이 있나요?", fx + 6 * mm, bottom_top - 15 * mm,
              family_w - 12 * mm, style("family_q", 7.8, 11.0, SERIF_B, COBALT_DARK, TA_CENTER), max_height=17 * mm)

    box(c, x, y + 1 * mm, w, 22 * mm, fill=SAFETY, radius=4 * mm)
    tag(c, "도움 요청", x + 5 * mm, y + 13 * mm, INK, width=24 * mm, height=6 * mm, font_size=7)
    draw_para(c, "괴롭힘·폭력·학대·자해나 죽고 싶은 생각은 책에 자세히 쓰지 말고 지금 믿을 수 있는 교사·교역자·보호 담당자 또는 안전한 어른에게 말하세요. 바로 위험하면 즉시 주변 어른에게 도움을 요청하세요.",
              x + 34 * mm, y + 17 * mm, w - 40 * mm,
              style("safety_small", 6.9, 9.5, SANS_M, INK), max_height=16 * mm)
    c.showPage()


def build_student() -> dict[str, float]:
    c = canvas.Canvas(str(STUDENT_FILE), pagesize=B5_MEDIA, pageCompression=1)
    c.setTitle("전신갑주 4주 공과 1과 학생책 - 진리로 중심을 잡아라")
    c.setAuthor("전신갑주 4주 공과")
    student_cover(c)
    student_page2(c)
    student_page3(c)
    student_page4(c)
    student_page5(c)
    student_page6(c)
    student_page7(c)
    student_page8(c)
    c.save()
    set_boxes(STUDENT_FILE, B5_TRIM, BLEED)
    hero_ppi = 1024 / (84 / 25.4)
    spot_ppi = 1536 / (130 / 25.4)
    return {"hero": round(hero_ppi, 1), "spot": round(spot_ppi, 1)}


TEACHER_STAGES = ["장면", "본문", "핵심", "활동", "적용", "마무리"]


def teacher_base(c, page_no: int, title: str, active_stage: int | None = None):
    c.setFillColor(WHITE)
    c.rect(0, 0, A4[0], A4[1], stroke=0, fill=1)
    left = 17 * mm
    right = A4[0] - 15 * mm
    top = A4[1] - 15 * mm
    bottom = 16 * mm
    seg_gap = 2 * mm
    seg_w = (right - left - 5 * seg_gap) / 6
    for idx, label in enumerate(TEACHER_STAGES):
        fill = COBALT if active_stage == idx else SOFT
        text_color = WHITE if active_stage == idx else MUTED
        box(c, left + idx * (seg_w + seg_gap), top - 7 * mm, seg_w, 7 * mm, fill=fill, radius=2.5 * mm)
        c.setFillColor(text_color)
        c.setFont(SANS_B, 6.8)
        c.drawCentredString(left + idx * (seg_w + seg_gap) + seg_w / 2, top - 4.8 * mm, label)
    tag(c, "교사용 지도서 · LESSON 01", left, top - 18 * mm, COBALT_DARK, width=48 * mm, height=6.5 * mm, font_size=7)
    draw_para(c, title, left, top - 23 * mm, right - left, STYLES["t_title"], max_height=16 * mm)
    line(c, left, top - 42 * mm, right, top - 42 * mm, color=COBALT, width=1.3)
    c.setFillColor(MUTED)
    c.setFont(SANS_M, 7.5)
    c.drawString(left, 9 * mm, "진리로 중심을 잡아라 · 중1~고3 · 55분")
    c.drawRightString(right, 9 * mm, f"{page_no:02d} / 12")
    return left, bottom, right - left, top - bottom - 47 * mm


def teacher_panel(c, x, top, w, h, title, body, accent=COBALT, fill=SOFT, body_style=None, title_width=None):
    box(c, x, top - h, w, h, fill=fill, radius=3.5 * mm)
    tag(c, title, x + 5 * mm, top - 11 * mm, accent, width=title_width, height=6.5 * mm, font_size=7.2)
    draw_para(c, body, x + 6 * mm, top - 16 * mm, w - 12 * mm, body_style or STYLES["t_body"], max_height=h - 21 * mm)


def teacher_cover(c) -> None:
    c.setFillColor(PAPER)
    c.rect(0, 0, A4[0], A4[1], stroke=0, fill=1)
    c.setFillColor(COBALT_DARK)
    c.rect(0, 0, 72 * mm, A4[1], stroke=0, fill=1)
    c.setStrokeColor(SUN)
    c.setLineWidth(4 * mm)
    c.bezier(8 * mm, 35 * mm, 60 * mm, 65 * mm, 10 * mm, 120 * mm, 60 * mm, 145 * mm)
    c.line(60 * mm, 145 * mm, 72 * mm, 145 * mm)
    c.setFillColor(SUN)
    c.circle(60 * mm, 145 * mm, 6 * mm, stroke=0, fill=1)
    c.setFillColor(WHITE)
    c.setFont(SANS_B, 10)
    c.drawString(15 * mm, A4[1] - 24 * mm, "전신갑주 4주 공과")
    draw_para(c, "TEACHER\nGUIDE", 15 * mm, A4[1] - 43 * mm, 45 * mm, style("tg", 23, 26, SANS_B, WHITE), max_height=58 * mm)
    c.setFont(SANS_M, 8)
    c.drawString(15 * mm, 20 * mm, "중·고등부 교사용")

    rx = 86 * mm
    rw = A4[0] - rx - 16 * mm
    tag(c, "LESSON 01 · 진리", rx, A4[1] - 28 * mm, CORAL, width=39 * mm, height=7 * mm, font_size=7.5)
    draw_para(c, "진리로\n중심을 잡아라", rx, A4[1] - 45 * mm, rw, style("tc_title", 27, 31, SANS_B, INK), max_height=68 * mm)
    draw_para(c, "에베소서 6:10~14", rx, A4[1] - 111 * mm, rw, style("tc_ref", 11, 15, SANS_M, CORAL), max_height=16 * mm)
    art_w = 79 * mm
    art_h = 119 * mm
    draw_crop(c, HERO_ART, rx, A4[1] - 242 * mm, art_w, art_h, focus_y=0.56)
    box(c, rx + art_w + 5 * mm, A4[1] - 183 * mm, rw - art_w - 5 * mm, 60 * mm, fill=LAVENDER, radius=4 * mm)
    draw_para(c, "55", rx + art_w + 10 * mm, A4[1] - 137 * mm, 25 * mm, style("mins", 25, 28, SANS_B, COBALT_DARK), max_height=30 * mm)
    draw_para(c, "분 수업", rx + art_w + 10 * mm, A4[1] - 167 * mm, 28 * mm, STYLES["t_small"], max_height=10 * mm)
    box(c, rx + art_w + 5 * mm, A4[1] - 242 * mm, rw - art_w - 5 * mm, 52 * mm, fill=SUN_PALE, radius=4 * mm)
    draw_para(c, "장면 → 본문 → 핵심 → 활동 → 적용 → 마무리", rx + art_w + 10 * mm, A4[1] - 202 * mm, rw - art_w - 15 * mm, style("flowcover", 9.2, 14, SANS_B, INK, TA_CENTER), max_height=32 * mm)
    box(c, rx, 18 * mm, rw, 31 * mm, fill=COBALT_DARK, radius=4 * mm)
    draw_para(c, "주님의 능력 안에서 진리를 붙들면, 성급히 단정하지 않고 사랑으로 다음 행동을 선택할 수 있습니다.", rx + 7 * mm, 42 * mm, rw - 14 * mm, style("tc_core", 9.2, 14, SERIF_B, WHITE, TA_CENTER), max_height=20 * mm)
    c.setFillColor(MUTED)
    c.setFont(SANS_M, 7.5)
    c.drawRightString(A4[0] - 16 * mm, 9 * mm, "01 / 12")
    c.showPage()


def teacher_page2(c) -> None:
    x, y, w, h = teacher_base(c, 2, "학습목표와 수업 준비")
    top = y + h
    gap = 6 * mm
    col_w = (w - gap) / 2
    teacher_panel(
        c, x, top, col_w, 78 * mm, "학습목표",
        "1. 힘의 근원·갑주의 목적·사람이 싸움의 대상이 아님을 본문에서 찾습니다.\n\n2. 사실·아직 확인하지 않은 설명·넓게 단정한 결론을 구분합니다.\n\n3. 존중하는 확인 질문과 사랑의 다음 행동을 정합니다.",
        TEAL, TEAL_PALE, STYLES["t_body_m"], 27 * mm,
    )
    teacher_panel(
        c, x + col_w + gap, top, col_w, 78 * mm, "준비물",
        "• 학생책, 성경, 필기구\n• C01~C12 활동카드\n• A4 분류판 3장\n• 수업 슬라이드\n• 실제 납품 URL의 미션 QR 카드\n• 기기 없는 학생용 종이 완료표\n• 교회 보호·비상 절차와 연락 방법",
        VIOLET, VIOLET_PALE, STYLES["t_body"], 24 * mm,
    )
    top -= 86 * mm
    teacher_panel(
        c, x, top, w, 76 * mm, "수업 전 체크",
        "□ QR은 실제 납품 URL이며 iOS와 Android에서 스캔했다.\n□ QR 보상은 활동을 대신하지 않도록 수업 후에만 제시한다.\n□ 스마트폰이 없는 학생에게 조별 기기 또는 종이 참여 동선을 안내한다.\n□ 개인 경험을 말하지 않아도 된다는 선택권을 먼저 안내한다.\n□ 실명·계정명·연락처·채팅 원문·사진을 기록하지 않는다고 안내한다.\n□ 보호가 필요한 말이 나왔을 때 연결할 담당자와 장소를 확인했다.",
        CORAL, CORAL_PALE, STYLES["t_body_m"], 29 * mm,
    )
    top -= 84 * mm
    teacher_panel(
        c, x, top, w, 52 * mm, "공간 배치",
        "2~4명씩 둘러앉고, 각 팀 앞에 분류판 3장을 가로로 펼칩니다. 실제 카드 63×88mm가 분류판 네 칸 안에 들어가는지 수업 전에 확인합니다. QR은 수업 시작 때 배포하지 않고 활동 완료 후 교사가 보여 줍니다.",
        COBALT, PALE_BLUE, STYLES["t_body_m"], 24 * mm,
    )
    c.showPage()


def teacher_page3(c) -> None:
    x, y, w, h = teacher_base(c, 3, "본문 이해와 신학 핵심", 1)
    top = y + h
    gap = 6 * mm
    main_w = w * 0.64
    side_w = w - main_w - gap
    teacher_panel(
        c, x, top, main_w, 94 * mm, "본문 문맥",
        "에베소서 6:10은 스스로 강해지라는 뜻이 아니라 주님과 주님의 능력 안에서 강건해지라는 명령입니다. 11~13절의 갑주는 다른 사람을 공격하는 장비가 아니라 악에 맞서 끝까지 서기 위한 준비입니다.\n\n6:12은 우리가 맞서는 대상이 혈과 육, 곧 사람이 아니라고 밝힙니다. 갈등 상대를 악한 사람이나 마귀 편으로 낙인찍지 않습니다. 학생의 불안·우울·질병·갈등도 곧바로 영적 실패로 진단하지 않습니다.",
        COBALT, PALE_BLUE, STYLES["t_body"], 24 * mm,
    )
    teacher_panel(
        c, x + main_w + gap, top, side_w, 94 * mm, "연결 본문",
        "에베소서 1:13\n복음의 진리\n\n에베소서 4:21\n예수님 안에 있는 진리\n\n에베소서 4:25\n서로에게 진실을 말하는 삶",
        VIOLET, VIOLET_PALE, STYLES["t_body_m"], 24 * mm,
    )
    top -= 102 * mm
    teacher_panel(
        c, x, top, main_w, 87 * mm, "진리의 허리띠",
        "바울은 옷을 허리에 동여매어 움직이고 설 준비를 갖추는 모습을 진리에 연결합니다. 진리는 나를 안심시키는 말이나 무조건 긍정적인 생각이 아닙니다. 하나님이 그리스도 안에서 보여 주신 참된 소식을 붙들고 정직하고 사랑하는 행동을 선택하는 것입니다.\n\n사실과 해석을 구분하는 활동은 진리 전체가 아니라 진리로 사는 한 가지 연습입니다.",
        TEAL, TEAL_PALE, STYLES["t_body"], 28 * mm,
    )
    teacher_panel(
        c, x + main_w + gap, top, side_w, 87 * mm, "오개념 주의",
        "• 진리 = 긍정적으로 생각하기가 아닙니다.\n\n• 감정 = 틀린 판단이 아닙니다.\n\n• 갑주 = 영적 수준 점수표가 아닙니다.\n\n• 끝까지 서기 = 위험한 관계를 참고 견디라는 뜻이 아닙니다.",
        CORAL, CORAL_PALE, STYLES["t_body_m"], 26 * mm,
    )
    top -= 95 * mm
    box(c, x, top - 35 * mm, w, 35 * mm, fill=COBALT_DARK, radius=4 * mm)
    draw_para(c, "수업의 중심: 힘의 근원은 주님 · 사람은 적이 아님 · 진리는 사랑의 행동으로 이어짐", x + 10 * mm, top - 9 * mm, w - 20 * mm, style("teach_core", 11, 16, SERIF_B, WHITE, TA_CENTER), max_height=23 * mm)
    c.showPage()


def teacher_page4(c) -> None:
    x, y, w, h = teacher_base(c, 4, "55분 수업 지도", None)
    top = y + h
    draw_para(c, "학생책의 페이지 역할과 수업 시간을 함께 보며 진행합니다.", x, top, w, STYLES["t_body_m"], max_height=14 * mm)
    top -= 18 * mm
    rows = [
        ["시간", "단계", "학생 행동", "교사 초점", "자료"],
        ["0~5", "장면", "그림에서 사실·감정·미확인을 찾음", "채팅 내용 추측을 사실처럼 말하지 않게 함", "학생 2쪽 / 슬라이드 1~2"],
        ["5~15", "본문", "힘·목적·대상을 표시", "번역 표현보다 문맥을 보게 함", "성경 / 학생 3쪽"],
        ["15~25", "핵심", "세 진리와 네 단계를 연결", "진리를 긍정 사고로 축소하지 않음", "학생 4쪽 / 슬라이드 4~5"],
        ["25~38", "활동", "카드를 분류하고 근거를 말함", "좋은 추측도 확인 전 가설임을 강조", "카드·분류판 / 학생 5쪽"],
        ["38~42", "미션", "완료 조건을 확인", "실제 QR 또는 종이 참여 제공", "학생 6쪽"],
        ["42~50", "적용", "안전한 상황을 네 단계로 기록", "공개 나눔을 선택으로 둠", "학생 7쪽"],
        ["50~55", "마무리", "퇴실 3문항·기도·주간 미션", "기록 제출을 요구하지 않음", "학생 6·8쪽"],
    ]
    header_style = style("table_head", 7.6, 10, SANS_B, WHITE, TA_CENTER)
    cell_style = style("table_cell", 7.5, 10.8, SANS, INK)
    data = []
    for ridx, row in enumerate(rows):
        data.append([Paragraph(safe(cell), header_style if ridx == 0 else cell_style) for cell in row])
    table = Table(data, colWidths=[16 * mm, 19 * mm, 47 * mm, 60 * mm, 36 * mm], rowHeights=[11 * mm] + [22 * mm] * 7)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), COBALT_DARK),
        ("GRID", (0, 0), (-1, -1), 0.5, LINE),
        ("BACKGROUND", (0, 1), (-1, -1), WHITE),
        ("BACKGROUND", (0, 2), (-1, 2), SOFT),
        ("BACKGROUND", (0, 4), (-1, 4), SOFT),
        ("BACKGROUND", (0, 6), (-1, 6), SOFT),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    table.wrapOn(c, w, 180 * mm)
    table.drawOn(c, x, top - 18 * mm - (11 + 7 * 22) * mm)

    bottom_top = y + 49 * mm
    teacher_panel(c, x, bottom_top, w, 43 * mm, "전환 멘트",
                  "장면→본문: “우리 생각의 중심을 무엇이 잡아 줄 수 있을지 본문에서 찾아봅시다.”\n본문→활동: “진리를 붙드는 연습으로 사실과 설명을 구분해 봅시다.”\n활동→적용: “정답에서 끝내지 않고 사랑의 다음 행동까지 정해 봅시다.”",
                  CORAL, CORAL_PALE, STYLES["t_body_m"], 25 * mm)
    c.showPage()


def stage_layout(c, page_no, title, active_stage, main_title, main_body, side_blocks, accent):
    x, y, w, h = teacher_base(c, page_no, title, active_stage)
    top = y + h
    gap = 6 * mm
    main_w = w * 0.66
    side_w = w - main_w - gap
    teacher_panel(c, x, top, main_w, h - 4 * mm, main_title, main_body, accent, WHITE, STYLES["t_body_m"], 32 * mm)
    side_top = top
    total_gap = 5 * mm
    block_h = (h - 4 * mm - total_gap * (len(side_blocks) - 1)) / len(side_blocks)
    for idx, (label, body, block_accent, block_fill) in enumerate(side_blocks):
        teacher_panel(c, x + main_w + gap, side_top, side_w, block_h, label, body, block_accent, block_fill, STYLES["t_body"], 29 * mm)
        side_top -= block_h + total_gap
    student_links = {
        5: ("학생책 연결 · 2쪽", "학생이 남길 것: 사실 2개 · 감정 1개 · 아직 모르는 설명 1개 · 존중하는 확인 질문 1개"),
        6: ("학생책 연결 · 3쪽", "본문에서 힘의 근원 · 갑주의 목적 · 사람이 싸움의 대상이 아님을 직접 찾습니다."),
        7: ("학생책 연결 · 4쪽", "한 상황을 사실 → 감정·의미 → 아직 모름 → 다음 행동의 네 단계로 설명합니다."),
        8: ("학생책 연결 · 5~6쪽", "카드 3장 이상을 근거와 함께 분류하고, 존중하는 질문과 사랑의 다음 행동을 만듭니다."),
        9: ("학생책 연결 · 7쪽", "공개 고백 없이 안전한 상황 하나를 고르고, 작고 구체적인 다음 행동 한 가지를 씁니다."),
        10: ("학생책 연결 · 6·8쪽", "퇴실 3문항으로 핵심을 확인합니다. 주간 진리 로그는 제출하거나 촬영하지 않습니다."),
    }
    link_title, link_body = student_links[page_no]
    teacher_panel(c, x + 5 * mm, y + 62 * mm, main_w - 10 * mm, 46 * mm, link_title, link_body,
                  COBALT, PALE_BLUE, STYLES["t_body_m"], 36 * mm)
    c.showPage()


def teacher_page5(c) -> None:
    stage_layout(
        c, 5, "0~5분 · 장면 보기 진행", 0, "교사 진행 대본",
        "그림만 먼저 보여 주고 채팅 내용은 설명하지 않습니다.\n\n질문 1. 그림에서 직접 확인할 수 있는 것은 무엇인가요?\n질문 2. 민서는 어떤 감정을 느낄 수 있나요?\n질문 3. 짧은 답장의 이유는 그림만으로 확정할 수 있나요?\n질문 4. 사람을 적으로 삼지 않고 확인하려면 어떻게 물을까요?\n\n정리 멘트\n“감정은 없애거나 무시할 대상이 아닙니다. 오늘은 감정을 인정하면서도 성급한 단정을 멈추고, 주님의 능력 안에서 진리를 붙들어 사랑의 다음 행동을 선택하는 연습을 합니다.”",
        [
            ("예상 반응", "사실: 휴대폰을 보고 있다.\n감정: 서운함·불안.\n미확인: 친구가 짧게 답한 이유.", TEAL, TEAL_PALE),
            ("이어갈 질문", "“그 생각을 사실이라고 말하려면 어떤 정보가 더 필요할까?”\n“감정과 사실을 나누어 말할 수 있을까?”", VIOLET, VIOLET_PALE),
            ("피할 진행", "실제 채팅방 공개 요구\n공개 고백 강요\n불안을 믿음 부족이나 영적 공격으로 단정", CORAL, CORAL_PALE),
        ], CORAL,
    )


def teacher_page6(c) -> None:
    stage_layout(
        c, 6, "5~15분 · 본문 관찰 진행", 1, "성경을 직접 읽고 찾기",
        "학생이 교회에서 사용하는 성경으로 에베소서 6:10~14의 해당 부분을 읽습니다. 번역본에 따라 표현이 달라도 특정 단어를 정답으로 요구하지 않습니다.\n\n1. 힘은 어디에서 옵니까?\n- 주님과 주님의 능력입니다.\n\n2. 갑주를 입는 목적은 무엇입니까?\n- 악에 맞서고 끝까지 서기 위해서입니다.\n\n3. 본문이 싸움의 대상이 아니라고 말하는 존재는 누구입니까?\n- 혈과 육, 곧 사람입니다.\n\n4. 첫 번째로 제시되는 준비는 무엇입니까?\n- 진리로 허리를 동여매는 것입니다.\n\n학생책의 ‘힘의 근원·사람은 적?·갑주의 목적’ 세 칸을 마지막 2분에 함께 확인합니다.",
        [
            ("본문 초점", "능력의 출처\n갑주의 목적\n사람은 적이 아님\n진리로 설 준비", COBALT, PALE_BLUE),
            ("교정 포인트", "강건함을 정신력으로 설명하지 않습니다.\n사람을 적으로 삼지 않는 것과 잘못을 모른 척하는 것은 다릅니다.", CORAL, CORAL_PALE),
            ("안전 연결", "위험하거나 반복적인 괴롭힘은 학생 혼자 확인하지 않습니다. 안전한 어른에게 알리는 것이 진리에 맞는 행동입니다.", SUN, SUN_PALE),
        ], COBALT,
    )


def teacher_page7(c) -> None:
    stage_layout(
        c, 7, "15~25분 · 핵심 진리 설명", 2, "칠판에 남길 세 문장",
        "1. 힘의 근원은 주님입니다.\n2. 사람은 내가 싸워야 할 적이 아닙니다.\n3. 진리는 정직하고 사랑하는 행동으로 이어집니다.\n\n네 단계 예시\n• 사실: 친구가 ‘응’이라고 짧게 답했습니다.\n• 감정·의미: 서운했고 나에게 화났다고 생각했습니다.\n• 아직 모르는 것: 짧게 답한 이유입니다.\n• 다음 행동: ‘아까 답이 짧아서 내가 오해했을 수도 있어. 혹시 불편한 일이 있었어?’라고 조용히 묻습니다.\n\n사실과 설명을 구분하는 이유는 감정을 지우기 위해서가 아니라 사랑으로 반응할 공간을 만들기 위해서입니다.",
        [
            ("강조", "긍정적인 설명도 확인 전에는 가설입니다.", SUN, SUN_PALE),
            ("오해 방지", "진리는 무조건 좋게 생각하는 기술이 아닙니다. 복음의 참된 소식과 진실한 삶에 뿌리를 둡니다.", VIOLET, VIOLET_PALE),
            ("한 줄 정리", "정답 맞히기 → 사랑의 행동 정하기", TEAL, TEAL_PALE),
        ], TEAL,
    )


def teacher_page8(c) -> None:
    stage_layout(
        c, 8, "25~42분 · 카드 활동과 미션", 3, "활동 진행",
        "2~4명씩 팀을 만들고 카드 문장만 보고 세 분류판에 놓습니다.\n\n1. 카드 9장 또는 12장을 나눕니다.\n2. 학생이 분류하고 문장 속 근거를 가리킵니다.\n3. 어려웠던 카드 두 장을 골라 이유를 설명합니다.\n4. 한 카드에 존중하는 확인 질문과 사랑의 다음 행동을 만듭니다.\n5. 교사가 완료 조건을 확인한 뒤 실제 QR 카드 또는 종이 완료표를 제시합니다.\n\n중요한 지도 문장\n“긍정적으로 들리는 설명도 확인 전에는 아직 가설입니다. 목표는 추측을 좋게 만드는 것이 아니라 사실과 설명을 구분하고 사랑으로 확인하는 것입니다.”",
        [
            ("시간", "분류 7분\n토론 4분\n질문 만들기 2분\nQR·완료 4분", COBALT, PALE_BLUE),
            ("기술 대안", "조별 기기 1대\n종이 완료표\n앱에는 완료 여부만 기록", TEAL, TEAL_PALE),
            ("주의 신호", "실제 관계를 카드 정답에 끼워 맞추지 않습니다. 반복 배제·위험이 나오면 공개 토론을 멈춥니다.", CORAL, CORAL_PALE),
        ], SUN,
    )


def teacher_page9(c) -> None:
    stage_layout(
        c, 9, "42~50분 · 개인 적용 지도", 4, "안전한 작은 상황에 적용",
        "학생이 실제 경험을 쓰지 않아도 되도록 활동카드 상황을 먼저 제안합니다.\n\n질문\n1. 직접 관찰하거나 기록으로 확인한 사실은 무엇인가요?\n2. 감정과 내가 붙인 의미를 나누어 적을 수 있나요?\n3. 아직 확인하지 못한 것은 무엇인가요?\n4. 상대를 적으로 만들지 않으면서 물을 수 있는 말은 무엇인가요?\n5. 다음 행동을 더 작고 안전하게 만들 수 있나요?\n\n평가 기준은 고백의 깊이나 감동적인 표현이 아닙니다. 사실과 설명의 구분, 안전한 확인 질문, 사랑의 다음 행동이 구체적인지를 봅니다.",
        [
            ("개인정보", "실명·계정명·연락처·채팅 원문·사진을 기록하지 않습니다. 민감한 내용은 앱에 입력하지 않습니다.", VIOLET, VIOLET_PALE),
            ("말할 선택권", "공개 나눔은 선택입니다. 학생이 말하지 않기로 하면 활동카드 예시로만 마칩니다.", TEAL, TEAL_PALE),
            ("모범 결단", "“나는 답장이 짧은 상황에서 단정하기 전에 조용히 이유를 묻겠습니다.”", CORAL, CORAL_PALE),
        ], VIOLET,
    )


def teacher_page10(c) -> None:
    stage_layout(
        c, 10, "50~55분 · 퇴실 확인과 기도", 5, "마무리 진행",
        "퇴실 확인\n1. 힘의 근원은 누구입니까? - 주님과 주님의 능력\n2. 우리가 싸워야 할 대상이 아닌 존재는 누구입니까? - 사람, 혈과 육\n3. 갑주의 목적은 무엇입니까? - 악에 맞서고 끝까지 서기 위해\n\n마무리 기도\n“하나님, 우리 힘이 아니라 주님의 능력을 의지하게 해 주세요. 사람을 적으로 삼지 않고 복음의 진리를 붙들어 정직하고 사랑하는 다음 행동을 선택하게 해 주세요.”\n\n주간 미션\n가능한 날에 세 번 진리 로그를 기록합니다. 못 한 날이 있어도 실패로 평가하지 않으며 기록 제출이나 사진 촬영을 요구하지 않습니다.",
        [
            ("가정 질문", "“확인하기 전에 단정했다가, 확인한 뒤 생각이 달라진 일이 있나요?”", SUN, SUN_PALE),
            ("보호자 안내", "해결책보다 먼저 감정을 듣고, 사실·모르는 것·작고 안전한 다음 행동 순서로 대화합니다.", TEAL, TEAL_PALE),
            ("수업 종료", "QR 보상보다 말씀과 사랑의 행동을 마지막 화면에 남깁니다.", COBALT, PALE_BLUE),
        ], CORAL,
    )


def teacher_page11(c) -> None:
    x, y, w, h = teacher_base(c, 11, "카드 정답과 인정 답안", 3)
    top = y + h
    groups = [
        ("확인할 수 있는 사실", "C01 · C05 · C08 · C10", "관찰·기록 가능한 사건과 평가를 분리", TEAL, TEAL_PALE),
        ("아직 확인하지 않은 설명", "C03 · C04 · C09 · C12", "가능성은 있지만 확인 전에는 가설", VIOLET, VIOLET_PALE),
        ("근거보다 넓게 단정한 결론", "C02 · C06 · C07 · C11", "한 사건으로 사람·관계·미래 전체를 확정", CORAL, CORAL_PALE),
    ]
    gap = 5 * mm
    gw = (w - 2 * gap) / 3
    for idx, (title, codes, reason, accent, fill) in enumerate(groups):
        gx = x + idx * (gw + gap)
        box(c, gx, top - 54 * mm, gw, 54 * mm, fill=fill, radius=4 * mm)
        tag(c, title, gx + 4 * mm, top - 11 * mm, accent, width=gw - 8 * mm, height=7 * mm, font_size=6.6)
        draw_para(c, codes, gx + 5 * mm, top - 22 * mm, gw - 10 * mm, style(f"codes_{idx}", 11, 15, SANS_B, accent, TA_CENTER), max_height=16 * mm)
        draw_para(c, reason, gx + 5 * mm, top - 38 * mm, gw - 10 * mm, style(f"reason_{idx}", 7.8, 11, SANS, INK, TA_CENTER), max_height=13 * mm)
    top -= 63 * mm
    rows = [
        ["상황", "인정 가능한 질문·다음 행동", "지도 포인트"],
        ["답장", "혹시 내 질문을 봤어? 지금 바쁘면 나중에 답해도 괜찮아.", "답 없는 이유는 아직 모름"],
        ["모임", "우리 팀이 어떤 기준으로 다른 의견을 골랐는지 알려 줄래?", "선택과 사람의 가치를 분리"],
        ["시험", "틀린 문제 유형을 확인하고 공부 방법을 한 가지 질문한다.", "한 번의 결과로 능력 전체를 단정하지 않음"],
        ["먼저 나감", "아까 먼저 나갔던데 무슨 일이 있었어?", "반복 배제·위험이면 어른에게 알림"],
    ]
    head = style("ans_head", 8, 10.5, SANS_B, WHITE, TA_CENTER)
    cell = style("ans_cell", 8.1, 11.5, SANS, INK)
    data = [[Paragraph(safe(v), head if ridx == 0 else cell) for v in row] for ridx, row in enumerate(rows)]
    table = Table(data, colWidths=[29 * mm, 92 * mm, 57 * mm], rowHeights=[11 * mm] + [27 * mm] * 4)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), COBALT_DARK),
        ("GRID", (0, 0), (-1, -1), 0.5, LINE),
        ("BACKGROUND", (0, 1), (-1, -1), WHITE),
        ("BACKGROUND", (0, 2), (-1, 2), SOFT),
        ("BACKGROUND", (0, 4), (-1, 4), SOFT),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]))
    table.wrapOn(c, w, 120 * mm)
    table.drawOn(c, x, top - (11 + 4 * 27) * mm)
    bottom_top = y + 45 * mm
    teacher_panel(c, x, bottom_top, w, 38 * mm, "대화 문항",
                  "정답: X / O / O / X / O    ·    지도 순서: 감정 인정 → 말할 선택권 → 사실 확인 → 작고 안전한 도움",
                  VIOLET, VIOLET_PALE, STYLES["t_body_m"], 25 * mm)
    c.showPage()


def teacher_page12(c) -> None:
    x, y, w, h = teacher_base(c, 12, "안전·평가·수업 후 기록", None)
    top = y + h
    gap = 6 * mm
    col_w = (w - gap) / 2
    teacher_panel(c, x, top, col_w, 75 * mm, "즉시 중단 신호",
                  "• 현재 위험, 폭력·학대·괴롭힘\n• 자해나 죽고 싶은 생각\n• 특정 인물에게 보복당할 두려움\n• 학생이 혼자 해결하도록 압박받음",
                  CORAL, CORAL_PALE, STYLES["t_body_m"], 30 * mm)
    teacher_panel(c, x + col_w + gap, top, col_w, 75 * mm, "대응 원칙",
                  "1. 공개 나눔을 멈추고 학생을 혼자 두지 않습니다.\n2. 비밀을 약속하지 않고 필요한 어른과 연결한다고 설명합니다.\n3. 승인된 절차에 따라 최소 정보만 전달합니다.\n4. 교사가 단독 조사·대질을 하지 않습니다.",
                  SUN, SUN_PALE, STYLES["t_body"], 26 * mm)
    top -= 83 * mm
    teacher_panel(c, x, top, w, 70 * mm, "수업 후 점검",
                  "□ 학생이 힘의 근원·사람은 적이 아님·갑주의 목적을 설명했다.\n□ 카드 분류가 12분 안에 끝났다.\n□ QR 또는 종이 참여가 수업 흐름을 방해하지 않았다.\n□ 기록 공간과 문장 난이도가 적절했다.\n□ 공개 나눔을 선택으로 보장했다.\n□ 보호 절차에 따른 후속 연결이 필요한 상태를 별도로 처리했다.",
                  TEAL, TEAL_PALE, STYLES["t_body_m"], 28 * mm)
    top -= 78 * mm
    note_y = y + 34 * mm
    note_h = top - note_y
    box(c, x, note_y, w, note_h, fill=SOFT, radius=4 * mm)
    tag(c, "AFTER CLASS NOTE", x + 6 * mm, top - 10 * mm, COBALT_DARK, width=39 * mm, height=7 * mm, font_size=7)
    draw_para(c, "다음 수업에서 다시 설명할 개념", x + 7 * mm, top - 17 * mm, w - 14 * mm, STYLES["t_small"], max_height=9 * mm)
    write_lines(c, x + 7 * mm, top - 27 * mm, w - 14 * mm, count=1)
    draw_para(c, "교사 메모", x + 7 * mm, top - 34 * mm, w - 14 * mm, STYLES["t_small"], max_height=9 * mm)
    write_lines(c, x + 7 * mm, top - 44 * mm, w - 14 * mm, count=1)
    box(c, x, y + 1 * mm, w, 27 * mm, fill=COBALT_DARK, radius=4 * mm)
    draw_para(c, "보호 관련 이름·민감 정보는 이 지도서의 메모칸에 남기지 않습니다. 교회가 승인한 별도 보호 기록 체계를 사용합니다.",
              x + 10 * mm, y + 19 * mm, w - 20 * mm,
              style("teacher_safe", 8.2, 11.8, SANS_M, WHITE, TA_CENTER), max_height=16 * mm)
    c.showPage()


def build_teacher() -> None:
    c = canvas.Canvas(str(TEACHER_FILE), pagesize=A4, pageCompression=1)
    c.setTitle("전신갑주 4주 공과 1과 교사용 지도서 - 진리로 중심을 잡아라")
    c.setAuthor("전신갑주 4주 공과")
    teacher_cover(c)
    teacher_page2(c)
    teacher_page3(c)
    teacher_page4(c)
    teacher_page5(c)
    teacher_page6(c)
    teacher_page7(c)
    teacher_page8(c)
    teacher_page9(c)
    teacher_page10(c)
    teacher_page11(c)
    teacher_page12(c)
    c.save()
    set_boxes(TEACHER_FILE, A4, 0)


def parse_cards() -> list[dict[str, str]]:
    text = (SET_ROOT / "activities" / "lesson01_truth_cards.md").read_text(encoding="utf-8")
    chunks = re.split(r"(?m)^### (C\d{2})\s*$", text)
    cards: list[dict[str, str]] = []
    for index in range(1, len(chunks), 2):
        code = chunks[index]
        body = chunks[index + 1]
        fields: dict[str, str] = {}
        for label in ("앞면", "분류", "교사용 질문", "인정 답안"):
            match = re.search(rf"(?m)^{re.escape(label)}:\s*(.+)$", body)
            if not match:
                raise ValueError(f"Card {code} is missing {label}")
            fields[label] = match.group(1).strip().replace("`", "")
        cards.append({"code": code, **fields})
    if len(cards) != 12:
        raise ValueError(f"Expected 12 cards, got {len(cards)}")
    return cards


def card_positions() -> list[tuple[float, float, float, float]]:
    card_w = 63 * mm
    card_h = 88 * mm
    gap_x = 7 * mm
    gap_y = 4.5 * mm
    total_w = 2 * card_w + gap_x
    total_h = 3 * card_h + 2 * gap_y
    start_x = (A4[0] - total_w) / 2
    start_y = (A4[1] - total_h) / 2
    positions = []
    for row in range(3):
        for col in range(2):
            x = start_x + col * (card_w + gap_x)
            y = A4[1] - start_y - (row + 1) * card_h - row * gap_y
            positions.append((x, y, card_w, card_h))
    return positions


def draw_cut_marks(c, x, y, w, h) -> None:
    mark = 3 * mm
    offset = 1 * mm
    segments = [
        (x - mark, y, x - offset, y),
        (x, y - mark, x, y - offset),
        (x + w + offset, y, x + w + mark, y),
        (x + w, y - mark, x + w, y - offset),
        (x - mark, y + h, x - offset, y + h),
        (x, y + h + offset, x, y + h + mark),
        (x + w + offset, y + h, x + w + mark, y + h),
        (x + w, y + h + offset, x + w, y + h + mark),
    ]
    for x1, y1, x2, y2 in segments:
        line(c, x1, y1, x2, y2, color=colors.HexColor("#7D858A"), width=0.35)


def draw_card_front(c, card: dict[str, str], x, y, w, h) -> None:
    # All fronts use one neutral treatment so the correct category is never disclosed.
    box(c, x, y, w, h, fill=PAPER, stroke=LINE, radius=3.5 * mm, line_width=0.75)
    c.setFillColor(LAVENDER)
    c.roundRect(x, y + h - 20 * mm, w, 20 * mm, 3.5 * mm, stroke=0, fill=1)
    c.rect(x, y + h - 20 * mm, w, 8 * mm, stroke=0, fill=1)
    tag(c, card["code"], x + 5 * mm, y + h - 14 * mm, COBALT, width=18 * mm, height=7 * mm, font_size=8.2)
    draw_para(c, "상황 카드", x + 27 * mm, y + h - 7 * mm, w - 32 * mm,
              style(f"card_kind_{card['code']}", 8.0, 11, SANS_B, COBALT_DARK), max_height=10 * mm)
    draw_para(c, card["앞면"], x + 7 * mm, y + h - 29 * mm, w - 14 * mm,
              style(f"card_text_{card['code']}", 11.0, 17.0, SANS_M, INK), max_height=45 * mm)
    line(c, x + 7 * mm, y + 20 * mm, x + w - 7 * mm, y + 20 * mm, color=LINE, width=0.6)
    draw_para(c, "무엇이 확인됐고, 무엇은 아직 모를까요?", x + 7 * mm, y + 15 * mm, w - 14 * mm,
              style(f"card_prompt_{card['code']}", 7.2, 10.5, SANS_M, MUTED, TA_CENTER), max_height=12 * mm)
    draw_cut_marks(c, x, y, w, h)


def draw_card_back(c, x, y, w, h) -> None:
    # Low-ink reverse: an original line motif, not a solid flood fill.
    box(c, x, y, w, h, fill=WHITE, stroke=COBALT, radius=3.5 * mm, line_width=1.0)
    c.setStrokeColor(LAVENDER)
    c.setLineWidth(4 * mm)
    c.setLineCap(1)
    c.bezier(x + 5 * mm, y + 20 * mm, x + 28 * mm, y + 44 * mm, x + 8 * mm, y + 64 * mm, x + 31 * mm, y + 71 * mm)
    c.line(x + 31 * mm, y + 71 * mm, x + w - 8 * mm, y + 71 * mm)
    c.setFillColor(SUN)
    c.circle(x + w - 10 * mm, y + 71 * mm, 3.5 * mm, stroke=0, fill=1)
    tag(c, "LESSON 01", x + w / 2 - 16 * mm, y + h - 19 * mm, COBALT, width=32 * mm, height=6.5 * mm, font_size=7.1)
    draw_para(c, "진리로\n중심 잡기", x + 8 * mm, y + h / 2 + 12 * mm, w - 16 * mm,
              style("card_back_title", 16, 21, SANS_B, COBALT_DARK, TA_CENTER), max_height=45 * mm)
    draw_para(c, "확인하고 · 멈추고 · 선택하기", x + 7 * mm, y + 18 * mm, w - 14 * mm,
              style("card_back_sub", 7.4, 10.5, SANS_M, MUTED, TA_CENTER), max_height=11 * mm)
    draw_cut_marks(c, x, y, w, h)


def cards_page_label(c, page_no: int, title: str, subtitle: str = "") -> tuple[float, float, float]:
    c.setFillColor(PAPER)
    c.rect(0, 0, A4[0], A4[1], stroke=0, fill=1)
    x = 17 * mm
    w = A4[0] - 32 * mm
    tag(c, f"LESSON 01 · ACTIVITY {page_no}/8", x, A4[1] - 17 * mm, COBALT, width=49 * mm, height=6.5 * mm, font_size=7)
    draw_para(c, title, x, A4[1] - 25 * mm, w, STYLES["t_title"], max_height=18 * mm)
    if subtitle:
        draw_para(c, subtitle, x, A4[1] - 45 * mm, w, STYLES["t_body"], max_height=16 * mm)
    return x, A4[1] - 57 * mm, w


def draw_sorting_mat(c, page_no: int, title: str, description: str, accent, pale, symbol: str) -> None:
    x, top, w = cards_page_label(c, page_no, title, description)
    c.setFillColor(pale)
    c.roundRect(x, top - 205 * mm, w, 205 * mm, 6 * mm, stroke=0, fill=1)
    c.setFillColor(accent)
    c.circle(x + 14 * mm, top - 15 * mm, 8 * mm, stroke=0, fill=1)
    c.setFillColor(WHITE)
    c.setFont(SANS_B, 18)
    c.drawCentredString(x + 14 * mm, top - 17.5 * mm, symbol)
    draw_para(c, "카드를 놓고, 문장 속 근거를 말하세요.", x + 27 * mm, top - 9 * mm, w - 34 * mm,
              style(f"mat_prompt_{page_no}", 10.0, 14, SANS_B, accent), max_height=14 * mm)
    card_w = 63 * mm
    card_h = 88 * mm
    gap_x = 12 * mm
    gap_y = 8 * mm
    start_x = x + (w - (2 * card_w + gap_x)) / 2
    start_y = top - 28 * mm
    for row in range(2):
        for col in range(2):
            sx = start_x + col * (card_w + gap_x)
            sy = start_y - (row + 1) * card_h - row * gap_y
            c.setStrokeColor(accent)
            c.setLineWidth(1.0)
            c.setDash(4, 3)
            c.roundRect(sx, sy, card_w, card_h, 3.5 * mm, stroke=1, fill=0)
            c.setDash()
            draw_para(c, f"카드 자리 {row * 2 + col + 1}", sx + 8 * mm, sy + card_h / 2 + 4 * mm, card_w - 16 * mm,
                      style(f"slot_{page_no}_{row}_{col}", 9, 13, SANS_M, accent, TA_CENTER), max_height=12 * mm)
    c.setFillColor(accent)
    c.rect(0, 0, A4[0], 10 * mm, stroke=0, fill=1)
    draw_para(c, "실제 카드 완성 크기 63 × 88 mm · 이 분류판은 A4 100% 단면 출력", 18 * mm, 7.5 * mm,
              A4[0] - 36 * mm, style(f"mat_footer_{page_no}", 7.5, 10, SANS_M, WHITE, TA_CENTER), max_height=9 * mm)
    c.showPage()


def draw_answer_page(c, cards: list[dict[str, str]]) -> None:
    x, top, w = cards_page_label(
        c,
        8,
        "교사용 정답·인쇄 안내",
        "정답을 먼저 공개하지 말고, 학생이 문장 속 근거를 말한 뒤 새 정보에 따라 분류가 달라질 수 있음을 확인합니다.",
    )
    answer_rows = [["코드", "권장 분류", "확인 포인트"]]
    short_reason = {
        "확인할 수 있는 사실": "관찰·기록된 정보",
        "아직 확인하지 않은 설명": "가능하지만 미확인",
        "근거보다 넓게 단정한 결론": "근거보다 범위가 큼",
    }
    for card in cards:
        answer_rows.append([card["code"], card["분류"], short_reason[card["분류"]]])
    head = style("cards_ans_head", 8.2, 10.5, SANS_B, WHITE, TA_CENTER)
    body = style("cards_ans_body", 8.1, 10.8, SANS, INK)
    data = [[Paragraph(safe(value), head if row_idx == 0 else body) for value in row]
            for row_idx, row in enumerate(answer_rows)]
    table = Table(data, colWidths=[20 * mm, 69 * mm, 67 * mm], rowHeights=[10 * mm] + [10.5 * mm] * 12)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), COBALT_DARK),
        ("BACKGROUND", (0, 1), (-1, -1), WHITE),
        ("BACKGROUND", (0, 2), (-1, 2), SOFT),
        ("BACKGROUND", (0, 4), (-1, 4), SOFT),
        ("BACKGROUND", (0, 6), (-1, 6), SOFT),
        ("BACKGROUND", (0, 8), (-1, 8), SOFT),
        ("BACKGROUND", (0, 10), (-1, 10), SOFT),
        ("BACKGROUND", (0, 12), (-1, 12), SOFT),
        ("GRID", (0, 0), (-1, -1), 0.45, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    table.wrapOn(c, w, 150 * mm)
    table.drawOn(c, x, top - 136 * mm)
    panel_top = top - 145 * mm
    gap = 5 * mm
    panel_w = (w - gap) / 2
    teacher_panel(c, x, panel_top, panel_w, 67 * mm, "인쇄·재단",
                  "• 1~4쪽: A4 100%, 양면 긴 변 넘김\n• 뒷면은 좌우 반전 배치 완료\n• 완성 크기 63 × 88 mm 확인\n• 5~7쪽: A4 100%, 단면 출력\n• 실제 카드가 점선 안에 놓이는지 시험",
                  TEAL, TEAL_PALE, STYLES["t_body"], 29 * mm)
    teacher_panel(c, x + panel_w + gap, panel_top, panel_w, 67 * mm, "운영 안전",
                  "• 정답보다 근거를 먼저 말하게 합니다.\n• 실제 관계·채팅을 공개시키지 않습니다.\n• 말하고 싶지 않으면 카드 인물로만 토론합니다.\n• 반복 배제·폭력·학대가 의심되면 교회 보호 절차를 따릅니다.",
                  CORAL, CORAL_PALE, STYLES["t_body"], 27 * mm)
    c.showPage()


def build_cards() -> None:
    cards = parse_cards()
    positions = card_positions()
    mirrored = []
    for row in range(3):
        mirrored.extend([positions[row * 2 + 1], positions[row * 2]])
    c = canvas.Canvas(str(CARDS_FILE), pagesize=A4, pageCompression=1)
    c.setTitle("전신갑주 4주 공과 1과 활동카드와 분류판")
    c.setAuthor("전신갑주 4주 공과")
    for group_start in (0, 6):
        group = cards[group_start:group_start + 6]
        for card, position in zip(group, positions):
            draw_card_front(c, card, *position)
        c.showPage()
        for position in mirrored:
            draw_card_back(c, *position)
        c.showPage()
    draw_sorting_mat(c, 5, "확인할 수 있는 사실", "직접 보거나 듣고, 기록으로 확인할 수 있는 정보", TEAL, TEAL_PALE, "✓")
    draw_sorting_mat(c, 6, "아직 확인하지 않은 설명", "가능한 이유이지만, 확인 전에는 사실로 확정하지 않는 정보", VIOLET, VIOLET_PALE, "?")
    draw_sorting_mat(c, 7, "근거보다 넓게 단정한 결론", "한 장면이나 결과보다 사람·관계·미래 전체를 더 크게 판단한 말", CORAL, CORAL_PALE, "!")
    draw_answer_page(c, cards)
    c.save()
    set_boxes(CARDS_FILE, A4, 0)


def home_background(c, accent=COBALT) -> tuple[float, float, float, float]:
    c.setFillColor(PAPER)
    c.rect(0, 0, A6_MEDIA[0], A6_MEDIA[1], stroke=0, fill=1)
    x = BLEED + 9 * mm
    y = BLEED + 9 * mm
    w = A6_TRIM[0] - 18 * mm
    h = A6_TRIM[1] - 18 * mm
    c.setFillColor(accent)
    c.rect(0, A6_MEDIA[1] - BLEED - 5 * mm, A6_MEDIA[0], BLEED + 5 * mm, stroke=0, fill=1)
    return x, y, w, h


def build_home_card() -> None:
    c = canvas.Canvas(str(HOME_FILE), pagesize=A6_MEDIA, pageCompression=1)
    c.setTitle("전신갑주 4주 공과 1과 가정연계 카드")
    c.setAuthor("전신갑주 4주 공과")

    # Side 1: one warm conversation invitation, not a mini handout.
    x, y, w, h = home_background(c, CORAL)
    img_h = 37 * mm
    box(c, x + 2 * mm, y + h - img_h - 2 * mm, w, img_h, fill=SUN, radius=5 * mm)
    draw_crop(c, SPOT_ART, x, y + h - img_h, w - 2 * mm, img_h, focus_x=0.18, focus_y=0.5)
    tag(c, "LESSON 01 · FAMILY", x + 4 * mm, y + h - 8 * mm, CORAL, width=37 * mm, height=6 * mm, font_size=6.6)
    top = y + h - img_h - 7 * mm
    draw_para(c, "이번 주 함께 묻기", x, top, w, style("home_title_1", 15.5, 20, SANS_B, INK), max_height=18 * mm)
    top -= 23 * mm
    box(c, x, top - 38 * mm, w, 38 * mm, fill=LAVENDER, radius=4 * mm)
    tag(c, "핵심 문장", x + 5 * mm, top - 10 * mm, COBALT, width=23 * mm, height=6 * mm, font_size=6.7)
    draw_para(c, "주님의 능력 안에서 진리를 붙들면, 성급히 단정하지 않고 사랑으로 다음 행동을 선택할 수 있습니다.",
              x + 6 * mm, top - 15 * mm, w - 12 * mm,
              style("home_core", 8.8, 13.5, SERIF_B, COBALT_DARK, TA_CENTER), max_height=21 * mm)
    top -= 44 * mm
    box(c, x, top - 31 * mm, w, 31 * mm, fill=SUN_PALE, radius=4 * mm)
    tag(c, "가족 질문", x + 5 * mm, top - 10 * mm, SUN, text_color=INK, width=23 * mm, height=6 * mm, font_size=6.7)
    draw_para(c, "확인하기 전에 단정했다가, 확인한 뒤 생각이 달라진 일이 있나요?",
              x + 6 * mm, top - 15 * mm, w - 12 * mm,
              style("home_question", 9.0, 13.2, SANS_B, INK, TA_CENTER), max_height=15 * mm)
    draw_para(c, "실제 경험이 불편하면 교재 속 민서의 가상 상황으로 이야기해도 됩니다.", x + 2 * mm, y + 9 * mm, w - 4 * mm,
              style("home_permission", 7.3, 10.5, SANS_M, MUTED, TA_CENTER), max_height=12 * mm)
    c.showPage()

    # Side 2: an actionable listening sequence and a compact safeguarding note.
    x, y, w, h = home_background(c, TEAL)
    tag(c, "가족 대화 가이드", x, y + h - 7 * mm, TEAL, width=31 * mm, height=6 * mm, font_size=6.6)
    draw_para(c, "보호자를 위한 듣기 순서", x, y + h - 11 * mm, w,
              style("home_title_2", 14.2, 18.5, SANS_B, INK), max_height=18 * mm)
    top = y + h - 35 * mm
    steps = [
        ("1", "먼저 듣기", "“그렇게 느꼈구나.”", TEAL, TEAL_PALE),
        ("2", "사실 묻기", "“확인할 수 있는 건 뭘까?”", COBALT, PALE_BLUE),
        ("3", "모르는 것", "확인 전 설명을 구분합니다.", VIOLET, VIOLET_PALE),
        ("4", "다음 행동", "작고 안전한 행동을 찾습니다.", CORAL, CORAL_PALE),
    ]
    gap = 3 * mm
    step_w = (w - gap) / 2
    step_h = 20 * mm
    for idx, (num, title, body, accent, fill) in enumerate(steps):
        sx = x + (idx % 2) * (step_w + gap)
        sy = top - (idx // 2 + 1) * step_h - (idx // 2) * 3 * mm
        box(c, sx, sy, step_w, step_h, fill=fill, radius=3 * mm)
        number_badge(c, num, sx + 3 * mm, sy + step_h - 9 * mm, fill=accent, text_color=WHITE, diameter=6 * mm, size=6.5)
        draw_para(c, title, sx + 11 * mm, sy + step_h - 3 * mm, step_w - 14 * mm,
                  style(f"home_step_title_{idx}", 7.6, 9.8, SANS_B, accent), max_height=8 * mm)
        draw_para(c, body, sx + 4 * mm, sy + 10 * mm, step_w - 8 * mm,
                  style(f"home_step_body_{idx}", 7.1, 9.4, SANS_M, INK, TA_CENTER), max_height=10 * mm)
    top = top - 2 * step_h - 3 * mm - 5 * mm
    draw_para(c, "하지 않는 것", x, top, w, style("home_dont_title", 9.3, 12, SANS_B, CORAL), max_height=10 * mm)
    top -= 9 * mm
    donts = ["기록·사진 제출 요구", "공개 고백 강요", "감정을 믿음 부족으로 평가", "위험을 학생끼리 해결"]
    cell_w = (w - gap) / 2
    for idx, text in enumerate(donts):
        dx = x + (idx % 2) * (cell_w + gap)
        dy = top - (idx // 2 + 1) * 10 * mm - (idx // 2) * 2 * mm
        box(c, dx, dy, cell_w, 10 * mm, fill=CORAL_PALE, radius=3 * mm)
        draw_para(c, f"× {text}", dx + 3 * mm, dy + 7.5 * mm, cell_w - 6 * mm,
                  style(f"home_dont_{idx}", 6.6, 8.4, SANS_M, CORAL, TA_CENTER), max_height=8 * mm)
    box(c, x, y, w, 14 * mm, fill=SAFETY, radius=3 * mm)
    draw_para(c, "괴롭힘·폭력·학대·자해나 죽고 싶은 생각처럼 안전과 관련된 이야기는 교회 보호 담당자 또는 적절한 전문 도움에 즉시 연결해 주세요.",
              x + 5 * mm, y + 11 * mm, w - 10 * mm,
              style("home_safety", 7.0, 9.5, SANS_M, INK, TA_CENTER), max_height=10 * mm)
    c.showPage()
    c.save()
    set_boxes(HOME_FILE, A6_TRIM, BLEED)


def slide_base(c, page_no: int, title: str, accent=COBALT, dark=False) -> tuple[float, float, float, float]:
    bg = COBALT_DARK if dark else PAPER
    fg = WHITE if dark else INK
    c.setFillColor(bg)
    c.rect(0, 0, SLIDE_SIZE[0], SLIDE_SIZE[1], stroke=0, fill=1)
    c.setFillColor(accent)
    c.rect(0, SLIDE_SIZE[1] - 9 * mm, SLIDE_SIZE[0], 9 * mm, stroke=0, fill=1)
    x = 16 * mm
    y = 16 * mm
    w = SLIDE_SIZE[0] - 32 * mm
    h = SLIDE_SIZE[1] - 28 * mm
    tag(c, f"LESSON 01 · {page_no}/10", x, SLIDE_SIZE[1] - 20 * mm, accent if not dark else WHITE,
        text_color=WHITE if not dark else COBALT_DARK, width=38 * mm, height=6.5 * mm, font_size=7.2)
    draw_para(c, title, x, SLIDE_SIZE[1] - 29 * mm, w,
              style(f"slide_title_{page_no}", 38, 44, SANS_B, fg), max_height=24 * mm)
    c.setFont(SANS_M, 10.5)
    c.setFillColor(WHITE if dark else MUTED)
    c.drawRightString(SLIDE_SIZE[0] - 12 * mm, 8 * mm, "전신갑주 4주 공과 · 중·고등부")
    return x, y, w, h - 31 * mm


def slide_cover(c) -> None:
    c.setFillColor(LAVENDER)
    c.rect(0, 0, SLIDE_SIZE[0], SLIDE_SIZE[1], stroke=0, fill=1)
    c.setStrokeColor(COBALT)
    c.setLineWidth(6 * mm)
    c.setLineCap(1)
    c.bezier(0, 34 * mm, 39 * mm, 90 * mm, 20 * mm, 118 * mm, 77 * mm, 126 * mm)
    c.line(77 * mm, 126 * mm, 170 * mm, 126 * mm)
    c.setFillColor(SUN)
    c.circle(169 * mm, 126 * mm, 6 * mm, stroke=0, fill=1)
    art_x = 164 * mm
    art_y = 18 * mm
    art_w = 74 * mm
    art_h = 111 * mm
    box(c, art_x - 3 * mm, art_y - 3 * mm, art_w + 6 * mm, art_h + 6 * mm, fill=WHITE, radius=7 * mm)
    draw_crop(c, HERO_ART, art_x, art_y, art_w, art_h, focus_y=0.55)
    tag(c, "전신갑주 4주 공과 · LESSON 01", 17 * mm, 122 * mm, COBALT, width=59 * mm, height=7 * mm, font_size=7.5)
    draw_para(c, "진리로\n중심을 잡아라", 17 * mm, 105 * mm, 137 * mm,
              style("slide_cover_title", 45, 51, SANS_B, COBALT_DARK), max_height=55 * mm)
    draw_para(c, "에베소서 6:10~14", 18 * mm, 48 * mm, 110 * mm,
              style("slide_cover_ref", 24, 30, SANS_M, CORAL), max_height=25 * mm)
    c.setFont(SANS_M, 11)
    c.setFillColor(MUTED)
    c.drawString(18 * mm, 13 * mm, "중·고등부 · [교회명]")
    c.showPage()


def slide_scene(c) -> None:
    x, y, w, h = slide_base(c, 2, "답장이 짧아진 이유", CORAL)
    img_w = 118 * mm
    img_h = 69 * mm
    draw_crop(c, SPOT_ART, x, y + 11 * mm, img_w, img_h, focus_x=0.18, focus_y=0.5)
    bx = x + img_w + 9 * mm
    bw = w - img_w - 9 * mm
    prompts = ["직접 확인할 수 있는 것은?", "아직 모르는 것은?", "사람을 적으로 삼지 않는 질문은?"]
    py = y + h - 2 * mm
    for idx, prompt in enumerate(prompts):
        box(c, bx, py - 23 * mm, bw, 23 * mm, fill=[TEAL_PALE, SUN_PALE, CORAL_PALE][idx], radius=4 * mm)
        number_badge(c, str(idx + 1), bx + 5 * mm, py - 17 * mm, fill=[TEAL, SUN, CORAL][idx],
                     text_color=WHITE if idx != 1 else INK, diameter=8 * mm, size=8)
        draw_para(c, prompt, bx + 17 * mm, py - 2 * mm, bw - 23 * mm,
                  style(f"slide_scene_{idx}", 24, 29, SANS_B, INK), max_height=21 * mm)
        py -= 25 * mm
    c.showPage()


def slide_read(c) -> None:
    x, y, w, h = slide_base(c, 3, "본문을 직접 읽어요", COBALT, dark=True)
    box(c, x, y + 16 * mm, w, 66 * mm, fill=WHITE, radius=7 * mm)
    draw_para(c, "에베소서 6:10~14", x + 10 * mm, y + 69 * mm, w - 20 * mm,
              style("slide_read_ref", 36, 43, SERIF_B, COBALT_DARK, TA_CENTER), max_height=37 * mm)
    draw_para(c, "‘진리로 허리를 동여매고’까지\n교회에서 사용하는 성경으로 함께 읽습니다.", x + 14 * mm, y + 46 * mm, w - 28 * mm,
              style("slide_read_body", 24, 32, SANS_M, INK, TA_CENTER), max_height=40 * mm)
    c.showPage()


def slide_observe(c) -> None:
    x, y, w, h = slide_base(c, 4, "본문에서 세 가지를 찾아요", TEAL)
    gap = 6 * mm
    card_w = (w - 2 * gap) / 3
    items = [
        ("1", "힘의 근원", "누구에게서\n힘을 얻나요?", TEAL, TEAL_PALE),
        ("2", "싸움의 대상", "사람은\n적일까요?", VIOLET, VIOLET_PALE),
        ("3", "갑주의 목적", "무엇을 위해\n입나요?", CORAL, CORAL_PALE),
    ]
    for idx, (num, label, prompt, accent, fill) in enumerate(items):
        cx = x + idx * (card_w + gap)
        box(c, cx, y + 10 * mm, card_w, 76 * mm, fill=fill, radius=6 * mm)
        number_badge(c, num, cx + card_w / 2 - 6 * mm, y + 67 * mm, fill=accent, text_color=WHITE, diameter=12 * mm, size=12)
        draw_para(c, label, cx + 7 * mm, y + 54 * mm, card_w - 14 * mm,
                  style(f"slide_ob_label_{idx}", 24, 29, SANS_B, accent, TA_CENTER), max_height=24 * mm)
        draw_para(c, prompt, cx + 7 * mm, y + 32 * mm, card_w - 14 * mm,
                  style(f"slide_ob_prompt_{idx}", 23, 29, SANS_M, INK, TA_CENTER), max_height=31 * mm)
    c.showPage()


def slide_core(c) -> None:
    x, y, w, h = slide_base(c, 5, "오늘의 핵심", SUN, dark=True)
    box(c, x + 7 * mm, y + 12 * mm, w - 14 * mm, 74 * mm, fill=SUN_PALE, radius=8 * mm)
    draw_para(c, "주님의 능력 안에서 진리를 붙들면,\n성급히 단정하지 않고 사랑으로\n다음 행동을 선택할 수 있습니다.",
              x + 18 * mm, y + 72 * mm, w - 36 * mm,
              style("slide_core_text", 31, 39, SERIF_B, COBALT_DARK, TA_CENTER), max_height=62 * mm)
    c.showPage()


def slide_three_truths(c) -> None:
    x, y, w, h = slide_base(c, 6, "진리가 세우는 기준", COBALT)
    gap = 5 * mm
    card_w = (w - 2 * gap) / 3
    items = [
        ("POWER", "힘의 근원", "주님과\n주님의 능력", COBALT, PALE_BLUE),
        ("PERSON", "사람은", "내가 싸워야 할\n적이 아님", VIOLET, VIOLET_PALE),
        ("PURPOSE", "갑주의 목적", "맞서고\n끝까지 서기", CORAL, CORAL_PALE),
    ]
    for idx, (tag_text, label, value, accent, fill) in enumerate(items):
        cx = x + idx * (card_w + gap)
        box(c, cx, y + 10 * mm, card_w, 76 * mm, fill=fill, radius=6 * mm)
        tag(c, tag_text, cx + card_w / 2 - 17 * mm, y + 69 * mm, accent, width=34 * mm, height=7 * mm, font_size=7.5)
        draw_para(c, label, cx + 7 * mm, y + 57 * mm, card_w - 14 * mm,
                  style(f"slide_truth_label_{idx}", 23, 28, SANS_B, accent, TA_CENTER), max_height=23 * mm)
        draw_para(c, value, cx + 7 * mm, y + 33 * mm, card_w - 14 * mm,
                  style(f"slide_truth_value_{idx}", 25, 31, SANS_B, INK, TA_CENTER), max_height=34 * mm)
    c.showPage()


def slide_categories(c) -> None:
    x, y, w, h = slide_base(c, 7, "세 가지 분류", VIOLET)
    items = [
        ("✓", "확인할 수 있는 사실", TEAL, TEAL_PALE),
        ("?", "아직 확인하지 않은 설명", VIOLET, VIOLET_PALE),
        ("!", "근거보다 넓게 단정한 결론", CORAL, CORAL_PALE),
    ]
    gap = 5 * mm
    card_w = (w - 2 * gap) / 3
    for idx, (symbol, label, accent, fill) in enumerate(items):
        cx = x + idx * (card_w + gap)
        box(c, cx, y + 10 * mm, card_w, 76 * mm, fill=fill, radius=7 * mm)
        c.setFillColor(accent)
        c.circle(cx + card_w / 2, y + 65 * mm, 9 * mm, stroke=0, fill=1)
        c.setFillColor(WHITE)
        c.setFont(SANS_B, 22)
        c.drawCentredString(cx + card_w / 2, y + 61.5 * mm, symbol)
        draw_para(c, label, cx + 7 * mm, y + 48 * mm, card_w - 14 * mm,
                  style(f"slide_category_{idx}", 24, 31, SANS_B, accent, TA_CENTER), max_height=38 * mm)
    c.showPage()


def slide_four_steps(c) -> None:
    x, y, w, h = slide_base(c, 8, "네 단계로 다시 보기", TEAL)
    steps = [
        ("1", "사실", TEAL, TEAL_PALE),
        ("2", "감정·의미", VIOLET, VIOLET_PALE),
        ("3", "아직 모름", SUN, SUN_PALE),
        ("4", "다음 행동", CORAL, CORAL_PALE),
    ]
    gap = 4 * mm
    step_w = (w - 3 * gap) / 4
    for idx, (num, label, accent, fill) in enumerate(steps):
        sx = x + idx * (step_w + gap)
        box(c, sx, y + 20 * mm, step_w, 66 * mm, fill=fill, radius=6 * mm)
        number_badge(c, num, sx + step_w / 2 - 6 * mm, y + 69 * mm, fill=accent,
                     text_color=WHITE if idx != 2 else INK, diameter=12 * mm, size=12)
        draw_para(c, label, sx + 5 * mm, y + 48 * mm, step_w - 10 * mm,
                  style(f"slide_step_{idx}", 24, 30, SANS_B, accent, TA_CENTER), max_height=34 * mm)
        if idx < 3:
            c.setFillColor(COBALT_DARK)
            c.setFont(SANS_B, 22)
            c.drawCentredString(sx + step_w + gap / 2, y + 49 * mm, "›")
    c.showPage()


def slide_activity(c) -> None:
    x, y, w, h = slide_base(c, 9, "카드 활동 · 17분", CORAL)
    steps = [
        ("1", "분류", "문장만 보고 놓기"),
        ("2", "근거", "왜 그렇게 보았는지"),
        ("3", "질문", "존중하며 확인하기"),
        ("4", "행동", "사랑의 다음 선택"),
    ]
    gap = 4 * mm
    step_w = (w - 3 * gap) / 4
    card_y = y + 14 * mm
    card_h = 61 * mm
    for idx, (num, title, body) in enumerate(steps):
        sx = x + idx * (step_w + gap)
        box(c, sx, card_y, step_w, card_h, fill=[TEAL_PALE, LAVENDER, SUN_PALE, CORAL_PALE][idx], radius=6 * mm)
        number_badge(c, num, sx + step_w / 2 - 6 * mm, card_y + card_h - 14 * mm,
                     fill=[TEAL, COBALT, SUN, CORAL][idx], text_color=WHITE if idx != 2 else INK, diameter=12 * mm, size=12)
        draw_para(c, title, sx + 5 * mm, card_y + card_h - 23 * mm, step_w - 10 * mm,
                  style(f"slide_act_title_{idx}", 25, 30, SANS_B, INK, TA_CENTER), max_height=25 * mm)
        draw_para(c, body, sx + 5 * mm, card_y + card_h - 43 * mm, step_w - 10 * mm,
                  style(f"slide_act_body_{idx}", 19, 23, SANS_M, MUTED, TA_CENTER), max_height=22 * mm)
    draw_para(c, "실제 경험을 공개하지 않아도 됩니다.", x, y + 10 * mm, w,
              style("slide_activity_safe", 20, 24, SANS_B, CORAL, TA_CENTER), max_height=10 * mm)
    c.showPage()


def slide_exit(c) -> None:
    x, y, w, h = slide_base(c, 10, "퇴실 확인과 주간 미션", SUN, dark=True)
    gap = 7 * mm
    left_w = w * 0.58
    right_w = w - left_w - gap
    box(c, x, y + 10 * mm, left_w, 68 * mm, fill=WHITE, radius=7 * mm)
    tag(c, "EXIT 3", x + 7 * mm, y + 65 * mm, COBALT, width=27 * mm, height=7 * mm, font_size=7.5)
    questions = ["힘의 근원은?", "사람은 싸움의 대상?", "갑주의 목적은?"]
    qy = y + 53 * mm
    for idx, question in enumerate(questions):
        number_badge(c, str(idx + 1), x + 9 * mm, qy - 4 * mm, fill=[TEAL, VIOLET, CORAL][idx], text_color=WHITE, diameter=8 * mm, size=8)
        draw_para(c, question, x + 22 * mm, qy + 2 * mm, left_w - 29 * mm,
                  style(f"slide_exit_q_{idx}", 23, 28, SANS_B, INK), max_height=22 * mm)
        qy -= 16 * mm
    rx = x + left_w + gap
    box(c, rx, y + 10 * mm, right_w, 68 * mm, fill=SUN_PALE, radius=7 * mm)
    tag(c, "THIS WEEK", rx + 7 * mm, y + 65 * mm, SUN, text_color=INK, width=35 * mm, height=7 * mm, font_size=7.2)
    draw_para(c, "가능한 날에\n진리 로그를\n세 번 기록해요.", rx + 9 * mm, y + 52 * mm, right_w - 18 * mm,
              style("slide_week", 25, 31, SANS_B, COBALT_DARK, TA_CENTER), max_height=44 * mm)
    c.showPage()


def build_slides() -> None:
    c = canvas.Canvas(str(SLIDES_FILE), pagesize=SLIDE_SIZE, pageCompression=1)
    c.setTitle("전신갑주 4주 공과 1과 교사용 슬라이드")
    c.setAuthor("전신갑주 4주 공과")
    slide_cover(c)
    slide_scene(c)
    slide_read(c)
    slide_observe(c)
    slide_core(c)
    slide_three_truths(c)
    slide_categories(c)
    slide_four_steps(c)
    slide_activity(c)
    slide_exit(c)
    c.save()
    set_boxes(SLIDES_FILE, SLIDE_SIZE, 0)


def write_manifest(ppi: dict[str, float]) -> None:
    files = {
        "student": STUDENT_FILE,
        "teacher": TEACHER_FILE,
        "cards": CARDS_FILE,
        "homeConnection": HOME_FILE,
        "slides": SLIDES_FILE,
    }
    manifest = {
        "version": "2.0.0",
        "status": "lesson01_master_v2",
        "builtAt": "2026-07-13",
        "lessonId": "lesson-01-truth",
        "audience": "중1~고3",
        "designSystem": "Korean youth Sunday-school editorial v2",
        "referenceDocument": "DESIGN_V2_KR_REFERENCE.md",
        "files": {key: str(path.relative_to(SET_ROOT)).replace("\\", "/") for key, path in files.items()},
        "pageCounts": {key: len(PdfReader(str(path)).pages) for key, path in files.items()},
        "illustration": {
            "effectivePpi": min(ppi.values()),
            "generationMode": "Codex built-in image generation",
        },
        "illustrations": [
            {
                "role": "hero",
                "path": str(HERO_ART.relative_to(SET_ROOT)).replace("\\", "/"),
                "placedWidthMm": 84,
                "effectivePpi": ppi["hero"],
            },
            {
                "role": "listening-spot",
                "path": str(SPOT_ART.relative_to(SET_ROOT)).replace("\\", "/"),
                "maxPlacedWidthMm": 130,
                "effectivePpi": ppi["spot"],
            },
        ],
        "qrPolicy": {
            "embedded": False,
            "reason": "실제 교회별 DELIVERY_BASE_URL 확정 전 가짜 QR과 내부 미션 ID를 인쇄물에 노출하지 않음",
            "deliveryMethod": "교사가 실제 납품 URL로 생성한 별도 미션 QR 카드 또는 종이 완료표를 제시",
        },
        "personalizationRequired": [
            "교회명·부서명·담당자",
            "교회 사용 성경 번역본",
            "실제 DELIVERY_BASE_URL로 생성한 미션 QR 카드",
            "교회 보호 담당자와 비상 절차",
        ],
        "printNotes": [
            "학생책 B5와 가정연계 A6는 3mm 도련과 TrimBox를 포함합니다.",
            "활동카드 1~4쪽은 A4 100% 양면 긴 변 넘김, 5~8쪽은 A4 100% 단면 출력입니다.",
            "분류판에는 실제 63×88mm 카드 네 장을 놓을 수 있습니다.",
            "슬라이드는 16:9, 10장으로 구성하며 핵심 본문은 후방 투사를 고려해 크게 배치했습니다.",
        ],
    }
    MANIFEST_FILE.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    register_fonts()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for art_path in (HERO_ART, SPOT_ART):
        if not art_path.exists():
            raise FileNotFoundError(art_path)
    ppi = build_student()
    build_teacher()
    build_cards()
    build_home_card()
    build_slides()
    write_manifest(ppi)
    DELIVERY_DIR.mkdir(parents=True, exist_ok=True)
    for final_path in (STUDENT_FILE, TEACHER_FILE, CARDS_FILE, HOME_FILE, SLIDES_FILE, MANIFEST_FILE):
        shutil.copy2(final_path, DELIVERY_DIR / final_path.name)
    print(f"Lesson 01 v2 master PDFs generated under {OUT_DIR}")


if __name__ == "__main__":
    main()
