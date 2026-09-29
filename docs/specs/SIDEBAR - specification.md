# Sidebar Console v3 : spécification

Proposition 2a retenue (accordéon aéré). Ce fichier remplace la sidebar précédente. Les props, les événements et les identifiants de page ne changent pas.

## 1. Changements visuels
| Élément | Avant | v3 |
|---|---|---|
| Largeur dépliée | 252 px | **300 px** (72 px en mode rail, inchangé) |
| Vue d’ensemble | 38 px, 13 px | 46 px, 14,5 px |
| Titre de domaine | 38 px, 13 px gras | **46 px, capitales 11 px, espacement 0,15 em** |
| Page | 34 px, 12,5 px, tronquée par « … » | **42 px minimum, 14 px, titre complet sur 1 ou 2 lignes** |
| Page ouverte | barre ambre verticale | pastille ambre de 6 px sur le filet |
| Domaine ouvert | — | fond léger, filet sarcelle dégradé qui relie ses pages |
| Espacement entre domaines | 2 px | 8 px |

Couleur du titre de domaine : sarcelle `#3dd6c6` dès qu’il est ouvert (au clic), `#dfe8ee` s’il est replié et contient la page ouverte, `#6f8a9e` sinon. Aucune barre verticale ambre sur le bord de la sidebar.

## 2. Comportement (inchangé)
- Accordéon : un seul domaine déplié à la fois. Ouvrir un domaine referme le précédent.
- À l’arrivée sur une page, le domaine qui la contient est déplié.
- Un domaine replié affiche le compteur (pastille ambre) ou le point d’état (corail pour une erreur, ambre pour une alerte) de ses pages. S’il contient la page ouverte, son titre reste clair (`#dfe8ee`).
- Mode rail : icônes seules avec menu flottant (inchangé).

## 3. Libellés IA
`providers` Fournisseurs et modèles · `assign` Affectation des modèles · `conso` **Vue générale des coûts** · `journal` **Journal consommation et coûts**.
Mettre à jour `META` dans Console Admin avec les mêmes libellés.

## 4. Intégration
- Remplacer `Sidebar Console.dc.html`.
- Si la mise en page réserve une largeur fixe à la sidebar, passer de 252 à 300 px. La largeur du mode rail ne change pas.
- Hauteur utile : les 16 pages tiennent sans défilement sur 920 px avec IA ouvert. En dessous, la sidebar défile (déjà prévu).

## 5. Recette
1. Aucun titre de page n’est tronqué, y compris « Journal consommation et coûts » et « Initialisation d’un projet ».
2. Ouvrir Projets referme IA : le titre PROJETS passe en sarcelle, IA garde son point d’état et reste clair. Aucune barre ambre sur le bord.
3. Naviguer vers Snapshots depuis la Vue d’ensemble déplie Projets.
4. Le mode rail et le mode mobile se comportent comme avant.
5. Navigation au clavier : Tab parcourt uniquement les pages du domaine ouvert.
