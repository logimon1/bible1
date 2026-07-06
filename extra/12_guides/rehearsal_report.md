# 현장 리허설 실행 보고서

이 문서는 6단계 현장 리허설을 납품 전 검증 항목으로 고정하기 위한 보고서입니다. 자동 검증은 통과했지만, 실제 휴대폰 카메라와 출력물 스캔은 행사 URL 확정 후 반드시 한 번 더 진행합니다.

## 자동 검증 증거
- 앱 기능 검증: `productized-qr-rpg` 폴더에서 `npm.cmd run smoke`
- 패키지 산출물 검증: `extra` 폴더에서 `npm.cmd run check`
- QR/미션 동기화 검증: 앱 설정의 미션 코드와 납품 QR index 코드 비교

| 시나리오 | 검증 방법 | 상태 | 비고 |
| --- | --- | --- | --- |
| 학생 2명 생성 | productized-qr-rpg smoke | 통과 | 학생 A/B 생성과 재접속 흐름 확인 |
| QR 보상 지급 | productized-qr-rpg smoke | 통과 | 미션 완료 후 보상 반영 확인 |
| QR 중복 방지 | productized-qr-rpg smoke | 통과 | 같은 QR 재접속 시 중복 보상 차단 |
| 교환소 흐름 | productized-qr-rpg smoke | 통과 | 두 학생 교환 처리와 인벤토리 갱신 확인 |
| 관리자 확인 | productized-qr-rpg smoke | 통과 | 참가자/보상/상태 조회 흐름 확인 |
| 인쇄물 생성 | extra npm.cmd run check | 통과 | PDF 6종과 print-ready HTML 생성 |
| QR SVG 생성 | extra npm.cmd run check | 통과 | QR index와 SVG 파일 연결 확인 |

## 실제 현장 리허설에서 남은 확인
- 실제 Vercel 주소로 `DELIVERY_BASE_URL=https://실제배포주소 npm.cmd run build`를 실행한 뒤 QR을 다시 출력합니다.
- 학생 휴대폰 2대와 교사용 휴대폰 1대로 기본 카메라 스캔을 확인합니다.
- QR 카드 1장, 히든 QR 1장, 교환소 QR 1장을 실제 출력물로 스캔합니다.
- 관리자 PIN, 데이터 초기화, CSV 다운로드를 교사가 직접 실행해 봅니다.
- 인터넷이 느린 환경에서 버튼 연타 시 중복 보상이 막히는지 확인합니다.
