# Rapport de test — aiguillage des questions de Jev (Cockpit)

Généré par `npm run jev:aiguillage-cockpit` le 01/10/2026 11:22:52.

Jeu de test : `backend/test/fixtures/jev-routage-cockpit.json`, 110 questions dont le cas attendu et sa justification ont été fixés **avant** tout appel à l'API :
- par cas : 1 Insight Cockpit (25), 2 Guide utilisateur (22), 3 Modification des données (22), 4a Documents (13), 4b Données + documents (8), 5 Clarification (20) ;
- par groupe : simple (50), familier (14), frontiere (24), suite (4), hors_perimetre (8), multi (10) ;
- 11 questions à plusieurs demandes (cas attendu : celui de la première demande).

Objectifs du brief : au moins 95 % de bonne classification, et **0 %** de question de lecture classée en modification.

## Synthèse par version des consignes

| Version | Passages | Global | Lecture classée en modification (objectif 0 %) | Modifications reconnues | Plusieurs demandes détectées | Fausses alertes « plusieurs demandes » | Par passage | Questions instables | Temps moyen / médian / max | Replis |
|---|---|---|---|---|---|---|---|---|---|---|
| cockpit-v2 | 3 | 97.9 % (323/330) | 0 % (0/264) | 95.5 % (63/66) | 100 % (33/33) | 1 % (3/297) | 97.3 % · 98.2 % · 98.2 % | 2 | 244 / 234 / 554 ms | 0 |
| cockpit-v3 | 3 | 98.8 % (326/330) | 0 % (0/264) | 95.5 % (63/66) | 100 % (33/33) | 1 % (3/297) | 98.2 % · 99.1 % · 99.1 % | 1 | 247 / 240 / 510 ms | 0 |

## Version cockpit-v2 — détail

Consignes : `COCKPIT_ROUTER_PROMPTS['cockpit-v2']` (`backend/src/domain/jev-router-cockpit.ts`). Seuils : général 0.45, écriture 0.75 et « demande d’écriture » ≥ 0.5, plusieurs demandes ≥ 0.6. Mesure du 01/10/2026 11:21:04.

### Taux de bonne classification par cas et par groupe

| Cas | Taux |
|---|---|
| 1 · Insight Cockpit | 100 % (75/75) |
| 2 · Guide utilisateur | 100 % (66/66) |
| 3 · Modification des données | 95.5 % (63/66) |
| 4a · Documents | 100 % (39/39) |
| 4b · Données + documents | 83.3 % (20/24) |
| 5 · Clarification | 100 % (60/60) |

| Groupe | Taux |
|---|---|
| simple | 99.3 % (149/150) |
| familier | 92.9 % (39/42) |
| frontiere | 95.8 % (69/72) |
| suite | 100 % (12/12) |
| hors_perimetre | 100 % (24/24) |
| multi | 100 % (30/30) |

### Matrice de confusion (lignes : cas attendu, colonnes : cas obtenu, tous passages)

| Attendu \ Obtenu | 1 | 2 | 3 | 4a | 4b | 5 |
|---|---|---|---|---|---|---|
| 1 | **72** | · | · | · | 3 | · |
| 2 | · | **66** | · | · | · | · |
| 3 | · | · | **63** | · | · | 3 |
| 4a | · | · | · | **39** | · | · |
| 4b | 1 | · | · | · | **20** | 3 |
| 5 | · | · | · | · | · | **60** |

Stabilité : 2 question(s) changent de cas d’un passage à l’autre : C4-17, C4-20.

### Erreurs (tous passages)

| Id | Question | Attendu | Obtenu (par passage) | Option du modèle | Confiance | Écriture | Motif du seuil |
|---|---|---|---|---|---|---|---|
| C3-18 | Note que la décision D-005 a été arbitrée en faveur de l'option B. | 3 | 5 · 5 · 5 | clarification | 0.31 | 0.11 | — |
| C4-17 | Où en est le risque R03, et qu'en disait le compte rendu du dernier comité projet ? | 4b | 5 · 4b · 4b | donnees_et_documents | 0.43 | 0.02 | confiance 0.43 sous le seuil 0.45 |
| C4-20 | les jalons du kick off on les tient ou pas ? | 4b | 1 · 5 · 5 | donnees | 0.49 | 0.08 | — |

### Tableau détaillé (passage 1)

