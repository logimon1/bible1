#!/usr/bin/env python3
"""Build the printable THE WAR night-forest mission pack."""

from __future__ import annotations

import argparse
import io
import json
from pathlib import Path
from typing import Any

import qrcode
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
    Frame,
    Image,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "night-forest-missions.json"
OUTPUT_DIR = ROOT / "output" / "pdf"
QR_DIR = ROOT / "output" / "qr"
PAGE_W, PAGE_H = A4

NAVY = colors.HexColor("#102735")
FOREST = colors.HexColor("#173C3A")
MOSS = colors.HexColor("#6E9E86")
MINT = colors.HexColor("#D9F0E4")
AMBER = colors.HexColor("#F2BD5D")
PAPER = colors.HexColor("#FBF7EA")
INK = colors.HexColor("#1D2932")
MUTED = colors.HexColor("#5E6C71")
RED = colors.HexColor("#B94B4B")


def register_fonts() -> None:
    candidates = [
        ("NotoSansKR", Path("C:/Windows/Fonts/NotoSansKR-Regular.ttf")),
        ("NotoSansKRBold", Path("C:/Windows/Fonts/NotoSansKR-Bold.ttf")),
        ("Malgun", Path("C:/Windows/Fonts/malgun.ttf")),
        ("MalgunBold", Path("C:/Windows/Fonts/malgunbd.ttf")),
    ]
    for name, path in candidates:
        if path.exists():
            pdfmetrics.registerFont(TTFont(name, str(path)))
    if "NotoSansKR" not in pdfmetrics.getRegisteredFontNames():
        raise RuntimeError("한글 PDF 글꼴을 찾지 못했습니다. NotoSansKR 또는 malgun.ttf가 필요합니다.")


def font_name(bold: bool = False) -> str:
    registered = pdfmetrics.getRegisteredFontNames()
    if bold and "NotoSansKRBold" in registered:
        return "NotoSansKRBold"
    if not bold and "NotoSansKR" in registered:
        return "NotoSansKR"
    return "MalgunBold" if bold else "Malgun"


def styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "body": ParagraphStyle(
            "BodyKR",
            parent=base["BodyText"],
            fontName=font_name(),
            fontSize=10.2,
            leading=16,
            textColor=INK,
            spaceAfter=4,
        ),
        "small": ParagraphStyle(
            "SmallKR",
            parent=base["BodyText"],
            fontName=font_name(),
            fontSize=8.5,
            leading=12,
            textColor=MUTED,
            spaceAfter=3,
        ),
        "cover_kicker": ParagraphStyle(
            "CoverKicker",
            parent=base["BodyText"],
            fontName=font_name(True),
            fontSize=11,
            leading=15,
            textColor=AMBER,
            alignment=TA_LEFT,
        ),
        "cover_title": ParagraphStyle(
            "CoverTitle",
            parent=base["Title"],
            fontName=font_name(True),
            fontSize=28,
            leading=34,
            textColor=colors.white,
            alignment=TA_LEFT,
            spaceAfter=8,
        ),
        "cover_subtitle": ParagraphStyle(
            "CoverSubtitle",
            parent=base["BodyText"],
            fontName=font_name(),
            fontSize=12,
            leading=18,
            textColor=colors.HexColor("#EAF4EF"),
            alignment=TA_LEFT,
        ),
        "h1": ParagraphStyle(
            "H1KR",
            parent=base["Heading1"],
            fontName=font_name(True),
            fontSize=19,
            leading=25,
            textColor=NAVY,
            spaceBefore=2,
            spaceAfter=8,
        ),
        "h2": ParagraphStyle(
            "H2KR",
            parent=base["Heading2"],
            fontName=font_name(True),
            fontSize=12.5,
            leading=18,
            textColor=FOREST,
            spaceBefore=7,
            spaceAfter=4,
        ),
        "label": ParagraphStyle(
            "LabelKR",
            parent=base["BodyText"],
            fontName=font_name(True),
            fontSize=8.5,
            leading=12,
            textColor=MOSS,
            spaceAfter=2,
        ),
        "mission_title": ParagraphStyle(
            "MissionTitleKR",
            parent=base["Heading1"],
            fontName=font_name(True),
            fontSize=22,
            leading=28,
            textColor=colors.white,
            spaceAfter=2,
        ),
        "mission_meta": ParagraphStyle(
            "MissionMetaKR",
            parent=base["BodyText"],
            fontName=font_name(True),
            fontSize=10,
            leading=15,
            textColor=colors.HexColor("#E7F1ED"),
        ),
        "card_heading": ParagraphStyle(
            "CardHeadingKR",
            parent=base["Heading2"],
            fontName=font_name(True),
            fontSize=13,
            leading=18,
            textColor=NAVY,
            spaceBefore=0,
            spaceAfter=3,
        ),
        "card_body": ParagraphStyle(
            "CardBodyKR",
            parent=base["BodyText"],
            fontName=font_name(),
            fontSize=10,
            leading=15,
            textColor=INK,
            spaceAfter=3,
        ),
    }


