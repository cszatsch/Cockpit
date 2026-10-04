<#
  Installation de RISE Cockpit (Cockpit et Console) sur ce poste, sans droit d'administrateur ni Docker.
  Lancée par installer_cockpit.cmd, depuis le dossier extrait du ZIP.
    1. copie les programmes dans %LOCALAPPDATA%\Programs\RISE Cockpit (application, Node.js, PostgreSQL) ;
    2. crée la base dans %LOCALAPPDATA%\RISE Cockpit et y charge les données livrées (projet RISE, IA, SMTP…) ;
    3. écrit la configuration (secrets de session propres à ce poste) ;
    4. crée le compte de la personne qui installe (Administrateur de la plateforme et PMO) ;
    5. crée les raccourcis « Démarrer Cockpit » et « Arrêter Cockpit » (Bureau et menu Démarrer) et ouvre Cockpit.
#>
$Paquet = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'commun.ps1')

Write-Host ''
Write-Host '═══════════════════════════════════════════' -ForegroundColor Cyan
Write-Host '  Installation de RISE Cockpit' -ForegroundColor Cyan
Write-Host '═══════════════════════════════════════════' -ForegroundColor Cyan

foreach ($f in 'app\backend\dist\main.js', 'runtime\node\node.exe', 'runtime\pgsql\bin\pg_ctl.exe', 'donnees\rise.dump', 'donnees\cle-secrets.txt') {
  if (-not (Test-Path -LiteralPath (Join-Path $Paquet $f))) { Echec "fichier manquant dans le dossier extrait : $f. Extrayez à nouveau tout le contenu du ZIP." }
}

# ───── 1. Installation précédente ─────
Etape 'Vérification du poste'
$dejaInstalle = Test-Path -LiteralPath (Join-Path $PgData 'PG_VERSION')
if (Test-Path -LiteralPath $Node) { Arreter-Application }
if ($dejaInstalle -and (Test-Path -LiteralPath $PgBin)) { Arreter-Pg }
$remplacer = $true
if ($dejaInstalle) {
  Write-Host '  RISE Cockpit est déjà installé sur ce poste.' -ForegroundColor Yellow
  $r = Read-Host '  Remplacer ses données par celles de ce paquet ? Les données actuelles seront mises de côté. (O/N)'
  $remplacer = $r -match '^[oOyY]'
}
foreach ($port in $PortApp, $PortPg) {
  if (Processus-SurPort $port) { Echec "le port $port est utilisé par un autre programme. Fermez-le puis relancez l'installation." }
}
Ok 'poste prêt'

# ───── 2. Programmes ─────
Etape 'Copie des programmes (une à deux minutes)'
New-Item -ItemType Directory -Force -Path $Programmes | Out-Null
foreach ($d in 'app', 'runtime', 'installation') {
  robocopy (Join-Path $Paquet $d) (Join-Path $Programmes $d) /MIR /NFL /NDL /NJH /NJS /NP /R:1 /W:1 | Out-Null
  if ($LASTEXITCODE -ge 8) { Echec "copie impossible du dossier « $d » vers $Programmes." }
}
Copy-Item -LiteralPath (Join-Path $Paquet 'installation\cockpit.ico') -Destination (Join-Path $Programmes 'cockpit.ico') -Force
Ok "programmes installés dans $Programmes"

