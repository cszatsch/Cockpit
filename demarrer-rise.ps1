<#
  RISE : démarrage local (Windows) de PostgreSQL, de l'API, du Cockpit et de la Console Admin.

  À placer à la racine du dossier du projet (celui qui contient « backend » et « frontends »).

  Lancement :
    - double-clic sur demarrer-rise.cmd (arrêt : double-clic sur arreter-rise.cmd) ;
    - ou, dans PowerShell : powershell -ExecutionPolicy Bypass -File .\demarrer-rise.ps1
  Arrêt de tout (application et PostgreSQL) :
    - powershell -ExecutionPolicy Bypass -File .\demarrer-rise.ps1 -Arreter
  Réinitialiser les données de démonstration au démarrage :
    - powershell -ExecutionPolicy Bypass -File .\demarrer-rise.ps1 -Reinitialiser
  Forcer la recompilation (normalement automatique quand le code a changé) :
    - powershell -ExecutionPolicy Bypass -File .\demarrer-rise.ps1 -Compiler

  Étapes :
    1. libère les ports utilisés : 3000 (application) et 5433 (PostgreSQL) ;
    2. démarre le serveur PostgreSQL personnel (créé au premier lancement s'il n'existe pas) ;
    3. prépare l'application : configuration, dépendances, migrations et compilation,
       chacune seulement si nécessaire (fichiers modifiés depuis la dernière fois, par exemple après un git pull) ;
       crée le compte initial (Cédric Schmitz) s'il n'existe pas : son mot de passe provisoire est demandé
       en saisie masquée, transmis au seul script de création et jamais écrit sur le disque ;
    4. lance l'application dans sa propre fenêtre ;
    5. ouvre les écrans de connexion du Cockpit et de la Console Admin dans le navigateur.
#>
param(
  [switch]$Arreter,
  [switch]$Reinitialiser,
  [switch]$Compiler
)

# « Continue » : sous Windows PowerShell 5.1, « Stop » transformerait les messages des outils PostgreSQL en erreurs bloquantes.
$ErrorActionPreference = 'Continue'

# ───── Réglages ─────
$PortApp  = 3000
$PortPg   = 5433
$Racine   = $PSScriptRoot
$Backend  = Join-Path $Racine 'backend'
$PgData   = Join-Path $env:USERPROFILE 'rise-pgdata'
$PgJournal = Join-Path $PgData 'journal.txt'
$UrlBase  = "http://localhost:$PortApp"

function Etape($texte)  { Write-Host ''; Write-Host "> $texte" -ForegroundColor Cyan }
function Ok($texte)     { Write-Host "  [OK] $texte" -ForegroundColor Green }
function Info($texte)   { Write-Host "  ...  $texte" -ForegroundColor Gray }
function Echec($texte)  { Write-Host ''; Write-Host "  [ERREUR] $texte" -ForegroundColor Red; exit 1 }

# ───── Outils PostgreSQL : version la plus récente installée ─────
function Trouver-PgBin {
  if (-not (Test-Path 'C:\Program Files\PostgreSQL')) { Echec 'PostgreSQL est introuvable dans « C:\Program Files\PostgreSQL ».' }
  $dossiers = Get-ChildItem 'C:\Program Files\PostgreSQL' -Directory -ErrorAction SilentlyContinue |
    Where-Object { Test-Path (Join-Path $_.FullName 'bin\pg_ctl.exe') } |
    Sort-Object { [int]($_.Name -replace '[^\d].*$', '') } -Descending
  if (-not $dossiers) { Echec 'PostgreSQL est introuvable dans « C:\Program Files\PostgreSQL ».' }
  return (Join-Path $dossiers[0].FullName 'bin')
}

# Processus qui écoutent sur un port (hors processus système).
function Processus-SurPort([int]$port) {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    Where-Object { $_ -gt 4 }
}

