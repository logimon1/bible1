# 교회 QR RPG 운영 세트

수련회 또는 한 달 챌린지에서 사용할 수 있는 웹앱형 QR RPG MVP입니다. 학생은 휴대폰 기본 카메라로 QR을 찍어 미션에 접속하고, 서버 기준으로 보상/장비/랭킹이 반영됩니다.

## 구조

- `public/`: 학생/관리자 화면 SPA
- `api/app.js`: Vercel Serverless API 진입점
- `server/`: 게임 로직, DB 저장소, 프로그램 설정
- `config/program.config.json`: 납품 1건 기준 운영 설정
- `schema.sql`: Supabase/Postgres 스키마
- `scripts/`: 로컬 서버, 스모크 테스트, 데모 데이터

## 운영 모드

- `retreat`: 1~3일 수련회 집중형
- `monthly`: 4주 챌린지형

기본값은 `config/program.config.json`의 `programMode`입니다. Vercel 환경변수 `PROGRAM_MODE`로 배포별 override가 가능합니다.

## 로컬 실행

```bash
npm install
npm run dev
```

기본 주소는 `http://127.0.0.1:8765`입니다.

## 검증 명령

```bash
npm run doctor
npm run check
npm run smoke
npm run build
npm test
```

배포 URL 리허설:

```bash
REHEARSAL_BASE_URL=https://your-project.vercel.app npm run rehearsal
```

실제 테스트 학생까지 만들려면:

```bash
REHEARSAL_BASE_URL=https://your-project.vercel.app REHEARSAL_ADMIN_PIN=your-pin REHEARSAL_WRITE=1 npm run rehearsal
```

## 필수 환경변수

- `DATABASE_URL`: Vercel/production 필수. Supabase Transaction pooler 또는 Direct connection URL.
- `ADMIN_PIN`: 관리자 화면 접근 코드.

선택 환경변수:

- `PROGRAM_CONFIG_FILE`
- `PROGRAM_MODE`
- `CHURCH_NAME`
- `EVENT_NAME`
- `EVENT_START_DATE`
- `EVENT_END_DATE`
- `PARTICIPANT_LIMIT`
- `CURRENT_WEEK`
- `TEAM_MODE`

## 주요 URL

- `/`: 학생 입장
- `/mission/:code`: 일반 QR 미션
- `/hidden/:code`: 히든 QR
- `/boss`: 보스전
- `/ranking`: 개인 랭킹
- `/team-ranking`: 팀 랭킹
- `/monthly`: 월간 미션
- `/exchange/1`, `/exchange/2`: 교환소
- `/admin`: 관리자
- `/admin/print/qr`: QR 카드 출력
- `/admin/print/equipment`: 장비 카드 출력
- `/admin/print/exchange`: 교환소 포스터
- `/admin/print/checklist`: 비상 체크리스트

## 문서

- `SETUP.md`: 로컬 준비
- `SUPABASE.md`: DB 설정
- `DEPLOYMENT.md`: Vercel 배포
- `OPERATION_GUIDE.md`: 현장 운영
- `PRINT_GUIDE.md`: 인쇄물 출력
- `MONTHLY_MODE_GUIDE.md`: 한 달 모드
- `RETREAT_MODE_GUIDE.md`: 수련회 모드
