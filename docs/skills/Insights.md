## Objectif
Donner une lecture fiable de l’état réel du projet : où il en est, ce qui dérape, ce qui menace les prochains jalons, et ce qu’il faut décider. Chaque constat s’appuie sur les données du Cockpit et en cite la source.

## Quand appliquer cette skill
- L’utilisateur demande « où en est le projet », « qu’est-ce qui bloque », « est-on prêt pour le Go / No-Go », « que dire au prochain COPIL ».
- Il veut une synthèse d’un chantier, d’une phase, d’un lot, ou une comparaison avec le planning de référence.
- Il demande les risques, actions, décisions ou jalons qui méritent son attention.
- Pour modifier une donnée, appliquer plutôt la skill de mise à jour ; pour préparer une présentation, la skill de rapport.

## Méthode
1. Cadrer le périmètre : projet entier, chantier (C1 à C8), phase, lot, ou objet précis (A-31, R05, D-007, J06). Par défaut, le projet entier et les 45 prochains jours.
2. Relever les faits dans cet ordre : jalons, livrables, risques et problèmes, actions, décisions, séances à venir, budget si le module est actif.
3. Appliquer les règles du Cockpit (ci-dessous) pour qualifier chaque fait, sans inventer de seuil.
4. Distinguer trois niveaux : les faits (données), les tendances (évolution, écarts), les hypothèses (ce qu’on en déduit). Les nommer comme tels.
5. Hiérarchiser : ce qui menace le prochain jalon d’abord, puis le critique, puis le reste.
6. Conclure par la recommandation, seulement si elle est demandée ou si un arbitrage est manifestement attendu.

## Règles du Cockpit à appliquer
- Jalons : l’écart est la date prévue moins la date de référence, en jours (0 = conforme). Le prochain jalon est le premier dont la date est aujourd’hui ou plus tard. Un jalon non confirmé depuis plus de 7 jours est à surveiller, plus de 14 jours en alerte. Changer la date d’un jalon annule sa confirmation.
- Risques : criticité = probabilité × impact (1 à 5 chacun). Critique à partir de 20, élevé à partir de 12, modéré à partir de 6, faible en dessous. Un risque critique sans plan de mitigation est une anomalie.
- Problèmes (P01…) : risques avérés, avec une sévérité de 1 à 5 et une cible de résolution.
- Actions : en retard si elles ne sont pas terminées et que leur échéance est passée. Statuts : À faire, En cours, Bloquée, Terminée. Priorité Haute, Moyenne ou Basse.
- Livrables : terminés à 100 % ; en retard après leur échéance ; sinon, écart = pourcentage de temps écoulé moins avancement. Plus de 18 points : critique ; plus de 6 : sous tension ; sinon maîtrisé. Un risque forcé à la main prime sur ce calcul.
- Avancement d’une phase ou d’un chantier : écart = réalisé moins prévu. En dessous de −20 points : à risque ; en dessous de 0 : à surveiller.
- Décisions : Brouillon, En instruction, À arbitrer, Arbitrée, Annulée, Remplacée. Une décision à arbitrer sans séance prévue est un point à signaler.
- Séances : une séance planifiée dont la date est passée est « à confirmer ».
- Santé du projet : c’est une appréciation posée à la main par le PMO, toujours avec sa raison. Ne pas la présenter comme un calcul ; la confronter aux faits si elle semble décalée.
- Fraîcheur : une donnée non revue depuis plus de 7 jours est à surveiller, plus de 14 jours en alerte ; le dire quand une conclusion en dépend.

## Anomalies à toujours remonter
- Risque critique sans plan de mitigation.
- Jalon non confirmé ou qui glisse par rapport à la référence.
- Action échue, surtout si elle porte sur un jalon ou une décision.
- Budget non renseigné (la slide Budget affichera « non évalué »).
- Données modifiées depuis la dernière capture de rapport.

## Préparer un Go / No-Go ou un comité
1. Lister les critères du jalon (livrables attendus, risques ouverts, actions préalables, décisions requises).
2. Pour chaque critère : son seuil ou son attendu, sa valeur actuelle, et s’il est tenu.
3. Donner l’état d’ensemble en une phrase, puis les points qui empêchent un « Go ».
4. Proposer les décisions à mettre à l’ordre du jour de la séance.

## Droits et périmètre
- Un Responsable ou un Lecteur ne voit que ses chantiers : l’analyse porte sur ce qu’il voit, et le dire si le périmètre est partiel.
- Ne jamais extrapoler à partir d’un chantier invisible pour l’utilisateur.

## Format de réponse
1. Le constat en une phrase.
2. Les trois points qui comptent le plus, chacun avec son code et sa source (ex. « R05, criticité 20, sans plan »).
3. La recommandation, si elle est demandée.
- Chiffres exacts avec leur unité et leur date : « J06 prévu le 15/03/2027, +12 jours sur la référence ».
- Citer les codes (A-31, R05, P01, D-007, J06) pour que l’utilisateur ouvre l’objet d’un clic.
- Si une donnée manque, le dire (« budget non renseigné ») au lieu de la supposer.

## À éviter
- Inventer une formule de santé, un score global ou un seuil absent du Cockpit.
- Mélanger faits et opinions sans les distinguer.
- Noyer l’essentiel : au-delà de trois points, proposer le détail sur demande.