# Ferme les processus qui occupent un port.
function Liberer-Port([int]$port, [string]$usage) {
  $pids = @(Processus-SurPort $port)
  if ($pids.Count -eq 0) { Ok "port $port ($usage) libre"; return }
  foreach ($id in $pids) {
    $p = Get-Process -Id $id -ErrorAction SilentlyContinue
    $nom = if ($p) { $p.ProcessName } else { '?' }
    Info "port $port ($usage) occupé par « $nom » (PID $id) : fermeture"
    Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 1
  if (@(Processus-SurPort $port).Count -gt 0) { Echec "impossible de libérer le port $port. Fermez le programme qui l'utilise puis relancez." }
  Ok "port $port ($usage) libéré"
}

function Pg-EnMarche  { & $PgCtl status -D $PgData *> $null; return ($LASTEXITCODE -eq 0) }
function Pg-Pret      { & $PgIsReady -h localhost -p $PortPg -q *> $null; return ($LASTEXITCODE -eq 0) }

# Arrêt propre de PostgreSQL (sans perte de données), puis fermeture de ce qui resterait sur le port.
function Arreter-Postgres {
  if ((Test-Path $PgData) -and (Pg-EnMarche)) {
    Info 'arrêt propre de PostgreSQL'
    & $PgCtl stop -D $PgData -m fast *> $null
  }
  Liberer-Port $PortPg 'PostgreSQL'
}

# Démarrage détaché : fermer une fenêtre PowerShell ou faire Ctrl + C n'arrête plus PostgreSQL.
function Demarrer-Postgres {
  Start-Process -FilePath $PgCtl -WindowStyle Hidden -ArgumentList @(
    'start', '-D', "`"$PgData`"", '-o', "`"-p $PortPg`"", '-l', "`"$PgJournal`""
  )
  for ($i = 0; $i -lt 30; $i++) {
    if (Pg-Pret) { Ok "PostgreSQL prêt sur le port $PortPg"; return }
    Start-Sleep -Seconds 1
  }
  Echec "PostgreSQL ne répond pas. Consultez le journal : $PgJournal"
}

# Lance npm ou npx dans le dossier backend ; arrête le script en cas d'échec.
function Lancer([string]$outil, [string[]]$arguments, [string]$message) {
  Push-Location $Backend
  try { & "$outil.cmd" @arguments; $code = $LASTEXITCODE } finally { Pop-Location }
  if ($code -ne 0) { Echec $message }
}

# Date de modification la plus récente parmi des fichiers ou dossiers du backend (dossiers parcourus en entier).
function Plus-Recent([string[]]$chemins) {
  $max = [datetime]::MinValue
  foreach ($c in $chemins) {
    $p = Join-Path $Backend $c
    if (-not (Test-Path $p)) { continue }
    $f = Get-ChildItem -LiteralPath $p -Recurse -File -Force -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($f -and $f.LastWriteTime -gt $max) { $max = $f.LastWriteTime }
  }
  return $max
}
# Date de modification d'un fichier (date minimale s'il n'existe pas).
function Date-De([string]$chemin) {
  $p = Join-Path $Backend $chemin
  if (Test-Path $p) { return (Get-Item -LiteralPath $p -Force).LastWriteTime }
  return [datetime]::MinValue
}

# ───── Vérifications de départ ─────
if (-not (Test-Path (Join-Path $Backend 'package.json'))) {
  Echec "dossier « backend » introuvable à côté du script ($Racine). Placez le script à la racine du projet."
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Echec 'Node.js est introuvable. Installez-le depuis https://nodejs.org puis relancez.' }

$PgBin     = Trouver-PgBin
$PgCtl     = Join-Path $PgBin 'pg_ctl.exe'
$PgIsReady = Join-Path $PgBin 'pg_isready.exe'
$InitDb    = Join-Path $PgBin 'initdb.exe'
$CreateDb  = Join-Path $PgBin 'createdb.exe'

# ───── Mode arrêt ─────
if ($Arreter) {
  Etape 'Arrêt de RISE'
  Liberer-Port $PortApp 'application'
  Arreter-Postgres
  Write-Host ''; Write-Host 'RISE est arrêté.' -ForegroundColor Green
  exit 0
}

Write-Host '═══════════════════════════════════════════' -ForegroundColor Cyan
Write-Host '  RISE : démarrage du Cockpit et de la Console' -ForegroundColor Cyan
Write-Host '═══════════════════════════════════════════' -ForegroundColor Cyan

# ───── 1. Ports ─────
Etape '1/5 Vérification des ports'
Liberer-Port $PortApp 'application'
Arreter-Postgres

# ───── 2. PostgreSQL ─────
Etape "2/5 PostgreSQL ($PgBin)"
$premierLancement = -not (Test-Path (Join-Path $PgData 'PG_VERSION'))
if ($premierLancement) {
  Info "création du serveur personnel dans $PgData"
  & $InitDb -D $PgData -U rise -A trust -E UTF8 --locale=C *> $null
  if ($LASTEXITCODE -ne 0) { Echec 'la création du serveur PostgreSQL a échoué (initdb).' }
}
Demarrer-Postgres
& $CreateDb -h localhost -p $PortPg -U rise rise *> $null   # sans effet si la base existe déjà

# ───── 3. Application ─────
Etape '3/5 Préparation de l''application'
$envFichier = Join-Path $Backend '.env'
if (-not (Test-Path $envFichier)) {
  (Get-Content (Join-Path $Backend '.env.example')) -replace 'localhost:5432', "localhost:$PortPg" | Set-Content $envFichier
  Ok 'configuration .env créée (base sur le port 5433)'
} else { Ok 'configuration .env présente' }

# Tout ce qui change les types utilisés par le code impose de recompiler.
$recompiler = [bool]$Compiler

# Dépendances : installées si absentes, ou si leur liste (package-lock.json) a changé depuis la dernière installation.
$clientPrisma = 'node_modules\.prisma\client\index.js'
if (-not (Test-Path (Join-Path $Backend $clientPrisma)) -or ((Date-De 'package-lock.json') -gt (Date-De 'node_modules\.package-lock.json'))) {
  Info 'installation des dépendances (1 à 3 minutes)'
  Lancer 'npm' @('install', '--no-fund', '--no-audit') 'npm install a échoué.'
  $recompiler = $true
  Ok 'dépendances installées'
} else { Ok 'dépendances à jour' }

# Client Prisma : régénéré si le schéma de la base a changé depuis la dernière génération.
if ((Date-De 'prisma\schema.prisma') -gt (Date-De $clientPrisma)) {
  Info 'le schéma de la base a changé : régénération du client Prisma'
  Lancer 'npx' @('prisma', 'generate') 'la génération du client Prisma a échoué.'
  $recompiler = $true
  Ok 'client Prisma à jour'
}

Info 'mise à jour du schéma de la base'
Lancer 'npx' @('prisma', 'migrate', 'deploy') 'la mise à jour de la base (prisma migrate deploy) a échoué.'
Ok 'base à jour'

if ($premierLancement -or $Reinitialiser) {
  Info 'chargement des données de démonstration'
  Lancer 'npm' @('run', 'db:seed') 'le chargement des données de démonstration a échoué.'
  Ok 'données de démonstration chargées'
}

# Compte initial (Cédric Schmitz, administrateur et PMO) : créé une seule fois (et après -Reinitialiser,
# qui vide la base). Mot de passe provisoire : variable RISE_INITIAL_ADMIN_PASSWORD si elle est définie,
# sinon saisie masquée ; il n'est passé qu'au processus de création et doit être changé à la première connexion.
Push-Location $Backend
try { & npm.cmd run -s init:admin -- --etat *> $null; $etatCompte = $LASTEXITCODE } finally { Pop-Location }
if ($etatCompte -eq 0) {
  Ok 'compte initial présent'
} elseif ($etatCompte -eq 2) {
  $mdp = $env:RISE_INITIAL_ADMIN_PASSWORD
  if (-not $mdp) {
    Info 'compte initial c.schmitz@groupeonepoint.com absent : choisissez son mot de passe provisoire'
    Info '(12 caractères minimum, majuscule, minuscule, chiffre et caractère spécial ; à changer à la première connexion)'
    $saisie = Read-Host '  Mot de passe provisoire (Entrée seule pour passer)' -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($saisie)
    try { $mdp = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  }
  if ($mdp) {
    $env:RISE_INITIAL_ADMIN_PASSWORD = $mdp
    Push-Location $Backend
    try { & npm.cmd run -s init:admin; $code = $LASTEXITCODE } finally { Pop-Location; Remove-Item Env:RISE_INITIAL_ADMIN_PASSWORD -ErrorAction SilentlyContinue; $mdp = $null }
    if ($code -eq 0) { Ok 'compte initial créé' } else { Info 'compte initial non créé (voir le message ci-dessus) : relancez le script pour réessayer' }
  } else { Info 'compte initial non créé : relancez le script pour le créer' }
} else { Info 'état du compte initial inconnu (la base répond-elle ?)' }

# Compilation : seulement si le code a changé depuis la dernière compilation réussie (repère dist\.compilation).
$repere = 'dist\.compilation'
$derniereCompilation = Date-De $repere
$dernierChangement = Plus-Recent @('src', 'tsconfig.json', 'tsconfig.build.json', 'package.json')
if ($recompiler -or -not (Test-Path (Join-Path $Backend 'dist\main.js')) -or ($dernierChangement -gt $derniereCompilation)) {
  Info 'compilation (le code a changé)'
  Lancer 'npm' @('run', 'build') 'la compilation a échoué.'
  Set-Content -Path (Join-Path $Backend $repere) -Value (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
  Ok 'application compilée'
} else {
  Ok ("compilation déjà à jour (aucun changement depuis le " + $derniereCompilation.ToString('dd/MM/yyyy à HH:mm') + ')')
}

# ───── 4. Lancement de l'application ─────
Etape '4/5 Lancement de l''application'
# Fenêtre dédiée au serveur : ses messages y restent visibles ; la fermer arrête l'application.
# Commande encodée (base64) pour éviter tout problème de guillemets ou d'espaces dans le chemin.
$cheminEchappe = $Backend -replace "'", "''"
$commande = "`$host.UI.RawUI.WindowTitle = 'RISE - serveur (fermer cette fenetre arrete l''application)'; Set-Location -LiteralPath '$cheminEchappe'; npm.cmd start"
$encodee = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($commande))
Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoExit', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', $encodee)

$pret = $false
for ($i = 0; $i -lt 60; $i++) {
  try {
    Invoke-WebRequest -Uri "$UrlBase/api/docs" -UseBasicParsing -TimeoutSec 2 | Out-Null
    $pret = $true; break
  } catch { Start-Sleep -Seconds 1 }
}
if (-not $pret) { Echec 'l''application ne répond pas. Regardez les messages dans la fenêtre « RISE - serveur ».' }
Ok "application prête sur $UrlBase"

# ───── 5. Navigateur ─────
Etape '5/5 Ouverture des écrans de connexion'
Start-Process "$UrlBase/connexion"
Start-Process "$UrlBase/console/connexion"
Ok 'pages ouvertes dans le navigateur'

Write-Host ''
Write-Host '═══════════════════════════════════════════' -ForegroundColor Green
Write-Host '  RISE est démarré' -ForegroundColor Green
Write-Host "  Cockpit : $UrlBase/connexion"
Write-Host "  Console : $UrlBase/console/connexion"
Write-Host '  Pour tout arrêter : double-clic sur arreter-rise.cmd'
Write-Host '═══════════════════════════════════════════' -ForegroundColor Green
