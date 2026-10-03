-- Mise en service des templates publiés (04/10/2026) : état persistant, étape, erreur, date de mise en service, première génération.
ALTER TABLE "ReportTemplate" ADD COLUMN "serviceStatus" TEXT NOT NULL DEFAULT 'READY';
ALTER TABLE "ReportTemplate" ADD COLUMN "servicePhase" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ReportTemplate" ADD COLUMN "serviceError" TEXT;
ALTER TABLE "ReportTemplate" ADD COLUMN "serviceReadyAt" TIMESTAMP(3);
ALTER TABLE "ReportTemplate" ADD COLUMN "firstReportAt" TIMESTAMP(3);
