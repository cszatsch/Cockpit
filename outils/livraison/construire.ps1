<#
  Construction du paquet d'installation de RISE Cockpit (04/10/2026) : un ZIP autonome pour Windows, sans Docker ni
  droit d'administrateur chez la personne qui l'installe.
    - application compilée (Cockpit, Console) avec ses dépendances de production ;
    - Node.js et PostgreSQL (avec l'extension pgvector) embarqués ;
    - copie de la base de développement (état actuel : projet RISE, templates, IA, SMTP, skills, guide…) et des fichiers
      déposés ; le compte de l'auteur, les sessions et les liens de mot de passe sont retirés ; les secrets (clés d'IA,
      cartes API, mot de passe SMTP) sont rechiffrés avec une clé propre au paquet ;
    - installateur (installer_cockpit.cmd) et lanceurs « Démarrer Cockpit » / « Arrêter Cockpit ».
  Lancement : npm run livraison (dans backend/), avec le PostgreSQL de développement démarré (port 5433).
  Sortie : livraison\RISE Cockpit <date>.zip (dossier non versionné).
#>
$ErrorActionPreference = 'Continue'
$Racine  = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$Backend = Join-Path $Racine 'backend'
$Sortie  = Join-Path $Racine 'livraison'
$Paquet  = Join-Path $Sortie 'RISE Cockpit'
$Modele  = Join-Path $PSScriptRoot 'modele'

function Ok([string]$m)    { Write-Host "  [OK] $m" -ForegroundColor Green }
function Etape([string]$m) { Write-Host ''; Write-Host "» $m" -ForegroundColor Cyan }
function Echec([string]$m) { Write-Host "  [ERREUR] $m" -ForegroundColor Red; exit 1 }
function Copier([string]$de, [string]$vers, [string[]]$sauf = @()) {
  $a = @($de, $vers, '/MIR', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/R:1', '/W:1')
  if ($sauf.Count) { $a += '/XD'; $a += $sauf }
  robocopy @a | Out-Null
  if ($LASTEXITCODE -ge 8) { Echec "copie impossible : $de" }
}
function Taille([string]$p) { '{0:N0} Mo' -f ((Get-ChildItem -LiteralPath $p -Recurse -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum / 1MB) }

# Configuration de développement (lue, jamais affichée).
$envDev = @{}
foreach ($l in Get-Content (Join-Path $Backend '.env') -Encoding UTF8) { if ($l -match '^\s*([A-Z_][A-Z0-9_]*)=(.*)$') { $envDev[$Matches[1]] = $Matches[2].Trim().Trim('"') } }
if ($envDev['SECRETS_KEY'] -notmatch '^[0-9a-fA-F]{64}$') { Echec 'SECRETS_KEY absente ou invalide dans backend\.env.' }
$url = [uri]($envDev['DATABASE_URL'] -replace '^postgresql://', 'http://')
$PgPort = if ($url.Port -gt 0) { $url.Port } else { 5432 }
$PgUser = ($url.UserInfo -split ':')[0]
$PgBase = $url.AbsolutePath.Trim('/') -replace '\?.*$', ''
$PgDir = Get-ChildItem 'C:\Program Files\PostgreSQL' -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'lib\vector.dll') } | Sort-Object { [int]($_.Name -replace '\D.*$', '') } -Descending | Select-Object -First 1
if (-not $PgDir) { Echec 'PostgreSQL avec pgvector introuvable dans C:\Program Files\PostgreSQL.' }
$PgBin = Join-Path $PgDir.FullName 'bin'
$env:PGHOST = 'localhost'; $env:PGPORT = "$PgPort"; $env:PGUSER = $PgUser
& (Join-Path $PgBin 'pg_isready.exe') -q
if ($LASTEXITCODE -ne 0) { Echec "le PostgreSQL de développement ne répond pas sur le port $PgPort (lancez start_cockpit)." }

Write-Host ''
Write-Host "Paquet d'installation de RISE Cockpit — PostgreSQL $($PgDir.Name), base « $PgBase »" -ForegroundColor White

# ───── 1. Compilation ─────
Etape 'Compilation'
Push-Location $Backend
npm.cmd run build | Out-Null
if ($LASTEXITCODE -ne 0) { Pop-Location; Echec 'compilation en échec (npm run build).' }
Pop-Location
Ok 'application compilée'

# ───── 2. Dossier du paquet ─────
if (Test-Path -LiteralPath $Paquet) { Remove-Item -LiteralPath $Paquet -Recurse -Force }
New-Item -ItemType Directory -Force -Path $Paquet, (Join-Path $Paquet 'donnees') | Out-Null

Etape 'Application'
$B = Join-Path $Paquet 'app\backend'
Copier (Join-Path $Backend 'dist') (Join-Path $B 'dist')
# Ressources lues par l'application (exemple ORION du préremplissage, 07/10/2026).
Copier (Join-Path $Backend 'assets') (Join-Path $B 'assets')
# Migrations SQL : appliquées par l'installateur quand les données du poste sont conservées.
Copier (Join-Path $Backend 'prisma\migrations') (Join-Path $B 'prisma\migrations')
Copier (Join-Path $Backend 'node_modules') (Join-Path $B 'node_modules')
Copy-Item (Join-Path $Backend 'package.json'), (Join-Path $Backend 'package-lock.json') -Destination $B
Push-Location $B
npm.cmd prune --omit=dev --ignore-scripts --no-audit --no-fund | Out-Null
$prune = $LASTEXITCODE
Pop-Location
if ($prune -ne 0) { Echec 'retrait des dépendances de développement impossible (npm prune).' }
if (-not (Test-Path (Join-Path $B 'node_modules\.prisma\client\index.js'))) { Echec 'client Prisma généré introuvable.' }
# Inutiles à l'exécution : copies temporaires du moteur Prisma (une par génération), outils de développement restés
# comme dépendances indirectes (CLI Prisma et ses moteurs, TypeScript), caches et définitions de types.
Get-ChildItem (Join-Path $B 'node_modules\.prisma\client') -Filter '*.tmp*' -Force | Remove-Item -Force
foreach ($d in 'prisma', '@prisma\engines', 'typescript', 'effect', '.cache', '@types') {
  $x = Join-Path $B "node_modules\$d"
  if (Test-Path -LiteralPath $x) { Remove-Item -LiteralPath $x -Recurse -Force }
}
Copier (Join-Path $Racine 'frontends') (Join-Path $Paquet 'app\frontends')
Ok "application et dépendances de production ($(Taille (Join-Path $Paquet 'app')))"

