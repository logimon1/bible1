@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install Node.js first.
  pause
  exit /b 1
)

if not exist "node_modules\pg\package.json" (
  echo Installing server dependencies...
  call npm.cmd ci
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

set "ADMIN_PIN="
set /p "ADMIN_PIN=Create a teacher PIN for this LAN session: "
if not defined ADMIN_PIN (
  echo A teacher PIN is required.
  pause
  exit /b 1
)

echo Starting the retreat LAN test server...
call npm.cmd run start:lan
if errorlevel 1 pause
