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
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    HRFlowable,
    Image,
    KeepInFrame,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


PRINT_ROOT = Path(__file__).resolve().parents[2]
SET_ROOT = PRINT_ROOT / "14_textbook_set"
OUT_DIR = SET_ROOT / "output" / "pdf"
DELIVERY_DIR = PRINT_ROOT / "11_print_ready"
ART_PATH = SET_ROOT / "art" / "generated" / "lesson01_truth_opening_final.png"
FONT_REGULAR = Path(r"C:\Windows\Fonts\NotoSansKR-Regular.ttf")
FONT_MEDIUM = Path(r"C:\Windows\Fonts\NotoSansKR-Medium.ttf")
FONT_BOLD = Path(r"C:\Windows\Fonts\NotoSansKR-Bold.ttf")

FOREST = colors.HexColor("#173f35")
NAVY = colors.HexColor("#243b69")
GOLD = colors.HexColor("#e9b64b")
CREAM = colors.HexColor("#f8ecd0")
INK = colors.HexColor("#2b2926")
MINT = colors.HexColor("#49b999")
CORAL = colors.HexColor("#d86a4a")
WHITE = colors.white
PALE = colors.HexColor("#fffaf0")
LINE = colors.HexColor("#cdbf9d")

FONT_BODY = "NotoSansKR"
FONT_MEDIUM_NAME = "NotoSansKR-Medium"
FONT_BOLD_NAME = "NotoSansKR-Bold"

B5_TRIM = (176 * mm, 250 * mm)
A6_TRIM = (105 * mm, 148 * mm)
BLEED = 3 * mm
B5_MEDIA = (B5_TRIM[0] + 2 * BLEED, B5_TRIM[1] + 2 * BLEED)
A6_MEDIA = (A6_TRIM[0] + 2 * BLEED, A6_TRIM[1] + 2 * BLEED)
SLIDE_SIZE = (254 * mm, 142.875 * mm)

STUDENT_FILE = OUT_DIR / "lesson01_student_B5_print.pdf"
TEACHER_FILE = OUT_DIR / "lesson01_teacher_A4_office.pdf"
CARDS_FILE = OUT_DIR / "lesson01_activity_cards_A4_duplex.pdf"
HOME_FILE = OUT_DIR / "lesson01_home_connection_A6_print.pdf"
SLIDES_FILE = OUT_DIR / "lesson01_teacher_slides_16x9.pdf"
MANIFEST_FILE = OUT_DIR / "lesson01_build_manifest.json"


def register_fonts() -> None:
    missing = [path for path in (FONT_REGULAR, FONT_MEDIUM, FONT_BOLD) if not path.exists()]
    if missing:
        raise FileNotFoundError(f"Required Noto Sans KR fonts are missing: {missing}")
    pdfmetrics.registerFont(TTFont(FONT_BODY, str(FONT_REGULAR)))
    pdfmetrics.registerFont(TTFont(FONT_MEDIUM_NAME, str(FONT_MEDIUM)))
    pdfmetrics.registerFont(TTFont(FONT_BOLD_NAME, str(FONT_BOLD)))


