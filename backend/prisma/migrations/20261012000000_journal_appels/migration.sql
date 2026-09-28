-- Journal des appels (spécification JOURNAL § 3) : tarifs figés au moment de l'appel et latence, sur UsageRecord.
-- Les appels antérieurs gardent ces champs à null (tarif non enregistré) : leur coût enregistré reste celui d'origine.
ALTER TABLE "UsageRecord" ADD COLUMN     "durationMs" INTEGER,
ADD COLUMN     "priceIn" DOUBLE PRECISION,
ADD COLUMN     "priceOut" DOUBLE PRECISION,
ADD COLUMN     "pricePer1k" DOUBLE PRECISION;

-- Index du journal : tri par date décroissante, filtre par fournisseur.
CREATE INDEX "UsageRecord_providerId_at_idx" ON "UsageRecord"("providerId", "at");

-- Vue jev.consommation_ia (dictionnaire de Jev) : identifiant de requête, tarifs figés et durée, en fin de vue.
CREATE OR REPLACE VIEW jev.consommation_ia AS
SELECT
  (t.at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris' AS date,
  t."functionId" AS fonction,
  t."modelId" AS modele_id,
  t."providerId" AS fournisseur_id,
  t."projectId" AS projet_id,
  t."tokensIn" AS jetons_entree,
  t."tokensOut" AS jetons_sortie,
  t.requests AS requetes,
  t."costEur" AS cout_eur,
  t."fallbackUsed" AS secours_utilise,
  t.source::text AS origine,
  t.id AS requete_id,
  t."priceIn" AS prix_entree_eur_million,
  t."priceOut" AS prix_sortie_eur_million,
  t."durationMs" AS duree_ms
FROM "UsageRecord" t;
GRANT SELECT ON jev.consommation_ia TO jev_lecteur;
