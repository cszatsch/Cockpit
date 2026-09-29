# Initialisation d'un projet : spécification

Console d'administration RISE › Projets › Initialisation d'un projet (`init`). Réservé au profil ADMIN.

## 1. Parcours

| Étape | Contenu | Sortie |
|---|---|---|
| 1 Importer | Zone de dépôt (glisser ou « Choisir un fichier »), liste des 13 onglets attendus, lien « Modèle Excel », « Charger l'exemple » | Fichier `.xlsx` lu |
| 2 Contrôler | 5 contrôles exécutés l'un après l'autre, carte fichier avec les 13 onglets, verdict | Conforme ou non conforme |
| 3 Prévisualiser | Bandeau projet (code, nom, client, dates, direction, 4 chiffres clés), 14 vues du référentiel, barre de validation fixe | Validation |
| 4 Valider | Création en 5 phases visibles, puis confirmation | Projet au statut PREPARATION |

Le stepper affiche la progression réelle de l'étape en cours. Les étapes terminées sont cliquables pour revenir en arrière (sauf après création).

## 2. Contrôles (étape 2)

Ordre d'exécution et affichage : en attente, en cours (indicateur animé et texte d'action), terminé (Conforme / N erreurs / N à vérifier).

1. **Structure du fichier** : présence des 13 onglets `01 Équipes` à `13 Livrables`. Les onglets s'allument un à un sur la carte fichier ; un onglet absent passe en rouge.
2. **Fiche projet** : code projet présent et absent de la bibliothèque (`existingCodes`).
3. **Champs obligatoires** : colonnes marquées OBLIGATOIRE non vides.
4. **Contrôles de cohérence** : colonnes CONTRÔLE commençant par `⚠`.
5. **Avertissements** : colonnes CONTRÔLE commençant par `◔`. Non bloquants.

Le détail liste jusqu'à 12 points (onglet, ligne, message).

## 3. Verdict et sorties

- **Conforme** : « Importer un autre fichier » et « Prévisualiser ».
- **Non conforme** : « Importer le fichier corrigé » ouvre directement le sélecteur de fichier et relance le contrôle. Rien n'est créé.
- **Dans tous les cas** : « Réinitialiser la session » renvoie à l'étape 1 et oublie le fichier chargé.

## 4. Création (étape 4)

Phases affichées dans l'ordre, chacune avec sa barre : Création du projet, Lots et phases, Chantiers et jalons, Personnes et habilitations, Instances de pilotage. Pourcentage global et libellé de la phase en cours (« étape n sur 5 »).

À la fin : `onImported({ code, name, client, start, end, dir, counts, file })`. La console ajoute le projet en tête de bibliothèque (badge « Nouveau ») et trace l'audit « Initialisation d'un projet », code et fichier, niveau sensible.

## 5. API attendue

| Méthode | Route | Rôle |
|---|---|---|
| POST | `/admin/projects/import/validate` | Envoie le fichier, renvoie `{ sheets, project, issues, missing }` et les 5 résultats de contrôle |
| POST | `/admin/projects/import/commit` | Crée le projet, **tout ou rien** dans une transaction |
| GET | `/admin/projects/import/{jobId}` | Avancement de la création : `{ phase: 1..5, percent }` (le frontend simule en attendant) |

Le contrôle final est toujours refait côté serveur au `commit`. Refus `409` si le code existe déjà, `422` si le fichier n'est plus conforme, `403` hors profil ADMIN.

## 6. Recette

1. « Charger l'exemple » : les 13 onglets s'allument, 5 contrôles passent, 2 avertissements, verdict « Fichier conforme ».
2. Importer `Referentiel RISE - exemple rempli.xlsx` : verdict en erreur, pas de bouton Prévisualiser, « Importer le fichier corrigé » et « Réinitialiser la session » présents.
3. « Réinitialiser la session » depuis l'étape 2 : retour à l'étape 1, aucun fichier conservé.
4. Un fichier non `.xlsx` affiche « Format attendu : .xlsx ».
5. En prévisualisation, le compteur « n / 14 vus » progresse et le stepper se remplit d'autant.
6. « Valider l'importation » : les 5 phases s'enchaînent, puis confirmation ; « Ouvrir la bibliothèque » appelle `onOpenLib`.
