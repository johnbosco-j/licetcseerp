@echo off
title LICET Attendance Station
cd /d "%~dp0\.."
where node >nul 2>nul || (echo Node.js 18+ is required: https://nodejs.org & pause & exit /b 1)
if not exist node_modules ( echo Installing once... & call npm install --no-audit --no-fund )
start "Classroom Wi-Fi" powershell -NoExit -ExecutionPolicy Bypass -File "%~dp0start-hotspot.ps1"
timeout /t 3 >nul
start "" http://localhost:7070
node server.mjs
pause
