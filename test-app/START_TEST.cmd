@echo off
REM ============================================================
REM  [TEST BUILD] 전신갑주 테스트 서버
REM  - 포트 8790 (원본과 동시 실행 가능)
REM  - MIN_ROSTER=1 : 혼자서도 조 확정/THE WAR 가능
REM  - TEST_MODE=1  : 1인이 6개 역할 전부 배정 가능
REM  화면 우하단 "TEST 패널"로 로그인 후 모든 기능 테스트.
REM ============================================================
cd /d %~dp0
set PORT=8790
set MIN_ROSTER=1
set TEST_MODE=1
node scripts/dev-server.js
pause
