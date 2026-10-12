#!/usr/bin/env bash
# Restauration de RISE en production, ou reprise initiale de la base du poste :
#   ./outils/gcp/restaurer.sh <base>.dump [<fichiers>.tar.gz]
# La base « rise » est REMPLACÉE (tout ou rien), puis les fichiers stockés s'il y a une archive. L'API est arrêtée
# pendant l'opération et redémarrée ensuite (prisma migrate deploy applique alors les migrations plus récentes).
set -euo pipefail

cd "$(dirname "$0")/../.."
COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env.prod)

dump=${1:?usage : restaurer.sh <base>.dump [<fichiers>.tar.gz]}
archive=${2:-}
[ -f "${dump}" ] || { echo "fichier introuvable : ${dump}"; exit 1; }
[ -z "${archive}" ] || [ -f "${archive}" ] || { echo "archive introuvable : ${archive}"; exit 1; }

read -r -p "La base de production sera remplacée par ${dump}. Taper RESTAURER pour continuer : " reponse
[ "${reponse}" = "RESTAURER" ] || { echo "abandon"; exit 1; }

echo "arrêt de l'API"
"${COMPOSE[@]}" stop api
"${COMPOSE[@]}" up -d db

psql=("${COMPOSE[@]}" exec -T db psql -U rise -v ON_ERROR_STOP=1)
"${psql[@]}" -d postgres -c "DROP DATABASE IF EXISTS rise_restauration;" -c "CREATE DATABASE rise_restauration OWNER rise;"

# Rôles de lecture de Jev (migrations jev_lecteur et notifications_cockpit) : pg_dump ne sauvegarde pas les rôles.
"${psql[@]}" -d postgres <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jev_lecteur') THEN
    CREATE ROLE jev_lecteur NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jev_lecteur_cockpit') THEN
    CREATE ROLE jev_lecteur_cockpit NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$$;
GRANT jev_lecteur TO rise;
GRANT jev_lecteur_cockpit TO rise;
SQL

echo "restauration dans une base temporaire"
"${COMPOSE[@]}" exec -T db pg_restore -U rise -d rise_restauration --no-owner --exit-on-error < "${dump}"

echo "bascule : rise_restauration devient rise"
"${psql[@]}" -d postgres \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'rise' AND pid <> pg_backend_pid();" \
  -c "DROP DATABASE IF EXISTS rise;" \
  -c "ALTER DATABASE rise_restauration RENAME TO rise;"

if [ -n "${archive}" ]; then
  echo "restauration des fichiers stockés"
  "${COMPOSE[@]}" run --rm --no-deps -T --entrypoint sh api \
    -c 'find /data/storage -mindepth 1 -delete && tar xzf - -C /data/storage' < "${archive}"
fi

echo "redémarrage de l'API"
"${COMPOSE[@]}" up -d api
echo "terminé : suivre le démarrage avec  docker compose -f docker-compose.prod.yml logs -f api"
