-- Jev de la Console, Text-to-SQL (étape 2) : rôle d'exécution des requêtes écrites par le modèle.
-- Sans connexion (NOLOGIN) : le serveur y bascule par SET LOCAL ROLE, dans une transaction READ ONLY.
-- Droits : lecture des vues du schéma jev, et rien d'autre (aucune table de public, aucun secret).
-- Les vues s'exécutent avec les droits de leur propriétaire : le rôle n'a pas besoin d'accéder aux tables sources.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jev_lecteur') THEN
    CREATE ROLE jev_lecteur NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA jev TO jev_lecteur;
GRANT SELECT ON ALL TABLES IN SCHEMA jev TO jev_lecteur;
ALTER DEFAULT PRIVILEGES IN SCHEMA jev GRANT SELECT ON TABLES TO jev_lecteur;
-- Le compte de l'application doit pouvoir basculer sur ce rôle.
GRANT jev_lecteur TO CURRENT_USER;