# ───── 3. Données ─────
New-Item -ItemType Directory -Force -Path $Donnees, $Journaux | Out-Null
$nouveauCompte = $false
if ($remplacer) {
  Etape 'Création de la base et chargement des données'
  if ($dejaInstalle) {
    $cote = Join-Path $Donnees ('ancien-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
    New-Item -ItemType Directory -Force -Path $cote | Out-Null
    foreach ($d in $PgData, $Stockage, $Config) { if (Test-Path -LiteralPath $d) { Move-Item -LiteralPath $d -Destination $cote } }
    Ok "anciennes données mises de côté dans $cote"
  }
  & (Join-Path $PgBin 'initdb.exe') -D $PgData -U rise -A trust -E UTF8 --no-locale 2>&1 | Out-File (Join-Path $Journaux 'installation-base.log') -Encoding UTF8
  if (-not (Test-Path -LiteralPath (Join-Path $PgData 'PG_VERSION'))) { Echec "création de la base impossible (voir $Journaux\installation-base.log)." }
  Demarrer-Pg
  $psql = Join-Path $PgBin 'psql.exe'
  # Rôles de lecture de Jev (objets globaux, absents de l'export) puis base de l'application.
  # Une commande par -c : CREATE DATABASE ne s'exécute pas dans une transaction.
  & $psql -h localhost -p $PortPg -U rise -d postgres -q -v ON_ERROR_STOP=1 `
    -c 'CREATE ROLE jev_lecteur NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT' `
    -c 'CREATE ROLE jev_lecteur_cockpit NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT' `
    -c 'GRANT jev_lecteur TO rise' -c 'GRANT jev_lecteur_cockpit TO rise' -c 'CREATE DATABASE rise OWNER rise' | Out-Null
  if ($LASTEXITCODE -ne 0) { Echec 'préparation de la base impossible.' }
  & (Join-Path $PgBin 'pg_restore.exe') -h localhost -p $PortPg -U rise -d rise --no-owner (Join-Path $Paquet 'donnees\rise.dump') 2>&1 | Out-File (Join-Path $Journaux 'installation-donnees.log') -Encoding UTF8
  $n = (& $psql -h localhost -p $PortPg -U rise -d rise -tAc 'SELECT count(*) FROM \"Project\"').Trim()
  if (-not ($n -match '^\d+$') -or [int]$n -lt 1) { Echec "chargement des données incomplet (voir $Journaux\installation-donnees.log)." }
  Ok "données chargées ($n projet(s))"
  if (Test-Path -LiteralPath (Join-Path $Paquet 'donnees\fichiers')) {
    robocopy (Join-Path $Paquet 'donnees\fichiers') $Stockage /MIR /NFL /NDL /NJH /NJS /NP /R:1 /W:1 | Out-Null
  } else { New-Item -ItemType Directory -Force -Path $Stockage | Out-Null }
  Ok 'fichiers déposés copiés'

  # ───── 4. Configuration ─────
  Etape 'Configuration'
  $jwt = -join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Minimum 0 -Maximum 256) })
  $cle = (Get-Content -LiteralPath (Join-Path $Paquet 'donnees\cle-secrets.txt') -Raw).Trim()
  @(
    "DATABASE_URL=postgresql://rise@localhost:$PortPg/rise",
    "JWT_SECRET=$jwt",
    "SECRETS_KEY=$cle",
    "STORAGE_DIR=$Stockage",
    "FRONTEND_DIR=$(Join-Path $Programmes 'app\frontends')",
    "PORT=$PortApp",
    "APP_URL=http://localhost:$PortApp",
    'COOKIE_SECURE=false',
    'AUTH_DEV=false',
    'JOBS_ENABLED=true',
    'OFFLINE=false',
    'DEMO_TODAY='
  ) | Set-Content -LiteralPath $Config -Encoding UTF8
  Ok 'configuration écrite (secrets de session propres à ce poste)'
  $nouveauCompte = $true
} else {
  Demarrer-Pg
  Ok 'données existantes conservées'
}

# ───── 5. Compte de la personne qui installe ─────
if ($nouveauCompte) {
  Etape 'Votre compte (Administrateur de la plateforme et PMO)'
  Write-Host '  Mot de passe : 12 caractères minimum, majuscule et minuscule, chiffre et caractère spécial.' -ForegroundColor DarkGray
  Appliquer-Config
  # Installation sans questions (essais) : identité et mot de passe déjà fournis par l'environnement, un seul essai.
  $silencieux = [bool]($env:RISE_ADMIN_EMAIL -and $env:RISE_INITIAL_ADMIN_PASSWORD)
  while ($silencieux) {
    Push-Location $Backend
    & $Node (Join-Path $Programmes 'installation\creer-admin.js')
    $code = $LASTEXITCODE
    Pop-Location
    Remove-Item env:RISE_INITIAL_ADMIN_PASSWORD -ErrorAction SilentlyContinue
    if ($code -ne 0) { Echec 'création du compte impossible.' }
    break
  }
  while (-not $silencieux) {
    $nom = (Read-Host '  Prénom et nom').Trim()
    $mail = (Read-Host '  Adresse e-mail').Trim()
    if (-not $nom -or $mail -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') { Write-Host '  Nom et adresse e-mail valides requis.' -ForegroundColor Yellow; continue }
    $m1 = Read-Host '  Mot de passe' -AsSecureString
    $m2 = Read-Host '  Confirmation' -AsSecureString
    $p1 = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($m1))
    $p2 = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($m2))
    if ($p1 -ne $p2) { Write-Host '  Les deux mots de passe diffèrent.' -ForegroundColor Yellow; continue }
    $env:RISE_ADMIN_NOM = $nom; $env:RISE_ADMIN_EMAIL = $mail; $env:RISE_INITIAL_ADMIN_PASSWORD = $p1
    Push-Location $Backend
    & $Node (Join-Path $Programmes 'installation\creer-admin.js')
    $code = $LASTEXITCODE
    Pop-Location
    Remove-Item env:RISE_INITIAL_ADMIN_PASSWORD -ErrorAction SilentlyContinue
    $p1 = $null; $p2 = $null
    if ($code -eq 0) { break }
    if ($code -ne 3 -and $code -ne 4) { Echec 'création du compte impossible.' }
  }
}

# ───── 6. Raccourcis ─────
Etape 'Raccourcis'
if ($env:RISE_SANS_RACCOURCIS) { Ok 'raccourcis non créés (essai)' } else {
$wsh = New-Object -ComObject WScript.Shell
$menu = Join-Path ([Environment]::GetFolderPath('Programs')) 'RISE Cockpit'
New-Item -ItemType Directory -Force -Path $menu | Out-Null
foreach ($dossier in [Environment]::GetFolderPath('Desktop'), $menu) {
  foreach ($r in @(@('Démarrer Cockpit', 'demarrer.cmd', 'Démarrer RISE Cockpit'), @('Arrêter Cockpit', 'arreter.cmd', 'Arrêter RISE Cockpit'))) {
    $l = $wsh.CreateShortcut((Join-Path $dossier "$($r[0]).lnk"))
    $l.TargetPath = Join-Path $Programmes "installation\$($r[1])"
    $l.WorkingDirectory = Join-Path $Programmes 'installation'
    $l.IconLocation = (Join-Path $Programmes 'cockpit.ico') + ',0'
    $l.Description = $r[2]
    $l.WindowStyle = 7
    $l.Save()
  }
}
Ok 'raccourcis créés sur le Bureau et dans le menu Démarrer'
}

# ───── 7. Démarrage ─────
Etape 'Démarrage'
Demarrer-Application
Ok "Cockpit est prêt : http://localhost:$PortApp/connexion"
if (-not $env:RISE_SANS_RACCOURCIS) { Start-Process "http://localhost:$PortApp/connexion" }
Write-Host ''
Write-Host '═══════════════════════════════════════════' -ForegroundColor Green
Write-Host '  Installation terminée' -ForegroundColor Green
Write-Host "  Cockpit : http://localhost:$PortApp/connexion"
Write-Host "  Console : http://localhost:$PortApp/console/connexion"
Write-Host '  Raccourcis : « Démarrer Cockpit » et « Arrêter Cockpit »'
Write-Host '  Le dossier extrait du ZIP peut être supprimé.'
Write-Host '═══════════════════════════════════════════' -ForegroundColor Green
