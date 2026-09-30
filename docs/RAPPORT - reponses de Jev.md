# Rapport — réponses de Jev après l'aiguillage (Console)

30/09/2026. Brief « Implémentation de l'aiguillage de JEV (DONNÉES, USAGE, AMBIGUÏTÉ) ». Décisions : `docs/DECISIONS.md` § « Jev de la Console : réponses après l'aiguillage ».

## 1. Réalisé

| Traitement | Déclencheur | Chaîne |
|---|---|---|
| **DONNÉES** | type DONNEES | Requête SQL existante (`JevSqlService`), inchangée ; mémoire comprise. |
| **USAGE** | type USAGE | Reformulation de la question de suite (Guidage) → vectorisation avec le modèle de l'index (Qwen3 Embedding 8B, 1 536 dim.) → pgvector HNSW, 8 plus proches, seuil 0,58 → reclassement Voyage rerank-2.5, 4 meilleurs (repli : 4 premiers, tracé) → rédaction par la fonction Synthèse (Claude Sonnet 5) à partir des seuls extraits, citations (section, p. N), sources sous la réponse. |
| **Clarification** | AMBIGU, HORS_SUJET, aucun extrait au-dessus du seuil, guide non indexé, recherche indisponible | Fonction Guidage : « Génère une réponse à cette demande, qui nécessite une clarification de la part de l'utilisateur : [question] » + motif, capacités de Jev, historique ; 2 ou 3 reformulations ou options. |

- **Mémoire commune** : chaque question et sa réponse, quel que soit le traitement, avec type, reformulation et sources (`jev_messages`).
- **Réglages** sans valeur en dur : écran Guide utilisateur, bloc « Recherche de Jev dans le guide » (`jev_rag_settings`, audit sensible).
- **Journal technique** par question (`jev_answer_logs`) : type, traitement, motif, reformulation, 8 candidats (similarité), extraits retenus (score du reclassement), reclasseur ou repli, modèle, temps par étape, erreur.

## 2. Calibrage du seuil de similarité

Recherche des 50 questions dans le guide réel (47 pages, 101 extraits), seuil à 0 :

| Groupe | Meilleure similarité |
|---|---|
| USAGE (20 + P07, P10) | 0,66 à 0,87 |
| DONNÉES (20) | 0,61 à 0,82 (non concernées : elles ne passent pas par la recherche) |
| HORS SUJET (P04, P05) | 0,51 à 0,52 |

Seuil retenu : **0,58** (`RAG_DEFAULTS.minSimilarity`), réglable dans la Console. Latences mesurées : vectorisation 0,8 à 1,1 s, reclassement 0,4 s (un délai de 10 s dépassé une fois, ponctuellement, lors du premier essai).

## 3. Tests automatiques

`npm test` : **479 tests réussis**. Nouveaux :

- `test/unit/jev-rag.spec.ts` : réglages et bornes, sources, bloc d'extraits, préfixe Qwen3, prompt de clarification, reformulation.
- `test/e2e/jev-reponses.spec.ts` :
  - réglages (défauts, bornes, droits, audit) ;
  - USAGE avec sources et reclassement ;
  - **Voyage Rerank en panne** : repli sur les 4 premiers, tracé ;
  - **aucun extrait au-dessus du seuil** : clarification, pas de rédaction à vide ;
  - **suite après USAGE** (reformulée) et **après DONNÉES** (« Et le mois dernier ? ») ;
  - **changement de type** dans une conversation, mémoire commune ;
  - modèle indisponible : échange non gardé.
- `test/e2e/jev-aiguillage.spec.ts` adapté : hors sujet → clarification, USAGE sans guide indexé → clarification.

## 4. Rejeu des 50 questions (réponse finale)

`npm run jev:reponses`, 1 passage en réel le 30/09/2026. Critères annotés avant tout appel (`test/fixtures/jev-reponses.json`). Réponses complètes pour relecture : `docs/aiguillage-jev/Jev - reponses finales.xlsx` (colonnes « Relecture » et « Commentaire » à remplir).

| Groupe | Critère | Résultat |
|---|---|---|
| USAGE (22) | au moins une source dans les sections attendues | **22 / 22** (la 1re source est dans une section attendue dans les 22 cas) |
| DONNÉES (22, dont P08 et P09) | requête exécutée sans erreur | **21 / 22** |
| AMBIGU / HORS SUJET (6) | réponse de clarification | **5 / 6** |
| **Total** | | **48 / 50** |

Écarts :

- **D02** « Quels utilisateurs ne se sont pas connectés depuis 30 jours ? » : la requête écrite par le modèle échoue deux fois (`extract(unknown, integer)`) ; Jev l'explique et propose de reformuler. Traitement DONNÉES existant, non modifié par ce lot.
- **P02** (question mixte, clé Google + fonctions touchées) : classée USAGE par l'API de JEV. La réponse donne la procédure d'après le guide et dit qu'elle n'a pas la liste des fonctions touchées, en renvoyant vers Affectation des modèles : utile et honnête, mais sans clarification.

Mémoire vérifiée en réel : P09 « Et pour le mois dernier ? » répond sur août ; P10 « Et pour un administrateur ? » est reformulée (« Et pour un administrateur, faut-il aussi activer au moins un projet… ») et cite 3.3.3 et 4.2.

Temps de réponse total (classification comprise), médiane / maximum : guide 6,0 s / 22,7 s ; données 3,3 s / 6,7 s ; clarification 2,5 s / 3,6 s. Aucun repli du reclassement. Coût mesuré : ≈ 0,24 € pour la recherche, la synthèse et les clarifications (Synthèse 0,22 €), plus les appels SQL de Guidage.

Correction après relecture : le modèle recopiait parfois le chemin complet de la section dans ses citations ; les extraits portent désormais le seul titre de section (`guideExtractsBlock`).

## 5. Questions ouvertes

1. Requêtes SQL sur les dates (D02) : ajouter au dictionnaire ou aux consignes SQL un exemple de calcul d'intervalle ? (Hors du périmètre de ce lot.)
2. Questions mixtes classées USAGE (P02) : faut-il compléter une réponse du guide par une lecture des données quand la question le demande ?
3. Délai de vectorisation (10 s par défaut) : à surveiller dans le journal technique après la mise en service.
