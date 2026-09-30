-- Guide utilisateur par application (décision du 30/09/2026) : Console et Cockpit ont chacun leur guide, leurs versions,
-- leur traçabilité, leur index et leurs réglages de recherche de Jev ; aucune donnée partagée.

ALTER TABLE "guide_versions" ADD COLUMN "app" TEXT NOT NULL DEFAULT 'console';
DROP INDEX "guide_versions_v_key";
CREATE UNIQUE INDEX "guide_versions_app_v_key" ON "guide_versions"("app", "v");

ALTER TABLE "guide_uploads" ADD COLUMN "app" TEXT NOT NULL DEFAULT 'console';
-- Un seul dépôt en cours d'indexation par application.
DROP INDEX "guide_uploads_one_indexing";
CREATE UNIQUE INDEX "guide_uploads_one_indexing" ON "guide_uploads" ("app") WHERE "status" = 'INDEXING';

-- Journal en ajout seul : l'ajout de colonne ne modifie aucune ligne existante (valeur par défaut).
ALTER TABLE "guide_downloads" ADD COLUMN "app" TEXT NOT NULL DEFAULT 'console';

-- Réglages : la ligne unique devient celle de la Console.
ALTER TABLE "jev_rag_settings" ALTER COLUMN "id" DROP DEFAULT;
UPDATE "jev_rag_settings" SET "id" = 'console' WHERE "id" = 'default';
