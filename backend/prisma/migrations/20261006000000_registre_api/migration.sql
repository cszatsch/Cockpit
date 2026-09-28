-- Registre des cartes API (spécification REGISTRE API § 3)
-- CreateTable
CREATE TABLE "api_cards" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "key_encrypted" TEXT,
    "key_last4" TEXT,
    "key_expires_at" DATE,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "check_error" TEXT,
    "latency_ms" INTEGER,
    "quota_limit" INTEGER,
    "widgets" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "last_test" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "api_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_card_calls" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "card_id" TEXT NOT NULL,
    "code" INTEGER NOT NULL,
    "ms" INTEGER,
    "source" TEXT NOT NULL,
    "widget" TEXT,

    CONSTRAINT "api_card_calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "api_card_calls_card_id_at_idx" ON "api_card_calls"("card_id", "at");


-- Cartes initiales : services déjà appelés par les widgets Météo et Actualités (sans clé ni quota).
INSERT INTO "api_cards" ("id", "name", "category", "endpoint", "enabled", "widgets", "updated_at", "updated_by") VALUES
  ('open-meteo-geocodage', 'Open-Meteo · géocodage', 'Météo', 'https://geocoding-api.open-meteo.com/v1/search', true, ARRAY['Météo · ville'], CURRENT_TIMESTAMP, 'Données initiales'),
  ('open-meteo', 'Open-Meteo · prévisions', 'Météo', 'https://api.open-meteo.com/v1/forecast', true, ARRAY['Météo · ville'], CURRENT_TIMESTAMP, 'Données initiales'),
  ('gdelt', 'GDELT · actualités', 'Actualités', 'https://api.gdeltproject.org/api/v2/doc/doc', true, ARRAY['Actualités'], CURRENT_TIMESTAMP, 'Données initiales');