def strip_markdown(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^>\s?", "", text)
    text = text.replace("`", "")
    text = text.replace("**", "")
    return text


def para_text(text: str) -> str:
    return html.escape(strip_markdown(text)).replace("\n", "<br/>")


def parse_sections(path: Path, level: int = 2) -> list[tuple[str, list[str]]]:
    marker = "#" * level + " "
    sections: list[tuple[str, list[str]]] = []
    current_title: str | None = None
    current_lines: list[str] = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        if raw.startswith(marker):
            if current_title is not None:
                sections.append((current_title, current_lines))
            current_title = raw[len(marker) :].strip()
            current_lines = []
        elif current_title is not None:
            current_lines.append(raw.rstrip())
    if current_title is not None:
        sections.append((current_title, current_lines))
    return sections


def make_styles(student: bool = False) -> dict[str, ParagraphStyle]:
    body_size = 10.3 if student else 9.3
    leading = 15.2 if student else 13.1
    return {
        "body": ParagraphStyle(
            "body",
            fontName=FONT_BODY,
            fontSize=body_size,
            leading=leading,
            textColor=INK,
            spaceAfter=2.4 * mm,
            wordWrap="CJK",
        ),
        "small": ParagraphStyle(
            "small",
            fontName=FONT_BODY,
            fontSize=8.3 if student else 8.0,
            leading=11.8,
            textColor=INK,
            spaceAfter=1.4 * mm,
            wordWrap="CJK",
        ),
        "subhead": ParagraphStyle(
            "subhead",
            fontName=FONT_BOLD_NAME,
            fontSize=13.5 if student else 11.5,
            leading=17,
            textColor=FOREST,
            spaceBefore=2.5 * mm,
            spaceAfter=1.8 * mm,
            wordWrap="CJK",
        ),
        "quote": ParagraphStyle(
            "quote",
            fontName=FONT_MEDIUM_NAME,
            fontSize=10.6 if student else 9.2,
            leading=15,
            textColor=NAVY,
            leftIndent=5 * mm,
            rightIndent=4 * mm,
            borderColor=GOLD,
            borderWidth=1,
            borderPadding=5,
            borderRadius=4,
            backColor=colors.HexColor("#fff5d8"),
            spaceBefore=2 * mm,
            spaceAfter=3 * mm,
            wordWrap="CJK",
        ),
        "bullet": ParagraphStyle(
            "bullet",
            fontName=FONT_BODY,
            fontSize=body_size,
            leading=leading,
            textColor=INK,
            leftIndent=5 * mm,
            firstLineIndent=-3 * mm,
            spaceAfter=1.3 * mm,
            wordWrap="CJK",
        ),
        "table": ParagraphStyle(
            "table",
            fontName=FONT_BODY,
            fontSize=7.5 if student else 7.3,
            leading=10.2,
            textColor=INK,
            wordWrap="CJK",
        ),
    }


def markdown_flowables(lines: list[str], styles: dict[str, ParagraphStyle], compact: bool = False):
    flow = []
    i = 0
    paragraph_buffer: list[str] = []

    def flush_paragraph() -> None:
        nonlocal paragraph_buffer
        if paragraph_buffer:
            text = " ".join(strip_markdown(line) for line in paragraph_buffer)
            flow.append(Paragraph(para_text(text), styles["small"] if compact else styles["body"]))
            paragraph_buffer = []

    while i < len(lines):
        line = lines[i].strip()
        if not line:
            flush_paragraph()
            i += 1
            continue
        if line.startswith("### "):
            flush_paragraph()
            flow.append(Paragraph(para_text(line[4:]), styles["subhead"]))
            i += 1
            continue
        if line.startswith(">"):
            flush_paragraph()
            quote_lines = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                quote_lines.append(strip_markdown(lines[i]))
                i += 1
            flow.append(Paragraph(para_text(" ".join(quote_lines)), styles["quote"]))
            continue
        if line.startswith("|"):
            flush_paragraph()
            raw_rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                cells = [cell.strip() for cell in lines[i].strip().strip("|").split("|")]
                if not all(re.fullmatch(r"[-: ]+", cell or "-") for cell in cells):
                    raw_rows.append(cells)
                i += 1
            if raw_rows:
                header_style = ParagraphStyle("table-header", parent=styles["table"], textColor=WHITE, fontName=FONT_BOLD_NAME)
                rows = [
                    [Paragraph(para_text(cell), header_style if row_index == 0 else styles["table"]) for cell in cells]
                    for row_index, cells in enumerate(raw_rows)
                ]
                col_count = max(len(row) for row in rows)
                table = Table(rows, colWidths=[None] * col_count, repeatRows=1)
                table.setStyle(
                    TableStyle(
                        [
                            ("BACKGROUND", (0, 0), (-1, 0), FOREST),
                            ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
                            ("FONTNAME", (0, 0), (-1, 0), FONT_BOLD_NAME),
                            ("GRID", (0, 0), (-1, -1), 0.45, LINE),
                            ("BACKGROUND", (0, 1), (-1, -1), PALE),
                            ("VALIGN", (0, 0), (-1, -1), "TOP"),
                            ("LEFTPADDING", (0, 0), (-1, -1), 4),
                            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                            ("TOPPADDING", (0, 0), (-1, -1), 4),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                        ]
                    )
                )
                flow.append(table)
                flow.append(Spacer(1, 2 * mm))
            continue
        if re.match(r"^(?:- |\d+\. )", line):
            flush_paragraph()
            match = re.match(r"^(-|\d+\.)\s+(.*)$", line)
            assert match
            marker, text = match.groups()
            if text.startswith("[ ]"):
                text = "□ " + text[3:].strip()
            prefix = "•" if marker == "-" else marker
            flow.append(Paragraph(para_text(f"{prefix} {text}"), styles["bullet"]))
            i += 1
            continue
        paragraph_buffer.append(line)
        i += 1
    flush_paragraph()
    return flow


def draw_trim_background(c: canvas.Canvas, media_size, trim_size, bleed: float, color=CREAM) -> None:
    media_w, media_h = media_size
    trim_w, trim_h = trim_size
    c.setFillColor(color)
    c.rect(0, 0, media_w, media_h, stroke=0, fill=1)
    c.setStrokeColor(colors.HexColor("#ad9b77"))
    c.setLineWidth(0.35)
    c.rect(bleed, bleed, trim_w, trim_h, stroke=1, fill=0)


def draw_page_header(c, title: str, media_size, bleed: float, page_label: str, teacher: bool = False) -> tuple[float, float, float, float]:
    media_w, media_h = media_size
    top = media_h - bleed - (15 * mm if teacher else 14 * mm)
    left = bleed + (18 * mm if teacher else 14 * mm)
    right = media_w - bleed - (13 * mm if teacher else 12 * mm)
    c.setFillColor(FOREST)
    c.roundRect(left, top - 7 * mm, 24 * mm, 7 * mm, 3.5 * mm, stroke=0, fill=1)
    c.setFont(FONT_BOLD_NAME, 8.5)
    c.setFillColor(WHITE)
    c.drawCentredString(left + 12 * mm, top - 4.8 * mm, "전신갑주 1과")
    c.setFont(FONT_BOLD_NAME, 20 if teacher else 21.5)
    c.setFillColor(INK)
    c.drawString(left, top - 18 * mm, strip_markdown(title))
    c.setStrokeColor(GOLD)
    c.setLineWidth(2)
    c.line(left, top - 22 * mm, right, top - 22 * mm)
    c.setFont(FONT_BODY, 7.5)
    c.setFillColor(NAVY)
    c.drawRightString(right, bleed + 7 * mm, page_label)
    body_top = top - 27 * mm
    body_bottom = bleed + 14 * mm
    return left, body_bottom, right - left, body_top - body_bottom


def draw_flow_in_box(c, flowables, x, y, width, height) -> float:
    kif = KeepInFrame(width, height, flowables, mode="shrink", mergeSpace=True)
    _, used_h = kif.wrapOn(c, width, height)
    kif.drawOn(c, x, y + max(0, height - used_h))
    return used_h


def draw_note_area(c, x, y, width, height, label: str, line_count: int = 5) -> None:
    if height < 20 * mm:
        return
    c.setFillColor(colors.HexColor("#fffaf0"))
    c.setStrokeColor(LINE)
    c.setLineWidth(0.7)
    c.roundRect(x, y, width, height, 3 * mm, stroke=1, fill=1)
    c.setFillColor(FOREST)
    c.setFont(FONT_BOLD_NAME, 9)
    c.drawString(x + 4 * mm, y + height - 7 * mm, label)
    usable_top = y + height - 12 * mm
    usable_bottom = y + 6 * mm
    gap = (usable_top - usable_bottom) / max(line_count, 1)
    c.setStrokeColor(colors.HexColor("#d9cdb4"))
    c.setLineWidth(0.45)
    for index in range(line_count):
        line_y = usable_top - (index + 1) * gap
        c.line(x + 4 * mm, line_y, x + width - 4 * mm, line_y)


def weekly_log_flowables(styles):
    intro = Paragraph(
        para_text("다음 모임 전까지 가능한 날에 세 번 이상 진리 로그를 기록합니다. 못 한 날이 있어도 실패로 평가하지 않습니다."),
        styles["body"],
    )
    headers = ["기록", "확인할 사실", "감정·의미", "아직 모르는 것", "다음 행동"]
    header_style = ParagraphStyle("weekly-header", parent=styles["table"], textColor=WHITE, fontName=FONT_BOLD_NAME)
    rows = [[Paragraph(para_text(cell), header_style) for cell in headers]]
    for label in ("1", "2", "3"):
        rows.append([Paragraph(label, styles["table"]), "", "", "", ""])
    table = Table(rows, colWidths=[11 * mm, 29 * mm, 29 * mm, 29 * mm, 35 * mm], rowHeights=[10 * mm, 27 * mm, 27 * mm, 27 * mm])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), FOREST),
                ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
                ("GRID", (0, 0), (-1, -1), 0.55, LINE),
                ("BACKGROUND", (0, 1), (-1, -1), PALE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ALIGN", (0, 0), (0, -1), "CENTER"),
                ("LEFTPADDING", (0, 0), (-1, -1), 3),
                ("RIGHTPADDING", (0, 0), (-1, -1), 3),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    prayer = Paragraph(
        para_text("하나님, 내 감정을 숨기지 않으면서도 성급히 단정하지 않게 해 주세요. 주님의 능력 안에서 진리를 붙들고, 사람을 적으로 삼지 않으며 사랑으로 다음 행동을 선택하게 해 주세요."),
        styles["quote"],
    )
    safety = Paragraph(
        para_text("괴롭힘, 폭력, 학대, 자해나 죽고 싶은 생각처럼 안전과 관련된 일은 책에 자세히 쓰지 말고 지금 믿을 수 있는 안전한 어른에게 말하세요. 바로 위험하면 주변 어른에게 즉시 도움을 요청하세요."),
        styles["small"],
    )
    return [intro, Spacer(1, 2 * mm), table, Spacer(1, 3 * mm), Paragraph("한 문장 기도", styles["subhead"]), prayer, safety]


def set_boxes(path: Path, trim_size, bleed: float = 0) -> None:
    reader = PdfReader(str(path))
    writer = PdfWriter()
    for page in reader.pages:
        media = page.mediabox
        media_w = float(media.width)
        media_h = float(media.height)
        page.mediabox = RectangleObject([0, 0, media_w, media_h])
        if bleed:
            page.bleedbox = RectangleObject([0, 0, media_w, media_h])
            page.cropbox = RectangleObject([0, 0, media_w, media_h])
            page.trimbox = RectangleObject([bleed, bleed, bleed + trim_size[0], bleed + trim_size[1]])
        else:
            page.cropbox = RectangleObject([0, 0, media_w, media_h])
            page.trimbox = RectangleObject([0, 0, media_w, media_h])
            page.bleedbox = RectangleObject([0, 0, media_w, media_h])
        writer.add_page(page)
    writer.add_metadata(reader.metadata or {})
    temp = path.with_suffix(".boxed.pdf")
    with temp.open("wb") as handle:
        writer.write(handle)
    temp.replace(path)


def build_student() -> float:
    sections = parse_sections(SET_ROOT / "student" / "lesson01_truth.md")
    if len(sections) != 8:
        raise ValueError(f"Student source must have exactly 8 page sections, got {len(sections)}")
    if not ART_PATH.exists():
        raise FileNotFoundError(ART_PATH)
    image_width_mm = 72.0
    with PILImage.open(ART_PATH) as image:
        effective_ppi = image.width / (image_width_mm / 25.4)
    if effective_ppi < 300:
        raise ValueError(f"Illustration effective PPI is too low: {effective_ppi:.1f}")

    styles = make_styles(student=True)
    c = canvas.Canvas(str(STUDENT_FILE), pagesize=B5_MEDIA, pageCompression=1)
    c.setTitle("전신갑주 공과 1과 학생책 - 진리로 중심을 잡아라")
    c.setAuthor("전신갑주 QR RPG")
    for index, (title, lines) in enumerate(sections):
        draw_trim_background(c, B5_MEDIA, B5_TRIM, BLEED)
        x, y, width, height = draw_page_header(c, title, B5_MEDIA, BLEED, f"학생책 {index + 5}쪽")
        flowables = markdown_flowables(lines, styles, compact=index in (0, 7))
        if index == 0:
            img = Image(str(ART_PATH), width=image_width_mm * mm, height=108 * mm)
            text_width = width - image_width_mm * mm - 5 * mm
            text_box = KeepInFrame(text_width, height, flowables, mode="shrink", mergeSpace=True)
            table = Table([[text_box, img]], colWidths=[text_width, image_width_mm * mm], rowHeights=[height])
            table.setStyle(
                TableStyle(
                    [
                        ("VALIGN", (0, 0), (-1, -1), "TOP"),
                        ("LEFTPADDING", (0, 0), (-1, -1), 0),
                        ("RIGHTPADDING", (0, 0), (0, 0), 5 * mm),
                        ("RIGHTPADDING", (1, 0), (1, 0), 0),
                        ("TOPPADDING", (0, 0), (-1, -1), 0),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                    ]
                )
            )
            table.wrapOn(c, width, height)
            table.drawOn(c, x, y)
        elif index == 7:
            draw_flow_in_box(c, weekly_log_flowables(styles), x, y, width, height)
        else:
            used_h = draw_flow_in_box(c, flowables, x, y, width, height)
            remaining = height - used_h
            labels = {
                1: "본문 관찰 메모",
                2: "내 말로 핵심 진리 정리하기",
                3: "우리 팀 기록",
                4: "미션 기록",
                5: "내 적용 기록",
                6: "함께 서는 한 문장",
            }
            if index in labels and remaining > 34 * mm:
                note_h = min(remaining - 8 * mm, 62 * mm)
                draw_note_area(c, x, y + 2 * mm, width, note_h, labels[index], line_count=5)
        c.showPage()
    c.save()
    set_boxes(STUDENT_FILE, B5_TRIM, BLEED)
    return effective_ppi


def build_teacher() -> None:
    sections = parse_sections(SET_ROOT / "teacher" / "lesson01_truth_teacher.md")
    if len(sections) != 12:
        raise ValueError(f"Teacher source must have exactly 12 page sections, got {len(sections)}")
    styles = make_styles(student=False)
    c = canvas.Canvas(str(TEACHER_FILE), pagesize=A4, pageCompression=1)
    c.setTitle("전신갑주 공과 1과 교사용 지도서")
    c.setAuthor("전신갑주 QR RPG")
    for index, (title, lines) in enumerate(sections):
        c.setFillColor(colors.white)
        c.rect(0, 0, A4[0], A4[1], stroke=0, fill=1)
        x, y, width, height = draw_page_header(c, title, A4, 0, f"교사용 {index + 1} / 12", teacher=True)
        flowables = markdown_flowables(lines, styles, compact=index in (3, 10, 11))
        used_h = draw_flow_in_box(c, flowables, x, y, width, height)
        remaining = height - used_h
        if remaining > 42 * mm:
            note_h = min(remaining - 10 * mm, 72 * mm)
            draw_note_area(c, x, y + 2 * mm, width, note_h, "교사 메모", line_count=6)
        c.showPage()
    c.save()
    set_boxes(TEACHER_FILE, A4, 0)


def parse_cards() -> list[dict[str, str]]:
    text = (SET_ROOT / "activities" / "lesson01_truth_cards.md").read_text(encoding="utf-8")
    chunks = re.split(r"(?m)^### (C\d{2})\s*$", text)
    cards = []
    for index in range(1, len(chunks), 2):
        code = chunks[index]
        body = chunks[index + 1]
        fields = {}
        for label in ("앞면", "분류", "교사용 질문", "인정 답안"):
            match = re.search(rf"(?m)^{re.escape(label)}:\s*(.+)$", body)
            if not match:
                raise ValueError(f"Card {code} is missing {label}")
            fields[label] = strip_markdown(match.group(1))
        cards.append({"code": code, **fields})
    if len(cards) != 12:
        raise ValueError(f"Expected 12 cards, got {len(cards)}")
    return cards


def card_positions():
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


def draw_cut_marks(c, x, y, w, h):
    c.setStrokeColor(colors.HexColor("#777777"))
    c.setLineWidth(0.35)
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
        c.line(x1, y1, x2, y2)


def draw_card_front(c, card, x, y, w, h):
    c.setFillColor(PALE)
    c.roundRect(x, y, w, h, 4 * mm, stroke=0, fill=1)
    c.setFillColor(NAVY)
    c.roundRect(x, y + h - 19 * mm, w, 19 * mm, 4 * mm, stroke=0, fill=1)
    c.rect(x, y + h - 19 * mm, w, 8 * mm, stroke=0, fill=1)
    c.setFillColor(GOLD)
    c.circle(x + 13 * mm, y + h - 9.5 * mm, 7 * mm, stroke=0, fill=1)
    c.setFillColor(INK)
    c.setFont(FONT_BOLD_NAME, 12)
    c.drawCentredString(x + 13 * mm, y + h - 12 * mm, card["code"])
    c.setFillColor(WHITE)
    c.setFont(FONT_MEDIUM_NAME, 9.2)
    c.drawString(x + 25 * mm, y + h - 12 * mm, "상황 카드")
    style = ParagraphStyle("cardfront", fontName=FONT_MEDIUM_NAME, fontSize=11, leading=16, textColor=INK, wordWrap="CJK", alignment=TA_LEFT)
    paragraph = Paragraph(para_text(card["앞면"]), style)
    max_w = w - 14 * mm
    max_h = h - 34 * mm
    _, ph = paragraph.wrap(max_w, max_h)
    paragraph.drawOn(c, x + 7 * mm, y + h - 27 * mm - ph)
    c.setStrokeColor(LINE)
    c.setLineWidth(0.7)
    c.roundRect(x, y, w, h, 4 * mm, stroke=1, fill=0)
    draw_cut_marks(c, x, y, w, h)


def draw_card_back(c, x, y, w, h):
    c.setFillColor(FOREST)
    c.roundRect(x, y, w, h, 4 * mm, stroke=0, fill=1)
    c.setStrokeColor(GOLD)
    c.setLineWidth(2)
    c.roundRect(x + 5 * mm, y + 5 * mm, w - 10 * mm, h - 10 * mm, 3 * mm, stroke=1, fill=0)
    c.setFillColor(GOLD)
    c.setFont(FONT_BOLD_NAME, 18)
    c.drawCentredString(x + w / 2, y + h / 2 + 6 * mm, "진리의 허리띠")
    c.setFillColor(WHITE)
    c.setFont(FONT_BODY, 9)
    c.drawCentredString(x + w / 2, y + h / 2 - 3 * mm, "확인하고 · 멈추고 · 선택하기")
    c.setFont(FONT_BODY, 7.5)
    c.drawCentredString(x + w / 2, y + 12 * mm, "전신갑주 공과 1과")
    draw_cut_marks(c, x, y, w, h)


def build_cards() -> None:
    cards = parse_cards()
    positions = card_positions()
    c = canvas.Canvas(str(CARDS_FILE), pagesize=A4, pageCompression=1)
    c.setTitle("전신갑주 공과 1과 활동카드")
    c.setAuthor("전신갑주 QR RPG")
    for group_start in (0, 6):
        group = cards[group_start : group_start + 6]
        for card, position in zip(group, positions):
            draw_card_front(c, card, *position)
        c.showPage()
        mirrored = []
        for row in range(3):
            mirrored.extend([positions[row * 2 + 1], positions[row * 2]])
        for position in mirrored:
            draw_card_back(c, *position)
        c.showPage()

    sorting = [
        ("확인할 수 있는 사실", MINT),
        ("아직 확인하지 않은 설명", GOLD),
        ("근거보다 넓게 단정한 결론", CORAL),
    ]
    c.setFillColor(CREAM)
    c.rect(0, 0, A4[0], A4[1], stroke=0, fill=1)
    c.setFont(FONT_BOLD_NAME, 20)
    c.setFillColor(INK)
    c.drawString(18 * mm, A4[1] - 20 * mm, "분류 표지")
    panel_h = 70 * mm
    for index, (label, accent) in enumerate(sorting):
        x = 18 * mm
        y = A4[1] - 38 * mm - (index + 1) * panel_h - index * 7 * mm
        c.setFillColor(PALE)
        c.roundRect(x, y, A4[0] - 36 * mm, panel_h, 5 * mm, stroke=0, fill=1)
        c.setFillColor(accent)
        c.rect(x, y + panel_h - 12 * mm, A4[0] - 36 * mm, 12 * mm, stroke=0, fill=1)
        c.setFillColor(INK)
        c.setFont(FONT_BOLD_NAME, 16)
        c.drawCentredString(A4[0] / 2, y + panel_h / 2 - 4 * mm, label)
        c.setStrokeColor(LINE)
        c.roundRect(x, y, A4[0] - 36 * mm, panel_h, 5 * mm, stroke=1, fill=0)
    c.showPage()

    c.setFillColor(WHITE)
    c.rect(0, 0, A4[0], A4[1], stroke=0, fill=1)
    c.setFont(FONT_BOLD_NAME, 20)
    c.setFillColor(INK)
    c.drawString(18 * mm, A4[1] - 20 * mm, "교사용 정답·인쇄 안내")
    answer_rows = [["코드", "권장 분류"]] + [[card["code"], card["분류"]] for card in cards]
    answer_style = ParagraphStyle("ans", fontName=FONT_BODY, fontSize=8.5, leading=11, wordWrap="CJK", textColor=INK)
    answer_header_style = ParagraphStyle("ans-head", parent=answer_style, fontName=FONT_BOLD_NAME, textColor=WHITE)
    table_data = [
        [Paragraph(para_text(cell), answer_header_style if row_index == 0 else answer_style) for cell in row]
        for row_index, row in enumerate(answer_rows)
    ]
    table = Table(table_data, colWidths=[24 * mm, 78 * mm], rowHeights=[None] * len(table_data))
    table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), FOREST), ("TEXTCOLOR", (0, 0), (-1, 0), WHITE), ("GRID", (0, 0), (-1, -1), 0.4, LINE), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 5), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    _, table_h = table.wrapOn(c, 110 * mm, 220 * mm)
    table_y = A4[1] - 40 * mm - table_h
    table.drawOn(c, 18 * mm, table_y)
    style = ParagraphStyle("notes", fontName=FONT_BODY, fontSize=9, leading=13, textColor=INK, wordWrap="CJK")
    notes = [
        "1~4쪽은 100% 크기, 양면 긴 변 넘김으로 출력합니다.",
        "앞면과 뒷면은 좌우 반전 배치되어 있습니다.",
        "5쪽 분류 표지는 단면 출력합니다.",
        "정답표는 학생에게 배포하지 않습니다.",
        "카드 완성 크기는 63x88mm입니다. 출력 후 자로 확인합니다.",
    ]
    flow = [Paragraph(para_text(f"• {note}"), style) for note in notes]
    c.setFillColor(PALE)
    c.setStrokeColor(LINE)
    c.roundRect(122 * mm, A4[1] - 132 * mm, 70 * mm, 92 * mm, 4 * mm, stroke=1, fill=1)
    draw_flow_in_box(c, flow, 127 * mm, A4[1] - 127 * mm, 60 * mm, 82 * mm)
    c.showPage()
    c.save()
    set_boxes(CARDS_FILE, A4, 0)


