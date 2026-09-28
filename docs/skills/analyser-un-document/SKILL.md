---
name: analyser-un-document
description: Analyse un document de projet (PDF, Word, PowerPoint, Excel, e-mail .msg ou .eml) déposé dans la Base de connaissance de RISE Cockpit ou joint à Jev — résumé, décisions, actions, risques, jalons, chiffres clés, écarts avec les données du Cockpit — et cite chaque élément (page, slide, onglet, cellule). À utiliser dès qu’un utilisateur demande de lire, résumer, analyser, comparer ou « extraire » un document, un compte rendu, un support de comité, un livrable ou un classeur.
---

## Objectif
Tirer d’un document ce qui compte pour piloter le projet, sans rien inventer : de quoi il parle, ce qui a été décidé, qui doit faire quoi et quand, ce qui menace le projet, et ce qui diffère des données du Cockpit. Chaque élément extrait renvoie à l’endroit exact du document.

## Quand appliquer cette skill
- « Résume ce compte rendu », « quelles décisions dans le CR du 20e COPIL ? », « analyse ce classeur », « compare ce support avec le planning ».
- Un document de la Base de connaissance ou une pièce jointe envoyée à Jev.
- Pour créer ou modifier ensuite des actions, risques ou décisions, enchaîner avec la skill « Gestion des données » (validation obligatoire).

## Règles de la plateforme
- Formats acceptés : PDF, Word (.docx), PowerPoint (.pptx), Excel (.xlsx), e-mails Outlook (.msg) et .eml ; 25 Mo au plus.
- État de l’extraction : en attente, réussie, partielle (e-mails : le corps sans toutes les pièces jointes), non prise en charge. Si l’extraction n’est pas réussie, le dire et limiter l’analyse à ce qui a été lu.
- Chaîne d’analyse des documents : vectorisation, reclassement des passages, synthèse. Une citation ouvre la version exacte et le passage.
- Chaque document a un type (compte rendu, livrable, référence, support de comité, contractuel…), une date, une version (v1, v2…) et des liens vers les objets du projet (risques, actions, décisions, jalons, livrables, séances, rapports, chantiers).
- Confidentialité : un document restreint n’est visible que du PMO et de l’administrateur. Ne jamais citer ni résumer un document restreint pour un utilisateur qui n’y a pas accès.
- La Base de connaissance est en lecture seule pour Jev : il ne dépose, ne renomme ni ne supprime aucun document.

## Méthode
1. Identifier le document : titre, type, version, date, auteur ou émetteur, confidentialité, état de l’extraction. Si plusieurs versions existent, analyser la plus récente et le préciser.
2. Lire selon le format (voir plus bas), en gardant pour chaque information sa position : page, slide, onglet et cellule, ou paragraphe.
3. Extraire les éléments de pilotage : décisions, actions, risques, problèmes, jalons et dates, chiffres clés, points ouverts.
4. Rapprocher avec le Cockpit : pour chaque élément, chercher l’objet existant (par code ou par libellé) et noter les écarts.
5. Restituer selon le format de sortie, en distinguant ce que dit le document, ce que disent les données du Cockpit, et ce que Jev en déduit.

## Lire selon le format
- PDF : suivre la structure (titres, sections, tableaux) ; un PDF scanné sans texte ne se lit pas : le signaler. Citer la page.
- Word : titres et sections, tableaux d’actions ou de décisions, annexes ; signaler les commentaires et modifications suivies s’ils apparaissent. Citer la section ou la page.
- PowerPoint : le titre de chaque slide porte son message ; lire aussi les tableaux, les graphiques (valeurs lisibles) et les notes de l’orateur. Citer le numéro de slide.
- Excel : lister les onglets, puis pour chacun les en-têtes, les unités, les totaux et les périodes ; distinguer valeurs et formules quand c’est visible ; ne pas extrapoler au-delà des lignes lues. Citer l’onglet et la cellule ou la plage. Le fichier d’initialisation du Cockpit (13 onglets, de « 01 Équipes » à « 13 Livrables ») relève de l’import du PMO : le serveur refait tous les contrôles et fait foi.
- E-mail : émetteur, date, destinataires, objet, demandes explicites et échéances ; signaler les pièces jointes non lues.

## Ce qu’il faut extraire
- Décisions : libellé, auteur ou instance, date, impact ; rapprocher des décisions D-xxx (brouillon, en instruction, à arbitrer, arbitrée).
- Actions : libellé, porteur, échéance, chantier ; une action sans porteur ou sans échéance est à compléter, le signaler.
- Risques : libellé, probabilité et impact de 1 à 5 si le document permet de les estimer (criticité = probabilité × impact ; critique à partir de 20), plan de mitigation.
- Problèmes : risques avérés, avec leur sévérité et leur cible de résolution.
- Jalons et dates : toute date annoncée, comparée au jalon J-xx et à sa date de référence (écart en jours).
- Chiffres clés : montants, pourcentages, effectifs, avec unité et période.
- Points ouverts : questions sans réponse, arbitrages demandés, informations manquantes.

## Rapprochement avec le Cockpit
- Objet existant et cohérent : le citer par son code.
- Écart : date, statut, porteur ou montant différent ; donner les deux valeurs et la source de chacune.
- Élément absent du Cockpit : le proposer à la création, sans l’enregistrer ; la création passe par la skill « Gestion des données » et la validation de l’utilisateur.
- Ne jamais corriger le document ni conclure à une erreur sans le dire comme une hypothèse.

## Format de sortie
1. Le document en une ligne : type, titre, version, date, émetteur, confidentialité.
2. L’essentiel en trois phrases.
3. Les éléments extraits, par rubrique (décisions, actions, risques, jalons, chiffres, points ouverts), chacun avec sa citation entre parenthèses (p. 4, slide 7, onglet « Budget » C12).
4. Les écarts avec le Cockpit, objet par objet.
5. Les propositions : créations ou mises à jour à valider.
6. Les limites de l’analyse : extraction partielle, pages illisibles, pièces jointes non lues, version ancienne.

## À éviter
- Inventer un contenu qui n’a pas été lu, ou compléter un chiffre manquant.
- Résumer sans citer : chaque élément extrait porte sa position dans le document.
- Présenter une proposition comme enregistrée.
- Dévoiler un document restreint à un utilisateur qui n’y a pas accès.

## Exemples
- « Quelles décisions dans le CR du 20e COPIL ? » → la liste des décisions avec leur page, rapprochées des D-xxx (par exemple D-007, base de planning v5 au 01/04/2027, arbitrée), puis celles absentes du Cockpit à créer.
- « Analyse ce classeur budgétaire » → les onglets, les totaux par période, l’écart avec l’atterrissage du module Budget s’il est actif, les cellules à vérifier.
- « Résume ce mail » → émetteur, date, demandes et échéances, pièces jointes non lues signalées.
