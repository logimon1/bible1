# AI Agent Working Guide

이 저장소는 세 영역이 함께 있습니다. 다음 작업자는 먼저 이 역할 구분을 확인하고 움직입니다.

## Active Areas

- `productized-qr-rpg/`: 교회 납품/판매용 제품화 앱입니다. 신규 기능, 배포, Supabase, 관리자, monthly/retreat 모드는 기본적으로 이 폴더를 수정합니다.
- `extra/`: 인쇄물/QR/PDF/납품 패키지 생성기입니다. 앱 기능이 아니라 산출물 제작과 검증을 담당합니다.
- repository root app (`app.js`, `server/`, `api/`, `styles.css`): 기존 수련회 MVP/legacy 앱입니다. 사용자가 명시하지 않으면 새 기능을 여기에 추가하지 않습니다.

## Vercel Deployment

- 제품화 앱을 배포할 때 Vercel Root Directory는 `productized-qr-rpg`로 설정합니다.
- `productized-qr-rpg/vercel.json`의 `outputDirectory`는 `public`입니다.
- production/Vercel에는 `DATABASE_URL`과 `ADMIN_PIN`이 필요합니다.

## Common Commands

루트 legacy 앱:

```bash
npm run check
npm run smoke
```

제품화 앱:

```bash
cd productized-qr-rpg
npm run doctor
npm run check
npm run smoke
```

납품 패키지:

```bash
cd extra
npm run check
```

## Editing Rules

- `node_modules/`, `.data/`, `.env`, `.vercel/`은 커밋하지 않습니다.
- `extra/11_print_ready/*.pdf`와 `productized-qr-rpg/public/assets/*.png`는 현재 백업/납품용으로 추적됩니다. 대체 이미지를 만들 때만 갱신합니다.
- `extra/10_image_assets/production_svg/`가 납품용 SVG 기준입니다. 예전 placeholder SVG 폴더를 다시 만들지 않습니다.
- QR 본체는 AI 이미지로 만들지 않습니다. QR은 `qrcode` 라이브러리 또는 앱 API로 생성합니다.
- 사용자가 “기존 앱”이라고 명시하지 않으면 `productized-qr-rpg/` 기준으로 작업합니다.
