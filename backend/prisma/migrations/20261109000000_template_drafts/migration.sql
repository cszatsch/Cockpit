-- Créer un template (04/10/2026) : brouillon enregistré à chaque modification, un par compte et par projet.
CREATE TABLE "report_template_drafts" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "report_template_drafts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "report_template_drafts_projectId_accountId_key" ON "report_template_drafts"("projectId", "accountId");
