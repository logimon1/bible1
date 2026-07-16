# 납품용 제품

이 폴더는 다른 교회에 납품·판매할 제품만 보관합니다. 이번 수련회 실사용 앱은 `../current-retreat/`에 있습니다.

## 구성

- `app/`: 교회별 설정, Supabase/Postgres, 관리자, 수련회·월간 모드를 제공하는 제품화 웹앱
- `print-package/`: QR 카드, 워크북, 교사용 매뉴얼, 장비카드, 포스터, 스티커와 PDF 생성기

## 실행

```bash
cd delivery/app
npm run doctor
npm run check
npm run smoke
```

```bash
cd delivery/print-package
npm run check
```

Vercel Root Directory는 `delivery/app`입니다. 실제 QR/PDF 생성 전에는 `DELIVERY_BASE_URL`을 확정된 납품 앱 URL로 설정합니다.
