-- Templates de rapport (étapes 3 à 6, 03/10/2026) : versions publiées (PowerPoint de référence et manifeste des zones variables).
CREATE TABLE "report_template_versions" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "structure" JSONB NOT NULL,
    "pages" INTEGER NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "report_template_versions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "report_template_versions_templateId_seq_key" ON "report_template_versions"("templateId", "seq");
CREATE INDEX "report_template_versions_projectId_idx" ON "report_template_versions"("projectId");
