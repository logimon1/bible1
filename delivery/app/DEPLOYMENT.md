# DEPLOYMENT

## Vercel 설정

Project Settings:

- Framework Preset: Other
- Build Command: `npm run build`
- Output Directory: `public`
- Install Command: `npm install`

`vercel.json`에도 `buildCommand`, `installCommand`, `outputDirectory`를 명시했습니다. Vercel 프로젝트 설정과 파일 설정이 충돌하면 파일 설정을 기준으로 확인합니다.

`vercel.json`은 SPA clean path를 `index.html`로 rewrite합니다.

## 환경변수

필수:

- `DATABASE_URL`
- `ADMIN_PIN`
- `DELIVERY_BASE_URL` (예: `https://armor.example-church.kr`)

선택:

- `PROGRAM_MODE`
- `CHURCH_NAME`
- `EVENT_NAME`
- `EVENT_START_DATE`
- `EVENT_END_DATE`
- `PARTICIPANT_LIMIT`
- `CURRENT_WEEK`
- `TEAM_MODE`
- `PROGRAM_CONFIG_FILE`

## 배포 전 확인

```bash
npm run doctor
npm run export:seed-sql
npm run check
npm run smoke
npm run build
npm test
```

## QR URL 정책

이 제품 폴더는 clean path를 기준으로 합니다.

- 일반 미션: `/mission/{mission-code}`
- 히든 QR: `/hidden/{mission-code}`
- 보스전: `/boss`
- 교환소: `/exchange/1`, `/exchange/2`

Vercel rewrite와 로컬 dev fallback이 같은 정책을 따릅니다.

## 리허설 체크리스트

- Vercel Production URL 접속
- 새 학생 생성
- 같은 이름+조+입장코드 재접속
- 일반 QR 1개 완료
- 같은 QR 재접속 시 중복 지급 방지 확인
- 관리자 PIN 로그인
- CSV 다운로드
- QR 출력 페이지 인쇄 미리보기
- 휴대폰 LTE/5G에서 직접 접속
- 선생님 1명, 학생 2명으로 교환소 테스트

배포 URL read-only 리허설:

```bash
REHEARSAL_BASE_URL=https://your-project.vercel.app npm run rehearsal
```

운영 DB에 테스트 학생을 1명 만들어 실제 보상 중복 방지까지 확인:

```bash
REHEARSAL_BASE_URL=https://your-project.vercel.app REHEARSAL_ADMIN_PIN=your-pin REHEARSAL_WRITE=1 npm run rehearsal
```
