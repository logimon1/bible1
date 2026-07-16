# 7단계 완료 검수표

## 목표
사용자가 요청한 "제안한 7단계까지 작업 모두 진행" 범위를 납품 패키지 산출물로 구현했는지 확인합니다.

## 검수 결과
| 단계 | 요구 | 증거 파일 |
| --- | --- | --- |
| 1 | 제품 골격 확정 | 01_brand/brand_system.md, 12_guides/production_roadmap.md |
| 2 | 콘텐츠 원고 제작 | 08_content_retreat/retreat_content.md, 09_content_monthly/monthly_content.md |
| 3 | 기능성 자산 제작 | 02_qr_set/svg/*.svg, 02_qr_set/data/qr_index.json, 13_app_data/*.json, 12_guides/admin_operation_table.md |
| 4 | 핵심 비주얼 제작 | 10_image_assets/production_svg/*.svg, 10_image_assets/prompts/ai_generation_prompts.md |
| 5 | 인쇄물 편집/PDF 생성 | 03~07 print HTML, 11_print_ready/*.pdf |
| 6 | 현장 리허설 | 12_guides/rehearsal_checklist.md, 12_guides/rehearsal_report.md |
| 7 | 납품 패키지화 | 00_README.md, 12_guides/handoff_manifest.md, npm run verify |

## 자동 검증
`npm run check`는 다음을 확인합니다.

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
- 실제 Vercel 주소로 `DELIVERY_BASE_URL`을 지정해 QR을 다시 생성해야 합니다.
- 종이 출력 후 학생 휴대폰 기본 카메라로 QR 스캔 리허설이 필요합니다.
- 교사 1명이 관리자 화면에서 수동 지급, 교환소 초기화, CSV 다운로드를 실제로 눌러 봐야 합니다.
