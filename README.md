# 시련의 숲: 전신갑주 전략전

2박 3일 중고등부 수련회용 전신갑주 RPG 서버형 MVP입니다. 학생 20명 내외가 휴대폰 기본 카메라로 QR URL에 접속하고, 장비 뽑기/수집/교환/시련의 숲을 진행하는 흐름을 지원합니다.

## 핵심 기능

- 학생 이름 + 조 + 4자리 입장코드 기반 캐릭터 생성/재접속
- 6종 전신갑주 수집
- B/A/S 3등급 자동 강화
  - B + B + B = A
  - A + A + A = S
- 1뽑기 / 2뽑기 / 3뽑기 랜덤박스
- 장비전투력 기준 랭킹
- 교환소 1 / 교환소 2
  - 각 교환소는 동시에 2명만 입장
  - 각자 최대 2칸 장비 제시
  - 양쪽 동의 후 서버가 동시에 교환 처리
- QR 보상 claim
  - 학생 1명당 같은 QR은 1회만 보상
  - `qr_claims(player_id, qr_code)` unique 제약으로 중복 지급 방지
- 교사 관리자 화면
- 시련의 숲 갑주별 미션/베네핏 안내

## 기술 구조

- 정적 프론트: `index.html`, `styles.css`, `app.js`
- Vercel API: `api/app.js`
- 서버 로직: `server/`
- DB: Postgres `DATABASE_URL`
  - Neon Postgres 권장
  - Supabase를 쓰는 경우 Supabase 프로젝트의 Postgres connection string을 `DATABASE_URL`로 사용
- 로컬 개발 DB: `.data/dev-db.json`

Vercel/production 환경에서는 `DATABASE_URL`이 반드시 필요합니다. 운영 환경에서 `DATABASE_URL`이 없으면 파일 DB로 진행하지 않고 서버 오류를 반환합니다.

## 로컬 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://127.0.0.1:8765`를 엽니다.

검증 명령:

```bash
npm run check
npm run smoke
npm run lint
npm run build
npm test
```

`smoke`는 별도 테스트 서버와 `.data/smoke-db.json`을 사용하므로 기존 `.data/dev-db.json` 리허설 데이터는 초기화하지 않습니다.

## DB 설정

1. Neon 또는 Supabase에서 Postgres DB를 만듭니다.
2. SQL 콘솔에서 `schema.sql` 전체를 실행합니다.
3. Vercel 환경변수에 다음을 등록합니다.

```text
DATABASE_URL=postgresql://...
ADMIN_PIN=원하는관리자PIN
```

기존 DB에 적용하는 경우에도 `schema.sql`을 다시 실행하면 됩니다. `access_code`, `qr_claims`, 교환소 기본 데이터가 없으면 생성됩니다.

## Vercel 배포

```bash
npm install
npm run check
npm run smoke
npm i -g vercel
vercel
vercel --prod
```

Vercel 프로젝트 환경변수에 `DATABASE_URL`, `ADMIN_PIN`을 등록한 뒤 재배포합니다.

## QR URL 정책

이 앱은 clean URL을 기준으로 운영합니다. Vercel rewrite와 로컬 dev fallback이 설정되어 있어 휴대폰 기본 카메라로 아래 주소를 직접 열 수 있습니다.

- 홈: `/`
- 랭킹: `/ranking`
- 교환소: `/exchange/1`, `/exchange/2`
- 시련의 숲: `/forest`
- 관리자: `/admin`
- 미션 QR: `/mission/truth`, `/mission/shield`, `/mission/sword`
- 히든 QR: `/hidden/forest-cache-1`, `/hidden/forest-cache-2`
- 보스/최종 보급: `/boss`

기존 hash URL도 일부 호환되지만, 새 QR은 clean URL로 생성하세요.

## 관리자 화면

`/admin`에서 접근합니다.

관리자 기능:

- 학생 목록/랭킹 확인
- 학생별 입장코드 확인
- 교환소 1/2 상태 확인
- 교환소 강제 초기화
- 학생 장비 수동 추가/삭제
- QR 보상 링크 확인
- 최근 로그 확인

## 배포 대상 파일

GitHub/Vercel 배포에 필요한 파일:

- `index.html`
- `app.js`
- `styles.css`
- `api/`
- `server/`
- `scripts/dev-server.js`
- `scripts/smoke-test.js`
- `assets/armor/`
- `assets/ui/warrior-shadow.png`
- `schema.sql`
- `package.json`
- `package-lock.json`
- `vercel.json`
- `.github/workflows/ci.yml`

배포 대상이 아닌 생성 원본/로컬 파일은 `.gitignore`로 제외합니다.

## 수련회 전 리허설 체크리스트

1. Vercel production URL 접속 확인
2. `/api/app?action=state`가 정상 응답하는지 확인
3. 새 학생 2명 생성
4. 각 학생 입장코드가 홈/관리자에서 보이는지 확인
5. 1뽑기/2뽑기/3뽑기 실행
6. B 3개가 A로 자동 합성되는지 확인
7. `/mission/truth` QR 보상 1회 지급 확인
8. 같은 QR 재접속 시 중복 지급이 막히는지 확인
9. 교환소 1/2에서 두 학생이 입장/선택/동의/완료되는지 확인
10. 교환 후 양쪽 인벤토리와 랭킹 갱신 확인
11. 관리자에서 교환소 초기화 확인
12. 현장 교사 휴대폰과 학생 휴대폰 각각에서 Safari/Chrome 접속 확인

## 주의사항

- 이 MVP는 행사 내부 운영용입니다. 외부 공개 게임처럼 강한 인증을 제공하지 않습니다.
- 관리자 PIN은 짧은 숫자보다 긴 문자열을 사용하세요.
- 교환소는 선생님 앞에서 줄을 세워 운영하는 것을 전제로 합니다.
- 랭킹은 WebSocket이 아니라 3~5초 polling 방식입니다.
- 교환소 입장 상태는 10분 후 자동 만료되어 다음 요청 시 초기화됩니다.
- 운영 전에는 반드시 실제 Vercel URL과 실제 DB로 리허설하세요.
