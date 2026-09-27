@echo off
rem RISE : lance demarrer-rise.ps1 (double-clic possible, sans modifier la politique d'execution de Windows).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0demarrer-rise.ps1" %*
echo.
pause
