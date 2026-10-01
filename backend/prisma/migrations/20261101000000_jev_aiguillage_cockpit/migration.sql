-- Aiguillage des questions de Jev dans le Cockpit (5 cas d'usage, 01/10/2026) : application d'origine, questions
-- oui / non (demande d'écriture, plusieurs demandes) et modèle de la réponse.
ALTER TABLE "jev_classifications" ADD COLUMN "app" TEXT NOT NULL DEFAULT 'console';
ALTER TABLE "jev_classifications" ADD COLUMN "write_score" DOUBLE PRECISION;
ALTER TABLE "jev_classifications" ADD COLUMN "multi_score" DOUBLE PRECISION;
ALTER TABLE "jev_classifications" ADD COLUMN "multi" BOOLEAN;
ALTER TABLE "jev_classifications" ADD COLUMN "answer_model" TEXT;
CREATE INDEX "jev_classifications_app_at_idx" ON "jev_classifications"("app", "at");
