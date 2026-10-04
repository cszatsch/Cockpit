<#
  « Arrêter Cockpit » : arrête l'application et la base de données.
#>
. (Join-Path $PSScriptRoot 'commun.ps1')
Write-Host ''
Write-Host '  RISE Cockpit — arrêt' -ForegroundColor White
Arreter-Application
Ok 'application arrêtée'
Arreter-Pg
Ok 'base de données arrêtée'
Start-Sleep -Seconds 2
