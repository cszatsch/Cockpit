<#
  RISE Cockpit installé : chemins, configuration et serveur PostgreSQL embarqué (fonctions communes à l'installateur
  et aux lanceurs « Démarrer Cockpit » / « Arrêter Cockpit »).
    - programmes : %LOCALAPPDATA%\Programs\RISE Cockpit (application, Node.js et PostgreSQL embarqués) ;
    - données    : %LOCALAPPDATA%\RISE Cockpit (base, fichiers déposés, configuration, journaux).
  Aucun droit d'administrateur n'est nécessaire.
#>
$ErrorActionPreference = 'Continue'
$Programmes = Join-Path $env:LOCALAPPDATA 'Programs\RISE Cockpit'
$Donnees    = Join-Path $env:LOCALAPPDATA 'RISE Cockpit'
$PgData     = Join-Path $Donnees 'base'
$Stockage   = Join-Path $Donnees 'fichiers'
$Journaux   = Join-Path $Donnees 'journaux'
$Config     = Join-Path $Donnees 'config.env'
$Node       = Join-Path $Programmes 'runtime\node\node.exe'
$PgBin      = Join-Path $Programmes 'runtime\pgsql\bin'
$Backend    = Join-Path $Programmes 'app\backend'
# Ports (variables RISE_PORT_APP / RISE_PORT_PG : essais d'installation à côté d'une autre instance).
$PortApp    = if ($env:RISE_PORT_APP) { [int]$env:RISE_PORT_APP } else { 3000 }
$PortPg     = if ($env:RISE_PORT_PG) { [int]$env:RISE_PORT_PG } else { 5439 }

function Ok([string]$m)    { Write-Host "  [OK] $m" -ForegroundColor Green }
function Etape([string]$m) { Write-Host ''; Write-Host "» $m" -ForegroundColor Cyan }
function Echec([string]$m) { Write-Host ''; Write-Host "  [ERREUR] $m" -ForegroundColor Red; Write-Host ''; exit 1 }

# Configuration de l'application (fichier clé=valeur), appliquée à l'environnement du processus.
function Lire-Config {
  $c = @{}
  if (Test-Path -LiteralPath $Config) {
    foreach ($l in Get-Content -LiteralPath $Config -Encoding UTF8) {
      if ($l -match '^\s*([A-Z_][A-Z0-9_]*)=(.*)$') { $c[$Matches[1]] = $Matches[2] }
    }
  }
  return $c
}
function Appliquer-Config { foreach ($e in (Lire-Config).GetEnumerator()) { Set-Item -Path "env:$($e.Key)" -Value $e.Value } }

function Processus-SurPort([int]$port) {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | Where-Object { $_ -gt 4 }
}
function Application-Repond {
  try { return (Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 "http://localhost:$PortApp/api/docs").StatusCode -eq 200 } catch { return $false }
}
function Pg-Pret { & (Join-Path $PgBin 'pg_isready.exe') -h localhost -p $PortPg -q; return $LASTEXITCODE -eq 0 }
function Demarrer-Pg {
  if (Pg-Pret) { return }
  New-Item -ItemType Directory -Force -Path $Journaux | Out-Null
  # Processus détaché : le serveur hérite sinon du flux de sortie et PowerShell attend indéfiniment sa fermeture.
  Start-Process -FilePath (Join-Path $PgBin 'pg_ctl.exe') -ArgumentList @('-D', "`"$PgData`"", '-l', "`"$(Join-Path $Journaux 'postgresql.log')`"", '-o', "`"-p $PortPg`"", 'start') -WindowStyle Hidden | Out-Null
  for ($i = 0; $i -lt 60; $i++) { if (Pg-Pret) { return } Start-Sleep -Seconds 1 }
  Echec "le serveur de base de données ne démarre pas (voir $Journaux\postgresql.log)."
}
function Arreter-Pg {
  if (Test-Path (Join-Path $PgData 'postmaster.pid')) { & (Join-Path $PgBin 'pg_ctl.exe') -D $PgData -m fast -w stop | Out-Null }
}
# Application : processus Node.js embarqué qui écoute sur le port de l'application.
function Arreter-Application {
  foreach ($id in @(Processus-SurPort $PortApp)) {
    $p = Get-Process -Id $id -ErrorAction SilentlyContinue
    if ($p -and $p.Path -and ($p.Path -ieq $Node)) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
  }
}
function Demarrer-Application {
  if (Application-Repond) { return }
  $autres = @(Processus-SurPort $PortApp) | Where-Object { $p = Get-Process -Id $_ -ErrorAction SilentlyContinue; -not ($p -and $p.Path -ieq $Node) }
  if ($autres) { Echec "le port $PortApp est déjà utilisé par un autre programme. Fermez-le puis relancez." }
  Appliquer-Config
  New-Item -ItemType Directory -Force -Path $Journaux | Out-Null
  Start-Process -FilePath $Node -ArgumentList 'dist/main.js' -WorkingDirectory $Backend -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $Journaux 'cockpit.log') -RedirectStandardError (Join-Path $Journaux 'cockpit-erreurs.log') | Out-Null
  for ($i = 0; $i -lt 90; $i++) { if (Application-Repond) { return } Start-Sleep -Seconds 1 }
  Echec "l'application ne répond pas (voir $Journaux\cockpit-erreurs.log)."
}