def build_home_card() -> None:
    sections = parse_sections(SET_ROOT / "activities" / "lesson01_home_connection.md")
    if len(sections) != 2:
        raise ValueError("Home connection source must have 2 sides")
    styles = make_styles(student=True)
    c = canvas.Canvas(str(HOME_FILE), pagesize=A6_MEDIA, pageCompression=1)
    c.setTitle("전신갑주 공과 1과 가정연계 카드")
    c.setAuthor("전신갑주 QR RPG")
    for index, (title, lines) in enumerate(sections):
        draw_trim_background(c, A6_MEDIA, A6_TRIM, BLEED)
        x = BLEED + 10 * mm
        width = A6_TRIM[0] - 20 * mm
        c.setFillColor(FOREST if index == 0 else NAVY)
        c.roundRect(x, A6_MEDIA[1] - BLEED - 28 * mm, width, 18 * mm, 4 * mm, stroke=0, fill=1)
        c.setFillColor(WHITE)
        c.setFont(FONT_BOLD_NAME, 14)
        c.drawCentredString(A6_MEDIA[0] / 2, A6_MEDIA[1] - BLEED - 21 * mm, strip_markdown(title))
        flow = markdown_flowables(lines, styles, compact=True)
        draw_flow_in_box(c, flow, x, BLEED + 12 * mm, width, A6_TRIM[1] - 48 * mm)
        c.showPage()
    c.save()
    set_boxes(HOME_FILE, A6_TRIM, BLEED)


