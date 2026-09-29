-- Serveur d'envoi SMTP (spécification SMTP) : une seule ligne ; mot de passe chiffré, jamais lisible.
CREATE TABLE "smtp_settings" (
    "id" TEXT NOT NULL DEFAULT 'smtp',
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "enc" TEXT NOT NULL,
    "auth" BOOLEAN NOT NULL DEFAULT true,
    "user" TEXT NOT NULL DEFAULT '',
    "password_encrypted" TEXT,
    "from_address" TEXT NOT NULL,
    "last_test" JSONB,
    "last_ok_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "smtp_settings_pkey" PRIMARY KEY ("id")
);

-- Jev de la Console : vue en lecture seule, sans le mot de passe (droits par défaut du schéma jev).
CREATE VIEW jev.serveur_smtp AS
SELECT
  t.host AS serveur,
  t.port AS port,
  t.enc AS chiffrement,
  t.auth AS authentification,
  t."user" AS identifiant,
  t.password_encrypted IS NOT NULL AS mdp_enregistre,
  t.from_address AS expediteur,
  t.last_test AS dernier_test,
  (t.last_ok_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris' AS dernier_test_reussi_le,
  (t.updated_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris' AS modifie_le,
  t.updated_by AS modifie_par
FROM smtp_settings t;
