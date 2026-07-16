# MONTHLY MODE GUIDE

## 목적

한 달 동안 말씀 습관과 소그룹 참여를 돕는 4주 챌린지 운영 모드입니다.

## 기본 흐름

- 1주차: 진리의 허리띠 / 의의 흉배
- 2주차: 평안의 복음의 신
- 3주차: 믿음의 방패 / 구원의 투구
- 4주차: 성령의 검 / 최종 결단 미션

## 설정

`config/program.config.json`:

```json
{
  "programMode": "monthly",
  "currentWeek": 1,
  "missionUnlockPolicy": {
    "monthly": "week_index",
    "lockFutureWeeks": true
  }
}
```

Vercel 환경변수로도 설정할 수 있습니다.

```text
PROGRAM_MODE=monthly
CURRENT_WEEK=1
```

## 학생 UX

- 홈 화면에서 이번 주 진행률을 먼저 보여줍니다.
- 다음 주 미션은 잠금 상태로 안내합니다.
- 완료한 미션은 다시 접속해도 중복 보상이 지급되지 않습니다.
- 소그룹 나눔 질문을 미션 설명에 포함할 수 있습니다.

## 운영자 UX

관리자 화면에서 확인할 항목:

- 주차별 진행률
- 개인별 4주 진행률
- 팀별 누적 점수
- 미션 완료 내역
- 잠긴 QR 접속 여부

## 주차 변경

행사 주차가 바뀌면 `CURRENT_WEEK` 또는 `config/program.config.json`의 `currentWeek`를 올리고 재배포합니다.

단순 운영이라면 매주 1회 Vercel 환경변수만 수정해도 충분합니다.
