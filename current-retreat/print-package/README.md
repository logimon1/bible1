# 이번 수련회 QR 인쇄 패키지

`current-retreat` 전용 인쇄물 생성기입니다. 납품용 `delivery/print-package`와 코드·데이터·출력물을 섞지 않습니다.

## 생성되는 인쇄물

- `00_retreat_qr_print_bundle.pdf`: 전체 9쪽 합본
- `01_game_entry_the_war.pdf`: 게임 입장, 랭킹, THE WAR
- `02_team_war_checkin.pdf`: 파티원 전원이 같은 QR을 스캔하는 THE WAR 공동 체크인
- `03_draw_reward_set.pdf`: 무작위 장비 1·2·3회 반복 뽑기 보상 QR
- `04_exchange_booth_1.pdf`: 교환소 1 A4 포스터
- `05_exchange_booth_2.pdf`: 교환소 2 A4 포스터
- `06_mission_hidden_boss.pdf`: 능력별 마귀 미션 6종, 히든 2종, 최종 보상
- `07_teacher_operations.pdf`: 교사용 관리자·서버 상태 확인
- `output/qr/*.png`: 실제 QR 원본 PNG
- `output/qr/qr_manifest.json`, `output/qr/qr_manifest.csv`: QR 주소 목록

모든 PDF는 `output/pdf/`에 생성됩니다. 장비 1·2·3회 뽑기 QR은 게임 보상 횟수만큼 반복 사용할 수 있습니다.

## 준비

Python 3.11 이상을 권장합니다.

```powershell
python -m pip install -r requirements.txt
```

## 앱 경로만 사전 점검

배포 URL이 정해지기 전에는 PDF를 만들지 않고 다음 명령으로 앱 경로와 필수 이미지만 확인합니다.

```powershell
python generate_print_package.py --check
```

## 실제 인쇄물 생성

Vercel 운영 주소가 확정된 뒤 실행합니다. 예시 주소를 그대로 쓰면 생성기가 중단됩니다.

```powershell
python generate_print_package.py --base-url "https://실제-수련회-주소.vercel.app"
```

환경 변수도 지원합니다.

```powershell
$env:RETREAT_BASE_URL = "https://실제-수련회-주소.vercel.app"
python generate_print_package.py
```

로컬 디자인 검수용 출력은 최종 폴더와 분리해야 합니다.

```powershell
python generate_print_package.py --base-url "http://127.0.0.1:8787" --allow-local-preview --output-root "tmp/pdfs/preview"
```

## 인쇄 권장값

- A4, 실제 크기 100%, 자동 맞춤 해제
- 컬러, 고품질, 양면 해제
- QR 주변 여백을 자르지 않기
- 장비 뽑기 QR은 게임 보상 횟수만큼 반복 사용
- THE WAR 공동 체크인 QR은 파티원 모두 각자 스캔하고, 전원 완료 후 역할 배분 화면으로 이동
- 교사용 운영 시트는 학생 게시용으로 사용하지 않기