def para(text: str, style: ParagraphStyle) -> Paragraph:
    safe = str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return Paragraph(safe.replace("\n", "<br/>"), style)


def bullet_list(items: list[str], style: ParagraphStyle) -> list[Flowable]:
    return [para(f"- {item}", style) for item in items]


def qr_png(url: str, path: Path) -> None:
    qr = qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_Q, box_size=10, border=4)
    qr.add_data(url)
    qr.make(fit=True)
    image = qr.make_image(fill_color="#102735", back_color="white")
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path)


def qr_image(url: str, name: str, size: float = 33 * mm) -> Image:
    path = QR_DIR / f"{name}.png"
    qr_png(url, path)
    image = Image(str(path), width=size, height=size)
    image.hAlign = "RIGHT"
    return image


class CoverBackground(Flowable):
    def __init__(self, height: float) -> None:
        super().__init__()
        self.width = PAGE_W - 32 * mm
        self.height = height

    def draw(self) -> None:
        canvas = self.canv
        canvas.saveState()
        canvas.setFillColor(NAVY)
        canvas.roundRect(0, 0, self.width, self.height, 8 * mm, stroke=0, fill=1)
        canvas.setFillColor(FOREST)
        canvas.circle(self.width - 38 * mm, self.height - 22 * mm, 34 * mm, stroke=0, fill=1)
        canvas.setFillColor(colors.Color(1, 1, 1, alpha=0.07))
        for index in range(7):
            canvas.circle(18 * mm + index * 23 * mm, 15 * mm + (index % 2) * 4 * mm, 1.4 * mm, stroke=0, fill=1)
        canvas.restoreState()


def footer(canvas: Any, doc: BaseDocTemplate) -> None:
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#D9E3DB"))
    canvas.setLineWidth(0.4)
    canvas.line(16 * mm, 12 * mm, PAGE_W - 16 * mm, 12 * mm)
    canvas.setFont(font_name(), 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(16 * mm, 7 * mm, "THE WAR 밤 숲 미션 팩 · current-retreat")
    canvas.drawRightString(PAGE_W - 16 * mm, 7 * mm, f"{doc.page}")
    canvas.restoreState()


def cover(story: list[Flowable], s: dict[str, ParagraphStyle]) -> None:
    story.append(Spacer(1, 18 * mm))
    story.append(CoverBackground(178 * mm))
    story.append(Spacer(1, -158 * mm))
    story.append(Spacer(1, 14 * mm))
    story.append(para("THE WAR · FIELD KIT", s["cover_kicker"]))
    story.append(para("밤 숲 미션 팩", s["cover_title"]))
    story.append(para("어둠 속에서 서로의 빛을 확인하는\n6개 핵심 미션 + 히든 + 최종 보스", s["cover_subtitle"]))
    story.append(Spacer(1, 61 * mm))
    safety_box = Table(
        [[para("공포 수위 2/5", s["label"]), para("뛰지 않기 · 밀지 않기 · 중단 신호: 빛", s["body"])]],
        colWidths=[36 * mm, 104 * mm],
    )
    safety_box.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), MINT),
                ("BOX", (0, 0), (-1, -1), 0.6, MOSS),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    story.append(safety_box)
    story.append(Spacer(1, 13 * mm))
    story.append(para("진행자용 원고 · 참가자 카드 · 안전 체크리스트 · QR 연동 데이터", s["small"]))
    story.append(PageBreak())


def intro_pages(story: list[Flowable], s: dict[str, ParagraphStyle], data: dict[str, Any]) -> None:
    story.append(para("운영 한눈에 보기", s["h1"]))
    story.append(para("이 팩은 실제 야간 숲에서 바로 읽고 진행할 수 있도록 문장을 짧게 만들었습니다. 공포보다 팀의 협력과 안전을 우선합니다.", s["body"]))
    story.append(para("권장 흐름", s["h2"]))
    for item in [
        "입장 브리핑 8분: 짝 확인, 중단 신호 빛, 이동 규칙",
        "핵심 미션 6개: 스테이션당 6-8분",
        "히든 미션 2개: 팀 컨디션이 좋을 때만 추가",
        "최종 보스: 6개 토큰을 모은 팀만 진행",
        "퇴장 5분: 인원과 소품을 다시 확인",
    ]:
        story.append(para(f"- {item}", s["body"]))
    story.append(para("안전 원칙", s["h2"]))
    story.extend(bullet_list(data["safety"]["rules"], s["body"]))
    story.append(Spacer(1, 4 * mm))
    story.append(para("앱 사용", s["h2"]))
    story.append(para("각 미션 QR을 스캔하면 앱에서 진행 화면이 열립니다. 진행자가 성공을 확인한 뒤 참가자가 `미션 완료 · 보상 받기`를 누릅니다. QR을 스캔하지 못하는 기기는 휴대폰 기본 카메라로 같은 주소를 열어도 됩니다.", s["body"]))
    story.append(PageBreak())

    story.append(para("현장 안전 브리핑", s["h1"]))
    story.append(para("아래 문장을 입장 전에 그대로 읽어 주세요.", s["body"]))
    quote = Table([[para("지금부터 THE WAR에 들어갑니다. 숲은 어둡지만 우리는 혼자가 아닙니다. 반드시 짝과 함께 움직이고, 표시된 길 밖으로 나가지 않습니다. 뛰지 않고, 밀지 않고, 눈을 가리지 않습니다. 불안하거나 다치거나 길이 헷갈리면 큰 소리로 `빛`이라고 말하세요. 그 말을 들으면 모두 멈추고 조명을 켭니다.", s["body"])]], colWidths=[165 * mm])
    quote.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#EEF7F0")), ("BOX", (0, 0), (-1, -1), 0.8, MOSS), ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10), ("TOPPADDING", (0, 0), (-1, -1), 10), ("BOTTOMPADDING", (0, 0), (-1, -1), 10)]))
    story.append(quote)
    story.append(para("중단 기준", s["h2"]))
    story.extend(bullet_list(["천둥, 강한 비, 낙뢰 예보", "길이 미끄러워진 경우", "참가자가 짝과 떨어진 경우", "공황, 호흡 곤란, 구토, 심한 어지럼", "조명 또는 통신 장비 고장"], s["body"]))
    story.append(PageBreak())


