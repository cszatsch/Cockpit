-- Skills de Jev (spécification SKILLS § 5)
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "n" TEXT NOT NULL,
    "t" TEXT NOT NULL DEFAULT '',
    "on" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- Données initiales : les cinq skills de démonstration (livraison Skills), dans l'ordre de la liste.
INSERT INTO "Skill" ("id", "n", "t", "on", "position", "updated_at", "updated_by") VALUES ('s1', 'Analyser le projet', '## Objectif
Aider à comprendre l’état réel du projet : santé, risques, jalons et évolutions.

## Consignes
- Toujours partir des données du projet et citer la source de chaque chiffre.
- Distinguer les faits, les tendances et les hypothèses.
- Pour un Go / No-Go, lister chaque critère avec son seuil et sa valeur.

## Format
1. Le constat en une phrase.
2. Les trois points qui comptent le plus.
3. La recommandation, si elle est demandée.', true, 1, CURRENT_TIMESTAMP, 'Données initiales');
INSERT INTO "Skill" ("id", "n", "t", "on", "position", "updated_at", "updated_by") VALUES ('s2', 'Rédiger un livrable', '## Objectif
Produire des livrables prêts à relire : comptes rendus, rapports, ordres du jour, relances.

## Consignes
- Reprendre la structure du modèle de document du projet.
- Chaque action a un porteur et une échéance.
- Signaler une information manquante au lieu de la supposer.

## Format
Un brouillon, jamais diffusé sans relecture.', true, 2, CURRENT_TIMESTAMP, 'Données initiales');
INSERT INTO "Skill" ("id", "n", "t", "on", "position", "updated_at", "updated_by") VALUES ('s3', 'Mettre à jour les données', '## Objectif
Créer, modifier ou supprimer des actions, risques et jalons à la demande.

## Consignes
- Toujours présenter la modification avant de l’appliquer.
- Attendre la validation explicite de l’utilisateur.
- Refuser une suppression groupée sans confirmation élément par élément.', true, 3, CURRENT_TIMESTAMP, 'Données initiales');
INSERT INTO "Skill" ("id", "n", "t", "on", "position", "updated_at", "updated_by") VALUES ('s4', 'Assister l’administration', '## Objectif
Assister l’administrateur de la plateforme.

## Consignes
- Contrôler un fichier d’initialisation et lister les non-conformités.
- Expliquer une panne IA et proposer le correctif.', false, 4, CURRENT_TIMESTAMP, 'Données initiales');
INSERT INTO "Skill" ("id", "n", "t", "on", "position", "updated_at", "updated_by") VALUES ('s5', 'Guider l’utilisateur', '## Objectif
Répondre aux questions « comment faire » sur le Cockpit.

## Consignes
- Répondre en trois étapes au plus.
- Terminer par le lien vers l’écran concerné.', true, 5, CURRENT_TIMESTAMP, 'Données initiales');
