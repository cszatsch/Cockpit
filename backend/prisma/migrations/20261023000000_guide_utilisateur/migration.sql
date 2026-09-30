-- Guide utilisateur de la Console (30/09/2026) : versions du PDF et journal des téléchargements (ajout seul).
-- CreateTable
CREATE TABLE "guide_versions" (
    "id" TEXT NOT NULL,
    "v" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "account_id" TEXT,
    "by" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "file_name" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,

    CONSTRAINT "guide_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guide_downloads" (
    "id" TEXT NOT NULL,
    "account_id" TEXT,
    "user" TEXT NOT NULL,
    "role" TEXT,
    "at" TIMESTAMP(3) NOT NULL,
    "version" TEXT NOT NULL,

    CONSTRAINT "guide_downloads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "guide_versions_v_key" ON "guide_versions"("v");

-- CreateIndex
CREATE INDEX "guide_downloads_at_idx" ON "guide_downloads"("at");


-- Journal des téléchargements : une trace ne se modifie ni ne se supprime (TRUNCATE de l'amorçage non concerné).
CREATE OR REPLACE FUNCTION guide_download_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'guide_downloads is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER guide_download_no_update BEFORE UPDATE ON "guide_downloads"
  FOR EACH ROW EXECUTE FUNCTION guide_download_immutable();
CREATE TRIGGER guide_download_no_delete BEFORE DELETE ON "guide_downloads"
  FOR EACH ROW EXECUTE FUNCTION guide_download_immutable();