def mission_page(story: list[Flowable], s: dict[str, ParagraphStyle], mission: dict[str, Any], base_url: str, label: str = "MISSION") -> None:
    header = Table([[para(f"{label} · {mission.get('number', '')}", s["mission_meta"]), qr_image(base_url.rstrip("/") + mission["qrRoute"], mission["id"])]], colWidths=[125 * mm, 40 * mm])
    header.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), NAVY), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (0, 0), 10), ("RIGHTPADDING", (0, 0), (0, 0), 5), ("TOPPADDING", (0, 0), (0, 0), 12), ("BOTTOMPADDING", (0, 0), (0, 0), 12), ("RIGHTPADDING", (1, 0), (1, 0), 10), ("TOPPADDING", (1, 0), (1, 0), 10), ("BOTTOMPADDING", (1, 0), (1, 0), 10)]))
    story.append(header)
    story.append(Spacer(1, 4 * mm))
    story.append(para(mission["title"], s["h1"]))
    meta = f"{mission.get('armor', '최종 미션')} · {mission.get('stat', '팀 미션')} · {mission.get('timeMinutes', 8)}분"
    story.append(para(meta, s["label"]))
    story.append(para(mission.get("fearCue", "숲의 어둠 속에서 팀의 빛을 확인합니다."), s["body"]))
    info = [
        [para("목표", s["label"]), para(mission["objective"], s["body"])],
        [para("성공", s["label"]), para(mission["success"], s["body"])],
        [para("보상", s["label"]), para(mission.get("reward", "진행자 확인"), s["body"])],
    ]
    info_table = Table(info, colWidths=[25 * mm, 140 * mm])
    info_table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), PAPER), ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#D4C8A9")), ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E5DCC4")), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7), ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    story.append(info_table)
    if mission.get("howTo"):
        story.append(para("진행 방법", s["h2"]))
        story.extend(bullet_list(mission.get("howTo", []), s["body"]))
    story.append(para("준비물", s["h2"]))
    story.append(para(" · ".join(mission.get("materials", [])), s["body"]))
    story.append(para("진행자 한마디", s["h2"]))
    story.append(para(mission.get("facilitatorLine", "진행자의 안내에 따라 수행하세요."), s["body"]))
    if mission.get("accessibility"):
        story.append(para(f"대체 방법: {mission['accessibility']}", s["small"]))
    story.append(PageBreak())


def build(base_url: str, output: Path) -> None:
    register_fonts()
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    s = styles()
    output.parent.mkdir(parents=True, exist_ok=True)
    QR_DIR.mkdir(parents=True, exist_ok=True)
    doc = BaseDocTemplate(str(output), pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=15 * mm, bottomMargin=18 * mm, title=data["title"], author="current-retreat")
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="normal")
    doc.addPageTemplates([PageTemplate(id="all", frames=[frame], onPage=footer)])

    story: list[Flowable] = []
    cover(story, s)
    intro_pages(story, s, data)
    for mission in data["missions"]:
        mission_page(story, s, mission, base_url)
    for mission in data["bonusMissions"]:
        mission_page(story, s, mission, base_url, label="HIDDEN")
    mission_page(story, s, data["finalMission"], base_url, label="FINAL")
    doc.build(story)


def main() -> None:
    parser = argparse.ArgumentParser(description="THE WAR 밤 숲 미션 팩 PDF 생성")
    parser.add_argument("--base-url", default="https://current-retreat.vercel.app", help="QR이 연결될 앱 주소")
    parser.add_argument("--output", default=str(OUTPUT_DIR / "night-forest-mission-pack.pdf"), help="출력 PDF 경로")
    args = parser.parse_args()
    build(args.base_url, Path(args.output))
    print(f"생성 완료: {args.output}")


if __name__ == "__main__":
    main()
