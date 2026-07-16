# SUPABASE

## 1. 프로젝트 생성

Supabase에서 새 프로젝트를 만들고 Database password를 보관합니다.

## 2. 스키마 적용

Supabase SQL Editor에서 `schema.sql` 전체를 실행합니다.

그 다음 `supabase.seed.sql`을 실행해 프로그램, 장비, 미션 목록을 초기 등록합니다.

설정 파일을 수정했다면 seed SQL을 다시 생성합니다.

```bash
npm run export:seed-sql
```

핵심 테이블:

- `players`
- `inventory`
- `missions`
- `mission_completions`
- `reward_transactions`
- `draw_logs`
- `exchange_sessions`
- `exchange_transactions`
- `event_logs`
- `admin_logs`
- `settings`

## 3. 중복 보상 방지

`mission_completions`에는 아래 unique 제약이 있습니다.

```sql
unique (player_id, mission_code)
```

같은 학생이 같은 QR을 여러 번 완료해도 DB 기준으로 중복 기록이 들어가지 않습니다.

## 4. 연결 문자열

Vercel 환경변수 `DATABASE_URL`에 Supabase Postgres 연결 문자열을 넣습니다.

권장:

- 소규모 행사: Supabase Transaction pooler URL
- 로컬 확인: Direct connection URL도 가능

주의:

- `service_role` key를 프론트에 넣지 않습니다.
- 이 앱은 Supabase JS SDK가 아니라 Postgres 연결 문자열을 사용합니다.
- Vercel/production에서 `DATABASE_URL`이 없으면 파일 DB로 진행하지 않고 명확한 서버 오류를 반환합니다.

## 5. RLS

이 MVP는 클라이언트가 Supabase에 직접 접속하지 않습니다. API 서버가 `DATABASE_URL`로 DB에 접근합니다. 따라서 브라우저에 anon/service key를 노출하지 않습니다.

나중에 Supabase 클라이언트 직접 접근 구조로 바꾸는 경우 RLS 정책을 별도로 설계해야 합니다.
