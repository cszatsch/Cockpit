@echo off
rem RISE Cockpit : installation sur ce poste (double-clic, sans droit d'administrateur).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0installation\installer.ps1"
echo.
pause
