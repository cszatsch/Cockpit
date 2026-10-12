#!/usr/bin/env bash
# Sauvegarde nocturne de RISE en production : base PostgreSQL (pg_dump -Fc) et fichiers stockés (STORAGE_DIR),
# copiés dans ./sauvegardes puis envoyés dans le bucket Cloud Storage (BUCKET_SAUVEGARDES de .env.prod).
# À lancer depuis la racine du dépôt, sur la VM (crontab de l'utilisateur qui pilote Docker) :
#   15 2 * * * cd /opt/rise && ./outils/gcp/sauvegarde.sh >> sauvegardes/sauvegarde.log 2>&1
# Restauration : outils/gcp/restaurer.sh. La clé SECRETS_KEY n'est pas dans la sauvegarde : la garder à part.
set -euo pipefail

cd "$(dirname "$0")/../.."
COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env.prod)
BUCKET=$(grep -E '^BUCKET_SAUVEGARDES=' .env.prod | cut -d= -f2- || true)
JOURS=$(grep -E '^JOURS_LOCAUX=' .env.prod | cut -d= -f2- || true)
JOURS=${JOURS:-7}

horodatage=$(date +%Y%m%d-%H%M)
mkdir -p sauvegardes
base="sauvegardes/rise-${horodatage}.dump"
fichiers="sauvegardes/storage-${horodatage}.tar.gz"

echo "$(date -Is) début de la sauvegarde ${horodatage}"

# Base : format personnalisé, reçu sur la sortie standard (aucun dossier partagé avec le conteneur).
"${COMPOSE[@]}" exec -T db pg_dump -U rise -d rise -Fc > "${base}"
# Contrôle de lecture du fichier produit (table des matières lisible).
"${COMPOSE[@]}" exec -T db pg_restore -l < "${base}" > /dev/null

# Fichiers : documents, formats de rapport, guides, corbeille des projets…
"${COMPOSE[@]}" exec -T api tar czf - -C /data/storage . > "${fichiers}"

echo "$(date -Is) base $(du -h "${base}" | cut -f1), fichiers $(du -h "${fichiers}" | cut -f1)"

if [ -n "${BUCKET}" ]; then
  gcloud storage cp "${base}" "${fichiers}" "${BUCKET%/}/${horodatage}/"
  echo "$(date -Is) envoyé dans ${BUCKET%/}/${horodatage}/"
else
  echo "$(date -Is) BUCKET_SAUVEGARDES vide : sauvegarde gardée sur la VM seulement"
fi

# Rotation locale (le bucket a sa propre règle de cycle de vie).
find sauvegardes -maxdepth 1 \( -name 'rise-*.dump' -o -name 'storage-*.tar.gz' \) -mtime "+${JOURS}" -delete

echo "$(date -Is) fin de la sauvegarde ${horodatage}"
