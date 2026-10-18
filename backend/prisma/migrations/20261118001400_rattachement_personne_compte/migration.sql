-- Rattachement explicite d'une personne du référentiel à un compte (audit de sécurité du 18/10/2026) : les droits d'une
-- personne ne passent plus à un compte d'après l'e-mail seul. Reprise des liens en vigueur : lien direct du compte
-- (`Account.personId`), puis e-mail identique (règle appliquée jusqu'ici), une personne au plus par compte et par projet.
ALTER TABLE "Person" ADD COLUMN "accountId" TEXT;

WITH c AS (
  SELECT DISTINCT ON (p."projectId", a."id") p."id" AS pid, a."id" AS aid
  FROM "Person" p JOIN "Account" a ON a."personId" = p."id"
  ORDER BY p."projectId", a."id", p."id"
)
UPDATE "Person" p SET "accountId" = c.aid FROM c WHERE p."id" = c.pid AND p."accountId" IS NULL;

WITH c AS (
  SELECT DISTINCT ON (p."projectId", a."id") p."id" AS pid, a."id" AS aid
  FROM "Person" p JOIN "Account" a ON lower(trim(p."email")) = lower(a."email")
  WHERE p."accountId" IS NULL
    AND NOT EXISTS (SELECT 1 FROM "Person" q WHERE q."projectId" = p."projectId" AND q."accountId" = a."id")
  ORDER BY p."projectId", a."id", p."id"
)
UPDATE "Person" p SET "accountId" = c.aid FROM c WHERE p."id" = c.pid AND p."accountId" IS NULL;

CREATE UNIQUE INDEX "Person_projectId_accountId_key" ON "Person"("projectId", "accountId");
