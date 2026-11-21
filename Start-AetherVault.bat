@echo off
title AetherVault MTG Inventory & Deck Builder (Auto-KeepAlive)
cd /d "%~dp0"
echo ===================================================================
echo   AetherVault MTG Collection Inventory ^& Deck Builder
echo   Starting local database server at http://localhost:3000 ...
echo   (Auto-KeepAlive Watchdog Enabled - Server will stay running!)
echo ===================================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
node --no-warnings server/index.mjs --open

:watchdog
echo.
echo [Watchdog] Server stopped or restarted. Relaunching in 1 second...
timeout /t 1 /nobreak >nul
node --no-warnings server/index.mjs
goto watchdog
