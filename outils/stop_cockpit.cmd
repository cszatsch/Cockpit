@echo off
rem RISE : arrete l'application et le serveur PostgreSQL personnel.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_cockpit.ps1" -Arreter
echo.
pause
