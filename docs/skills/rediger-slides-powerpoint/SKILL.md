---
name: rediger-slides-powerpoint
description: Rédige le contenu de slides PowerPoint à partir des données d’un projet RISE Cockpit — comité (COPIL, COPROJ), point hebdomadaire, bilan de phase, arbitrage, lancement, restitution. À utiliser dès qu’un utilisateur demande des slides, une présentation, un support, un deck ou « un PowerPoint ». Produit un plan slide par slide (titre-message, contenu, visuel, note de l’orateur) prêt à mettre en forme ; ne génère pas de fichier .pptx.
---

## Objectif
Produire des slides qui se lisent en 10 secondes chacune : un titre qui dit le message, les chiffres qui le prouvent, le visuel qui le montre, et ce qu’il faut dire à l’oral. Le contenu vient des données du Cockpit et en cite la source.

## Quand appliquer cette skill
- « Prépare les slides du COPIL », « fais-moi un PowerPoint sur l’avancement », « un support pour le lancement du lot 2 », « trois slides sur les risques ».
- Toute présentation, quel que soit le public : direction, comité, équipe projet, client.
- Complément de la skill « Rapports » : celle-ci choisit les données d’un rapport de comité ; la présente skill règle la façon d’écrire chaque slide.

## Ce que Jev fait, et ce qu’il ne fait pas
- Jev rédige le contenu, slide par slide, prêt à coller dans PowerPoint ou dans un modèle de l’entreprise.
- Jev ne produit pas de fichier .pptx : le dire en une phrase si on le lui demande, puis livrer le contenu.
- Le rapport officiel d’une séance se génère dans Comités et rapports › Générer un rapport, à partir d’une séance et d’un template actif ; il s’exporte en PDF. Comités et rapports est en lecture seule pour Jev.

## Méthode
1. Cadrer en une question au plus, sinon prendre les valeurs par défaut :
- Public et niveau de l’instance : stratégique (COPIL), pilotage (COPROJ), opérationnel (équipe), ou client.
- But de la présentation : informer, faire décider, aligner, lancer.
- Durée ou nombre de slides : environ une slide pour deux minutes ; par défaut 8 à 12 slides pour un comité.
- Périmètre : projet, lot, phase, chantier ; date de référence : la date du jour du projet.
2. Écrire la ligne directrice avant les slides : le message principal en une phrase, puis trois arguments au plus qui le soutiennent. Chaque slide porte un de ces arguments.
3. Choisir le plan type (voir plus bas) et ne garder que les sections utiles au but.
4. Rédiger chaque slide selon l’anatomie ci-dessous, avec les données du Cockpit.
5. Relire avec la liste de contrôle finale et signaler toute donnée manquante ou ancienne.

## Anatomie d’une slide
1. Titre-message : une phrase complète de 15 mots au plus qui dit ce qu’il faut retenir. « Le Go-Live du 01/04/2027 tient si la répétition générale finit le 15/03 », pas « Planning ».
2. Contenu : trois à cinq puces de 12 mots au plus, ou un tableau de cinq lignes au plus. Une idée par slide.
3. Visuel : celui qui prouve le titre (voir le tableau des visuels).
4. Source et date : l’écran du Cockpit et la date des données, en pied de slide.
5. Note de l’orateur : deux phrases au plus, ce qu’il faut dire et la question à poser à la salle.

## Choisir le visuel selon la donnée
- Jalons : frise chronologique avec la date de référence et l’écart en jours ; mettre en évidence le prochain jalon.
- Risques : matrice probabilité × impact (1 à 5) ; critiques (score ≥ 20) en rouge, élevés (≥ 12) en ambre ; lister à côté les risques critiques sans plan de mitigation.
- Avancement d’une phase ou d’un chantier : barres prévu / réalisé ; à surveiller en dessous de 0 point d’écart, à risque en dessous de −20.
- Livrables : liste avec l’état maîtrisé, sous tension (retard de plus de 6 points sur le temps écoulé) ou critique (plus de 18 points, ou échéance dépassée).
- Actions : tableau code, libellé, porteur, échéance, statut ; les échues d’abord.
- Décisions : fiche d’arbitrage (question, options, critères, recommandation) ; une décision par slide si elle doit être prise en séance.
- Budget (si le module est actif) : consommé face à la référence, atterrissage financier ; sinon écrire « non évalué ».
- Baromètre : tendance des thèmes (bon, à surveiller, à risque) sur les derniers relevés.

## Plans types
- Comité de pilotage : page de garde ; synthèse de situation (météo, faits marquants, points d’attention) ; jalons ; planning ; risques et problèmes ; décisions à prendre ; décisions prises depuis la dernière séance ; prochaines étapes ; annexes.
- Point hebdomadaire : ce qui a avancé ; ce qui bloque ; actions échues et de la semaine ; échéances à 15 jours ; besoins d’arbitrage.
- Bilan de phase : objectifs de la phase ; livrables produits et leur état ; écarts de planning ; enseignements ; risques reportés sur la phase suivante ; décision de passage.
- Arbitrage : le problème ; les options (coût, délai, risque) ; les critères ; la recommandation ; la décision attendue et son échéance.
- Lancement : contexte et objectifs ; périmètre ; organisation et instances ; planning et jalons ; règles de fonctionnement ; prochaines étapes.

## Règles de rédaction
- Chiffres avant adjectifs, avec unité et date : « 12 actions échues au 26/09/2026 », jamais « de nombreuses actions ».
- Codes du Cockpit cités tels quels (A-31, R05, P01, D-007, J06) pour retrouver la source.
- Vocabulaire du Cockpit : jalon, livrable, chantier, lot, phase, séance, décision arbitrée.
- Couleur d’état toujours doublée d’un mot (maîtrisé, à surveiller, critique) : une slide doit rester lisible en noir et blanc.
- Aucune donnée inventée : si elle manque, l’écrire (« budget non évalué », « jalon non confirmé ») et le signaler.
- Faits, tendances et recommandation distingués ; la recommandation porte la mention « Recommandation ».
- Dates au format JJ/MM/AAAA ; sigles développés à la première occurrence.

## Format de sortie
- En tête : public, but, durée, nombre de slides, et la ligne directrice en une phrase.
- Puis, pour chaque slide : « Slide N — titre-message », le contenu, le visuel conseillé, la note de l’orateur.
- Un sommaire au-delà de huit slides ; une slide « Décisions attendues » dès qu’un arbitrage est en jeu ; les détails en annexe plutôt que dans le corps.
- En fin : les données manquantes ou anciennes, et le rappel qu’un brouillon se relit avant diffusion.

## Liste de contrôle finale
- Chaque titre se lit seul et dit un message.
- Aucune slide sans chiffre ou fait vérifiable, sauf la page de garde.
- Pas plus de cinq puces ni de deux visuels par slide.
- Les décisions attendues sont explicites, avec leur échéance.
- Les chiffres concordent d’une slide à l’autre.

## Exemples
- « Trois slides pour le COPIL sur les risques » → slide 1 : « Deux risques critiques menacent le Go-Live », matrice p × i ; slide 2 : les plans de mitigation et leurs porteurs ; slide 3 : la décision attendue sur R05.
- « Un point hebdo pour l’équipe » → cinq slides : avancées, blocages, actions échues, échéances à 15 jours, besoins d’arbitrage.
- « Génère le fichier PowerPoint » → « Je ne produis pas de fichier .pptx ; voici le contenu prêt à coller, slide par slide », puis le plan.
