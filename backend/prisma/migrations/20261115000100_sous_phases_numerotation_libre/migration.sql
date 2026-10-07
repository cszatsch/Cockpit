-- Sous-phases : numérotation libre (07/10/2026, arbitrage du commanditaire). Consigne de la skill « Préremplissage
-- d’un projet » mise à jour là où la phrase d'origine est encore présente (texte modifié par l'utilisateur : inchangé).
UPDATE "Skill"
SET "t" = replace("t", 'Définition : le découpage d’une phase en étapes plus fines. Le N° reprend celui de la phase : 5.1, 5.2…',
  'Définition : le découpage d’une phase en étapes plus fines. Numérotation libre, propre au projet et unique : reprendre celle de la proposition si elle en a une, sinon le N° de la phase suivi d’un rang (5.1, 5.2…).')
WHERE "t" LIKE '%Le N° reprend celui de la phase : 5.1, 5.2…%';
