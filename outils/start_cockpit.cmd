@echo off
rem RISE Cockpit : lance start_cockpit.ps1 (double-clic possible, sans modifier la politique d'execution de Windows).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_cockpit.ps1" %*
echo.
pause
