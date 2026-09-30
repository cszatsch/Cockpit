## Analyse des erreurs et améliorations

### Méthode

- Chaque question du jeu de test a reçu son type attendu et sa justification **avant** le premier appel à l'API.
- Chaque version des consignes a été soumise **3 fois** au modèle Jev (TypeSafe, `jev-latest`) via la carte « JEV » du Registre, sur la base réelle de la plateforme.
- Les exemples ajoutés aux consignes des versions 2 et 3 sont volontairement **différents** des questions du jeu de test, pour ne pas fausser la mesure.

### Version 1 : consignes courtes en français

Taux sur les questions non ambiguës : **97,8 %**. L'objectif de 95 % est atteint, mais trois défauts apparaissent.

1. **D04 « Qui est PMO sur le projet RISE ? » est instable.** Le modèle hésite entre usage et données : 0,55 USAGE, puis 0,43 et 0,30, classé AMBIGU. La même hésitation, à la limite du seuil, touche D06 (« Quel est le modèle principal… », 0,56) et D13 (« Quelles règles… sont actives ? », 0,71).
   - *Cause probable* : une question sur la **configuration actuelle** ressemble à une question de fonctionnement. Les consignes n'énonçaient pas le critère qui départage les deux : la réponse dépend-elle des enregistrements actuels ?
2. **Les questions mixtes P01 et P02 sont classées USAGE avec confiance** (0,90 et 1,00).
   - *Cause probable* : l'option « mixte » était décrite trop brièvement, alors que « usage » mentionnait « quelles règles s'appliquent », ce qui attirait les questions en « pourquoi ».
3. **Cause transversale** : Jev est entraîné surtout en anglais. D'après la documentation TypeSafe, sa précision est moindre dans les autres langues, or les consignes étaient en français.

### Version 2 : consignes en anglais, structurées, critère discriminant explicite (**en service**)

Modifications :
- consignes et descriptions en anglais ; les questions restent posées en français ;
- chaque option décrit ce qu'elle couvre, ce qu'elle exclut (« not_for ») et donne des exemples ;
- la question posée au modèle nomme le critère : expliquer le fonctionnement, lire les enregistrements actuels, les deux, ou rien.

Résultats :
- **100 %** sur les questions non ambiguës ;
- 98 % au global ;
- **aucune question instable** sur les 3 passages ;
- DONNÉES passe de 95 % à 100 % : D04, D06 et D13 sont désormais classées DONNÉES de façon stable ;
- P01 est désormais reconnue comme mixte.

**Erreur restante : P02** (« La clé Google est invalide, comment je la remplace et quelles fonctions sont touchées ? ») est classée USAGE, avec une confiance de 0,66 à 0,78.
- *Cause* : la partie « comment je la remplace » domine ; la seconde demande (« quelles fonctions ») est secondaire dans la phrase.
- *Effet* : la réponse est traitée comme une question d'usage, sans lecture des données. Les consignes d'usage demandent alors à Jev de signaler que la partie « quelles fonctions » dépend des données actuelles et de proposer de la poser séparément. La perte est donc limitée.

### Version 3 : v2 + deux questions oui/non atomiques (**écartée**)

- *Idée* : la documentation TypeSafe recommande de décomposer les questions composites.
  - Deux questions oui/non ont été ajoutées dans le même appel : « demande-t-elle comment faire ? » et « demande-t-elle des données actuelles ? ».
  - Si les deux dépassaient 0,6, la question était traitée comme mixte.
- *Résultat* : 95,7 % sur les questions non ambiguës, en **baisse**. DONNÉES tombe à 90 %.
- *Cause* :
  - la question « fonctionnement » répond oui aussi pour des questions de configuration (D06 : 0,86 ; D13 : 0,89), qui deviennent à tort des mixtes ;
  - P02 n'est pas rattrapée pour autant (données : 0,29).
- *Décision* : la v3 reste définie dans le code, pour que le rapport soit reproductible, mais n'est pas utilisée.

### Temps de réponse

- Environ **250 ms** en moyenne, 240 ms en médiane, 630 ms au maximum, identique pour les trois versions.
- Ajouter des questions dans un même appel ne change pas le temps de réponse, comme l'annonce TypeSafe.
- Aucun repli (erreur, délai dépassé, réponse illisible) sur les 450 appels.

### Comportements retenus dans Jev

| Type | Traitement |
|---|---|
| USAGE | Réponse sur le fonctionnement, **sans lecture des données**. La recherche dans le guide utilisateur (RAG) sera branchée à l'étape suivante. |
| DONNÉES | Interrogation des tables de la Console (requête en lecture seule), avec une consigne qui l'oriente vers la requête. |
| AMBIGU (mixte, question vague, confiance < 0,5) | **Les deux traitements** : Jev peut expliquer et lire les données. Pour une question très vague (« invitations ? »), la réponse peut demander une précision. |
| HORS_SUJET | Réponse polie qui rappelle le périmètre de Jev, sans appel au modèle de rédaction. |
| Erreur de l'API (carte absente, désactivée ou sans clé, délai dépassé, erreur HTTP, réponse illisible) | Repli sur **les deux traitements** (AMBIGU), motif enregistré dans `jev_classifications` et dans le journal du serveur. |

Questions de suite : les 3 dernières questions de la conversation (mémoire de Jev) accompagnent la question. Les deux questions de suite du jeu de test (P09, P10) sont classées correctement dans les trois versions.

### Pour relancer le test

```
cd backend
npm run jev:aiguillage -- --version v2 --passages 3
```

Le rapport est régénéré à chaque lancement, avec toutes les versions déjà mesurées. Pour une nouvelle version des consignes : l'ajouter dans `ROUTER_PROMPTS` (`backend/src/domain/jev-router.ts`) avec des exemples qui ne reprennent pas le jeu de test, la mesurer, puis changer `ROUTER_PROMPT_VERSION` si elle fait mieux.
