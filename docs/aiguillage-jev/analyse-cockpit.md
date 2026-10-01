## Analyse des erreurs et décisions

### Méthode

- Jeu de 110 questions (`backend/test/fixtures/jev-routage-cockpit.json`). Le cas attendu et sa justification ont été fixés **avant** le premier appel à l'API.
- Répartition : environ 20 questions par cas (4a et 4b réunis), plus 10 questions à plusieurs demandes. Le jeu mêle :
  - questions simples ;
  - questions à la frontière de deux cas (1 / 4b, 2 / 3, 1 / 2) ;
  - formulations familières, avec fautes ou abréviations (COPIL, KO, « c koi ») ;
  - questions hors périmètre ;
  - questions de suite, avec historique.
- Chaque version des consignes a été soumise **3 fois** au modèle Jev (TypeSafe, `jev-latest`), via la carte « JEV » du Registre, sur la base réelle de la plateforme.
- Les exemples des consignes ne reprennent aucune question du jeu ; un test unitaire le vérifie. Ce test a détecté un exemple identique à une question (« planning ? », C5-01) : l'exemple a été remplacé et **toutes les versions ont été remesurées** ; les chiffres ci-dessous sont ceux de la seconde mesure.

### Requête envoyée à l'API

Une seule requête par question, qui contient trois questions :

1. une question **à choix** à 7 options : `donnees` (cas 1), `guide` (2), `modification` (3), `document` (4a), `donnees_et_documents` (4b), `clarification` et `hors_sujet` (cas 5) ;
2. une question **oui / non** « demande d'écriture » : le message demande-t-il à l'assistant de créer, modifier ou supprimer un enregistrement maintenant ? ;
3. une question **oui / non** « plusieurs demandes ».

**Règles de décision** (`parseCockpitRouterResponse`) :
- le cas 3 n'est retenu que si la confiance atteint **0,75** (`COCKPIT_ROUTER_WRITE_MIN_CONFIDENCE`) **et** si la « demande d'écriture » atteint **0,5** (`COCKPIT_ROUTER_WRITE_NOUL_MIN`) ; sinon, la question part en clarification ;
- pour les autres cas, sous **0,45** (`COCKPIT_ROUTER_MIN_CONFIDENCE`), la question part en clarification ;
- « plusieurs demandes » est signalé au-delà de **0,6**. Le cas retenu est celui de la première demande.

### Version cockpit-v2 : consignes en anglais, structurées (leçon du banc de la Console)

Première mesure, au seuil de 0,5 :

- **97,3 %** de bonne classification, identique sur les 3 passages. Aucune question instable.
- **0 %** de question de lecture classée en modification.
- Plusieurs demandes détectées à **100 %**, 1 % de fausses alertes.
- Trois erreurs, toutes **sans danger** puisqu'elles partent en clarification :
  - **C3-18** « Note que la décision D-005 a été arbitrée en faveur de l'option B. » : le modèle hésite (clarification, 0,36). *Cause* : « noter qu'un fait a eu lieu » n'était pas décrit comme une écriture.
  - **C4-17** et **C4-20** (« les jalons du kick off on les tient ou pas ? ») : bonne option (`donnees_et_documents` ou `donnees`), mais confiance juste sous 0,5 (0,45 à 0,49). *Cause* : le cas 4b ne nommait pas explicitement la comparaison avec « ce qui avait été annoncé ».

### Version cockpit-v3 (**en service**)

**Modifications :**
- la modification couvre aussi « noter, consigner qu'un fait a eu lieu » ;
- le cas 4b couvre explicitement « ce qui avait été annoncé, prévu ou décidé dans une présentation ou une séance passée tient-il encore ? » ; le cas 1 l'exclut ;
- un exemple ajouté à chacune de ces deux options, différent des questions du jeu.

**Mesure au seuil de 0,5 :** 98,2 % (99,1 / 98,2 / 97,3 % par passage), 2 questions instables. Les erreurs restantes sont toutes des confiances entre 0,45 et 0,49 sur la bonne option.

**Seuil général abaissé à 0,45.** La simulation sur les 660 observations des deux versions ne montre aucune bonne réponse perdue et aucune lecture classée en modification entre 0,30 et 0,45.

**Mesure finale au seuil de 0,45** (après correction de l'exemple, 3 passages par version) :
- v2 : 97,9 % (97,3 / 98,2 / 98,2 %), 2 questions instables ;
- v3 : **98,8 %** de bonne classification (98,2 / 99,1 / 99,1 % par passage) ;
- cas 1, 2, 4a et 5 à 100 % ; cas 3 à 95,5 % ; cas 4b à 95,8 % ;
- **0 %** de lecture classée en modification (0 sur 264) ;
- plusieurs demandes détectées à 100 % ;
- une seule question instable : C4-17 (4b, confiance proche du seuil).

*Réserve :* le seuil a été calé sur ce jeu. Il faudra le vérifier sur des questions réelles (les traces `jev_classifications` le permettent).

**Erreurs restantes :**
- **C3-18** (« Note que… ») : l'option `modification` est retenue à 0,74, juste sous le seuil d'écriture, et la « demande d'écriture » répond 0,08.
  - *Décision* : garder les deux garde-fous. Cette formulation part en clarification. Jev demandera « Voulez-vous que j'enregistre l'arbitrage de D-005 (option B) ? » : la perte est une question de plus, sans aucun risque d'écriture non voulue.
  - Élargir la question « demande d'écriture » aux constats (« note que ») augmenterait le risque de classer en écriture une phrase qui décrit un fait.
- **C4-17** (« Où en est le risque R03, et qu'en disait le compte rendu… ») : la bonne option est retenue à chaque passage, mais une fois sous le seuil (0,43). Elle part alors en clarification, sans danger.

### Temps de réponse

- Environ **245 ms** en moyenne, 240 ms en médiane, 510 ms au maximum. Les deux questions oui / non n'allongent pas l'appel.
- Aucun repli (erreur, délai, réponse illisible) sur les quelque 1 760 appels du banc.

### Objectifs du brief

| Objectif | Résultat (v3, 3 passages) | Atteint |
|---|---|---|
| ≥ 95 % de bonne classification | 98,8 % | Oui |
| 0 % de lecture classée en modification | 0 % (0/264) | Oui |
| Stabilité (même question posée 3 fois) | 109 questions sur 110 identiques sur les 3 passages | Oui |

### Pour relancer le test

```
cd backend
npm run jev:aiguillage-cockpit -- --version cockpit-v3 --passages 3
```

Pour une nouvelle version des consignes :
1. l'ajouter dans `COCKPIT_ROUTER_PROMPTS` (`backend/src/domain/jev-router-cockpit.ts`), avec des exemples qui ne reprennent pas le jeu de test ;
2. la mesurer ;
3. changer `COCKPIT_ROUTER_VERSION` si elle fait mieux.
