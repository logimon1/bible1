# Bible1 workspace

이 저장소는 사용 목적에 따라 두 개의 최상위 작업 영역으로 분리되어 있습니다.

| 폴더 | 용도 | 배포/실행 기준 |
| --- | --- | --- |
| `delivery/` | 교회 납품·판매용 제품과 인쇄 패키지 | 웹앱은 `delivery/app`, 인쇄물은 `delivery/print-package` |
| `current-retreat/` | 이번 수련회에서 실제 사용할 앱 | Vercel Root Directory `current-retreat` |

## 납품용

- 웹앱: [`delivery/app/`](delivery/app/)
- QR·PDF·인쇄 패키지: [`delivery/print-package/`](delivery/print-package/)
- 안내: [`delivery/README.md`](delivery/README.md)

## 이번 수련회 사용용

- 실제 행사 앱: [`current-retreat/`](current-retreat/)
- 운영 및 배포 안내: [`current-retreat/README.md`](current-retreat/README.md)

두 영역은 별도 앱과 별도 운영 데이터로 취급합니다. 납품용 변경을 이번 수련회 앱에 자동 반영하거나, 이번 수련회 데이터를 납품용 앱에 복사하지 않습니다.
