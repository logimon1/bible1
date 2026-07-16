# SETUP

## 사전 준비

- Node.js 20 이상 권장
- npm 사용
- Vercel 배포 시 Supabase Postgres 필요

## 설치

```bash
npm install
```

## 로컬 개발

```bash
npm run dev
```

로컬에서는 `DATABASE_URL`이 없어도 `.data/dev-db.json` 파일 DB로 실행됩니다. 단, Vercel/production에서는 파일 DB를 사용하지 않고 서버 오류를 반환합니다.

## 설정 변경

기본 운영 설정은 `config/program.config.json`에서 수정합니다.

자주 바꾸는 값:

- `programMode`: `retreat` 또는 `monthly`
- `churchName`
- `eventName`
- `eventStartDate`
- `eventEndDate`
- `participantLimit`
- `currentWeek`
- `qrSet`
- `equipmentSet`

배포마다 값이 다르면 Vercel 환경변수로 override합니다.

## 데모 데이터

```bash
npm run seed:demo
```

기본 출력 파일은 `.data/demo-db.json`입니다. 실제 운영 파일인 `.data/dev-db.json`과 섞이지 않습니다.

데모 파일로 실행하려면:

```bash
DATA_FILE=.data/demo-db.json npm run dev
```

PowerShell:

```powershell
$env:DATA_FILE=".data/demo-db.json"; npm run dev
```

## 배포 전 자체 점검

```bash
npm run doctor
```

이 명령은 `public/`, API, Vercel 설정, DB 스키마 중복 제약, 운영 설정 파일을 점검합니다.
