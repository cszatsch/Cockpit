#!/usr/bin/env bash
# Changement de la clé maître SECRETS_KEY de production (audit de sécurité du 18/10/2026) sans ressaisir les secrets :
#   1. nouvelle clé tirée au hasard (openssl rand -hex 32), jamais affichée ;
#   2. secrets en base rechiffrés par le conteneur de l'API en cours d'exécution (outils/gcp/rechiffrer-secrets.js,
#      tout ou rien) ;
#   3. SECRETS_KEY remplacée dans .env.prod, l'ancien fichier gardé dans sauvegardes/ (droits 600) : l'ancienne clé
#      reste nécessaire pour relire les secrets des sauvegardes antérieures.
# À lancer depuis la racine du dépôt, sur la VM, après ./outils/gcp/sauvegarde.sh ; puis relancer l'API
# (docker compose … up -d --build) pour qu'elle lise la nouvelle clé. DEPLOIEMENT - Google Cloud.md § 11.
set -euo pipefail
exec < /dev/null

cd "$(dirname "$0")/../.."
COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env.prod)

ANCIENNE=$(grep -E '^SECRETS_KEY=' .env.prod | cut -d= -f2- || true)
if ! [[ "${ANCIENNE}" =~ ^[0-9a-fA-F]{64}$ ]]; then
  echo "SECRETS_KEY absente ou invalide dans .env.prod : arrêt, rien n'a été modifié." >&2
  exit 1
fi
NOUVELLE=$(openssl rand -hex 32)

horodatage=$(date +%Y%m%d-%H%M)
mkdir -p sauvegardes
copie="sauvegardes/env.prod.avant-cle-${horodatage}"
(umask 077 && cp .env.prod "${copie}")
echo "$(date -Is) ancien .env.prod gardé dans ${copie} (droits 600)"

# Rechiffrement par l'API en cours (même base, même client Prisma) ; clés passées par l'environnement, pas en argument.
export SOURCE_SECRETS_KEY="${ANCIENNE}" CIBLE_SECRETS_KEY="${NOUVELLE}"
"${COMPOSE[@]}" exec -T -e SOURCE_SECRETS_KEY -e CIBLE_SECRETS_KEY api node - < outils/gcp/rechiffrer-secrets.js

# Nouvelle clé écrite dans .env.prod (lue par awk dans l'environnement, jamais sur la ligne de commande).
NOUVELLE_CLE="${NOUVELLE}" awk '/^SECRETS_KEY=/ { print "SECRETS_KEY=" ENVIRON["NOUVELLE_CLE"]; next } { print }' "${copie}" > .env.prod.tmp
chmod --reference="${copie}" .env.prod.tmp 2>/dev/null || chmod 600 .env.prod.tmp
mv .env.prod.tmp .env.prod
unset SOURCE_SECRETS_KEY CIBLE_SECRETS_KEY ANCIENNE NOUVELLE

echo "$(date -Is) SECRETS_KEY remplacée dans .env.prod. Relancer l'API maintenant :"
echo "  docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build"
