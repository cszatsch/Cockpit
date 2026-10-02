-- Message d'accueil de l'écran Aujourd'hui rédigé par Jev (02/10/2026) : une génération par compte, projet et jour.
CREATE TABLE "today_greetings" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "text" TEXT,
    "reason" TEXT,
    "modelId" TEXT,
    "promptVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "today_greetings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "today_greetings_accountId_projectId_day_key" ON "today_greetings"("accountId", "projectId", "day");
CREATE INDEX "today_greetings_createdAt_idx" ON "today_greetings"("createdAt");

-- Module de la Console « Message d'accueil de Jev » : actif sur tous les projets ; le désactiver rend le message par règles.
INSERT INTO "Module" ("id", "name", "description", "scope", "globalSince", "updatedAt", "version")
VALUES ('jev_accueil', 'Message d’accueil de Jev', 'Message de l’écran Aujourd’hui rédigé chaque jour par Jev, avec le ton de sa Personnalité. Désactivé : message calculé par règles.', 'ALL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)
ON CONFLICT ("id") DO NOTHING;
