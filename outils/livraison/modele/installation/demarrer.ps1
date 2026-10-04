<#
  « Démarrer Cockpit » : démarre la base de données et l'application, puis ouvre Cockpit dans le navigateur.
#>
. (Join-Path $PSScriptRoot 'commun.ps1')
Write-Host ''
Write-Host '  RISE Cockpit — démarrage' -ForegroundColor White
if (-not (Test-Path -LiteralPath $Config)) { Echec "RISE Cockpit n'est pas installé : lancez installer_cockpit.cmd depuis le dossier extrait du ZIP." }
Demarrer-Pg
Ok 'base de données démarrée'
Demarrer-Application
Ok "application prête sur http://localhost:$PortApp"
Start-Process "http://localhost:$PortApp/connexion"
Write-Host ''
Write-Host "  Cockpit : http://localhost:$PortApp/connexion"
Write-Host "  Console : http://localhost:$PortApp/console/connexion"
Write-Host '  Pour arrêter : raccourci « Arrêter Cockpit ».'
Start-Sleep -Seconds 4
