# 납품 패키지 인수인계서

## 포함 산출물
- 01_brand
- 02_qr_set/data
- 02_qr_set/svg
- 02_qr_set/print
- 03_workbook_student/source
- 03_workbook_student/print
- 04_manual_teacher/source
- 04_manual_teacher/print
- 05_equipment_cards/data
- 05_equipment_cards/print
- 06_exchange_set/source
- 06_exchange_set/print
- 07_stickers/data
- 07_stickers/print
- 08_content_retreat
- 09_content_monthly
- 10_image_assets/manifest
- 10_image_assets/prompts
- 10_image_assets/vector_placeholders
- 10_image_assets/production_svg
- 11_print_ready
- 12_guides
- 13_app_data

## 납품 전 교체해야 할 값
- `DELIVERY_BASE_URL`: 실제 Vercel 배포 URL
- 교회명
- 행사명
- 행사 날짜
- 관리자 PIN
- QR 미션 수량과 제목

## 납품 방법
1. 앱 배포 URL 확정
2. `DELIVERY_BASE_URL=https://실제주소 npm run build`
3. `npm run verify`
4. `02_qr_set/print/qr_cards.html`에서 인쇄/PDF 저장
5. `11_print_ready/index.html`에서 전체 인쇄물 확인
6. 교사용 매뉴얼과 리허설 체크리스트 전달
