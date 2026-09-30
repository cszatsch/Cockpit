-- Notifications sans alertes (décision du 30/09/2026) : il ne reste que des notifications envoyées à heure fixe
-- (quotidienne ou hebdomadaire). Les règles de type alerte sont supprimées (l'historique de leurs envois est conservé :
-- aucune clé étrangère entre "Delivery" et "NotificationRule") ; la fréquence « Immédiate », le type, le déclencheur
-- et le suivi des seuils budgétaires déjà signalés disparaissent.

-- 1. Données
DELETE FROM notification_occurrences o USING "NotificationRule" r WHERE o.rule_id = r.id AND r.kind = 'ALERT';
DELETE FROM "NotificationRule" WHERE kind = 'ALERT';
-- Une notification « Immédiate » restante devient quotidienne (heure gardée, sinon 07:00) ; prochain envoi recalculé.
UPDATE "NotificationRule"
SET frequency = 'DAILY', hour = COALESCE(hour, '07:00'), day = NULL, "scheduleKey" = NULL, "nextRunAt" = NULL
WHERE frequency = 'IMMEDIATE';
-- Les règles qui partaient sur un événement partent désormais à leur heure : prochain envoi recalculé.
UPDATE "NotificationRule" SET "scheduleKey" = NULL, "nextRunAt" = NULL WHERE trigger <> 'SCHEDULE';

-- 2. Vue du dictionnaire de Jev (dépend des colonnes retirées)
DROP VIEW IF EXISTS jev.regles_notification;

-- 3. Schéma
BEGIN;
CREATE TYPE "RuleFrequency_new" AS ENUM ('DAILY', 'WEEKLY', 'CUSTOM');
ALTER TABLE "NotificationRule" ALTER COLUMN "frequency" TYPE "RuleFrequency_new" USING ("frequency"::text::"RuleFrequency_new");
ALTER TYPE "RuleFrequency" RENAME TO "RuleFrequency_old";
ALTER TYPE "RuleFrequency_new" RENAME TO "RuleFrequency";
DROP TYPE "public"."RuleFrequency_old";
COMMIT;

ALTER TABLE "NotificationRule" DROP COLUMN "kind",
DROP COLUMN "trigger";

ALTER TABLE "user_notifications" DROP COLUMN "kind";

DROP TABLE "BudgetAlertFired";

DROP TYPE "RuleKind";

DROP TYPE "RuleTrigger";

-- 4. Vue recréée sans type ni déclencheur
CREATE VIEW jev.regles_notification AS
SELECT
  t.id AS id,
  t.name AS nom,
  t."targetProfiles" AS profils_cibles,
  t."projectIds" AS projets,
  t.platform AS plateforme,
  t."modelId" AS modele_id,
  t.prompt AS consigne,
  t.subject AS objet,
  t.body AS corps,
  t.frequency::text AS frequence,
  t.day AS jour,
  t.hour AS heure,
  t."everyDays" AS tous_les_n_jours,
  t.channels::text[] AS canaux,
  t.enabled AS active
FROM "NotificationRule" t;
GRANT SELECT ON jev.regles_notification TO jev_lecteur;
