@echo off
rem Cockpit : arret (application, base de donnees).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0arreter.ps1"
