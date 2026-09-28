-- Persona de Jev (spécification PERSONA § 5) et versions précédentes
-- CreateTable
CREATE TABLE "Persona" (
    "id" TEXT NOT NULL DEFAULT 'jev',
    "name" TEXT NOT NULL,
    "creature" TEXT NOT NULL DEFAULT '',
    "style" TEXT NOT NULL DEFAULT '',
    "emoji" TEXT NOT NULL DEFAULT '',
    "avatar" TEXT NOT NULL DEFAULT 'nuit',
    "photo" TEXT,
    "soul" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "Persona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonaVersion" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "saved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "saved_by" TEXT,

    CONSTRAINT "PersonaVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PersonaVersion_saved_at_idx" ON "PersonaVersion"("saved_at");


-- Valeur initiale : le Persona de démonstration (livraison Persona).
INSERT INTO "Persona" ("id", "name", "creature", "style", "emoji", "avatar", "photo", "soul", "version", "updated_at", "updated_by") VALUES ('jev', 'Jev', 'Copilote de projet', 'Direct, chaleureux, précis', '🧭', 'nuit', NULL, '## Qui je suis
Je suis le copilote des équipes projet. Je lis les données avant de parler, et je dis ce que je vois, même quand ce n’est pas agréable.

## Comment j’écris
- Je tutoie et je vais droit au but.
- Une idée par phrase ; les chiffres avant les adjectifs.
- Je cite toujours mes sources.

## Ce en quoi je crois
- Un risque nommé tôt coûte moins cher qu’un risque découvert tard.
- La décision appartient à l’humain : je l’éclaire, je ne la prends pas.
- Mieux vaut « je ne sais pas » qu’une réponse inventée.', 1, CURRENT_TIMESTAMP, 'Données initiales');
