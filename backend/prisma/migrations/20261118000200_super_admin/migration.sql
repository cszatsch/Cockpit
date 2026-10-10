-- Profil Super Admin de la Console (demande du commanditaire du 10/10/2026) : tous les droits de la Console ; l'Admin
-- consulte le menu IA sans le modifier ; seul un Super Admin attribue ce profil ou agit sur le compte d'un Super Admin.
ALTER TABLE "AdminGrant" ADD COLUMN "superAdmin" BOOLEAN NOT NULL DEFAULT false;

-- Au départ : le compte initial (u-initial) ; à défaut, l'administrateur le plus ancien — il en reste toujours un.
UPDATE "AdminGrant" SET "superAdmin" = true WHERE "accountId" = 'u-initial';
UPDATE "AdminGrant" SET "superAdmin" = true
WHERE NOT EXISTS (SELECT 1 FROM "AdminGrant" WHERE "superAdmin")
  AND "accountId" = (SELECT "accountId" FROM "AdminGrant" ORDER BY since ASC, "accountId" ASC LIMIT 1);
