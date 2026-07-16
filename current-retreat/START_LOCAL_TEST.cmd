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

echo Starting the retreat local test server...
call npm.cmd run start:test
if errorlevel 1 pause
