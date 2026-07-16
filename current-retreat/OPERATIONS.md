# 실제 수련회 운영 체크리스트

## 1. 배포 전 필수 확인

1. `delivery/`와 공유하지 않는 **이번 수련회 전용 Postgres DB**인지 확인합니다.
2. DB 공급자 대시보드에서 현재 DB 백업을 먼저 생성합니다.
3. 전용 DB에 최신 `schema.sql`을 실행합니다. 이 과정에서 `app_metadata.application=current-retreat-v2` 식별자가 생성됩니다.
4. Vercel Production 환경변수에 다음 값을 모두 등록합니다.
   - `DATABASE_URL`
   - `ADMIN_PIN`
   - `THE_WAR_OPENS_AT` (`+09:00` 포함)
   - `EVENT_ENDS_AT` (`+09:00` 포함, THE WAR 공개 시각보다 뒤)
   - `PG_POOL_MAX=2`
5. 운영 환경변수를 현재 셸에 설정한 뒤 아래 검사를 실행합니다.

```powershell
npm.cmd run doctor:prod
npm.cmd run check
npm.cmd run smoke
npm.cmd run build
```

`doctor:prod`가 DB 식별자, 필수 테이블·컬럼, 쓰기 권한, 행사 시각 설정을 모두 통과해야 배포합니다.

## 2. 배포 직후 확인

- `/api/app?action=health` 응답에서 아래 값을 확인합니다.
  - `status: ready`
  - `active: true`
  - `storage: postgres`
  - `schemaReady: true`
  - `writable: true`
  - `adminConfigured: true`
  - `databaseId: current-retreat-v2`
- `/`, `/party`, `/team/merge`, `/forest`, `/admin`을 새 탭과 새로고침으로 각각 열어봅니다.
- `players` 수가 실제 사전등록·리허설 인원과 일치하는지 확인합니다. 리허설 데이터는 행사 시작 전에 운영자가 판단하여 별도 백업 후 정리합니다.
- 최신 배포 URL로 인쇄 QR을 다시 검사하고, 예전 “시험의 숲”, “팀 전신갑주 합치기” 문구가 남은 인쇄물은 사용하지 않습니다.

## 3. 현장 리허설

- 실제 운영과 같은 Wi-Fi·휴대폰으로 4~6명 파티 결성, 장비 뽑기, 전원 THE WAR 스캔, 6개 역할 배분, 미션 보상, 교환을 끝까지 수행합니다.
- 별도 리허설 DB 또는 staging 배포에서 20~30명이 동시에 THE WAR QR을 스캔하는 테스트를 합니다. Production 참가자 데이터에는 부하 테스트를 하지 않습니다.
- 동명이인은 입력 이름 뒤에 번호나 반 이름을 붙여 서로 다른 이름을 사용합니다.
- 앱 안 카메라가 지원되지 않는 기기는 휴대폰 기본 카메라로 QR을 엽니다.

## 4. 현장 복구 원칙

- 파티 확정 전에는 학생·파티장 모두 직접 탈퇴해 조 이름을 다시 입력할 수 있습니다. 확정 뒤에는 탈퇴할 수 없습니다. 이름·조 오타는 `/admin`에서 수정하고, 확정 파티의 편성 오류는 **THE WAR 첫 QR 스캔 전까지만** 교사가 `확정 파티 비상 처리`에서 재개방합니다.
- 교환 오류는 `/admin`에서 해당 교환소를 초기화합니다.
- 인터넷 장애 중 LAN 로컬 서버로 전환하면 Production DB와 자동 동기화되지 않습니다. 행사 도중 임의 전환하지 말고, 사전에 정한 오프라인 진행안으로 전환합니다.
- LAN/로컬 운영 데이터는 `.data/dev-db.json`, 직전 백업은 `.data/dev-db.json.bak`에 저장됩니다.
- 행사 종료 시각이 되면 모든 화면이 종료 안내로 바뀌며 이후 게임 API는 차단됩니다.
