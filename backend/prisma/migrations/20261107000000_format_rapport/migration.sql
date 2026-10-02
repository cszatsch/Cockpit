-- Format du rapport (étape B de « Créer un template », 02/10/2026) : pages modèles chargées et format du template.
ALTER TABLE "ReportTemplate" ADD COLUMN "format" JSONB;

CREATE TABLE "report_format_files" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "fileKey" TEXT NOT NULL,
    "analysis" JSONB NOT NULL,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "report_format_files_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "report_format_files_projectId_idx" ON "report_format_files"("projectId");
