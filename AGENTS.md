# AI Agent Working Guide

이 저장소는 목적이 다른 두 영역으로만 구분합니다. 두 영역의 코드, 데이터, 배포 설정, 인쇄물을 서로 섞지 않습니다.

## Active Areas

- `delivery/`: 교회 납품·판매용 제품입니다.
  - `delivery/app/`: 교회별 제품화 웹앱, Supabase, 관리자, monthly/retreat 모드
  - `delivery/print-package/`: 인쇄물, QR, PDF, 납품 패키지 생성기
- `current-retreat/`: 이번 수련회에서 실제 사용할 독립 앱입니다. 이번 행사 기능, 현장 리허설, 실제 운영 데이터는 이 폴더만 수정합니다.

사용자가 “납품”, “판매”, “교회별”, “월간 모드”라고 하면 `delivery/`를 사용합니다. “이번 수련회”, “이번 행사”, “현장 사용”이라고 하면 `current-retreat/`를 사용합니다. 범위가 불명확하면 두 영역을 동시에 수정하지 말고 먼저 대상을 확인합니다.

## Vercel Deployment

- 납품용 앱 Root Directory: `delivery/app`
- 이번 수련회 앱 Root Directory: `current-retreat`
- `delivery/app/vercel.json`의 `outputDirectory`는 `public`입니다.
- 두 앱 모두 production/Vercel에서 `DATABASE_URL`과 `ADMIN_PIN`이 필요합니다.
- 폴더 이동 후 기존 Vercel 프로젝트의 Root Directory는 대시보드에서 직접 새 경로로 변경하고 재배포해야 합니다.

## Common Commands

이번 수련회 앱:

```bash
cd current-retreat
npm run check
npm run smoke
```

납품용 앱:

```bash
cd delivery/app
npm run doctor
npm run check
npm run smoke
```

납품 인쇄 패키지:

```bash
cd delivery/print-package
npm run check
```

실제 납품 QR을 만들 때는 `DELIVERY_BASE_URL`에 확정된 납품용 앱 URL을 지정합니다.

## Editing Rules

- `node_modules/`, `.data/`, `.env`, `.vercel/`은 커밋하지 않습니다.
- `delivery/print-package/11_print_ready/*.pdf`와 `delivery/app/public/assets/*.png`는 현재 백업/납품용으로 추적됩니다. 대체 이미지를 만들 때만 갱신합니다.
- `delivery/print-package/10_image_assets/production_svg/`가 납품용 SVG 기준입니다. 예전 placeholder SVG 폴더를 다시 만들지 않습니다.
- QR 본체는 AI 이미지로 만들지 않습니다. QR은 `qrcode` 라이브러리 또는 앱 API로 생성합니다.
- 한 영역의 코드를 다른 영역에 복사하거나 동기화하는 작업은 사용자가 명시적으로 요청했을 때만 합니다.