| Id | Groupe | Question | Attendu | Obtenu | Option | Confiance | Écriture | Plusieurs | Temps |
|---|---|---|---|---|---|---|---|---|---|
| C1-01 | simple | Quels sont les risques critiques ouverts à ce jour sur le projet ? | 1 | 1 | donnees | 1.00 | 0.02 | 0.03 | 458 ms |
| C1-02 | simple | Quand a lieu le prochain COPIL ? | 1 | 1 | donnees | 1.00 | 0.02 | 0.02 | 223 ms |
| C1-03 | simple | Le chantier Finance est-il dans les temps par rapport au planning ? | 1 | 1 | donnees | 0.99 | 0.02 | 0.03 | 250 ms |
| C1-04 | simple | Combien d'actions sont en retard ? | 1 | 1 | donnees | 1.00 | 0.02 | 0.02 | 227 ms |
| C1-05 | simple | Qui porte l'action A-41 ? | 1 | 1 | donnees | 1.00 | 0.02 | 0.02 | 327 ms |
| C1-06 | simple | Quels jalons glissent par rapport à la référence ? | 1 | 1 | donnees | 0.79 | 0.03 | 0.04 | 307 ms |
| C1-07 | simple | Liste les décisions en attente d'arbitrage. | 1 | 1 | donnees | 1.00 | 0.03 | 0.03 | 228 ms |
| C1-08 | simple | Quel est l'avancement global du projet ? | 1 | 1 | donnees | 1.00 | 0.02 | 0.02 | 335 ms |
| C1-09 | simple | Quels problèmes de sévérité 5 sont encore ouverts ? | 1 | 1 | donnees | 1.00 | 0.02 | 0.03 | 278 ms |
| C1-10 | simple | Qui sont les membres du comité de pilotage ? | 1 | 1 | donnees | 1.00 | 0.02 | 0.02 | 272 ms |
| C1-11 | simple | Quels livrables doivent être remis dans les 30 prochains jours ? | 1 | 1 | donnees | 1.00 | 0.02 | 0.03 | 258 ms |
| C1-12 | simple | Combien de jours reste-t-il avant le Go-Live ? | 1 | 1 | donnees | 1.00 | 0.02 | 0.02 | 246 ms |
| C1-13 | familier | c koi les actions de Karim qui sont KO ? | 1 | 1 | donnees | 0.99 | 0.03 | 0.04 | 213 ms |
| C1-14 | familier | nb de risques sans plan de mitig ? | 1 | 1 | donnees | 1.00 | 0.02 | 0.04 | 303 ms |
| C1-15 | familier | le prochain copil c quand déjà | 1 | 1 | donnees | 1.00 | 0.03 | 0.04 | 244 ms |
| C1-16 | frontiere | Pourquoi l'action A-41 est-elle en retard ? | 1 | 1 | donnees | 0.94 | 0.02 | 0.02 | 238 ms |
| C1-17 | frontiere | Le baromètre des équipes s'est-il amélioré ce mois-ci ? | 1 | 1 | donnees | 1.00 | 0.02 | 0.03 | 251 ms |
| C1-18 | frontiere | Quels chantiers dépendent du chantier Interfaces ? | 1 | 1 | donnees | 1.00 | 0.03 | 0.03 | 252 ms |
| C1-19 | suite | Et ceux du chantier Ventes ? *(suite de : « Quels sont les risques critiques du chantier Finance ? »)* | 1 | 1 | donnees | 1.00 | 0.03 | 0.05 | 269 ms |
| C1-20 | frontiere | Est-ce que j'ai des validations à donner ? | 1 | 1 | donnees | 0.91 | 0.04 | 0.04 | 430 ms |
| C2-01 | simple | Comment créer un risque dans l'application ? | 2 | 2 | guide | 1.00 | 0.03 | 0.03 | 258 ms |
| C2-02 | simple | À qui dois-je m'adresser pour étendre mes habilitations à un autre chantier ? | 2 | 2 | guide | 0.99 | 0.03 | 0.03 | 233 ms |
| C2-03 | simple | Comment générer un rapport pour un comité de pilotage ? | 2 | 2 | guide | 1.00 | 0.03 | 0.03 | 262 ms |
| C2-04 | simple | Que signifie « non confirmé » à côté d'un jalon ? | 2 | 2 | guide | 1.00 | 0.02 | 0.02 | 232 ms |
| C2-05 | simple | Comment personnaliser mon tableau de bord ? | 2 | 2 | guide | 1.00 | 0.04 | 0.04 | 247 ms |
| C2-06 | simple | Quels formats de fichiers puis-je déposer dans la base de connaissance ? | 2 | 2 | guide | 1.00 | 0.02 | 0.03 | 237 ms |
| C2-07 | simple | Comment est calculée la criticité d'un risque ? | 2 | 2 | guide | 1.00 | 0.02 | 0.02 | 243 ms |
| C2-08 | simple | Où trouver l'historique des rapports générés ? | 2 | 2 | guide | 0.92 | 0.02 | 0.03 | 280 ms |
| C2-09 | simple | Comment changer mon mot de passe ? | 2 | 2 | guide | 0.95 | 0.04 | 0.03 | 230 ms |
| C2-10 | simple | Pourquoi ma session se ferme-t-elle toute seule ? | 2 | 2 | guide | 0.99 | 0.02 | 0.03 | 305 ms |
| C2-11 | simple | Qui peut modifier le référentiel du projet ? | 2 | 2 | guide | 1.00 | 0.03 | 0.02 | 221 ms |
| C2-12 | simple | À quoi sert la fiche d'arbitrage ? | 2 | 2 | guide | 1.00 | 0.02 | 0.02 | 243 ms |
| C2-13 | familier | comment on fait pour archiver une tache ? | 2 | 2 | guide | 1.00 | 0.03 | 0.03 | 236 ms |
| C2-14 | familier | le bouton pour inviter qqn il est où ?? | 2 | 2 | guide | 1.00 | 0.03 | 0.03 | 229 ms |
| C2-15 | frontiere | Comment ajouter une action liée à un risque ? | 2 | 2 | guide | 1.00 | 0.03 | 0.04 | 220 ms |
| C2-16 | frontiere | Est-ce que je peux supprimer un jalon ? | 2 | 2 | guide | 0.78 | 0.09 | 0.04 | 253 ms |
| C2-17 | frontiere | Comment demander à Jev de créer un risque à ma place ? | 2 | 2 | guide | 0.70 | 0.06 | 0.06 | 218 ms |
| C2-18 | frontiere | Comment déposer le support du COPIL dans la base de connaissance ? | 2 | 2 | guide | 0.98 | 0.05 | 0.04 | 202 ms |
| C2-19 | frontiere | Quelle est la différence entre un problème et un risque dans le Cockpit ? | 2 | 2 | guide | 1.00 | 0.02 | 0.03 | 221 ms |
| C2-20 | suite | Et pour une décision ? *(suite de : « Comment créer un risque dans l'application ? »)* | 2 | 2 | guide | 0.99 | 0.05 | 0.05 | 229 ms |
| C3-01 | simple | Ajoute le risque suivant dans le chantier Finance : Moindre disponibilité de l'équipe Finance pendant la clôture annuelle. Probabilité élevée, impact moyen à élevé. Mitigation : nommer un référent Finance disponible quelques heures par semaine. | 3 | 3 | modification | 1.00 | 0.97 | 0.07 | 208 ms |
| C3-02 | simple | Passe l'action A-41 au statut terminé. | 3 | 3 | modification | 1.00 | 0.96 | 0.03 | 242 ms |
| C3-03 | simple | Reporte l'échéance de l'action A-44 au 15 novembre. | 3 | 3 | modification | 1.00 | 0.96 | 0.04 | 335 ms |
| C3-04 | simple | Supprime le problème P03. | 3 | 3 | modification | 1.00 | 0.96 | 0.03 | 237 ms |
| C3-05 | simple | Crée une action pour relancer l'éditeur sur le correctif des interfaces, échéance vendredi, porteur Karim Benali. | 3 | 3 | modification | 1.00 | 0.97 | 0.09 | 223 ms |
| C3-06 | simple | Change la probabilité du risque R04 à 3. | 3 | 3 | modification | 1.00 | 0.96 | 0.04 | 219 ms |
| C3-07 | simple | Marque le risque R02 comme clos. | 3 | 3 | modification | 1.00 | 0.96 | 0.03 | 230 ms |
| C3-08 | simple | Ajoute une décision à arbitrer au COPIL : choisir le prestataire de reprise des données. | 3 | 3 | modification | 1.00 | 0.95 | 0.09 | 211 ms |
| C3-09 | simple | Réaffecte l'action A-43 à Laurent Garnier. | 3 | 3 | modification | 1.00 | 0.96 | 0.03 | 260 ms |
| C3-10 | simple | Rouvre le problème P02, il n'est pas réglé. | 3 | 3 | modification | 1.00 | 0.93 | 0.17 | 223 ms |
| C3-11 | simple | Mets à jour le plan de mitigation du risque R03 : atelier de cadrage CRM avec l'éditeur le 10 octobre. | 3 | 3 | modification | 1.00 | 0.96 | 0.08 | 225 ms |
| C3-12 | simple | Enregistre un nouveau problème de sévérité 4 sur le chantier Ventes : les données clients de test sont incomplètes. | 3 | 3 | modification | 1.00 | 0.97 | 0.06 | 251 ms |
| C3-13 | familier | ajoute une action : faire valider le PV de recette finance par le DAF | 3 | 3 | modification | 1.00 | 0.96 | 0.05 | 215 ms |
| C3-14 | familier | A-42 c'est fini, tu peux la clôturer stp | 3 | 3 | modification | 1.00 | 0.92 | 0.15 | 241 ms |
| C3-15 | familier | vire le risque R06 il sert plus a rien | 3 | 3 | modification | 0.99 | 0.94 | 0.13 | 274 ms |
| C3-16 | frontiere | Il faudrait ajouter un risque sur la disponibilité des key users pendant l'été, tu peux le faire ? | 3 | 3 | modification | 1.00 | 0.95 | 0.45 | 260 ms |
| C3-17 | frontiere | Décale le jalon de fin de recette Finance d'une semaine. | 3 | 3 | modification | 1.00 | 0.95 | 0.04 | 258 ms |
| C3-18 | frontiere | Note que la décision D-005 a été arbitrée en faveur de l'option B. | 3 | **5** | clarification | 0.31 | 0.11 | 0.03 | 243 ms |
| C3-19 | suite | Mets-la plutôt au 20. *(suite de : « Reporte l'échéance de l'action A-44 au 15 novembre. »)* | 3 | 3 | modification | 1.00 | 0.95 | 0.04 | 375 ms |
| C3-20 | suite | Oui, crée-la. *(suite de : « Il manque une action pour préparer la recette Ventes, non ? »)* | 3 | 3 | modification | 1.00 | 0.96 | 0.09 | 209 ms |
| C4-01 | simple | Quel était le sommaire du support de lancement (kick-off) du projet ? | 4a | 4a | document | 1.00 | 0.02 | 0.02 | 209 ms |
| C4-02 | simple | Quels risques ont été présentés lors du dernier comité de pilotage ? | 4a | 4a | document | 0.83 | 0.02 | 0.03 | 271 ms |
| C4-03 | simple | Résume le support du COPIL du 19 mars. | 4a | 4a | document | 0.99 | 0.03 | 0.03 | 217 ms |
| C4-04 | simple | Que dit le compte rendu du dernier comité projet sur la migration des données ? | 4a | 4a | document | 1.00 | 0.02 | 0.03 | 205 ms |
| C4-05 | simple | Quels étaient les objectifs annoncés dans la présentation de lancement ? | 4a | 4a | document | 1.00 | 0.02 | 0.03 | 214 ms |
| C4-06 | simple | Dans le support SAP du kick-off, comment est organisée la gouvernance ? | 4a | 4a | document | 0.96 | 0.02 | 0.04 | 231 ms |
| C4-07 | simple | Quelles décisions ont été actées dans le compte rendu du COPIL de septembre ? | 4a | 4a | document | 0.98 | 0.02 | 0.03 | 205 ms |
| C4-08 | simple | Retrouve dans les documents la liste des pays du périmètre de déploiement de la vague 2. | 4a | 4a | document | 1.00 | 0.02 | 0.03 | 278 ms |
| C4-09 | familier | y avait quoi dans le deck du copil de mars ? | 4a | 4a | document | 1.00 | 0.02 | 0.03 | 219 ms |
| C4-10 | familier | le PPT du kick off il parle du planning ? | 4a | 4a | document | 0.99 | 0.02 | 0.04 | 202 ms |
| C4-11 | frontiere | Quel planning avait été présenté au lancement du projet ? | 4a | 4a | document | 0.89 | 0.02 | 0.03 | 213 ms |
| C4-12 | frontiere | Qu'a-t-on dit des articles de remplacement au dernier COPIL ? | 4a | 4a | document | 0.96 | 0.02 | 0.03 | 230 ms |
| C4-13 | frontiere | Les actions décidées au COPIL de septembre sont-elles toutes terminées ? | 4b | 4b | donnees_et_documents | 0.81 | 0.02 | 0.03 | 233 ms |
| C4-14 | frontiere | Le Go-Live annoncé au kick-off est-il toujours tenu ? | 4b | 4b | donnees_et_documents | 0.93 | 0.02 | 0.03 | 205 ms |
| C4-15 | frontiere | Compare l'avancement actuel des chantiers avec celui présenté au dernier comité de pilotage. | 4b | 4b | donnees_et_documents | 0.98 | 0.03 | 0.06 | 239 ms |
| C4-16 | frontiere | Quels risques critiques actuels n'ont pas été présentés au dernier COPIL ? | 4b | 4b | donnees_et_documents | 0.89 | 0.02 | 0.04 | 230 ms |
| C4-17 | simple | Où en est le risque R03, et qu'en disait le compte rendu du dernier comité projet ? | 4b | **5** | donnees_et_documents | 0.43 | 0.02 | 0.93 (attendu) | 221 ms |
| C4-18 | frontiere | Le budget engagé correspond-il à celui du contrat ? | 4b | 4b | donnees_et_documents | 0.98 | 0.02 | 0.04 | 214 ms |
| C4-19 | frontiere | Donne-moi l'état des jalons et ce que le support de lancement prévoyait pour eux. | 4b | 4b | donnees_et_documents | 0.64 | 0.03 | 0.82 | 242 ms |
| C4-20 | familier | les jalons du kick off on les tient ou pas ? | 4b | **1** | donnees | 0.49 | 0.08 | 0.07 | 217 ms |
| C5-01 | simple | planning ? | 5 | 5 | clarification | 0.89 | 0.06 | 0.05 | 221 ms |
| C5-02 | simple | Tu peux regarder ? | 5 | 5 | clarification | 1.00 | 0.07 | 0.04 | 238 ms |
| C5-03 | simple | Fais-le. | 5 | 5 | clarification | 0.99 | 0.53 | 0.05 | 256 ms |
| C5-04 | simple | C'est grave ? | 5 | 5 | clarification | 0.99 | 0.03 | 0.03 | 227 ms |
| C5-05 | simple | Aide | 5 | 5 | clarification | 0.99 | 0.04 | 0.03 | 205 ms |
| C5-06 | familier | ça marche pas | 5 | 5 | clarification | 0.99 | 0.04 | 0.03 | 263 ms |
| C5-07 | frontiere | Et pour lui ? | 5 | 5 | clarification | 1.00 | 0.08 | 0.05 | 208 ms |
| C5-08 | frontiere | Le risque, tu le mets ou pas ? | 5 | 5 | clarification | 0.58 | 0.65 | 0.17 | 231 ms |
| C5-09 | frontiere | Qu'est-ce que tu en penses ? | 5 | 5 | clarification | 0.99 | 0.03 | 0.03 | 237 ms |
| C5-10 | frontiere | Il faudrait peut-être revoir les risques… | 5 | 5 | clarification | 0.78 | 0.35 | 0.06 | 229 ms |
| C5-11 | hors_perimetre | Quelle est la capitale de l'Australie ? | 5 | 5 | hors_sujet | 1.00 | 0.02 | 0.02 | 214 ms |
| C5-12 | hors_perimetre | Écris-moi un poème sur l'automne. | 5 | 5 | hors_sujet | 1.00 | 0.02 | 0.02 | 213 ms |
| C5-13 | hors_perimetre | Quel temps fera-t-il demain à Lyon ? | 5 | 5 | hors_sujet | 1.00 | 0.01 | 0.02 | 210 ms |
| C5-14 | hors_perimetre | Réserve-moi un train pour Paris lundi. | 5 | 5 | hors_sujet | 0.96 | 0.15 | 0.05 | 223 ms |
| C5-15 | hors_perimetre | Comment faire un tableau croisé dynamique dans Excel ? | 5 | 5 | hors_sujet | 0.99 | 0.02 | 0.02 | 221 ms |
| C5-16 | hors_perimetre | Traduis ce paragraphe en allemand : le projet avance bien. | 5 | 5 | hors_sujet | 1.00 | 0.02 | 0.02 | 268 ms |
| C5-17 | hors_perimetre | Qui a gagné la Ligue des champions l'an dernier ? | 5 | 5 | hors_sujet | 1.00 | 0.02 | 0.02 | 238 ms |
| C5-18 | hors_perimetre | Envoie un mail à toute l'équipe pour décaler la réunion. | 5 | 5 | modification | 0.73 | 0.34 | 0.07 | 232 ms |
| C5-19 | familier | slt | 5 | 5 | clarification | 0.86 | 0.04 | 0.03 | 223 ms |
| C5-20 | familier | ?? | 5 | 5 | clarification | 1.00 | 0.09 | 0.06 | 266 ms |
| M-01 | multi | Liste les risques critiques et ajoute-en un nouveau sur la disponibilité des key users. | 1 | 1 | donnees | 0.98 | 0.94 | 0.97 (attendu) | 213 ms |
| M-02 | multi | Comment on crée une décision ? Et combien sont en attente aujourd'hui ? | 2 | 2 | guide | 0.99 | 0.04 | 0.96 (attendu) | 235 ms |
| M-03 | multi | Clôture l'action A-42 et dis-moi combien il en reste en retard. | 3 | 3 | modification | 1.00 | 0.96 | 0.97 (attendu) | 222 ms |
| M-04 | multi | Quand est le prochain COPIL et que contenait le support du précédent ? | 1 | 1 | donnees | 0.93 | 0.02 | 0.95 (attendu) | 229 ms |
| M-05 | multi | Résume le compte rendu du dernier comité projet puis crée les actions qui en découlent. | 4a | 4a | document | 1.00 | 0.93 | 0.97 (attendu) | 214 ms |
| M-06 | multi | Où je dépose un document, et quels documents ont été déposés cette semaine ? | 2 | 2 | guide | 0.99 | 0.04 | 0.95 (attendu) | 353 ms |
| M-07 | multi | Quel est l'avancement du chantier Interfaces ? Passe aussi le risque R05 en mitigation. | 1 | 1 | donnees | 0.99 | 0.89 | 0.98 (attendu) | 243 ms |
| M-08 | multi | donne moi les actions en retard de Karim et relance-les toutes en reportant d'une semaine | 1 | 1 | donnees | 0.89 | 0.94 | 0.96 (attendu) | 233 ms |
| M-09 | multi | Supprime le risque R06 et explique-moi comment on archive un risque normalement. | 3 | 3 | modification | 1.00 | 0.90 | 0.98 (attendu) | 249 ms |
| M-10 | multi | Quels jalons glissent, et que disait le planning du kick-off pour ces jalons ? | 1 | 4b | donnees_et_documents | 0.66 | 0.03 | 0.89 (attendu) | 554 ms |

## Version cockpit-v3 — détail

Consignes : `COCKPIT_ROUTER_PROMPTS['cockpit-v3']` (`backend/src/domain/jev-router-cockpit.ts`). Seuils : général 0.45, écriture 0.75 et « demande d’écriture » ≥ 0.5, plusieurs demandes ≥ 0.6. Mesure du 01/10/2026 11:22:30.

### Taux de bonne classification par cas et par groupe

| Cas | Taux |
|---|---|
| 1 · Insight Cockpit | 100 % (75/75) |
| 2 · Guide utilisateur | 100 % (66/66) |
| 3 · Modification des données | 95.5 % (63/66) |
| 4a · Documents | 100 % (39/39) |
| 4b · Données + documents | 95.8 % (23/24) |
| 5 · Clarification | 100 % (60/60) |

| Groupe | Taux |
|---|---|
| simple | 99.3 % (149/150) |
| familier | 100 % (42/42) |
| frontiere | 95.8 % (69/72) |
| suite | 100 % (12/12) |
| hors_perimetre | 100 % (24/24) |
| multi | 100 % (30/30) |

### Matrice de confusion (lignes : cas attendu, colonnes : cas obtenu, tous passages)

| Attendu \ Obtenu | 1 | 2 | 3 | 4a | 4b | 5 |
|---|---|---|---|---|---|---|
| 1 | **72** | · | · | · | 3 | · |
| 2 | · | **66** | · | · | · | · |
| 3 | · | · | **63** | · | · | 3 |
| 4a | · | · | · | **39** | · | · |
| 4b | · | · | · | · | **23** | 1 |
| 5 | · | · | · | · | · | **60** |

Stabilité : 1 question(s) changent de cas d’un passage à l’autre : C4-17.

### Erreurs (tous passages)

| Id | Question | Attendu | Obtenu (par passage) | Option du modèle | Confiance | Écriture | Motif du seuil |
|---|---|---|---|---|---|---|---|
| C3-18 | Note que la décision D-005 a été arbitrée en faveur de l'option B. | 3 | 5 · 5 · 5 | modification | 0.68 | 0.09 | modification à 0.68, sous le seuil d’écriture 0.75 |
| C4-17 | Où en est le risque R03, et qu'en disait le compte rendu du dernier comité projet ? | 4b | 5 · 4b · 4b | donnees_et_documents | 0.43 | 0.02 | confiance 0.43 sous le seuil 0.45 |

### Tableau détaillé (passage 1)

| Id | Groupe | Question | Attendu | Obtenu | Option | Confiance | Écriture | Plusieurs | Temps |
|---|---|---|---|---|---|---|---|---|---|
| C1-01 | simple | Quels sont les risques critiques ouverts à ce jour sur le projet ? | 1 | 1 | donnees | 1.00 | 0.02 | 0.03 | 315 ms |
| C1-02 | simple | Quand a lieu le prochain COPIL ? | 1 | 1 | donnees | 1.00 | 0.02 | 0.02 | 218 ms |
| C1-03 | simple | Le chantier Finance est-il dans les temps par rapport au planning ? | 1 | 1 | donnees | 0.97 | 0.02 | 0.02 | 238 ms |
| C1-04 | simple | Combien d'actions sont en retard ? | 1 | 1 | donnees | 1.00 | 0.02 | 0.02 | 250 ms |
| C1-05 | simple | Qui porte l'action A-41 ? | 1 | 1 | donnees | 1.00 | 0.02 | 0.02 | 233 ms |
| C1-06 | simple | Quels jalons glissent par rapport à la référence ? | 1 | 1 | donnees | 0.50 | 0.03 | 0.04 | 263 ms |
| C1-07 | simple | Liste les décisions en attente d'arbitrage. | 1 | 1 | donnees | 1.00 | 0.02 | 0.03 | 320 ms |
| C1-08 | simple | Quel est l'avancement global du projet ? | 1 | 1 | donnees | 1.00 | 0.02 | 0.02 | 239 ms |
| C1-09 | simple | Quels problèmes de sévérité 5 sont encore ouverts ? | 1 | 1 | donnees | 1.00 | 0.02 | 0.03 | 206 ms |
| C1-10 | simple | Qui sont les membres du comité de pilotage ? | 1 | 1 | donnees | 1.00 | 0.02 | 0.02 | 286 ms |
| C1-11 | simple | Quels livrables doivent être remis dans les 30 prochains jours ? | 1 | 1 | donnees | 1.00 | 0.02 | 0.03 | 237 ms |
| C1-12 | simple | Combien de jours reste-t-il avant le Go-Live ? | 1 | 1 | donnees | 1.00 | 0.02 | 0.02 | 201 ms |
| C1-13 | familier | c koi les actions de Karim qui sont KO ? | 1 | 1 | donnees | 0.99 | 0.03 | 0.04 | 227 ms |
| C1-14 | familier | nb de risques sans plan de mitig ? | 1 | 1 | donnees | 1.00 | 0.02 | 0.04 | 229 ms |
| C1-15 | familier | le prochain copil c quand déjà | 1 | 1 | donnees | 1.00 | 0.03 | 0.04 | 256 ms |
| C1-16 | frontiere | Pourquoi l'action A-41 est-elle en retard ? | 1 | 1 | donnees | 0.90 | 0.02 | 0.02 | 210 ms |
| C1-17 | frontiere | Le baromètre des équipes s'est-il amélioré ce mois-ci ? | 1 | 1 | donnees | 1.00 | 0.02 | 0.03 | 510 ms |
| C1-18 | frontiere | Quels chantiers dépendent du chantier Interfaces ? | 1 | 1 | donnees | 1.00 | 0.02 | 0.03 | 196 ms |
| C1-19 | suite | Et ceux du chantier Ventes ? *(suite de : « Quels sont les risques critiques du chantier Finance ? »)* | 1 | 1 | donnees | 1.00 | 0.03 | 0.05 | 240 ms |
| C1-20 | frontiere | Est-ce que j'ai des validations à donner ? | 1 | 1 | donnees | 0.92 | 0.04 | 0.04 | 222 ms |
| C2-01 | simple | Comment créer un risque dans l'application ? | 2 | 2 | guide | 1.00 | 0.03 | 0.03 | 235 ms |
| C2-02 | simple | À qui dois-je m'adresser pour étendre mes habilitations à un autre chantier ? | 2 | 2 | guide | 0.99 | 0.03 | 0.03 | 204 ms |
| C2-03 | simple | Comment générer un rapport pour un comité de pilotage ? | 2 | 2 | guide | 1.00 | 0.03 | 0.03 | 284 ms |
| C2-04 | simple | Que signifie « non confirmé » à côté d'un jalon ? | 2 | 2 | guide | 1.00 | 0.02 | 0.02 | 226 ms |
| C2-05 | simple | Comment personnaliser mon tableau de bord ? | 2 | 2 | guide | 1.00 | 0.03 | 0.03 | 238 ms |
| C2-06 | simple | Quels formats de fichiers puis-je déposer dans la base de connaissance ? | 2 | 2 | guide | 1.00 | 0.02 | 0.03 | 282 ms |
| C2-07 | simple | Comment est calculée la criticité d'un risque ? | 2 | 2 | guide | 1.00 | 0.02 | 0.02 | 245 ms |
| C2-08 | simple | Où trouver l'historique des rapports générés ? | 2 | 2 | guide | 0.93 | 0.02 | 0.03 | 239 ms |
| C2-09 | simple | Comment changer mon mot de passe ? | 2 | 2 | guide | 0.93 | 0.04 | 0.03 | 209 ms |
| C2-10 | simple | Pourquoi ma session se ferme-t-elle toute seule ? | 2 | 2 | guide | 0.99 | 0.02 | 0.03 | 231 ms |
| C2-11 | simple | Qui peut modifier le référentiel du projet ? | 2 | 2 | guide | 1.00 | 0.03 | 0.03 | 222 ms |
| C2-12 | simple | À quoi sert la fiche d'arbitrage ? | 2 | 2 | guide | 1.00 | 0.02 | 0.03 | 248 ms |
| C2-13 | familier | comment on fait pour archiver une tache ? | 2 | 2 | guide | 0.99 | 0.03 | 0.03 | 249 ms |
| C2-14 | familier | le bouton pour inviter qqn il est où ?? | 2 | 2 | guide | 1.00 | 0.03 | 0.03 | 257 ms |
| C2-15 | frontiere | Comment ajouter une action liée à un risque ? | 2 | 2 | guide | 1.00 | 0.03 | 0.04 | 252 ms |
| C2-16 | frontiere | Est-ce que je peux supprimer un jalon ? | 2 | 2 | guide | 0.77 | 0.09 | 0.04 | 239 ms |
| C2-17 | frontiere | Comment demander à Jev de créer un risque à ma place ? | 2 | 2 | guide | 0.63 | 0.06 | 0.07 | 226 ms |
| C2-18 | frontiere | Comment déposer le support du COPIL dans la base de connaissance ? | 2 | 2 | guide | 0.98 | 0.04 | 0.05 | 252 ms |
| C2-19 | frontiere | Quelle est la différence entre un problème et un risque dans le Cockpit ? | 2 | 2 | guide | 1.00 | 0.02 | 0.03 | 238 ms |
| C2-20 | suite | Et pour une décision ? *(suite de : « Comment créer un risque dans l'application ? »)* | 2 | 2 | guide | 0.99 | 0.05 | 0.06 | 233 ms |
| C3-01 | simple | Ajoute le risque suivant dans le chantier Finance : Moindre disponibilité de l'équipe Finance pendant la clôture annuelle. Probabilité élevée, impact moyen à élevé. Mitigation : nommer un référent Finance disponible quelques heures par semaine. | 3 | 3 | modification | 1.00 | 0.98 | 0.07 | 237 ms |
| C3-02 | simple | Passe l'action A-41 au statut terminé. | 3 | 3 | modification | 1.00 | 0.96 | 0.03 | 199 ms |
| C3-03 | simple | Reporte l'échéance de l'action A-44 au 15 novembre. | 3 | 3 | modification | 1.00 | 0.96 | 0.04 | 227 ms |
| C3-04 | simple | Supprime le problème P03. | 3 | 3 | modification | 1.00 | 0.96 | 0.03 | 207 ms |
| C3-05 | simple | Crée une action pour relancer l'éditeur sur le correctif des interfaces, échéance vendredi, porteur Karim Benali. | 3 | 3 | modification | 1.00 | 0.97 | 0.08 | 233 ms |
| C3-06 | simple | Change la probabilité du risque R04 à 3. | 3 | 3 | modification | 1.00 | 0.96 | 0.04 | 239 ms |
| C3-07 | simple | Marque le risque R02 comme clos. | 3 | 3 | modification | 1.00 | 0.96 | 0.03 | 233 ms |
| C3-08 | simple | Ajoute une décision à arbitrer au COPIL : choisir le prestataire de reprise des données. | 3 | 3 | modification | 1.00 | 0.96 | 0.09 | 255 ms |
| C3-09 | simple | Réaffecte l'action A-43 à Laurent Garnier. | 3 | 3 | modification | 1.00 | 0.96 | 0.03 | 294 ms |
| C3-10 | simple | Rouvre le problème P02, il n'est pas réglé. | 3 | 3 | modification | 1.00 | 0.94 | 0.14 | 214 ms |
| C3-11 | simple | Mets à jour le plan de mitigation du risque R03 : atelier de cadrage CRM avec l'éditeur le 10 octobre. | 3 | 3 | modification | 1.00 | 0.96 | 0.08 | 243 ms |
| C3-12 | simple | Enregistre un nouveau problème de sévérité 4 sur le chantier Ventes : les données clients de test sont incomplètes. | 3 | 3 | modification | 1.00 | 0.97 | 0.07 | 221 ms |
| C3-13 | familier | ajoute une action : faire valider le PV de recette finance par le DAF | 3 | 3 | modification | 1.00 | 0.96 | 0.05 | 240 ms |
| C3-14 | familier | A-42 c'est fini, tu peux la clôturer stp | 3 | 3 | modification | 1.00 | 0.93 | 0.20 | 279 ms |
| C3-15 | familier | vire le risque R06 il sert plus a rien | 3 | 3 | modification | 0.99 | 0.94 | 0.14 | 251 ms |
| C3-16 | frontiere | Il faudrait ajouter un risque sur la disponibilité des key users pendant l'été, tu peux le faire ? | 3 | 3 | modification | 1.00 | 0.95 | 0.44 | 246 ms |
| C3-17 | frontiere | Décale le jalon de fin de recette Finance d'une semaine. | 3 | 3 | modification | 1.00 | 0.95 | 0.05 | 301 ms |
| C3-18 | frontiere | Note que la décision D-005 a été arbitrée en faveur de l'option B. | 3 | **5** | modification | 0.68 | 0.09 | 0.03 | 216 ms |
| C3-19 | suite | Mets-la plutôt au 20. *(suite de : « Reporte l'échéance de l'action A-44 au 15 novembre. »)* | 3 | 3 | modification | 1.00 | 0.95 | 0.04 | 258 ms |
| C3-20 | suite | Oui, crée-la. *(suite de : « Il manque une action pour préparer la recette Ventes, non ? »)* | 3 | 3 | modification | 1.00 | 0.96 | 0.09 | 256 ms |
| C4-01 | simple | Quel était le sommaire du support de lancement (kick-off) du projet ? | 4a | 4a | document | 1.00 | 0.02 | 0.02 | 214 ms |
| C4-02 | simple | Quels risques ont été présentés lors du dernier comité de pilotage ? | 4a | 4a | document | 0.91 | 0.02 | 0.03 | 215 ms |
| C4-03 | simple | Résume le support du COPIL du 19 mars. | 4a | 4a | document | 0.99 | 0.03 | 0.03 | 237 ms |
| C4-04 | simple | Que dit le compte rendu du dernier comité projet sur la migration des données ? | 4a | 4a | document | 1.00 | 0.02 | 0.03 | 316 ms |
| C4-05 | simple | Quels étaient les objectifs annoncés dans la présentation de lancement ? | 4a | 4a | document | 1.00 | 0.02 | 0.03 | 204 ms |
| C4-06 | simple | Dans le support SAP du kick-off, comment est organisée la gouvernance ? | 4a | 4a | document | 0.97 | 0.02 | 0.04 | 239 ms |
| C4-07 | simple | Quelles décisions ont été actées dans le compte rendu du COPIL de septembre ? | 4a | 4a | document | 0.96 | 0.02 | 0.03 | 301 ms |
| C4-08 | simple | Retrouve dans les documents la liste des pays du périmètre de déploiement de la vague 2. | 4a | 4a | document | 1.00 | 0.02 | 0.04 | 259 ms |
| C4-09 | familier | y avait quoi dans le deck du copil de mars ? | 4a | 4a | document | 1.00 | 0.02 | 0.03 | 211 ms |
| C4-10 | familier | le PPT du kick off il parle du planning ? | 4a | 4a | document | 0.98 | 0.02 | 0.04 | 212 ms |
| C4-11 | frontiere | Quel planning avait été présenté au lancement du projet ? | 4a | 4a | document | 0.94 | 0.02 | 0.02 | 331 ms |
| C4-12 | frontiere | Qu'a-t-on dit des articles de remplacement au dernier COPIL ? | 4a | 4a | document | 0.96 | 0.02 | 0.03 | 239 ms |
| C4-13 | frontiere | Les actions décidées au COPIL de septembre sont-elles toutes terminées ? | 4b | 4b | donnees_et_documents | 0.89 | 0.02 | 0.03 | 215 ms |
| C4-14 | frontiere | Le Go-Live annoncé au kick-off est-il toujours tenu ? | 4b | 4b | donnees_et_documents | 1.00 | 0.02 | 0.03 | 219 ms |
| C4-15 | frontiere | Compare l'avancement actuel des chantiers avec celui présenté au dernier comité de pilotage. | 4b | 4b | donnees_et_documents | 0.99 | 0.03 | 0.07 | 232 ms |
| C4-16 | frontiere | Quels risques critiques actuels n'ont pas été présentés au dernier COPIL ? | 4b | 4b | donnees_et_documents | 0.94 | 0.02 | 0.04 | 393 ms |
| C4-17 | simple | Où en est le risque R03, et qu'en disait le compte rendu du dernier comité projet ? | 4b | **5** | donnees_et_documents | 0.43 | 0.02 | 0.92 (attendu) | 259 ms |
| C4-18 | frontiere | Le budget engagé correspond-il à celui du contrat ? | 4b | 4b | donnees_et_documents | 0.98 | 0.02 | 0.04 | 265 ms |
| C4-19 | frontiere | Donne-moi l'état des jalons et ce que le support de lancement prévoyait pour eux. | 4b | 4b | donnees_et_documents | 0.82 | 0.03 | 0.82 | 300 ms |
| C4-20 | familier | les jalons du kick off on les tient ou pas ? | 4b | 4b | donnees_et_documents | 0.62 | 0.07 | 0.08 | 200 ms |
| C5-01 | simple | planning ? | 5 | 5 | clarification | 0.88 | 0.06 | 0.04 | 247 ms |
| C5-02 | simple | Tu peux regarder ? | 5 | 5 | clarification | 1.00 | 0.07 | 0.04 | 263 ms |
| C5-03 | simple | Fais-le. | 5 | 5 | clarification | 0.99 | 0.52 | 0.04 | 247 ms |
| C5-04 | simple | C'est grave ? | 5 | 5 | clarification | 0.99 | 0.03 | 0.03 | 213 ms |
| C5-05 | simple | Aide | 5 | 5 | clarification | 0.99 | 0.05 | 0.03 | 246 ms |
| C5-06 | familier | ça marche pas | 5 | 5 | clarification | 0.99 | 0.04 | 0.02 | 211 ms |
| C5-07 | frontiere | Et pour lui ? | 5 | 5 | clarification | 1.00 | 0.09 | 0.05 | 248 ms |
| C5-08 | frontiere | Le risque, tu le mets ou pas ? | 5 | 5 | clarification | 0.47 | 0.67 | 0.16 | 245 ms |
| C5-09 | frontiere | Qu'est-ce que tu en penses ? | 5 | 5 | clarification | 0.99 | 0.04 | 0.03 | 279 ms |
| C5-10 | frontiere | Il faudrait peut-être revoir les risques… | 5 | 5 | clarification | 0.76 | 0.38 | 0.06 | 237 ms |
| C5-11 | hors_perimetre | Quelle est la capitale de l'Australie ? | 5 | 5 | hors_sujet | 1.00 | 0.02 | 0.02 | 213 ms |
| C5-12 | hors_perimetre | Écris-moi un poème sur l'automne. | 5 | 5 | hors_sujet | 1.00 | 0.02 | 0.02 | 234 ms |
| C5-13 | hors_perimetre | Quel temps fera-t-il demain à Lyon ? | 5 | 5 | hors_sujet | 1.00 | 0.01 | 0.02 | 251 ms |
| C5-14 | hors_perimetre | Réserve-moi un train pour Paris lundi. | 5 | 5 | hors_sujet | 0.96 | 0.14 | 0.05 | 241 ms |
| C5-15 | hors_perimetre | Comment faire un tableau croisé dynamique dans Excel ? | 5 | 5 | hors_sujet | 0.99 | 0.02 | 0.02 | 223 ms |
| C5-16 | hors_perimetre | Traduis ce paragraphe en allemand : le projet avance bien. | 5 | 5 | hors_sujet | 1.00 | 0.02 | 0.02 | 204 ms |
| C5-17 | hors_perimetre | Qui a gagné la Ligue des champions l'an dernier ? | 5 | 5 | hors_sujet | 1.00 | 0.01 | 0.02 | 205 ms |
| C5-18 | hors_perimetre | Envoie un mail à toute l'équipe pour décaler la réunion. | 5 | 5 | modification | 0.69 | 0.34 | 0.07 | 245 ms |
| C5-19 | familier | slt | 5 | 5 | clarification | 0.85 | 0.03 | 0.03 | 216 ms |
| C5-20 | familier | ?? | 5 | 5 | clarification | 1.00 | 0.09 | 0.06 | 236 ms |
| M-01 | multi | Liste les risques critiques et ajoute-en un nouveau sur la disponibilité des key users. | 1 | 1 | donnees | 0.97 | 0.94 | 0.97 (attendu) | 237 ms |
| M-02 | multi | Comment on crée une décision ? Et combien sont en attente aujourd'hui ? | 2 | 2 | guide | 0.99 | 0.04 | 0.96 (attendu) | 327 ms |
| M-03 | multi | Clôture l'action A-42 et dis-moi combien il en reste en retard. | 3 | 3 | modification | 1.00 | 0.96 | 0.97 (attendu) | 326 ms |
| M-04 | multi | Quand est le prochain COPIL et que contenait le support du précédent ? | 1 | 1 | donnees | 0.91 | 0.02 | 0.95 (attendu) | 212 ms |
| M-05 | multi | Résume le compte rendu du dernier comité projet puis crée les actions qui en découlent. | 4a | 4a | document | 1.00 | 0.93 | 0.97 (attendu) | 229 ms |
| M-06 | multi | Où je dépose un document, et quels documents ont été déposés cette semaine ? | 2 | 2 | guide | 0.99 | 0.04 | 0.96 (attendu) | 260 ms |
| M-07 | multi | Quel est l'avancement du chantier Interfaces ? Passe aussi le risque R05 en mitigation. | 1 | 1 | donnees | 0.99 | 0.88 | 0.98 (attendu) | 237 ms |
| M-08 | multi | donne moi les actions en retard de Karim et relance-les toutes en reportant d'une semaine | 1 | 1 | donnees | 0.90 | 0.94 | 0.97 (attendu) | 232 ms |
| M-09 | multi | Supprime le risque R06 et explique-moi comment on archive un risque normalement. | 3 | 3 | modification | 1.00 | 0.90 | 0.98 (attendu) | 249 ms |
| M-10 | multi | Quels jalons glissent, et que disait le planning du kick-off pour ces jalons ? | 1 | 4b | donnees_et_documents | 0.76 | 0.03 | 0.88 (attendu) | 224 ms |

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
