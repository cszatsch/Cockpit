-- Sous-phases d'un chantier (06/10/2026) : choix multiple, chaque sous-phase appartient à une phase du chantier
-- (règle contrôlée par le serveur). Suppression du chantier ou de la sous-phase : lien supprimé.
CREATE TABLE "WorkstreamSubphase" (
    "wsId" TEXT NOT NULL,
    "subphaseId" TEXT NOT NULL,
    CONSTRAINT "WorkstreamSubphase_pkey" PRIMARY KEY ("wsId", "subphaseId")
);
ALTER TABLE "WorkstreamSubphase" ADD CONSTRAINT "WorkstreamSubphase_wsId_fkey" FOREIGN KEY ("wsId") REFERENCES "Workstream"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkstreamSubphase" ADD CONSTRAINT "WorkstreamSubphase_subphaseId_fkey" FOREIGN KEY ("subphaseId") REFERENCES "Subphase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
