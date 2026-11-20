@echo off
title RoboAI Setup
cd /d "%~dp0"
echo ========================================
echo              RoboAI Setup
echo ========================================
echo.
if not exist package.json (
  echo ERROR: package.json was not found.
  echo Extract the complete GitHub ZIP first, then run this file from the extracted folder.
  pause
  exit /b 1
)
where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js/npm is not installed.
  echo Install the LTS version of Node.js from https://nodejs.org/ and run this file again.
  pause
  exit /b 1
)
echo Installing RoboAI dependencies...
call npm.cmd install
if errorlevel 1 (
  echo.
  echo Installation failed. Check the error above.
  pause
  exit /b 1
)
echo.
echo Starting RoboAI...
start "" http://127.0.0.1:4317
call npm.cmd start
pause
