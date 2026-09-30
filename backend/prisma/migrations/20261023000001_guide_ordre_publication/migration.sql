-- Guide utilisateur (30/09/2026) : ordre de publication indépendant de l'horloge (deux dépôts dans la même seconde).
ALTER TABLE "guide_versions" ADD COLUMN "seq" SERIAL NOT NULL;
