-- Préremplissage du fichier d'initialisation depuis la proposition commerciale (07/10/2026).
-- CreateTable
CREATE TABLE "prefill_documents" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "pages" INTEGER NOT NULL,
    "format" TEXT NOT NULL,
    "fileKey" TEXT,
    "textKey" TEXT,
    "accountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prefill_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prefill_tasks" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "tabIndex" INTEGER NOT NULL DEFAULT 0,
    "tabs" JSONB NOT NULL DEFAULT '[]',
    "result" TEXT,
    "error" TEXT,
    "excelKey" TEXT,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prefill_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prefill_documents_expiresAt_idx" ON "prefill_documents"("expiresAt");

-- CreateIndex
CREATE INDEX "prefill_tasks_documentId_idx" ON "prefill_tasks"("documentId");

-- AddForeignKey
ALTER TABLE "prefill_tasks" ADD CONSTRAINT "prefill_tasks_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "prefill_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