def build_slides() -> None:
    sections = parse_sections(SET_ROOT / "teacher" / "lesson01_slides.md")
    if len(sections) != 6:
        raise ValueError("Slide source must have 6 slides")
    styles = make_styles(student=True)
    slide_body = ParagraphStyle("slidebody", parent=styles["body"], fontSize=17, leading=25, spaceAfter=5 * mm, textColor=WHITE)
    slide_quote = ParagraphStyle("slidequote", parent=styles["quote"], fontSize=18, leading=27)
    slide_styles = {**styles, "body": slide_body, "small": slide_body, "quote": slide_quote, "bullet": ParagraphStyle("slidebullet", parent=styles["bullet"], fontSize=16, leading=24, leftIndent=8 * mm, firstLineIndent=-4 * mm, textColor=WHITE)}
    c = canvas.Canvas(str(SLIDES_FILE), pagesize=SLIDE_SIZE, pageCompression=1)
    c.setTitle("전신갑주 공과 1과 교사용 슬라이드")
    c.setAuthor("전신갑주 QR RPG")
    for index, (title, lines) in enumerate(sections):
        c.setFillColor(NAVY if index % 2 == 0 else FOREST)
        c.rect(0, 0, SLIDE_SIZE[0], SLIDE_SIZE[1], stroke=0, fill=1)
        c.setFillColor(GOLD)
        c.rect(0, SLIDE_SIZE[1] - 7 * mm, SLIDE_SIZE[0], 7 * mm, stroke=0, fill=1)
        c.setFillColor(WHITE)
        c.setFont(FONT_BOLD_NAME, 28)
        display_title = re.sub(r"^슬라이드\s+\d+\s*-\s*", "", strip_markdown(title))
        c.drawString(16 * mm, SLIDE_SIZE[1] - 24 * mm, display_title)
        c.setFont(FONT_BODY, 8)
        c.drawRightString(SLIDE_SIZE[0] - 12 * mm, 8 * mm, f"전신갑주 공과 1과 · {index + 1}/6")
        flow = markdown_flowables(lines, slide_styles, compact=False)
        if index == 0:
            image_width = 60 * mm
            image_height = 90 * mm
            c.drawImage(str(ART_PATH), SLIDE_SIZE[0] - 16 * mm - image_width, 22 * mm, image_width, image_height, preserveAspectRatio=True, anchor="c")
            draw_flow_in_box(c, flow, 16 * mm, 18 * mm, SLIDE_SIZE[0] - image_width - 42 * mm, SLIDE_SIZE[1] - 48 * mm)
        else:
            draw_flow_in_box(c, flow, 18 * mm, 18 * mm, SLIDE_SIZE[0] - 36 * mm, SLIDE_SIZE[1] - 50 * mm)
        c.showPage()
    c.save()
    set_boxes(SLIDES_FILE, SLIDE_SIZE, 0)


