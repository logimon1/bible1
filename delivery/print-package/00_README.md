# 전신갑주 QR RPG 올인원 세트

이 폴더는 교회 납품용 패키지 산출물입니다. 앱 단품이 아니라 QR, 교재, 매뉴얼, 장비카드, 교환소, 스티커, 콘텐츠, 이미지 지침, 인쇄물, 운영 가이드를 함께 제공합니다.

> 현재 상태: 기존 2쪽 학생 워크북과 1쪽 교사용 운영표는 QR 운영 키트입니다. 판매용 공과책은 14_textbook_set에서 차시별로 확정하며, 1과는 국내 청소년 공과 레퍼런스를 반영한 학생책 8쪽·교사용 12쪽·활동카드 8쪽·가정연계 2쪽·슬라이드 10쪽의 마스터 V2.0으로 완성했습니다.

## 7단계 산출 상태

1. 제품 골격 확정: `01_brand`, `12_guides`
2. 콘텐츠 원고 제작: `08_content_retreat`, `09_content_monthly`
3. 기능성 자산 제작: `02_qr_set`, `13_app_data`
4. 핵심 비주얼 제작: `10_image_assets`, 벡터 플레이스홀더와 AI 생성 지침
5. 인쇄물 편집: `03_workbook_student`, `04_manual_teacher`, `05_equipment_cards`, `06_exchange_set`, `07_stickers`, `11_print_ready`
6. 현장 리허설: `12_guides/rehearsal_checklist.md`
7. 납품 패키지화: `12_guides/handoff_manifest.md`

## 공과책 세트

- 1과 확정 원고: 14_textbook_set/student, teacher, activities
- 1과 인쇄 PDF: 14_textbook_set/output/pdf
- 납품용 복사본: 11_print_ready/lesson01_*.pdf
- 재생성/검증: npm run build:lesson01, npm run verify:lesson01

## 재생성

```bash
npm install
npm run build
npm run verify
```