Etape 'Node.js et PostgreSQL embarqués'
$R = Join-Path $Paquet 'runtime'
New-Item -ItemType Directory -Force -Path (Join-Path $R 'node') | Out-Null
Copy-Item (Get-Command node).Source (Join-Path $R 'node\node.exe')
foreach ($d in 'bin', 'lib', 'share') { Copier (Join-Path $PgDir.FullName $d) (Join-Path $R "pgsql\$d") }
# Bibliothèques d'exécution Visual C++ (absentes de certains postes).
foreach ($dll in 'vcruntime140.dll', 'vcruntime140_1.dll', 'msvcp140.dll') {
  $s = Join-Path $env:SystemRoot "System32\$dll"
  if ((Test-Path $s) -and -not (Test-Path (Join-Path $R "pgsql\bin\$dll"))) { Copy-Item $s (Join-Path $R "pgsql\bin\$dll") }
}
Ok "Node.js $(node -v), PostgreSQL $($PgDir.Name) avec pgvector ($(Taille $R))"

# ───── 3. Données ─────
Etape 'Copie de la base (état actuel) et des fichiers déposés'
$tmp = Join-Path $Sortie 'travail'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$src = Join-Path $tmp 'source.dump'
& (Join-Path $PgBin 'pg_dump.exe') -Fc -f $src $PgBase
if ($LASTEXITCODE -ne 0) { Echec 'export de la base impossible.' }
$temp = 'rise_livraison'
& (Join-Path $PgBin 'dropdb.exe') --if-exists $temp 2>$null
& (Join-Path $PgBin 'createdb.exe') $temp
& (Join-Path $PgBin 'pg_restore.exe') --no-owner -d $temp $src 2>&1 | Out-File (Join-Path $tmp 'restauration.log') -Encoding UTF8
# Clé propre au paquet : les secrets y sont rechiffrés.
$cle = -join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Minimum 0 -Maximum 256) })
$env:BACKEND_DIR = $Backend
$env:DATABASE_URL = "postgresql://$PgUser@localhost:$PgPort/$temp"
$env:SOURCE_SECRETS_KEY = $envDev['SECRETS_KEY']
$env:PAQUET_SECRETS_KEY = $cle
$bilan = node (Join-Path $PSScriptRoot 'preparer-base.js')
$code = $LASTEXITCODE
Remove-Item env:SOURCE_SECRETS_KEY, env:PAQUET_SECRETS_KEY, env:DATABASE_URL -ErrorAction SilentlyContinue
if ($code -ne 0) { & (Join-Path $PgBin 'dropdb.exe') $temp; Echec 'préparation de la copie de la base impossible.' }
& (Join-Path $PgBin 'pg_dump.exe') -Fc -f (Join-Path $Paquet 'donnees\rise.dump') $temp
& (Join-Path $PgBin 'dropdb.exe') $temp
Remove-Item -LiteralPath $tmp -Recurse -Force
Set-Content -LiteralPath (Join-Path $Paquet 'donnees\cle-secrets.txt') -Value $cle -Encoding ASCII
Ok "base copiée et préparée : $bilan"
$stock = if ($envDev['STORAGE_DIR']) { $envDev['STORAGE_DIR'] } else { './storage' }
if (-not [IO.Path]::IsPathRooted($stock)) { $stock = Join-Path $Backend $stock }
if (Test-Path -LiteralPath $stock) { Copier $stock (Join-Path $Paquet 'donnees\fichiers') }
Ok "fichiers déposés ($(Taille (Join-Path $Paquet 'donnees')) avec la base)"

# ───── 4. Installateur ─────
Etape 'Installateur'
Copier (Join-Path $Modele 'installation') (Join-Path $Paquet 'installation')
Copy-Item (Join-Path $Racine 'outils\cockpit.ico') (Join-Path $Paquet 'installation\cockpit.ico')
Copy-Item (Join-Path $Modele 'installation\installer_cockpit.cmd'), (Join-Path $Modele 'installation\LISEZMOI.txt') -Destination $Paquet
Ok 'installer_cockpit.cmd, lanceurs et icône'

# ───── 5. ZIP ─────
Etape 'Archive'
$zip = Join-Path $Sortie ("RISE Cockpit $(Get-Date -Format 'yyyy-MM-dd').zip")
if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
Push-Location $Sortie
& (Join-Path $env:SystemRoot 'System32\tar.exe') -a -c -f $zip 'RISE Cockpit'
$t = $LASTEXITCODE
Pop-Location
if ($t -ne 0) { Echec 'création du ZIP impossible.' }
Ok ("$zip ({0:N0} Mo)" -f ((Get-Item -LiteralPath $zip).Length / 1MB))
Write-Host ''
Write-Host '  Ce ZIP contient des clés d''accès (IA, SMTP) : à ne transmettre qu''à la personne concernée.' -ForegroundColor Yellow