def write_manifest(effective_ppi: float) -> None:
    files = {
        "student": STUDENT_FILE,
        "teacher": TEACHER_FILE,
        "cards": CARDS_FILE,
        "homeConnection": HOME_FILE,
        "slides": SLIDES_FILE,
    }
    manifest = {
        "version": "1.0.0",
        "status": "lesson01_master_final",
        "builtAt": "2026-07-13",
        "lessonId": "lesson-01-truth",
        "files": {key: str(path.relative_to(SET_ROOT)).replace("\\", "/") for key, path in files.items()},
        "pageCounts": {key: len(PdfReader(str(path)).pages) for key, path in files.items()},
        "illustration": {
            "path": str(ART_PATH.relative_to(SET_ROOT)).replace("\\", "/"),
            "placedWidthMm": 72,
            "effectivePpi": round(effective_ppi, 1),
            "generationMode": "Codex built-in image generation, precise-object-edit",
        },
        "personalizationRequired": [
            "교회명·부서명·담당자",
            "교회 사용 성경 번역본",
            "실제 DELIVERY_BASE_URL의 mission-truth QR 카드",
            "교회 보호 담당자와 비상 절차",
        ],
        "notes": [
            "학생책은 본문 전문을 싣지 않고 교회에서 사용하는 성경을 직접 읽도록 구성했습니다.",
            "학생책의 QR은 별도 QR 카드로 제시해 교회별 URL 개인화와 책 재고를 분리합니다.",
            "활동카드 1~4쪽은 양면 긴 변 넘김, 5~6쪽은 단면 교사용입니다.",
        ],
    }
    MANIFEST_FILE.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    register_fonts()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    effective_ppi = build_student()
    build_teacher()
    build_cards()
    build_home_card()
    build_slides()
    write_manifest(effective_ppi)
    DELIVERY_DIR.mkdir(parents=True, exist_ok=True)
    for final_path in (STUDENT_FILE, TEACHER_FILE, CARDS_FILE, HOME_FILE, SLIDES_FILE, MANIFEST_FILE):
        shutil.copy2(final_path, DELIVERY_DIR / final_path.name)
    print(f"Lesson 01 final PDFs generated under {OUT_DIR}")


if __name__ == "__main__":
    main()
