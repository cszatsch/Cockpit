// RISE Cockpit — jeu de données du projet RISE (AMC Corp). Données fictives.
// Date de référence du jeu : 26 sept. 2026. Dates ISO (YYYY-MM-DD) pour tout champ *Iso ; les champs texte (planned, due…) sont des libellés d'affichage.
// Référentiel (master data, géré par le PMO) : model.* (Client, Projet, Lots, Phases, Sous-phases, Chantiers, Livrables, Rôles, Équipes, Personnes, Instances de pilotage) + milestones (Jalons : phaseId obligatoire, subphaseId et wsId facultatifs).
// Données transactionnelles : risks, issues, actions, decisions, sessions (séances de comité), reports, barometre, mission, documents.
// Clés étrangères : *Id / *Ids. Personnes : ids p01… / r01…. Chantiers : C1…C8. Phases : P1…P6. Sous-phases : SP<code>. Lots : w1…w4. Instances : g1…g6.
// Enums — decisions.status : DRAFT | IN_REVIEW | TO_ARBITRATE | ARBITRATED | CANCELLED | SUPERSEDED · actions.status : OPEN | IN_PROGRESS | BLOCKED | DONE · risks.status : OPEN | MITIGATING | CLOSED · issues.status : OPEN | RESOLVING | RESOLVED · sessions.status : PLANNED | HELD | CANCELLED · perm : ADMIN | PMO | PM | CONTRIBUTOR | READER
// Données calculées par l'application (non stockées) : écart jalon = iso − baselineIso ; criticité risque = p × i ; action échue ; compteurs ; décisions récentes.
// Date de référence du projet (fournie par le serveur, fuseau du projet).
export const today = "2026-09-26";
export const me = {"personId":"p01","firstName":"Robin","lastName":"Lefèvre"};

export const project = {"code":"RISE","name":"RISE — Implémentation Brand X + CRM","client":"AMC Corp","integrator":"Codilog","programDirectorId":"p03","editor":"Brand X","phase":"Recette utilisateur (UAT)","status":"Actif · UAT","objective":"Remplacer 19 ERP disparates (dont Brand X…) par un unique Brand X, complété d'un CRM Brand X, pour intégrer rapidement les acquisitions et piloter le Groupe de façon homogène.","baseline":{"version":"v5","date":"1er avr. 2027","approvedAt":"26 sept. 2026","approvedBy":"p04","reason":"5e date de bascule (D-007, COPIL n°20), après les reports du 1er déc. 2025, 11 avr. 2026, 1er juil. 2026 et 1er nov. 2026 (v4)","previous":{"version":"v4","date":"1er nov. 2026","approvedAt":"15 mai 2026"}},"forecast":{"golive":"1er avr. 2027","goliveIso":"2027-04-01"},"healthOverride":{"value":"Go-Live 1er décembre maintenu","by":"p03","at":"26 août","reason":"Date officielle maintenue au 20e COPIL ; faisabilité à retrancher au COPIL du 26 oct."}};

export const committee = {"sessionId":"S-g1-20","name":"COPIL n°20","date":"samedi 26 septembre 2026","short":"26 sept.","iso":"2026-09-26","template":"COPIL v2","reportingDate":"13 sept.","captureAt":"13 sept. · 18:00","version":"v1","generatedAt":"14 sept. · 09:05","reviewer":"p01","validator":"p03","comments":6,"unresolved":3,"sources":17,"objects":52,"changesSince":3,"slides":18};

export const people = [
  {"id":"p01","name":"Robin Lefèvre","initials":"RL","title":"PMO projet · AMC Corp","role":"PMO programme","team":"AMOA","org":"AMOA","email":"robin.lefevre@example.com"},
  {"id":"p02","name":"Julien Morel","initials":"JM","title":"Directeur de projet · AMC Corp","role":"Direction de mission AMOA","team":"AMOA","org":"AMOA","email":"julien.morel@example.com"},
  {"id":"p03","name":"Laurent Garnier","initials":"LG","title":"Directeur de programme RISE","role":"Responsable projet RISE","team":"Direction","org":"CLIENT","email":"laurent.garnier@example.com"},
  {"id":"p04","name":"Philippe Aubert","initials":"PA","title":"Directeur Général France","role":"Sponsor global · sponsor Ventes","team":"Direction","org":"CLIENT","email":"philippe.aubert@example.com"},
  {"id":"p05","name":"Nathalie Roux","initials":"NR","title":"DSI & Data Groupe","role":"Sponsor IT","team":"DSI","org":"CLIENT","email":"nathalie.roux@example.com"},
  {"id":"p06","name":"Karim Benali","initials":"KB","title":"Responsable IT ERP","role":"Responsable projet RISE (DSI) · migration","team":"DSI","org":"CLIENT","email":"karim.benali@example.com"},
  {"id":"p07","name":"Sophie Marchand","initials":"SM","title":"Directrice Comptable","role":"Pilote métier Finance","team":"Finance","org":"CLIENT","email":"sophie.marchand@example.com"},
  {"id":"p08","name":"Thomas Girard","initials":"TG","title":"Directeur Commercial France","role":"Pilote métier Ventes","team":"Ventes","org":"CLIENT","email":"thomas.girard@example.com"},
  {"id":"p09","name":"Élodie Faure","initials":"ÉF","title":"Référent DSI Achats/Appros/Log./Ventes","role":"Responsable chantier Interfaces","team":"DSI","org":"CLIENT","email":"elodie.faure@example.com"},
  {"id":"p10","name":"Isabelle Perrin","initials":"IP","title":"DRH Groupe","role":"Sponsor conduite du changement","team":"RH","org":"CLIENT","email":"isabelle.perrin@example.com"},
  {"id":"p11","name":"Marc Delorme","initials":"MD","title":"RSSI","role":"Rôles & autorisations","team":"DSI","org":"CLIENT","email":"marc.delorme@example.com"},
  {"id":"p12","name":"Antoine Mercier","initials":"AM","title":"Cutover manager · AMC Corp","role":"Responsable bascule","team":"AMOA","org":"AMOA","email":"antoine.mercier@example.com"},
  {"id":"p13","name":"Camille Rey","initials":"CR","title":"PMO AMOA · AMC Corp","role":"PMO AMOA","team":"AMOA","org":"AMOA","email":"camille.rey@example.com"},
  {"id":"p14","name":"Olivier Chevalier","initials":"OC","title":"Directeur de projet · AMC Corp","role":"Direction projet intégrateur","team":"Intégrateur","org":"INTEG","email":"olivier.chevalier@example.com"},
  {"id":"p15","name":"Léa Fontaine","initials":"LF","title":"Chef de projet Brand X fonctionnel · AMC Corp","role":"Paramétrage et livraisons","team":"Intégrateur","org":"INTEG","email":"lea.fontaine@example.com"}
];

export const workstreams = [
  {"n":"1 · Design de la solution (sprints 1-4)","v":100,"ref":100,"sig":"ok","detail":"Sprints 1-4 finalisés au 28/08","owner":"p14","wsId":"C8"},
  {"n":"2 · Recette Achats / Appros / Logistique","v":77,"ref":80,"sig":"ok","detail":"221 / 288 scénarios","owner":"p09","wsId":"C2"},
  {"n":"3 · Recette Finance","v":91,"ref":100,"sig":"vig","detail":"86 / 94 scénarios · fin décalée au 19/09","owner":"p07","wsId":"C1"},
  {"n":"4 · Recette Ventes / CRM","v":60,"ref":75,"sig":"vig","detail":"55 / 92 fonctionnalités · chemin critique","owner":"p08","wsId":"C3"},
  {"n":"5 · Tests techniques","v":68,"ref":80,"sig":"vig","detail":"92 / 136 finalisés","owner":"p06","wsId":"C8"},
  {"n":"6 · Migration des données — Run 3","v":44,"ref":90,"sig":"risk","detail":"27 / 61 objets · CRM 0 %","owner":"p06","wsId":"C5"},
  {"n":"7 · Interfaces","v":70,"ref":90,"sig":"vig","detail":"66 recettées / 94 au périmètre actif","owner":"p09","wsId":"C4"},
  {"n":"8 · Formation","v":70,"ref":85,"sig":"vig","detail":"70 % des contenus produits","owner":"p10","wsId":"C7"}
];

export const volets = [
  {"n":"Finance & contrôle de gestion","d":["vig","ok","vig","vig"],"s":"vig"},
  {"n":"Achats, Appros & Logistique","d":["ok","ok","vig","ok"],"s":"ok"},
  {"n":"Ventes & CRM","d":["risk","vig","risk","vig"],"s":"risk"},
  {"n":"Interfaces & migration","d":["risk","risk","vig","na"],"s":"risk"}
];

export const milestones = [
  {"id":"J01","code":"J01","n":"Fin de la recette Finance","planned":"19 sept.","iso":"2026-09-19","owner":"p07","confirmedDays":3,"baselineIso":"2026-09-19","wsId":"C1","ws":"Finance","waveId":"w1","phaseId":"P4","subphaseId":"SP4.5"},
  {"id":"J02","code":"J02","n":"Fin de la phase UAT","planned":"30 oct.","iso":"2026-10-30","owner":"p03","confirmedDays":5,"baselineIso":"2026-10-30","wsId":"C8","ws":"Pilotage et transverse","waveId":"w1","phaseId":"P4","subphaseId":"SP4.5"},
  {"id":"J03","code":"J03","n":"Modules de formation obligatoires livrés","planned":"15 oct.","iso":"2026-10-15","owner":"p10","confirmedDays":19,"baselineIso":"2026-10-15","wsId":"C7","ws":"Conduite du changement","waveId":"w1","phaseId":"P5","subphaseId":"SP5.2"},
  {"id":"J04","code":"J04","n":"Fin de la migration Run 3 (objets Brand X)","planned":"14 oct.","iso":"2026-10-14","owner":"p06","confirmedDays":2,"baselineIso":"2026-10-14","wsId":"C5","ws":"Migration des données","waveId":"w1","phaseId":"P4","subphaseId":"SP4.4"},
  {"id":"J05","code":"J05","n":"Fin des tests 2-à-2 interfaces","planned":"30 oct.","iso":"2026-10-30","owner":"p09","confirmedDays":12,"baselineIso":"2026-10-30","wsId":"C4","ws":"Interfaces","waveId":"w1","phaseId":"P4","subphaseId":"SP4.5"},
  {"id":"J06","code":"J06","n":"Go / No-Go Go-Live","planned":"15 mars 2027","iso":"2027-03-15","owner":"p04","confirmedDays":0,"baselineIso":"2027-03-15","wsId":"C8","ws":"Pilotage et transverse","waveId":"w1","phaseId":"P5","subphaseId":"SP5.4"},
  {"id":"J07","code":"J07","n":"Fin du Dry Run (répétition de bascule)","planned":"5 mars 2027","iso":"2027-03-05","owner":"p12","confirmedDays":0,"baselineIso":"2027-03-05","wsId":"C5","ws":"Migration des données","waveId":"w1","phaseId":"P5","subphaseId":"SP5.3"},
  {"id":"J08","code":"J08","n":"Go-Live Lot 1 — AMC Corp, Brand X, stores","planned":"1er avr. 2027","iso":"2027-04-01","owner":"p03","confirmedDays":0,"baselineIso":"2027-04-01","wsId":"C8","ws":"Pilotage et transverse","waveId":"w1","phaseId":"P5","subphaseId":"SP5.4"},
  {"id":"J09","code":"J09","n":"Démarrage Hypercare","planned":"2 avr. 2027","iso":"2027-04-02","owner":"p12","confirmedDays":0,"baselineIso":"2027-04-02","wsId":"C8","ws":"Pilotage et transverse","waveId":"w1","phaseId":"P5","subphaseId":"SP5.5"}
];

export const risks = [
  {"id":"R01","n":"Reprise & qualité des données au démarrage — Run 3 planifié en 6 semaines vs 17 pour le Run 2 ; 27/61 objets, CRM 0 %","p":5,"i":5,"plan":"Replanification du Run 3 (fin estimée 14/10) ; renfort des contrôles métiers ; nettoyage data legacy","owner":"p06","ws":"Migration des données","due":"14 oct.","status":"MITIGATING","wsId":"C5"},
  {"id":"R02","n":"Chantier Interfaces — retard majeur et périmètre instable (5 nouvelles interfaces en 4 semaines)","p":5,"i":4,"plan":"Gel du périmètre ; complément documentaire Brand X ; jeux de données de test ; tests 2-à-2 pour le 30/10","owner":"p09","ws":"Interfaces","due":"30 oct.","status":"MITIGATING","wsId":"C4"},
  {"id":"R03","n":"Solution CRM incomplète (Brand X) — 79 user stories à repositionner, capacité 40 US sur 2 sprints ; articles de remplacement sans solution","p":4,"i":5,"plan":null,"owner":"p14","ws":"Ventes / CRM","due":"COPIL 26 sept.","status":"OPEN","wsId":"C3"},
  {"id":"R04","n":"Faisabilité du Go-Live au 1er décembre questionnée par les équipes projet","p":4,"i":4,"plan":"D-007 arbitrée au COPIL n°20 du 26 sept. : report du Go-Live au 1er avr. 2027 ; replanification Deploy et Run en cours","owner":"p03","ws":"Pilotage et transverse","due":"26 sept.","status":"MITIGATING","wsId":"C8"},
  {"id":"R05","n":"Tests techniques insuffisants — 70/136 finalisés, nouveau planning à tenir impérativement","p":4,"i":4,"plan":"Planning technique resserré ; revue hebdomadaire DSI / intégrateur (AMC Corp)","owner":"p06","ws":"Pilotage et transverse","due":"30 oct.","status":"MITIGATING","wsId":"C8"},
  {"id":"R07","n":"Formation insuffisante — 70 % des contenus produits, 45 % des équipes se sentent préparées","p":3,"i":4,"plan":"Modules obligatoires livrés pour le 15 octobre ; sessions par domaine","owner":"p10","ws":"Conduite du changement","due":"15 oct.","status":"MITIGATING","wsId":"C7"}
];

export const riskStats = {"weeks":[[4,1],[5,2],[5,2],[5,2],[6,3],[6,3],[6,3],[6,3]],"labels":["S32","S33","S34","S35","S36","S37","S38","S39"]};

export const issues = [
  {"id":"P01","n":"Articles de remplacement — point dur CRM sans solution","sev":5,"origin":"R03","opened":"26 août","owner":"p14","target":"COPIL 26 sept.","detail":"Aucune solution identifiée à date côté Brand X ; impacte la recette Ventes et la bascule des commandes.","status":"OPEN","wsId":"C3","ws":"Ventes / CRM"},
  {"id":"P02","n":"Paramétrages Finance non livrés (client douteux, CCA, DEB/DAS2)","sev":4,"origin":null,"opened":"19 août","owner":"p15","target":"19 sept.","detail":"Recettes KO sur LCR, relances, acomptes, revalorisation devises ; fin de recette Finance décalée au 19/09 (D-004).","status":"RESOLVING","wsId":"C1","ws":"Finance"},
  {"id":"P03","n":"Dépendance EDI avis de transport clients et Brand X","sev":3,"origin":null,"opened":"26 août","owner":"p09","target":"fin sept.","detail":"Livraisons prévues mi-sept. (Brand X) et fin sept. (EDI) ; bloque des scénarios Appros / Logistique.","status":"RESOLVING","wsId":"C4","ws":"Interfaces"}
];

export const actions = [
  {"id":"A-41","n":"Replanifier le Run 3 et publier le calendrier détaillé par objet","owner":"p06","due":"27 août","status":"IN_PROGRESS","late":true,"source":"R01","prio":"Haute"},
  {"id":"A-42","n":"Livrer les paramétrages Finance manquants (CCA, DEB/DAS2, client douteux)","owner":"p15","due":"13 sept.","status":"OPEN","late":true,"source":"P02","prio":"Haute"},
  {"id":"A-48","n":"Lancer le Dry Run — prérequis validés (environnements, périmètre reprise figé)","owner":"p12","due":"16 sept.","status":"DONE","late":false,"source":"J07","prio":"Haute","closed":"16 sept."},
  {"id":"A-43","n":"Figer le périmètre interfaces et arbitrer l'interface en attente","owner":"p09","due":"20 sept.","status":"OPEN","late":false,"source":"R02","prio":"Haute"},
  {"id":"A-44","n":"Repositionner les 79 user stories CRM sur les sprints 5 et 6","owner":"p14","due":"20 sept.","status":"IN_PROGRESS","late":false,"source":"R03","prio":"Haute"},
  {"id":"A-45","n":"Préparer la fiche d'arbitrage Go-Live (D-007) pour le COPIL","owner":"p01","due":"20 sept.","status":"DONE","late":false,"source":"D-007","prio":"Haute"},
  {"id":"A-46","n":"Consolider l'avancement UAT par domaine et le baromètre d'août","owner":"p01","due":"24 sept.","status":"DONE","late":false,"source":null,"prio":"Haute"},
  {"id":"A-49","n":"Recetter les rôles et autorisations","owner":"p11","due":"10 oct.","status":"OPEN","late":false,"source":null,"prio":"Moyenne"},
  {"id":"A-47","n":"Livrer les modules de formation obligatoires","owner":"p10","due":"15 oct.","status":"OPEN","late":false,"source":"R07","prio":"Moyenne"}
];

export const decisions = [
  {"id":"D-001","t":"Fixer la 3e date de Go-Live du Lot 1","p":4,"status":"SUPERSEDED","crIso":"2026-01-12","ddIso":"2026-02-03","wsId":"C8","bodyId":"g1","decL":"Go-Live Lot 1 fixé au 1er juillet 2026 (3e date)","maker":"p04","impact":"Remplacée par D-017","supersedes":null,"full":false,"opt":null,"expectedSessionId":null},
  {"id":"D-002","t":"Fixer la 4e date de Go-Live du Lot 1","p":4,"status":"ARBITRATED","crIso":"2026-04-28","ddIso":"2026-05-15","wsId":"C8","bodyId":"g1","decL":"Go-Live Lot 1 fixé au 1er novembre 2026 (4e date) — baseline v4","maker":"p04","impact":"Remplace D-001 (1er juil. 2026)","supersedes":"D-001","full":false,"opt":null,"expectedSessionId":null},
  {"id":"D-003","t":"Arrêter le périmètre des interfaces du Lot 1","p":3,"status":"ARBITRATED","crIso":"2026-08-05","ddIso":"2026-08-26","wsId":"C4","bodyId":"g2","decL":"Interfaces : 8 reportées post Go-Live, 35 annulées","maker":"p03","impact":"Périmètre actif ramené à 94 interfaces","supersedes":null,"full":false,"opt":null,"expectedSessionId":null},
  {"id":"D-004","t":"Fixer la date de fin de la recette Finance","p":3,"status":"ARBITRATED","crIso":"2026-08-10","ddIso":"2026-08-26","wsId":"C1","bodyId":"g2","decL":"Fin de la recette Finance décalée au 19 sept.","maker":"p03","impact":"Paramétrages non livrés et recettes KO ; périmètre étendu à 102 scénarios","supersedes":null,"full":false,"opt":null,"expectedSessionId":null},
  {"id":"D-005","t":"Choisir une solution pour les articles de remplacement CRM","p":4,"status":"IN_REVIEW","crIso":"2026-08-27","ddIso":"","wsId":"C3","bodyId":"g5","decL":"","maker":null,"impact":"","supersedes":null,"full":false,"opt":null,"expectedSessionId":null},
  {"id":"D-006","t":"Décider du plan de reprise des recettes Finance KO (LCR, CCA, DEB / DAS2)","p":3,"status":"DRAFT","crIso":"2026-09-12","ddIso":"","wsId":"C1","bodyId":"g3","decL":"","maker":null,"impact":"","supersedes":null,"full":false,"opt":null,"expectedSessionId":null},
  {"id":"D-007","t":"Confirmer ou reporter la date de Go-Live du Lot 1","p":4,"status":"ARBITRATED","crIso":"2026-09-13","ddIso":"2026-09-26","wsId":"C8","bodyId":"g1","decL":"Go-Live Lot 1 reporté au 1er avril 2027 (option B) — 5e date","maker":"p04","impact":"Chemin critique Lot 1 ; Dry Run, Cutover et Hypercare à recaler ; coûts de prolongation intégrateur / AMOA (AMC Corp)","supersedes":"D-002","full":true,"opt":"B","expectedSessionId":"S-g1-20"},
  {"id":"D-008","t":"Valider le calendrier de livraison EDI des avis de transport","p":2,"status":"DRAFT","crIso":"2026-09-19","ddIso":"","wsId":"C4","bodyId":"g4","decL":"","maker":null,"impact":"","supersedes":null,"full":false,"opt":null,"expectedSessionId":null},
  {"id":"D-009","t":"Prioriser les 79 user stories CRM sur une capacité de 40","p":3,"status":"TO_ARBITRATE","crIso":"2026-09-20","ddIso":"","wsId":"C3","bodyId":"g2","decL":"","maker":null,"impact":"","supersedes":null,"full":false,"opt":null,"expectedSessionId":null},
  {"id":"D-010","t":"Inclure ou reporter l'interface en attente du gel de périmètre","p":3,"status":"IN_REVIEW","crIso":"2026-09-21","ddIso":"","wsId":"C4","bodyId":"g4","decL":"","maker":null,"impact":"","supersedes":null,"full":false,"opt":null,"expectedSessionId":null}
];

export const sessions = [
  {"id":"S-g1-17","bodyId":"g1","number":17,"dateIso":"2026-06-18","time":"14:00","place":"Siège · salle du Conseil + visio","status":"HELD","participants":["p04","p03","p05","p10","p02","p14"],"reportId":"RP-17"},
  {"id":"S-g1-18","bodyId":"g1","number":18,"dateIso":"2026-07-29","time":"14:00","place":"Siège · salle du Conseil + visio","status":"HELD","participants":["p04","p03","p05","p10","p02","p14"],"reportId":"RP-18"},
  {"id":"S-g1-19","bodyId":"g1","number":19,"dateIso":"2026-08-26","time":"14:00","place":"Siège · salle du Conseil + visio","status":"HELD","participants":["p04","p03","p05","p10","p02","p14"],"reportId":"RP-19"},
  {"id":"S-g1-20","bodyId":"g1","number":20,"dateIso":"2026-09-26","time":"14:00","place":"Siège · salle du Conseil + visio","status":"HELD","participants":["p04","p03","p05","p10","p02","p14"],"reportId":"RP-20"},
  {"id":"S-g1-21","bodyId":"g1","number":21,"dateIso":"2026-10-26","time":"14:00","place":"Siège · salle du Conseil + visio","status":"PLANNED","participants":["p04","p03","p05","p10","p02","p14"],"reportId":null},
  {"id":"S-g1-22","bodyId":"g1","number":22,"dateIso":"2026-11-26","time":"14:00","place":"Siège · salle du Conseil + visio","status":"PLANNED","participants":["p04","p03","p05","p10","p02","p14"],"reportId":null},
  {"id":"S-g1-23","bodyId":"g1","number":23,"dateIso":"2026-12-17","time":"14:00","place":"Siège · salle du Conseil + visio","status":"PLANNED","participants":["p04","p03","p05","p10","p02","p14"],"reportId":null},
  {"id":"S-g2-1","bodyId":"g2","number":1,"dateIso":"2026-09-16","time":"09:30","place":"Siège · salle Kyoto + visio","status":"HELD","participants":["p03","p01","p02","p06","p07","p08","p14","p15"],"reportId":null},
  {"id":"S-g2-2","bodyId":"g2","number":2,"dateIso":"2026-09-23","time":"09:30","place":"Siège · salle Kyoto + visio","status":"HELD","participants":["p03","p01","p02","p06","p07","p08","p14","p15"],"reportId":null},
  {"id":"S-g2-3","bodyId":"g2","number":3,"dateIso":"2026-09-30","time":"09:30","place":"Siège · salle Kyoto + visio","status":"PLANNED","participants":["p03","p01","p02","p06","p07","p08","p14","p15"],"reportId":null},
  {"id":"S-g2-4","bodyId":"g2","number":4,"dateIso":"2026-10-07","time":"09:30","place":"Siège · salle Kyoto + visio","status":"PLANNED","participants":["p03","p01","p02","p06","p07","p08","p14","p15"],"reportId":null},
  {"id":"S-g2-5","bodyId":"g2","number":5,"dateIso":"2026-10-14","time":"09:30","place":"Siège · salle Kyoto + visio","status":"PLANNED","participants":["p03","p01","p02","p06","p07","p08","p14","p15"],"reportId":null},
  {"id":"S-g2-6","bodyId":"g2","number":6,"dateIso":"2026-10-21","time":"09:30","place":"Siège · salle Kyoto + visio","status":"PLANNED","participants":["p03","p01","p02","p06","p07","p08","p14","p15"],"reportId":null},
  {"id":"S-g2-7","bodyId":"g2","number":7,"dateIso":"2026-10-28","time":"09:30","place":"Siège · salle Kyoto + visio","status":"PLANNED","participants":["p03","p01","p02","p06","p07","p08","p14","p15"],"reportId":null},
  {"id":"S-g2-8","bodyId":"g2","number":8,"dateIso":"2026-11-04","time":"09:30","place":"Siège · salle Kyoto + visio","status":"PLANNED","participants":["p03","p01","p02","p06","p07","p08","p14","p15"],"reportId":null},
  {"id":"S-g2-9","bodyId":"g2","number":9,"dateIso":"2026-11-11","time":"09:30","place":"Siège · salle Kyoto + visio","status":"PLANNED","participants":["p03","p01","p02","p06","p07","p08","p14","p15"],"reportId":null},
  {"id":"S-g2-10","bodyId":"g2","number":10,"dateIso":"2026-11-18","time":"09:30","place":"Siège · salle Kyoto + visio","status":"PLANNED","participants":["p03","p01","p02","p06","p07","p08","p14","p15"],"reportId":null},
  {"id":"S-g2-11","bodyId":"g2","number":11,"dateIso":"2026-11-25","time":"09:30","place":"Siège · salle Kyoto + visio","status":"PLANNED","participants":["p03","p01","p02","p06","p07","p08","p14","p15"],"reportId":null},
  {"id":"S-g2-12","bodyId":"g2","number":12,"dateIso":"2026-12-02","time":"09:30","place":"Siège · salle Kyoto + visio","status":"PLANNED","participants":["p03","p01","p02","p06","p07","p08","p14","p15"],"reportId":null},
  {"id":"S-g2-13","bodyId":"g2","number":13,"dateIso":"2026-12-09","time":"09:30","place":"Siège · salle Kyoto + visio","status":"PLANNED","participants":["p03","p01","p02","p06","p07","p08","p14","p15"],"reportId":null},
  {"id":"S-g2-14","bodyId":"g2","number":14,"dateIso":"2026-12-16","time":"09:30","place":"Siège · salle Kyoto + visio","status":"PLANNED","participants":["p03","p01","p02","p06","p07","p08","p14","p15"],"reportId":null},
  {"id":"S-g3-1","bodyId":"g3","number":1,"dateIso":"2026-09-24","time":"11:00","place":"Visio","status":"HELD","participants":["p07","p08","p09","p11","p13","p15"],"reportId":null},
  {"id":"S-g3-2","bodyId":"g3","number":2,"dateIso":"2026-10-01","time":"11:00","place":"Visio","status":"PLANNED","participants":["p07","p08","p09","p11","p13","p15"],"reportId":null},
  {"id":"S-g3-3","bodyId":"g3","number":3,"dateIso":"2026-10-08","time":"11:00","place":"Visio","status":"PLANNED","participants":["p07","p08","p09","p11","p13","p15"],"reportId":null},
  {"id":"S-g3-4","bodyId":"g3","number":4,"dateIso":"2026-10-15","time":"11:00","place":"Visio","status":"PLANNED","participants":["p07","p08","p09","p11","p13","p15"],"reportId":null},
  {"id":"S-g3-5","bodyId":"g3","number":5,"dateIso":"2026-10-22","time":"11:00","place":"Visio","status":"PLANNED","participants":["p07","p08","p09","p11","p13","p15"],"reportId":null},
  {"id":"S-g3-6","bodyId":"g3","number":6,"dateIso":"2026-10-29","time":"11:00","place":"Visio","status":"PLANNED","participants":["p07","p08","p09","p11","p13","p15"],"reportId":null},
  {"id":"S-g3-7","bodyId":"g3","number":7,"dateIso":"2026-11-05","time":"11:00","place":"Visio","status":"PLANNED","participants":["p07","p08","p09","p11","p13","p15"],"reportId":null},
  {"id":"S-g3-8","bodyId":"g3","number":8,"dateIso":"2026-11-12","time":"11:00","place":"Visio","status":"PLANNED","participants":["p07","p08","p09","p11","p13","p15"],"reportId":null},
  {"id":"S-g3-9","bodyId":"g3","number":9,"dateIso":"2026-11-19","time":"11:00","place":"Visio","status":"PLANNED","participants":["p07","p08","p09","p11","p13","p15"],"reportId":null},
  {"id":"S-g3-10","bodyId":"g3","number":10,"dateIso":"2026-11-26","time":"11:00","place":"Visio","status":"PLANNED","participants":["p07","p08","p09","p11","p13","p15"],"reportId":null},
  {"id":"S-g3-11","bodyId":"g3","number":11,"dateIso":"2026-12-03","time":"11:00","place":"Visio","status":"PLANNED","participants":["p07","p08","p09","p11","p13","p15"],"reportId":null},
  {"id":"S-g3-12","bodyId":"g3","number":12,"dateIso":"2026-12-10","time":"11:00","place":"Visio","status":"PLANNED","participants":["p07","p08","p09","p11","p13","p15"],"reportId":null},
  {"id":"S-g3-13","bodyId":"g3","number":13,"dateIso":"2026-12-17","time":"11:00","place":"Visio","status":"PLANNED","participants":["p07","p08","p09","p11","p13","p15"],"reportId":null},
  {"id":"S-g4-1","bodyId":"g4","number":1,"dateIso":"2026-09-22","time":"15:00","place":"Siège · salle Kyoto","status":"HELD","participants":["p06","p09","p12","p13","p15"],"reportId":null},
  {"id":"S-g4-2","bodyId":"g4","number":2,"dateIso":"2026-10-06","time":"15:00","place":"Siège · salle Kyoto","status":"PLANNED","participants":["p06","p09","p12","p13","p15"],"reportId":null},
  {"id":"S-g4-3","bodyId":"g4","number":3,"dateIso":"2026-10-20","time":"15:00","place":"Siège · salle Kyoto","status":"PLANNED","participants":["p06","p09","p12","p13","p15"],"reportId":null},
  {"id":"S-g4-4","bodyId":"g4","number":4,"dateIso":"2026-11-03","time":"15:00","place":"Siège · salle Kyoto","status":"PLANNED","participants":["p06","p09","p12","p13","p15"],"reportId":null},
  {"id":"S-g4-5","bodyId":"g4","number":5,"dateIso":"2026-11-17","time":"15:00","place":"Siège · salle Kyoto","status":"PLANNED","participants":["p06","p09","p12","p13","p15"],"reportId":null},
  {"id":"S-g4-6","bodyId":"g4","number":6,"dateIso":"2026-12-01","time":"15:00","place":"Siège · salle Kyoto","status":"PLANNED","participants":["p06","p09","p12","p13","p15"],"reportId":null},
  {"id":"S-g4-7","bodyId":"g4","number":7,"dateIso":"2026-12-15","time":"15:00","place":"Siège · salle Kyoto","status":"PLANNED","participants":["p06","p09","p12","p13","p15"],"reportId":null},
  {"id":"S-g5-1","bodyId":"g5","number":1,"dateIso":"2026-10-07","time":"17:00","place":"Visio","status":"PLANNED","participants":["p03","p04","p02"],"reportId":null},
  {"id":"S-g6-1","bodyId":"g6","number":1,"dateIso":"2026-08-03","time":"08:30","place":"Siège · bureau du DG","status":"HELD","participants":["p04","p05","p10","p03"],"reportId":null},
  {"id":"S-g6-2","bodyId":"g6","number":2,"dateIso":"2026-09-01","time":"08:30","place":"Siège · bureau du DG","status":"HELD","participants":["p04","p05","p10","p03"],"reportId":null},
  {"id":"S-g6-3","bodyId":"g6","number":3,"dateIso":"2026-10-01","time":"08:30","place":"Siège · bureau du DG","status":"PLANNED","participants":["p04","p05","p10","p03"],"reportId":null},
  {"id":"S-g6-4","bodyId":"g6","number":4,"dateIso":"2026-11-02","time":"08:30","place":"Siège · bureau du DG","status":"PLANNED","participants":["p04","p05","p10","p03"],"reportId":null},
  {"id":"S-g6-5","bodyId":"g6","number":5,"dateIso":"2026-12-01","time":"08:30","place":"Siège · bureau du DG","status":"PLANNED","participants":["p04","p05","p10","p03"],"reportId":null}
];

export const programBudget = {"known":false,"reason":"Budget programme (licences Brand X, forfait intégrateur, équipes client — AMC Corp) non renseigné dans Cockpit"};

export const mission = [
  {"period":"2024 (11 mois)","amoa":512,"sub":0,"total":512,"status":"Facturé"},
  {"period":"2025 (12 mois)","amoa":1125,"sub":600,"total":1725,"status":"Facturé"},
  {"period":"2026 (juillet → septembre)","amoa":500,"sub":125,"total":625,"status":"En cours"}
];

export const missionNext = {"n":"Tranche 6","status":"En négociation","by":"r16","note":"Volonté de la DSI qu'AMC Corp accompagne les lots 2 à 4"};

export const reports = [
  {"id":"RP-20","sessionId":"S-g1-20","n":"COPIL n°20 · 26 sept. 2026","reporting":"13 sept.","v":"v1","status":"En relecture","validator":"p03","audience":"—","published":false},
  {"id":"RP-19","sessionId":"S-g1-19","n":"COPIL n°19 · 26 août 2026","reporting":"23 août","v":"v2","status":"Publiée","validator":"p03","audience":"COPIL · 26 août","published":true},
  {"id":"RP-18","sessionId":"S-g1-18","n":"COPIL n°18 · 29 juil. 2026","reporting":"26 juil.","v":"v1","status":"Publiée","validator":"p03","audience":"COPIL · 29 juil.","published":true},
  {"id":"RP-17","sessionId":"S-g1-17","n":"COPIL n°17 · 18 juin 2026","reporting":"15 juin","v":"v3","status":"Publiée","validator":"p03","audience":"COPIL + actionnaire (AMC Corp) · 18 juin","published":true}
];

export const anomalies = [
  {"level":"Blocage","text":"Risque R03 (critique, 20) sans plan de mitigation : le point dur « articles de remplacement » n'a ni solution ni porteur de plan","owner":"p14","action":"Qualifier","target":{"space":"pilotage","tab":"risques"}},
  {"level":"Avertissement","text":"Jalon « Go / No-Go Go-Live » replanifié au 15 mars 2027 suite à D-007 — date à confirmer par le sponsor","owner":"p04","action":"Confirmer","target":{"space":"pilotage","tab":"planning"}},
  {"level":"Avertissement","text":"Jalon « Modules de formation obligatoires » non confirmé depuis 19 jours","owner":"p10","action":"Confirmer","target":{"space":"pilotage","tab":"planning"}},
  {"level":"Avertissement","text":"Budget programme non renseigné : la slide « Budget » affichera « non évalué »","owner":"p03","action":"Renseigner","target":{"space":"pilotage","tab":"budget"}},
  {"level":"Avertissement","text":"3 modifications du projet depuis la capture du 13 sept. (Run 3 : 31/61 objets, A-48 clôturée, P03 ouvert)","owner":null,"action":"Régénérer","target":{"space":"comites","tab":"preparation"}}
];

export const documents = [
  {"n":"Cartographie officielle des risques — 19e COPIL","type":"Compte rendu","date":"26 août","v":"v1","conf":"Interne","src":"Déposé","ext":"SUCCEEDED","mime":"PPTX","pages":9,"linked":"RISK R01 → R07"},
  {"n":"Support COPIL n°19 — RISE","type":"Support de comité","date":"23 août","v":"v2","conf":"Interne","src":"Généré","ext":"SUCCEEDED","mime":"PPTX","pages":22,"linked":"REPORT_INSTANCE · publié"},
  {"n":"Baromètre mensuel des équipes — juillet 2026","type":"Livrable","date":"20 août","v":"v1","conf":"Interne","src":"Déposé","ext":"SUCCEEDED","mime":"PDF","pages":6,"linked":"RISK R07"},
  {"n":"Plan de bascule (Cutover) — vue macro","type":"Référence","date":"10 sept.","v":"v3","conf":"Interne","src":"Déposé","ext":"SUCCEEDED","mime":"DOCX","pages":41,"linked":"MILESTONE J07 · J08"},
  {"n":"Suivi des interfaces au 23/08/2026","type":"Livrable","date":"23 août","v":"v7","conf":"Interne","src":"Déposé","ext":"PARTIAL","mime":"DOCX","pages":14,"linked":"RISK R02 · DECISION D-003"},
  {"n":"Spécifications CRM Brand X — lot Ventes","type":"Livrable","date":"4 août","v":"v2","conf":"Interne","src":"Déposé","ext":"PARTIAL","mime":"DOCX","pages":88,"linked":"RISK R03 · ISSUE P01"},
  {"n":"Contrat AMOA / client (AMC Corp) — tranche 5","type":"Contractuel","date":"12 juil.","v":"v1","conf":"Restreint","src":"Déposé","ext":"UNSUPPORTED","mime":"PDF","pages":null,"linked":"MISSION · tranche 5"},
  {"n":"Cahier des charges — appel d'offres Brand X (2023)","type":"Référence","date":"3 janv. 2024","v":"v4","conf":"Interne","src":"Déposé","ext":"SUCCEEDED","mime":"PDF","pages":214,"linked":"PROJECT · cadrage"}
];

export const weekWins = ["Dry Run lancé le 16 sept. : prérequis validés (A-48)","Recette Achats / Appros / Logistique : 221 / 288 scénarios, 183 anomalies validées KU","Run 3 : 31 / 61 objets migrés (27 au 26/08) · 17 / 24 contrôlés métiers","Sprints CRM 1-4 finalisés : commandes multipostes, contremarque, promotions, acomptes","Baromètre DSI : 7,2 / 10 (nouveau domaine répondant)"];

export const model = {
  CLIENT: {
    label: "Client",
    scope: "",
    constraints: [],
    cols: ["code","nom","description","statut"],
    widths: "80px minmax(0,1fr) minmax(0,1.6fr) 90px",
    rows: [
      {"id":"c1","cells":["AMC Corp","AMC Corp","Distribution B2B d'équipements CHR, care et collectivités · 19 pays","Actif"]}
    ]
  },
  PROJECT: {
    label: "Projet",
    scope: "",
    constraints: [],
    cols: ["champ","valeur"],
    widths: "240px minmax(0,1fr)",
    rows: [
      {"id":"code","cells":["Code","RISE"],"locked":true},
      {"id":"name","cells":["Nom","RISE — next level"]},
      {"id":"objectives","cells":["Objectifs","Remplacer 19 ERP par un unique Brand X + CRM, en 4 lots."]},
      {"id":"start","cells":["Date de début","01/03/2024"]},
      {"id":"end","cells":["Date de fin cible","31/12/2030"]},
      {"id":"owner","cells":["Responsable","Laurent Garnier"],"ownerId":"p03"},
      {"id":"currency","cells":["Devise","EUR"]},
      {"id":"tz","cells":["Fuseau horaire","Europe/Paris"]},
      {"id":"city","cells":["Ville du projet","Grigny"]},
      {"id":"country","cells":["Pays","France"]}
    ]
  },
  WAVE: {
    label: "Lots",
    scope: "",
    constraints: [],
    cols: ["seq","nom","début","fin","statut"],
    widths: "44px minmax(0,1fr) 104px 104px 100px",
    rows: [
      {"id":"w1","cells":["1","Lot 1 · AMC Corp, Brand X et stores","01/03/2024","30/06/2027","En cours"],"cur":true,"ownerId":"p03"},
      {"id":"w2","cells":["2","Lot 2 · Autres filiales France","01/01/2027","31/12/2028","Prévu"],"ownerId":null},
      {"id":"w3","cells":["3","Lot 3 · Filiales EMEA","2028","2029","Prévu"],"ownerId":null},
      {"id":"w4","cells":["4","Lot 4 · Hors Europe","2029","2030","Prévu"],"ownerId":null}
    ]
  },
  PHASE: {
    label: "Phases",
    scope: "",
    constraints: [],
    cols: ["seq","nom","lot","début","fin","statut"],
    widths: "44px minmax(0,1fr) 180px 120px 120px 100px",
    rows: [
      {"id":"P1","desc":"Découverte de la solution et de sa valeur pour l'entreprise ; stratégie et feuille de route d'adoption avant le lancement formel du projet.","cells":["1","Discover","Lot 1","06/2023","04/2024","Terminée"],"waveIds":["w1"]},
      {"id":"P2","desc":"Lancement formel du projet : gouvernance, mobilisation des équipes, plan projet, environnements initiaux et cadrage des stratégies clés.","cells":["2","Prepare","Lot 1","07/2024","08/2024","Terminée"],"waveIds":["w1"]},
      {"id":"P3","desc":"Confrontation des processus standards aux besoins métier (Fit-to-Standard), conception de la solution et identification des écarts.","cells":["3","Explore","Lot 1","08/2024","09/2025","Terminée"],"waveIds":["w1"]},
      {"id":"P4","desc":"Construction itérative de la solution en sprints : configuration, développements, intégration, migration des données et tests.","cells":["4","Realize","Lot 1","09/2025","02/2026","Terminée"],"waveIds":["w1"]},
      {"id":"P5","desc":"Préparation de la production, formation des utilisateurs, répétition générale, bascule (cutover) et go-live, puis hypercare.","cells":["5","Deploy","Lot 1","02/2026","30/06/2027","En cours"],"cur":true,"waveIds":["w1"]},
      {"id":"P6","desc":"Exploitation courante et amélioration continue du système en production.","cells":["6","Run","Lot 1","01/07/2027","30/06/2028","Prévue"],"waveIds":["w1"]}
    ]
  },
  SUBPHASE: {
    label: "Sous-phases",
    scope: "",
    constraints: [],
    cols: ["seq","phase","nom","début","fin","statut"],
    widths: "44px 84px minmax(0,1fr) 104px 104px 100px",
    rows: [
      {"id":"SP1.1","desc":"Découverte des offres et innovations disponibles dans le portefeuille Brand X pour identifier celles qui répondent aux besoins de l'entreprise.","cells":["1.1","Discover","Analyse du portefeuille Brand X","06/2023","10/2023","Terminée"],"phaseId":"P1"},
      {"id":"SP1.2","desc":"Élaboration d'une première stratégie et feuille de route d'adoption, souvent réalisée durant le cycle commercial, avant le lancement formel du projet.","cells":["1.2","Discover","Stratégie de transformation","10/2023","02/2024","Terminée"],"phaseId":"P1"},
      {"id":"SP1.3","desc":"Test d'un système de démonstration et évaluation de l'adéquation de la solution avec les besoins métier.","cells":["1.3","Discover","Accès système d'essai / évaluation","01/2024","04/2024","Terminée"],"phaseId":"P1"},
      {"id":"SP2.1","desc":"Démarrage formel du projet : définition du périmètre, de la gouvernance, des rôles et responsabilités, et du plan projet.","cells":["2.1","Prepare","Initialisation du projet","07/2024","07/2024","Terminée"],"phaseId":"P2"},
      {"id":"SP2.2","desc":"Constitution et montée en compétence de l'équipe projet (client et intégrateur), préparation au changement (solution adoption).","cells":["2.2","Prepare","Mobilisation des équipes","07/2024","08/2024","Terminée"],"phaseId":"P2"},
      {"id":"SP2.3","desc":"Provisionnement des systèmes techniques (sandbox, starter system) nécessaires au démarrage des travaux.","cells":["2.3","Prepare","Mise à disposition des environnements","07/2024","08/2024","Terminée"],"phaseId":"P2"},
      {"id":"SP2.4","desc":"Définition des stratégies qui seront exécutées plus tard dans le projet : stratégie de migration des données, stratégie de tests, stratégie d'intégration.","cells":["2.4","Prepare","Cadrage des stratégies clés","08/2024","08/2024","Terminée"],"phaseId":"P2"},
      {"id":"SP3.1","desc":"Ateliers de confrontation des processus standards Brand X Best Practices aux besoins réels de l'entreprise, afin d'identifier les écarts (gaps) à traiter.","cells":["3.1","Explore","Ateliers Fit-to-Standard","08/2024","02/2025","Terminée"],"phaseId":"P3"},
      {"id":"SP3.2","desc":"Formalisation de la conception fonctionnelle et documentation des écarts identifiés dans un backlog de configuration et de développements.","cells":["3.2","Explore","Conception de la solution","11/2024","05/2025","Terminée"],"phaseId":"P3"},
      {"id":"SP3.3","desc":"Définition des interfaces et flux d'intégration entre le nouveau système et les autres applications de l'écosystème.","cells":["3.3","Explore","Planification de l'intégration","01/2025","06/2025","Terminée"],"phaseId":"P3"},
      {"id":"SP3.4","desc":"Analyse des données existantes et préparation du plan de reprise (mapping, nettoyage) en amont de la migration.","cells":["3.4","Explore","Préparation des données","03/2025","08/2025","Terminée"],"phaseId":"P3"},
      {"id":"SP3.5","desc":"Élaboration du plan de tests global (approche, jeux d'essai, environnements, planning des campagnes).","cells":["3.5","Explore","Planification des tests","06/2025","09/2025","Terminée"],"phaseId":"P3"},
      {"id":"SP4.1","desc":"Paramétrage itératif du système à partir du backlog validé, réalisé en sprints agiles successifs.","cells":["4.1","Realize","Construction / configuration","09/2025","12/2025","Terminée"],"phaseId":"P4"},
      {"id":"SP4.2","desc":"Réalisation des développements complémentaires (extensibilité) non couverts par la configuration standard.","cells":["4.2","Realize","Développements spécifiques","10/2025","01/2026","Terminée"],"phaseId":"P4"},
      {"id":"SP4.3","desc":"Mise en œuvre et test des interfaces entre le système cible et les applications tierces.","cells":["4.3","Realize","Intégration technique","10/2025","02/2026","Terminée"],"phaseId":"P4"},
      {"id":"SP4.4","desc":"Extraction, transformation et chargement des données historiques dans le nouveau système, avec cycles de mock migration.","cells":["4.4","Realize","Migration des données (legacy)","11/2025","02/2026","Terminée"],"phaseId":"P4"},
      {"id":"SP4.5","desc":"Exécution des campagnes de tests successives : tests unitaires, tests d'intégration, puis recette utilisateur (UAT) validant l'adéquation aux besoins métier.","cells":["4.5","Realize","Tests (unitaires, intégration, UAT)","12/2025","02/2026","Terminée"],"phaseId":"P4"},
      {"id":"SP4.6","desc":"Élaboration détaillée du plan de bascule (cutover plan) en vue du passage en production.","cells":["4.6","Realize","Préparation du cutover","01/2026","02/2026","Terminée"],"phaseId":"P4"},
      {"id":"SP5.1","desc":"Configuration finale et sécurisation du système de production avant le démarrage réel.","cells":["5.1","Deploy","Mise en place de l'environnement de production","02/2026","06/2026","Terminée"],"phaseId":"P5"},
      {"id":"SP5.2","desc":"Sessions de formation dispensées aux utilisateurs finaux juste avant la mise en service.","cells":["5.2","Deploy","Formation des utilisateurs finaux","07/2026","03/2027","En cours"],"cur":true,"phaseId":"P5"},
      {"id":"SP5.3","desc":"Simulation complète du cutover en conditions réelles afin de valider le déroulé et les temps avant le go-live définitif.","cells":["5.3","Deploy","Répétition générale (dress rehearsal)","09/2026","03/2027","En cours"],"cur":true,"phaseId":"P5"},
      {"id":"SP5.4","desc":"Bascule effective des opérations vers le nouveau système en production.","cells":["5.4","Deploy","Cutover / Go-live","01/04/2027","01/04/2027","Prévue"],"phaseId":"P5"},
      {"id":"SP5.5","desc":"Période de support renforcé immédiatement après le go-live pour stabiliser le système et accompagner les utilisateurs.","cells":["5.5","Deploy","Hypercare","01/04/2027","30/06/2027","Prévue"],"phaseId":"P5"},
      {"id":"SP6.1","desc":"Maintien en conditions opérationnelles du système : support, exploitation quotidienne et gestion des incidents.","cells":["6.1","Run","Exploitation courante","07/2027","12/2027","Prévue"],"phaseId":"P6"},
      {"id":"SP6.2","desc":"Optimisation progressive des processus métier et du système sur la base des retours d'usage.","cells":["6.2","Run","Amélioration continue","07/2027","12/2027","Prévue"],"phaseId":"P6"},
      {"id":"SP6.3","desc":"Onboarding de nouveaux utilisateurs ou périmètres additionnels après la mise en production initiale.","cells":["6.3","Run","Intégration de nouveaux utilisateurs","09/2027","12/2027","Prévue"],"phaseId":"P6"},
      {"id":"SP6.4","desc":"Gestion des montées de version, correctifs et adoption de nouvelles fonctionnalités Brand X dans la durée.","cells":["6.4","Run","Mises à jour et innovations","12/2027","12/2027","Prévue"],"phaseId":"P6"}
    ]
  },
  WORKSTREAM: {
    label: "Chantiers",
    scope: "",
    constraints: [],
    cols: ["seq","nom","resp. chantier","statut","dépendances","phases"],
    widths: "44px minmax(0,1fr) 150px 80px 200px 200px",
    rows: [
      {"id":"C1","cells":["1","Finance","Sophie Marchand","Actif","Tous","P1 P2 P3 P4 P5 P6"],"waves":[1,1,1,1],"ownerId":"p07","phaseIds":["P1","P2","P3","P4","P5","P6"],"dependsOn":"ALL"},
      {"id":"C2","cells":["2","Achats / Appros / Logistique","Élodie Faure","Actif","Tous","P3 P4 P5"],"waves":[1,1,0,0],"ownerId":"p09","phaseIds":["P3","P4","P5"],"dependsOn":"ALL"},
      {"id":"C3","cells":["3","Ventes / CRM","Thomas Girard","Actif","Tous","P3 P4 P5"],"waves":[1,1,0,0],"ownerId":"p08","phaseIds":["P3","P4","P5"],"dependsOn":"ALL"},
      {"id":"C4","cells":["4","Interfaces","Élodie Faure","Actif","C1 · C2 · C3 · C5","P4 P5"],"waves":[1,0,0,0],"ownerId":"p09","phaseIds":["P4","P5"],"dependsOn":["C1","C2","C3","C5"]},
      {"id":"C5","cells":["5","Migration des données","Karim Benali","Actif","C1 · C2 · C3","P3 P4 P5 P6"],"waves":[1,1,1,0],"ownerId":"p06","phaseIds":["P3","P4","P5","P6"],"dependsOn":["C1","C2","C3"]},
      {"id":"C6","cells":["6","Rôles et autorisations","Karim Benali","Actif","C1 · C2 · C3","P4 P5"],"waves":[1,0,0,0],"ownerId":"p06","phaseIds":["P4","P5"],"dependsOn":["C1","C2","C3"]},
      {"id":"C7","cells":["7","Conduite du changement","Isabelle Perrin","Actif","C1 · C2 · C3","P2 P3 P4 P5 P6"],"waves":[1,1,1,1],"ownerId":"p10","phaseIds":["P2","P3","P4","P5","P6"],"dependsOn":["C1","C2","C3"]},
      {"id":"C8","cells":["8","Pilotage et transverse","Laurent Garnier","Actif","—","P1 P2 P3 P4 P5 P6"],"waves":[1,1,1,1],"ownerId":"p03","phaseIds":["P1","P2","P3","P4","P5","P6"],"dependsOn":[]}
    ]
  },
  TEAM: {
    label: "Équipes",
    scope: "",
    constraints: [],
    cols: ["société","équipe","description","personnes"],
    widths: "120px 110px minmax(0,1fr) 90px",
    rows: [
      {"id":"t10","cells":["Onepoint","Onepoint","","10"]},
      {"id":"t11","cells":["Kéa Partners","Kéa Partners","","0"]},
      {"id":"t12","cells":["Codilog","Codilog","","4"]},
      {"id":"t13","cells":["ECF","ECF","","24"]},
      {"id":"t14","cells":["Keyrus","Keyrus","","0"]}
    ]
  },
  ROLE: {
    label: "Rôles sur le projet",
    scope: "",
    constraints: [],
    cols: ["rôle","personnes"],
    widths: "minmax(0,1fr) 90px",
    rows: [
      {"id":"ro01","cells":["Sponsor Exécutif","1"]},
      {"id":"ro02","cells":["Sponsor Opérationnel","0"]},
      {"id":"ro03","cells":["Directeur de programme","1"]},
      {"id":"ro04","cells":["Direction générale","6"]},
      {"id":"ro05","cells":["Actionnaire","0"]},
      {"id":"ro06","cells":["Sponsors métiers","1"]},
      {"id":"ro07","cells":["Pilotes métiers","5"]},
      {"id":"ro08","cells":["AMOA interne","4"]},
      {"id":"ro09","cells":["Equipe IT - DSI","6"]},
      {"id":"ro10","cells":["AMOA Externe","10"]},
      {"id":"ro11","cells":["Intégrateur","4"]},
      {"id":"ro12","cells":["AMOE interne","0"]},
      {"id":"ro13","cells":["AMOE Externe","0"]}
    ]
  },
  PERSON: {
    label: "Personnes",
    scope: "",
    constraints: [],
    cols: ["nom","société","équipe","position","rôle","chantier","email","actif"],
    widths: "minmax(0,1fr) 90px 76px minmax(0,1.1fr) minmax(0,1fr) minmax(0,.9fr) minmax(0,1.1fr) 50px",
    rows: [
      {"id":"p01","cells":["Robin Lefèvre","AMC Corp","Onepoint","PMO projet","AMOA Externe","","robin.lefevre@example.com","oui"],"active":true,"teamId":"t10"},
      {"id":"p02","cells":["Julien Morel","AMC Corp","Onepoint","Directeur de projet","AMOA Externe","","julien.morel@example.com","oui"],"active":true,"teamId":"t10"},
      {"id":"p03","cells":["Laurent Garnier","AMC Corp","ECF","Directeur de programme RISE","Directeur de programme","","laurent.garnier@example.com","oui"],"active":true,"teamId":"t13"},
      {"id":"p04","cells":["Philippe Aubert","AMC Corp","ECF","Directeur Général France","Sponsor Exécutif","Ventes / CRM","philippe.aubert@example.com","oui"],"active":true,"teamId":"t13"},
      {"id":"p05","cells":["Nathalie Roux","AMC Corp","ECF","DSI & Data Groupe","Equipe IT - DSI","","nathalie.roux@example.com","oui"],"active":true,"teamId":"t13"},
      {"id":"p06","cells":["Karim Benali","AMC Corp","ECF","Responsable IT ERP","Equipe IT - DSI","Migration des données","karim.benali@example.com","oui"],"active":true,"teamId":"t13"},
      {"id":"p07","cells":["Sophie Marchand","AMC Corp","ECF","Directrice Comptable","Pilotes métiers","Finance","sophie.marchand@example.com","oui"],"active":true,"teamId":"t13"},
      {"id":"p08","cells":["Thomas Girard","AMC Corp","ECF","Directeur Commercial France","Pilotes métiers","Ventes / CRM","thomas.girard@example.com","oui"],"active":true,"teamId":"t13"},
      {"id":"p09","cells":["Élodie Faure","AMC Corp","ECF","Référent DSI Achats/Appros/Log./Ventes","Equipe IT - DSI","Ventes / CRM","elodie.faure@example.com","oui"],"active":true,"teamId":"t13"},
      {"id":"p10","cells":["Isabelle Perrin","AMC Corp","ECF","DRH Groupe","Sponsors métiers","Conduite du changement","isabelle.perrin@example.com","oui"],"active":true,"teamId":"t13"},
      {"id":"p11","cells":["Marc Delorme","AMC Corp","ECF","RSSI","Equipe IT - DSI","Rôles et autorisations","marc.delorme@example.com","oui"],"active":true,"teamId":"t13"},
      {"id":"p12","cells":["Antoine Mercier","AMC Corp","Onepoint","Cutover manager","AMOA Externe","","antoine.mercier@example.com","oui"],"active":true,"teamId":"t10"},
      {"id":"p13","cells":["Camille Rey","AMC Corp","Onepoint","PMO AMOA","AMOA Externe","","camille.rey@example.com","oui"],"active":true,"teamId":"t10"},
      {"id":"p14","cells":["Olivier Chevalier","AMC Corp","Codilog","Directeur de projet","Intégrateur","","olivier.chevalier@example.com","oui"],"active":true,"teamId":"t12"},
      {"id":"p15","cells":["Léa Fontaine","AMC Corp","Codilog","Chef de projet Brand X fonctionnel","Intégrateur","","lea.fontaine@example.com","oui"],"active":true,"teamId":"t12"},
      {"id":"r01","role":"Direction générale","team":"Direction","cells":["Vincent Lambert","AMC Corp","ECF","DG AMC Corp, depuis août 2026","Direction générale","","vincent.lambert@example.com","oui"],"active":true,"teamId":"t13"},
      {"id":"r02","role":"Actionnaire","team":"Direction","cells":["Henri Valmont","AMC Corp","ECF","Partner AMC Corp, président du conseil de surveillance","Direction générale","","henri.valmont@example.com","oui"],"active":true,"teamId":"t13"},
      {"id":"r03","role":"Finance Groupe","team":"Direction","cells":["François Mallet","AMC Corp","ECF","DG Finance, Legal, IT & Data","Direction générale","Finance","francois.mallet@example.com","oui"],"active":true,"teamId":"t13"},
      {"id":"r04","role":"Finance France","team":"Direction","cells":["Guillaume Picard","AMC Corp","ECF","Directeur Financier France","Direction générale","Finance","guillaume.picard@example.com","oui"],"active":true,"teamId":"t13"},
      {"id":"r05","role":"Achats / Appros / Logistique","team":"Direction","cells":["Catherine Vidal","AMC Corp","ECF","Directrice Générale","Direction générale","Achats / Appros / Logistique","catherine.vidal@example.com","oui"],"active":true,"teamId":"t13"},
      {"id":"r06","role":"Digital & Communication","team":"Direction","cells":["Aurélie Masson","AMC Corp","ECF","Directrice Marketing & Digital Groupe","Direction générale","","aurelie.masson@example.com","oui"],"active":true,"teamId":"t13"},
      {"id":"r07","role":"Achats","team":"Métiers","cells":["Valérie Collin","AMC Corp","ECF","Directrice des Achats","Pilotes métiers","Achats / Appros / Logistique","valerie.collin@example.com","oui"],"active":true,"teamId":"t13"},
      {"id":"r08","role":"Approvisionnement","team":"Métiers","cells":["Stéphane Noël","AMC Corp","ECF","Responsable Service Appro","Pilotes métiers","Achats / Appros / Logistique","stephane.noel@example.com","oui"],"active":true,"teamId":"t13"},
      {"id":"r09","role":"Logistique","team":"Métiers","cells":["Patrick Barbier","AMC Corp","ECF","Directeur Logistique","Pilotes métiers","Achats / Appros / Logistique","patrick.barbier@example.com","oui"],"active":true,"teamId":"t13"},
      {"id":"r10","role":"AMOA Ventes","team":"AMOA client","cells":["Mathieu Caron","AMC Corp","ECF","Manager de projets (AMC Corp)","AMOA interne","Ventes / CRM","mathieu.caron@example.com","oui"],"active":true,"teamId":"t13"},
      {"id":"r11","role":"AMOA CRM","team":"AMOA client","cells":["Inès Haddad","AMC Corp","ECF","Data Analyst (AMC Corp)","AMOA interne","Ventes / CRM","ines.haddad@example.com","oui"],"active":true,"teamId":"t13"},
      {"id":"r12","role":"AMOA Achat / Appro / Logistique","team":"AMOA client","cells":["Hugo Lemaire","AMC Corp","ECF","Consultant (AMC Corp)","AMOA interne","Achats / Appros / Logistique","hugo.lemaire@example.com","oui"],"active":true,"teamId":"t13"},
      {"id":"r13","role":"AMOA Finance","team":"AMOA client","cells":["Claire Dumont","AMC Corp","ECF","Consultant (freelance)","AMOA interne","Finance","claire.dumont@example.com","oui"],"active":true,"teamId":"t13"},
      {"id":"r14","role":"Référent SI multi-domaines","team":"DSI","cells":["Nicolas Brun","AMC Corp","ECF","Responsable domaine SI","Equipe IT - DSI","","nicolas.brun@example.com","oui"],"active":true,"teamId":"t13"},
      {"id":"r15","role":"Référent DSI Finance","team":"DSI","cells":["Sandrine Moulin","AMC Corp","ECF","Référent DSI Finance","Equipe IT - DSI","Finance","sandrine.moulin@example.com","oui"],"active":true,"teamId":"t13"},
      {"id":"r16","role":"Partner entrant","team":"AMOA","cells":["Arnaud Leroy","AMC Corp","Onepoint","Partner entrant","AMOA Externe","","arnaud.leroy@example.com","oui"],"active":true,"teamId":"t10"},
      {"id":"r17","role":"Partner sortant","team":"AMOA","cells":["Bernard Giraud","AMC Corp","Onepoint","Partner sortant","AMOA Externe","","bernard.giraud@example.com","oui"],"active":true,"teamId":"t10"},
      {"id":"r18","role":"AMOA Vente / CRM","team":"AMOA","cells":["Pauline Renard","AMC Corp","Onepoint","AMOA Vente / CRM","AMOA Externe","Ventes / CRM","pauline.renard@example.com","oui"],"active":true,"teamId":"t10"},
      {"id":"r19","role":"AMOA Vente / CRM","team":"AMOA","cells":["Maxime Arnaud","AMC Corp","Onepoint","AMOA Vente / CRM","AMOA Externe","Ventes / CRM","maxime.arnaud@example.com","oui"],"active":true,"teamId":"t10"},
      {"id":"r20","role":"AMOA Achat / Appro / Logistique","team":"AMOA","cells":["Chloé Bertin","AMC Corp","Onepoint","AMOA Achat / Appro / Logistique","AMOA Externe","Achats / Appros / Logistique","chloe.bertin@example.com","oui"],"active":true,"teamId":"t10"},
      {"id":"r21","role":"AMOA Achat / Appro / Logistique","team":"AMOA","cells":["Romain Gauthier","AMC Corp","Onepoint","AMOA Achat / Appro / Logistique","AMOA Externe","Achats / Appros / Logistique","romain.gauthier@example.com","oui"],"active":true,"teamId":"t10"},
      {"id":"r22","role":"Président","team":"Intégrateur","cells":["Didier Carré","AMC Corp","Codilog","Président","Intégrateur","","didier.carre@example.com","oui"],"active":true,"teamId":"t12"},
      {"id":"r23","role":"PMO","team":"Intégrateur","cells":["Manon Petit","AMC Corp","Codilog","PMO","Intégrateur","","manon.petit@example.com","oui"],"active":true,"teamId":"t12"}
    ]
  },
  GOVERNANCE_BODY: {
    label: "Instances de pilotage",
    scope: "Instances de gouvernance du projet ; chaque décision du registre est rattachée à l'une d'elles.",
    constraints: [],
    cols: ["libellé","description","fréquence"],
    widths: "170px minmax(0,1fr) 120px",
    rows: [
      {"id":"g1","cells":["Comité de pilotage","Arbitre les décisions structurantes du projet : dates de bascule, périmètre, budget.","Mensuelle"],"shortName":"COPIL","color":"#10233a","members":["p04","p03","p05","p10","p02","p14"],"frequency":"MONTHLY"},
      {"id":"g2","cells":["Comité de projet","Consolide l'avancement des chantiers et tranche les arbitrages inter-chantiers.","Hebdomadaire"],"shortName":"COPROJ","color":"#1d8f86","members":["p03","p01","p02","p06","p07","p08","p14","p15"],"frequency":"WEEKLY"},
      {"id":"g3","cells":["Comité de chantier","Pilote un chantier : planning, anomalies, charge des équipes.","Hebdomadaire"],"shortName":"Chantier","color":"#3b7dd8","members":["p07","p08","p09","p11","p13","p15"],"frequency":"WEEKLY"},
      {"id":"g4","cells":["Comité d'intégration","Coordonne interfaces, migration des données et tests de bout en bout.","Bimensuelle"],"shortName":"Intégration","color":"#e39a2d","members":["p06","p09","p12","p13","p15"],"frequency":"BIWEEKLY"},
      {"id":"g5","cells":["Comité d'arbitrage","Tranche hors cycle les points bloquants remontés par les chantiers.","À la demande"],"shortName":"Arbitrage","color":"#c2473b","members":["p03","p04","p02"],"frequency":"ON_DEMAND"},
      {"id":"g6","cells":["Comité sponsors","Informe les sponsors : santé du projet, baromètre, décisions à prendre.","Mensuelle"],"shortName":"Sponsors","color":"#b25fc4","members":["p04","p05","p10","p03"],"frequency":"MONTHLY"}
    ]
  },
  PROJECT_ASSIGNMENT: {
    label: "Affectations",
    scope: "Plusieurs affectations possibles par personne ; le rôle métier est distinct des permissions ; l'équipe appartient au même projet.",
    constraints: ["project_role ≠ permission applicative","team_id du même projet","end_date attendue pour toute affectation externe"],
    cols: ["person_id","team_id","project_role","début","fin","active"],
    widths: "minmax(0,1.2fr) 90px minmax(0,1.3fr) 90px 90px 60px",
    rows: [
      {"id":"a-p01","cells":["Robin Lefèvre","AMC Corp","PMO programme","01/03/2024","31/12/2026","oui"],"missing":false,"personId":"p01"},
      {"id":"a-p02","cells":["Julien Morel","AMC Corp","Direction de mission AMOA","01/03/2024","31/12/2026","oui"],"missing":false,"personId":"p02"},
      {"id":"a-p03","cells":["Laurent Garnier","AMC Corp","Responsable projet RISE","01/03/2024","","oui"],"missing":true,"personId":"p03"},
      {"id":"a-p04","cells":["Philippe Aubert","AMC Corp","Sponsor global · sponsor Ventes","01/03/2024","","oui"],"missing":true,"personId":"p04"},
      {"id":"a-p05","cells":["Nathalie Roux","AMC Corp","Sponsor IT","01/03/2024","—","oui"],"missing":false,"personId":"p05"},
      {"id":"a-p06-h1","cells":["Karim Benali","AMC Corp","Référent données (reprise legacy)","01/09/2024","31/08/2025","non"],"missing":false,"personId":"p06"},
      {"id":"a-p06-b","cells":["Karim Benali","AMC Corp","Référent données (reprise legacy)","01/09/2025","","oui"],"missing":false,"personId":"p06"},
      {"id":"a-p06","cells":["Karim Benali","AMC Corp","Responsable projet RISE (DSI) · migration","01/03/2024","—","oui"],"missing":false,"personId":"p06"},
      {"id":"a-p07","cells":["Sophie Marchand","AMC Corp","Pilote métier Finance","01/03/2024","—","oui"],"missing":false,"personId":"p07"},
      {"id":"a-p08","cells":["Thomas Girard","AMC Corp","Pilote métier Ventes","01/03/2024","—","oui"],"missing":false,"personId":"p08"},
      {"id":"a-p09","cells":["Élodie Faure","AMC Corp","Responsable chantier Interfaces","01/03/2024","—","oui"],"missing":false,"personId":"p09"},
      {"id":"a-p10","cells":["Isabelle Perrin","AMC Corp","Sponsor conduite du changement","01/03/2024","—","oui"],"missing":false,"personId":"p10"},
      {"id":"a-p11","cells":["Marc Delorme","AMC Corp","Rôles & autorisations","01/03/2024","—","oui"],"missing":false,"personId":"p11"},
      {"id":"a-p12-h1","cells":["Antoine Mercier","AMC Corp","Consultant migration","01/03/2024","30/11/2025","non"],"missing":false,"personId":"p12"},
      {"id":"a-p12","cells":["Antoine Mercier","AMC Corp","Responsable bascule","01/03/2024","30/11/2026","oui"],"missing":false,"personId":"p12"},
      {"id":"a-p13","cells":["Camille Rey","AMC Corp","PMO AMOA","01/03/2024","31/12/2026","oui"],"missing":false,"personId":"p13"},
      {"id":"a-p14","cells":["Olivier Chevalier","AMC Corp","Direction projet intégrateur","01/03/2024","31/12/2026","oui"],"missing":false,"personId":"p14"},
      {"id":"a-p15","cells":["Léa Fontaine","AMC Corp","Paramétrage et livraisons","01/03/2024","31/12/2026","oui"],"missing":false,"personId":"p15"}
    ]
  },
  DELIVERABLE: {
    label: "Livrables",
    scope: "Livrables attendus par phase et sous-phase ; chaque livrable a un responsable de production et une équipe.",
    constraints: [],
    sortable: true,
    cols: ["livrable","responsable","équipe","phase","sous-phase","chantier"],
    widths: "minmax(0,1.6fr) 110px 96px 84px minmax(0,1fr) 150px",
    rows: [
      {"id":"l1","cells":["Rapport d'analyse des innovations Brand X pertinentes","Julien Morel","AMOA","Discover","1.1 Analyse du portefeuille Brand X",""],"subphaseId":"SP1.1","ownerId":"p02","workstreamId":null,"start":"2023-06-01","due":"2023-09-10","prog":100,"riskOverride":null},
      {"id":"l2","cells":["Cartographie des processus actuels (as-is) et points de douleur","Julien Morel","AMOA","Discover","1.1 Analyse du portefeuille Brand X",""],"subphaseId":"SP1.1","ownerId":"p02","workstreamId":null,"start":"2023-06-19","due":"2023-10-06","prog":100,"riskOverride":null},
      {"id":"l3","cells":["Business case / analyse de valeur préliminaire","Julien Morel","AMOA","Discover","1.1 Analyse du portefeuille Brand X",""],"subphaseId":"SP1.1","ownerId":"p02","workstreamId":null,"start":"2023-07-06","due":"2023-10-31","prog":100,"riskOverride":null},
      {"id":"l4","cells":["Stratégie de transformation (greenfield, brownfield, selective data transition)","Julien Morel","AMOA","Discover","1.2 Stratégie de transformation","Conduite du changement"],"subphaseId":"SP1.2","ownerId":"p02","workstreamId":"C7","start":"2023-10-01","due":"2024-01-03","prog":100,"riskOverride":null},
      {"id":"l5","cells":["Feuille de route d'adoption (roadmap Brand X)","Julien Morel","AMOA","Discover","1.2 Stratégie de transformation","Conduite du changement"],"subphaseId":"SP1.2","ownerId":"p02","workstreamId":"C7","start":"2023-10-14","due":"2024-01-22","prog":100,"riskOverride":null},
      {"id":"l6","cells":["Rapport Readiness Check / Process Discovery (Brand X)","Julien Morel","AMOA","Discover","1.2 Stratégie de transformation",""],"subphaseId":"SP1.2","ownerId":"p02","workstreamId":null,"start":"2023-10-27","due":"2024-02-10","prog":100,"riskOverride":null},
      {"id":"l7","cells":["Estimation budgétaire et planning macro","Julien Morel","AMOA","Discover","1.2 Stratégie de transformation",""],"subphaseId":"SP1.2","ownerId":"p02","workstreamId":null,"start":"2023-11-10","due":"2024-02-29","prog":100,"riskOverride":null},
      {"id":"l8","cells":["Accès au système d'essai (trial) configuré","Julien Morel","AMOA","Discover","1.3 Accès système d'essai / évaluation",""],"subphaseId":"SP1.3","ownerId":"p02","workstreamId":null,"start":"2024-01-01","due":"2024-03-21","prog":100,"riskOverride":null},
      {"id":"l9","cells":["Compte rendu de démonstration des scénarios clés","Julien Morel","AMOA","Discover","1.3 Accès système d'essai / évaluation",""],"subphaseId":"SP1.3","ownerId":"p02","workstreamId":null,"start":"2024-01-15","due":"2024-04-10","prog":100,"riskOverride":null},
      {"id":"l10","cells":["Rapport d'adéquation solution / besoins métier (fit préliminaire)","Julien Morel","AMOA","Discover","1.3 Accès système d'essai / évaluation",""],"subphaseId":"SP1.3","ownerId":"p02","workstreamId":null,"start":"2024-01-29","due":"2024-04-30","prog":100,"riskOverride":null},
      {"id":"l11","cells":["Charte projet (objectifs, périmètre, hypothèses)","Robin Lefèvre","AMOA","Prepare","2.1 Initialisation du projet",""],"subphaseId":"SP2.1","ownerId":"p01","workstreamId":null,"start":"2024-07-01","due":"2024-07-19","prog":100,"riskOverride":null},
      {"id":"l12","cells":["Plan de management du projet (planning, budget, risques)","Robin Lefèvre","AMOA","Prepare","2.1 Initialisation du projet",""],"subphaseId":"SP2.1","ownerId":"p01","workstreamId":null,"start":"2024-07-03","due":"2024-07-22","prog":100,"riskOverride":null},
      {"id":"l13","cells":["Modèle de gouvernance (comités, instances, escalade)","Robin Lefèvre","AMOA","Prepare","2.1 Initialisation du projet",""],"subphaseId":"SP2.1","ownerId":"p01","workstreamId":null,"start":"2024-07-05","due":"2024-07-25","prog":100,"riskOverride":null},
      {"id":"l14","cells":["Matrice RACI des rôles et responsabilités","Robin Lefèvre","AMOA","Prepare","2.1 Initialisation du projet","Rôles et autorisations"],"subphaseId":"SP2.1","ownerId":"p01","workstreamId":"C6","start":"2024-07-07","due":"2024-07-28","prog":100,"riskOverride":null},
      {"id":"l15","cells":["Support et compte rendu de la réunion de lancement (kick-off)","Robin Lefèvre","AMOA","Prepare","2.1 Initialisation du projet","Conduite du changement"],"subphaseId":"SP2.1","ownerId":"p01","workstreamId":"C7","start":"2024-07-09","due":"2024-07-31","prog":100,"riskOverride":null},
      {"id":"l16","cells":["Organigramme de l'équipe projet","Robin Lefèvre","AMOA","Prepare","2.2 Mobilisation des équipes",""],"subphaseId":"SP2.2","ownerId":"p01","workstreamId":null,"start":"2024-07-01","due":"2024-08-07","prog":100,"riskOverride":null},
      {"id":"l17","cells":["Plan de formation de l'équipe projet (key users, consultants)","Robin Lefèvre","AMOA","Prepare","2.2 Mobilisation des équipes","Conduite du changement"],"subphaseId":"SP2.2","ownerId":"p01","workstreamId":"C7","start":"2024-07-05","due":"2024-08-13","prog":100,"riskOverride":null},
      {"id":"l18","cells":["Stratégie de conduite du changement et analyse des parties prenantes","Robin Lefèvre","AMOA","Prepare","2.2 Mobilisation des équipes","Conduite du changement"],"subphaseId":"SP2.2","ownerId":"p01","workstreamId":"C7","start":"2024-07-10","due":"2024-08-19","prog":100,"riskOverride":null},
      {"id":"l19","cells":["Plan de communication","Robin Lefèvre","AMOA","Prepare","2.2 Mobilisation des équipes","Conduite du changement"],"subphaseId":"SP2.2","ownerId":"p01","workstreamId":"C7","start":"2024-07-14","due":"2024-08-25","prog":100,"riskOverride":null},
      {"id":"l20","cells":["Stratégie d'adoption de la solution","Robin Lefèvre","AMOA","Prepare","2.2 Mobilisation des équipes","Conduite du changement"],"subphaseId":"SP2.2","ownerId":"p01","workstreamId":"C7","start":"2024-07-18","due":"2024-08-31","prog":100,"riskOverride":null},
      {"id":"l21","cells":["Système sandbox / starter system opérationnel","Robin Lefèvre","AMOA","Prepare","2.3 Mise à disposition des environnements",""],"subphaseId":"SP2.3","ownerId":"p01","workstreamId":null,"start":"2024-07-01","due":"2024-08-08","prog":100,"riskOverride":null},
      {"id":"l22","cells":["Architecture technique cible (landscape, transport)","Robin Lefèvre","AMOA","Prepare","2.3 Mise à disposition des environnements",""],"subphaseId":"SP2.3","ownerId":"p01","workstreamId":null,"start":"2024-07-06","due":"2024-08-16","prog":100,"riskOverride":null},
      {"id":"l23","cells":["Plan de provisionnement des environnements (DEV, QAS, PRD)","Robin Lefèvre","AMOA","Prepare","2.3 Mise à disposition des environnements",""],"subphaseId":"SP2.3","ownerId":"p01","workstreamId":null,"start":"2024-07-12","due":"2024-08-23","prog":100,"riskOverride":null},
      {"id":"l24","cells":["Procédures d'accès et gestion des habilitations projet","Robin Lefèvre","AMOA","Prepare","2.3 Mise à disposition des environnements","Rôles et autorisations"],"subphaseId":"SP2.3","ownerId":"p01","workstreamId":"C6","start":"2024-07-17","due":"2024-08-31","prog":100,"riskOverride":null},
      {"id":"l25","cells":["Stratégie de migration des données","Robin Lefèvre","AMOA","Prepare","2.4 Cadrage des stratégies clés","Migration des données"],"subphaseId":"SP2.4","ownerId":"p01","workstreamId":"C5","start":"2024-08-01","due":"2024-08-19","prog":100,"riskOverride":null},
      {"id":"l26","cells":["Stratégie de tests","Robin Lefèvre","AMOA","Prepare","2.4 Cadrage des stratégies clés",""],"subphaseId":"SP2.4","ownerId":"p01","workstreamId":null,"start":"2024-08-03","due":"2024-08-22","prog":100,"riskOverride":null},
      {"id":"l27","cells":["Stratégie d'intégration","Robin Lefèvre","AMOA","Prepare","2.4 Cadrage des stratégies clés","Interfaces"],"subphaseId":"SP2.4","ownerId":"p01","workstreamId":"C4","start":"2024-08-05","due":"2024-08-25","prog":100,"riskOverride":null},
      {"id":"l28","cells":["Stratégie de sécurité / habilitations","Robin Lefèvre","AMOA","Prepare","2.4 Cadrage des stratégies clés","Rôles et autorisations"],"subphaseId":"SP2.4","ownerId":"p01","workstreamId":"C6","start":"2024-08-07","due":"2024-08-28","prog":100,"riskOverride":null},
      {"id":"l29","cells":["Quality Gate Prepare validé","Robin Lefèvre","AMOA","Prepare","2.4 Cadrage des stratégies clés",""],"subphaseId":"SP2.4","ownerId":"p01","workstreamId":null,"start":"2024-08-09","due":"2024-08-31","prog":100,"riskOverride":null},
      {"id":"l30","cells":["Planning et supports des ateliers Fit-to-Standard","Olivier Chevalier","intégrateur","Explore","3.1 Ateliers Fit-to-Standard","Conduite du changement"],"subphaseId":"SP3.1","ownerId":"p14","workstreamId":"C7","start":"2024-08-01","due":"2024-12-11","prog":100,"riskOverride":null},
      {"id":"l31","cells":["Comptes rendus des ateliers par processus","Olivier Chevalier","intégrateur","Explore","3.1 Ateliers Fit-to-Standard",""],"subphaseId":"SP3.1","ownerId":"p14","workstreamId":null,"start":"2024-08-19","due":"2025-01-06","prog":100,"riskOverride":null},
      {"id":"l32","cells":["Liste des écarts (delta requirements / gaps) priorisés","Olivier Chevalier","intégrateur","Explore","3.1 Ateliers Fit-to-Standard",""],"subphaseId":"SP3.1","ownerId":"p14","workstreamId":null,"start":"2024-09-07","due":"2025-02-02","prog":100,"riskOverride":null},
      {"id":"l33","cells":["Validation des processus standards retenus (Best Practices)","Olivier Chevalier","intégrateur","Explore","3.1 Ateliers Fit-to-Standard",""],"subphaseId":"SP3.1","ownerId":"p14","workstreamId":null,"start":"2024-09-25","due":"2025-02-28","prog":100,"riskOverride":null},
      {"id":"l34","cells":["Backlog produit validé (configuration et développements)","Olivier Chevalier","intégrateur","Explore","3.2 Conception de la solution",""],"subphaseId":"SP3.2","ownerId":"p14","workstreamId":null,"start":"2024-11-01","due":"2025-03-08","prog":100,"riskOverride":null},
      {"id":"l35","cells":["Documents de conception de la solution (process design documents)","Olivier Chevalier","intégrateur","Explore","3.2 Conception de la solution",""],"subphaseId":"SP3.2","ownerId":"p14","workstreamId":null,"start":"2024-11-16","due":"2025-03-29","prog":100,"riskOverride":null},
      {"id":"l36","cells":["Spécifications fonctionnelles des WRICEF (Workflows, Reports, Interfaces, Conversions, Enhancements, Forms)","Olivier Chevalier","intégrateur","Explore","3.2 Conception de la solution","Interfaces"],"subphaseId":"SP3.2","ownerId":"p14","workstreamId":"C4","start":"2024-12-01","due":"2025-04-19","prog":100,"riskOverride":null},
      {"id":"l37","cells":["Structure organisationnelle Brand X (enterprise structure) validée","Olivier Chevalier","intégrateur","Explore","3.2 Conception de la solution",""],"subphaseId":"SP3.2","ownerId":"p14","workstreamId":null,"start":"2024-12-15","due":"2025-05-10","prog":100,"riskOverride":null},
      {"id":"l38","cells":["Concept d'habilitations (rôles utilisateurs)","Olivier Chevalier","intégrateur","Explore","3.2 Conception de la solution","Rôles et autorisations"],"subphaseId":"SP3.2","ownerId":"p14","workstreamId":"C6","start":"2024-12-30","due":"2025-05-31","prog":100,"riskOverride":null},
      {"id":"l39","cells":["Inventaire et cartographie des interfaces","Olivier Chevalier","intégrateur","Explore","3.3 Planification de l'intégration","Interfaces"],"subphaseId":"SP3.3","ownerId":"p14","workstreamId":"C4","start":"2025-01-01","due":"2025-05-01","prog":100,"riskOverride":null},
      {"id":"l40","cells":["Spécifications fonctionnelles des interfaces","Olivier Chevalier","intégrateur","Explore","3.3 Planification de l'intégration","Interfaces"],"subphaseId":"SP3.3","ownerId":"p14","workstreamId":"C4","start":"2025-01-22","due":"2025-05-31","prog":100,"riskOverride":null},
      {"id":"l41","cells":["Architecture d'intégration (Brand X BTP / Integration Suite, middleware)","Olivier Chevalier","intégrateur","Explore","3.3 Planification de l'intégration","Interfaces"],"subphaseId":"SP3.3","ownerId":"p14","workstreamId":"C4","start":"2025-02-12","due":"2025-06-30","prog":100,"riskOverride":null},
      {"id":"l42","cells":["Inventaire des objets de données à migrer","Olivier Chevalier","intégrateur","Explore","3.4 Préparation des données","Migration des données"],"subphaseId":"SP3.4","ownerId":"p14","workstreamId":"C5","start":"2025-03-01","due":"2025-06-23","prog":100,"riskOverride":null},
      {"id":"l43","cells":["Règles de mapping source-cible","Olivier Chevalier","intégrateur","Explore","3.4 Préparation des données","Migration des données"],"subphaseId":"SP3.4","ownerId":"p14","workstreamId":"C5","start":"2025-03-17","due":"2025-07-16","prog":100,"riskOverride":null},
      {"id":"l44","cells":["Plan de nettoyage et de qualité des données","Olivier Chevalier","intégrateur","Explore","3.4 Préparation des données","Migration des données"],"subphaseId":"SP3.4","ownerId":"p14","workstreamId":"C5","start":"2025-04-02","due":"2025-08-08","prog":100,"riskOverride":null},
      {"id":"l45","cells":["Plan de migration (cycles de mock loads)","Olivier Chevalier","intégrateur","Explore","3.4 Préparation des données","Migration des données"],"subphaseId":"SP3.4","ownerId":"p14","workstreamId":"C5","start":"2025-04-18","due":"2025-08-31","prog":100,"riskOverride":null},
      {"id":"l46","cells":["Plan de tests global","Olivier Chevalier","intégrateur","Explore","3.5 Planification des tests",""],"subphaseId":"SP3.5","ownerId":"p14","workstreamId":null,"start":"2025-06-01","due":"2025-08-13","prog":100,"riskOverride":null},
      {"id":"l47","cells":["Scénarios et cas de tests métier","Olivier Chevalier","intégrateur","Explore","3.5 Planification des tests",""],"subphaseId":"SP3.5","ownerId":"p14","workstreamId":null,"start":"2025-06-09","due":"2025-08-25","prog":100,"riskOverride":null},
      {"id":"l48","cells":["Plan des environnements et jeux de données de tests","Olivier Chevalier","intégrateur","Explore","3.5 Planification des tests","Migration des données"],"subphaseId":"SP3.5","ownerId":"p14","workstreamId":"C5","start":"2025-06-18","due":"2025-09-06","prog":100,"riskOverride":null},
      {"id":"l49","cells":["Planning des campagnes de tests","Olivier Chevalier","intégrateur","Explore","3.5 Planification des tests",""],"subphaseId":"SP3.5","ownerId":"p14","workstreamId":null,"start":"2025-06-26","due":"2025-09-18","prog":100,"riskOverride":null},
      {"id":"l50","cells":["Quality Gate Explore validé","Olivier Chevalier","intégrateur","Explore","3.5 Planification des tests",""],"subphaseId":"SP3.5","ownerId":"p14","workstreamId":null,"start":"2025-07-05","due":"2025-09-30","prog":100,"riskOverride":null},
      {"id":"l51","cells":["Système configuré par sprint (paramétrage documenté)","Karim Benali","intégrateur","Realize","4.1 Construction / configuration",""],"subphaseId":"SP4.1","ownerId":"p06","workstreamId":null,"start":"2025-09-01","due":"2025-11-16","prog":100,"riskOverride":null},
      {"id":"l52","cells":["Documentation de configuration","Karim Benali","intégrateur","Realize","4.1 Construction / configuration",""],"subphaseId":"SP4.1","ownerId":"p06","workstreamId":null,"start":"2025-09-12","due":"2025-12-01","prog":100,"riskOverride":null},
      {"id":"l53","cells":["Comptes rendus de démonstration de fin de sprint","Karim Benali","intégrateur","Realize","4.1 Construction / configuration",""],"subphaseId":"SP4.1","ownerId":"p06","workstreamId":null,"start":"2025-09-22","due":"2025-12-16","prog":100,"riskOverride":null},
      {"id":"l54","cells":["Backlog mis à jour (burn-down)","Karim Benali","intégrateur","Realize","4.1 Construction / configuration",""],"subphaseId":"SP4.1","ownerId":"p06","workstreamId":null,"start":"2025-10-03","due":"2025-12-31","prog":100,"riskOverride":null},
      {"id":"l55","cells":["Spécifications techniques des développements","Karim Benali","intégrateur","Realize","4.2 Développements spécifiques",""],"subphaseId":"SP4.2","ownerId":"p06","workstreamId":null,"start":"2025-10-01","due":"2025-12-16","prog":100,"riskOverride":null},
      {"id":"l56","cells":["Objets développés et transportés (WRICEF)","Karim Benali","intégrateur","Realize","4.2 Développements spécifiques","Interfaces"],"subphaseId":"SP4.2","ownerId":"p06","workstreamId":"C4","start":"2025-10-12","due":"2025-12-31","prog":100,"riskOverride":null},
      {"id":"l57","cells":["Résultats des tests unitaires des développements","Karim Benali","intégrateur","Realize","4.2 Développements spécifiques",""],"subphaseId":"SP4.2","ownerId":"p06","workstreamId":null,"start":"2025-10-22","due":"2026-01-16","prog":100,"riskOverride":null},
      {"id":"l58","cells":["Revue de code / conformité clean core","Karim Benali","intégrateur","Realize","4.2 Développements spécifiques",""],"subphaseId":"SP4.2","ownerId":"p06","workstreamId":null,"start":"2025-11-02","due":"2026-01-31","prog":100,"riskOverride":null},
      {"id":"l59","cells":["Interfaces développées et configurées","Karim Benali","intégrateur","Realize","4.3 Intégration technique","Interfaces"],"subphaseId":"SP4.3","ownerId":"p06","workstreamId":"C4","start":"2025-10-01","due":"2026-01-09","prog":100,"riskOverride":null},
      {"id":"l60","cells":["Résultats des tests d'interfaces (connectivité, flux)","Karim Benali","intégrateur","Realize","4.3 Intégration technique","Interfaces"],"subphaseId":"SP4.3","ownerId":"p06","workstreamId":"C4","start":"2025-10-19","due":"2026-02-03","prog":100,"riskOverride":null},
      {"id":"l61","cells":["Documentation technique des interfaces","Karim Benali","intégrateur","Realize","4.3 Intégration technique","Interfaces"],"subphaseId":"SP4.3","ownerId":"p06","workstreamId":"C4","start":"2025-11-05","due":"2026-02-28","prog":100,"riskOverride":null},
      {"id":"l62","cells":["Programmes et outils de migration (Migration Cockpit)","Karim Benali","intégrateur","Realize","4.4 Migration des données (legacy)","Migration des données"],"subphaseId":"SP4.4","ownerId":"p06","workstreamId":"C5","start":"2025-11-01","due":"2026-01-14","prog":100,"riskOverride":null},
      {"id":"l63","cells":["Rapports des cycles de mock migration","Karim Benali","intégrateur","Realize","4.4 Migration des données (legacy)","Migration des données"],"subphaseId":"SP4.4","ownerId":"p06","workstreamId":"C5","start":"2025-11-11","due":"2026-01-29","prog":100,"riskOverride":null},
      {"id":"l64","cells":["Rapports de réconciliation des données","Karim Benali","intégrateur","Realize","4.4 Migration des données (legacy)","Migration des données"],"subphaseId":"SP4.4","ownerId":"p06","workstreamId":"C5","start":"2025-11-22","due":"2026-02-13","prog":100,"riskOverride":null},
      {"id":"l65","cells":["Validation métier des données chargées","Karim Benali","intégrateur","Realize","4.4 Migration des données (legacy)","Migration des données"],"subphaseId":"SP4.4","ownerId":"p06","workstreamId":"C5","start":"2025-12-02","due":"2026-02-28","prog":100,"riskOverride":null},
      {"id":"l66","cells":["Résultats des tests unitaires","Karim Benali","intégrateur","Realize","4.5 Tests (unitaires, intégration, UAT)",""],"subphaseId":"SP4.5","ownerId":"p06","workstreamId":null,"start":"2025-12-01","due":"2026-01-23","prog":100,"riskOverride":null},
      {"id":"l67","cells":["Rapport des tests d'intégration (SIT)","Karim Benali","intégrateur","Realize","4.5 Tests (unitaires, intégration, UAT)","Interfaces"],"subphaseId":"SP4.5","ownerId":"p06","workstreamId":"C4","start":"2025-12-07","due":"2026-02-01","prog":100,"riskOverride":null},
      {"id":"l68","cells":["Procès-verbal de recette utilisateur (UAT sign-off)","Karim Benali","intégrateur","Realize","4.5 Tests (unitaires, intégration, UAT)",""],"subphaseId":"SP4.5","ownerId":"p06","workstreamId":null,"start":"2025-12-13","due":"2026-02-10","prog":100,"riskOverride":null},
      {"id":"l69","cells":["Journal des anomalies et suivi de résolution","Karim Benali","intégrateur","Realize","4.5 Tests (unitaires, intégration, UAT)",""],"subphaseId":"SP4.5","ownerId":"p06","workstreamId":null,"start":"2025-12-20","due":"2026-02-19","prog":100,"riskOverride":null},
      {"id":"l70","cells":["Rapport des tests de performance et de sécurité","Karim Benali","intégrateur","Realize","4.5 Tests (unitaires, intégration, UAT)","Rôles et autorisations"],"subphaseId":"SP4.5","ownerId":"p06","workstreamId":"C6","start":"2025-12-26","due":"2026-02-28","prog":100,"riskOverride":null},
      {"id":"l71","cells":["Plan de cutover détaillé (runbook)","Karim Benali","intégrateur","Realize","4.6 Préparation du cutover",""],"subphaseId":"SP4.6","ownerId":"p06","workstreamId":null,"start":"2026-01-01","due":"2026-02-05","prog":100,"riskOverride":null},
      {"id":"l72","cells":["Stratégie et plan de retour arrière (rollback)","Karim Benali","intégrateur","Realize","4.6 Préparation du cutover",""],"subphaseId":"SP4.6","ownerId":"p06","workstreamId":null,"start":"2026-01-05","due":"2026-02-11","prog":100,"riskOverride":null},
      {"id":"l73","cells":["Matériel de formation des utilisateurs finaux","Karim Benali","intégrateur","Realize","4.6 Préparation du cutover","Conduite du changement"],"subphaseId":"SP4.6","ownerId":"p06","workstreamId":"C7","start":"2026-01-09","due":"2026-02-16","prog":100,"riskOverride":null},
      {"id":"l74","cells":["Plan de support post-démarrage (hypercare)","Karim Benali","intégrateur","Realize","4.6 Préparation du cutover","Conduite du changement"],"subphaseId":"SP4.6","ownerId":"p06","workstreamId":"C7","start":"2026-01-13","due":"2026-02-22","prog":100,"riskOverride":null},
      {"id":"l75","cells":["Quality Gate Realize validé","Karim Benali","intégrateur","Realize","4.6 Préparation du cutover",""],"subphaseId":"SP4.6","ownerId":"p06","workstreamId":null,"start":"2026-01-17","due":"2026-02-28","prog":100,"riskOverride":null},
      {"id":"l76","cells":["Système de production installé et configuré","Antoine Mercier","AMOA","Deploy","5.1 Mise en place de l'environnement de production",""],"subphaseId":"SP5.1","ownerId":"p12","workstreamId":null,"start":"2026-02-01","due":"2026-05-05","prog":100,"riskOverride":null},
      {"id":"l77","cells":["Transports importés en production","Antoine Mercier","AMOA","Deploy","5.1 Mise en place de l'environnement de production",""],"subphaseId":"SP5.1","ownerId":"p12","workstreamId":null,"start":"2026-02-14","due":"2026-05-24","prog":100,"riskOverride":null},
      {"id":"l78","cells":["Habilitations utilisateurs de production","Antoine Mercier","AMOA","Deploy","5.1 Mise en place de l'environnement de production","Rôles et autorisations"],"subphaseId":"SP5.1","ownerId":"p12","workstreamId":"C6","start":"2026-02-27","due":"2026-06-11","prog":100,"riskOverride":null},
      {"id":"l79","cells":["Check-list de préparation production (production readiness)","Antoine Mercier","AMOA","Deploy","5.1 Mise en place de l'environnement de production",""],"subphaseId":"SP5.1","ownerId":"p12","workstreamId":null,"start":"2026-03-12","due":"2026-06-30","prog":100,"riskOverride":null},
      {"id":"l80","cells":["Supports de formation finalisés (guides, e-learning)","Antoine Mercier","AMOA","Deploy","5.2 Formation des utilisateurs finaux","Conduite du changement"],"subphaseId":"SP5.2","ownerId":"p12","workstreamId":"C7","start":"2026-07-01","due":"2026-09-20","prog":63,"riskOverride":null},
      {"id":"l81","cells":["Planning et feuilles de présence des sessions","Antoine Mercier","AMOA","Deploy","5.2 Formation des utilisateurs finaux",""],"subphaseId":"SP5.2","ownerId":"p12","workstreamId":null,"start":"2026-07-15","due":"2026-10-11","prog":66,"riskOverride":null},
      {"id":"l82","cells":["Évaluation des formations / readiness des utilisateurs","Antoine Mercier","AMOA","Deploy","5.2 Formation des utilisateurs finaux","Conduite du changement"],"subphaseId":"SP5.2","ownerId":"p12","workstreamId":"C7","start":"2026-07-29","due":"2026-10-31","prog":45,"riskOverride":null},
      {"id":"l83","cells":["Compte rendu de la répétition générale","Antoine Mercier","AMOA","Deploy","5.3 Répétition générale (dress rehearsal)",""],"subphaseId":"SP5.3","ownerId":"p12","workstreamId":null,"start":"2026-09-01","due":"2026-10-11","prog":45,"riskOverride":null},
      {"id":"l84","cells":["Plan de cutover ajusté (timings validés)","Antoine Mercier","AMOA","Deploy","5.3 Répétition générale (dress rehearsal)",""],"subphaseId":"SP5.3","ownerId":"p12","workstreamId":null,"start":"2026-09-08","due":"2026-10-21","prog":24,"riskOverride":null},
      {"id":"l85","cells":["Liste des actions correctives","Antoine Mercier","AMOA","Deploy","5.3 Répétition générale (dress rehearsal)",""],"subphaseId":"SP5.3","ownerId":"p12","workstreamId":null,"start":"2026-09-15","due":"2026-10-31","prog":6,"riskOverride":null},
      {"id":"l86","cells":["Données migrées et réconciliées en production","Antoine Mercier","AMOA","Deploy","5.4 Cutover / Go-live","Migration des données"],"subphaseId":"SP5.4","ownerId":"p12","workstreamId":"C5","start":"2027-04-01","due":"2027-04-01","prog":0,"riskOverride":null},
      {"id":"l87","cells":["Procès-verbal de validation du cutover","Antoine Mercier","AMOA","Deploy","5.4 Cutover / Go-live",""],"subphaseId":"SP5.4","ownerId":"p12","workstreamId":null,"start":"2027-04-01","due":"2027-04-01","prog":0,"riskOverride":null},
      {"id":"l88","cells":["Décision Go / No-Go signée","Antoine Mercier","AMOA","Deploy","5.4 Cutover / Go-live",""],"subphaseId":"SP5.4","ownerId":"p12","workstreamId":null,"start":"2027-04-01","due":"2027-04-01","prog":0,"riskOverride":null},
      {"id":"l89","cells":["Communication de démarrage aux utilisateurs","Antoine Mercier","AMOA","Deploy","5.4 Cutover / Go-live","Conduite du changement"],"subphaseId":"SP5.4","ownerId":"p12","workstreamId":"C7","start":"2027-04-01","due":"2027-04-01","prog":0,"riskOverride":null},
      {"id":"l90","cells":["Rapports de suivi des incidents hypercare","Antoine Mercier","AMOA","Deploy","5.5 Hypercare",""],"subphaseId":"SP5.5","ownerId":"p12","workstreamId":null,"start":"2027-04-01","due":"2027-04-01","prog":0,"riskOverride":null},
      {"id":"l91","cells":["Indicateurs de stabilisation (KPI)","Antoine Mercier","AMOA","Deploy","5.5 Hypercare",""],"subphaseId":"SP5.5","ownerId":"p12","workstreamId":null,"start":"2027-04-01","due":"2027-04-01","prog":0,"riskOverride":null},
      {"id":"l92","cells":["Documentation de transfert au support (handover)","Antoine Mercier","AMOA","Deploy","5.5 Hypercare","Conduite du changement"],"subphaseId":"SP5.5","ownerId":"p12","workstreamId":"C7","start":"2027-04-01","due":"2027-04-01","prog":0,"riskOverride":null},
      {"id":"l93","cells":["Clôture du projet et retour d'expérience (lessons learned)","Antoine Mercier","AMOA","Deploy","5.5 Hypercare","Finance"],"subphaseId":"SP5.5","ownerId":"p12","workstreamId":"C1","start":"2027-04-01","due":"2027-04-01","prog":0,"riskOverride":null},
      {"id":"l94","cells":["Quality Gate Deploy validé","Antoine Mercier","AMOA","Deploy","5.5 Hypercare",""],"subphaseId":"SP5.5","ownerId":"p12","workstreamId":null,"start":"2027-04-01","due":"2027-04-01","prog":0,"riskOverride":null},
      {"id":"l95","cells":["Modèle opérationnel de support (niveaux 1/2/3, SLA)","Laurent Garnier","client","Run","6.1 Exploitation courante","Conduite du changement"],"subphaseId":"SP6.1","ownerId":"p03","workstreamId":"C7","start":"2027-07-01","due":"2027-10-29","prog":0,"riskOverride":null},
      {"id":"l96","cells":["Procédures d'exploitation (run book)","Laurent Garnier","client","Run","6.1 Exploitation courante",""],"subphaseId":"SP6.1","ownerId":"p03","workstreamId":null,"start":"2027-07-22","due":"2027-11-28","prog":0,"riskOverride":null},
      {"id":"l97","cells":["Rapports de suivi des incidents et de la disponibilité","Laurent Garnier","client","Run","6.1 Exploitation courante",""],"subphaseId":"SP6.1","ownerId":"p03","workstreamId":null,"start":"2027-08-12","due":"2027-12-28","prog":0,"riskOverride":null},
      {"id":"l98","cells":["Backlog d'améliorations continues","Laurent Garnier","client","Run","6.2 Amélioration continue",""],"subphaseId":"SP6.2","ownerId":"p03","workstreamId":null,"start":"2027-07-01","due":"2027-10-29","prog":0,"riskOverride":null},
      {"id":"l99","cells":["Rapports de suivi des KPI métier","Laurent Garnier","client","Run","6.2 Amélioration continue",""],"subphaseId":"SP6.2","ownerId":"p03","workstreamId":null,"start":"2027-07-22","due":"2027-11-28","prog":0,"riskOverride":null},
      {"id":"l100","cells":["Analyses d'optimisation des processus","Laurent Garnier","client","Run","6.2 Amélioration continue",""],"subphaseId":"SP6.2","ownerId":"p03","workstreamId":null,"start":"2027-08-12","due":"2027-12-28","prog":0,"riskOverride":null},
      {"id":"l101","cells":["Plan de déploiement des nouveaux utilisateurs / périmètres","Laurent Garnier","client","Run","6.3 Intégration de nouveaux utilisateurs","Conduite du changement"],"subphaseId":"SP6.3","ownerId":"p03","workstreamId":"C7","start":"2027-08-29","due":"2027-11-18","prog":0,"riskOverride":null},
      {"id":"l102","cells":["Supports de formation adaptés","Laurent Garnier","client","Run","6.3 Intégration de nouveaux utilisateurs","Conduite du changement"],"subphaseId":"SP6.3","ownerId":"p03","workstreamId":"C7","start":"2027-09-12","due":"2027-12-08","prog":0,"riskOverride":null},
      {"id":"l103","cells":["Comptes utilisateurs et habilitations créés","Laurent Garnier","client","Run","6.3 Intégration de nouveaux utilisateurs","Rôles et autorisations"],"subphaseId":"SP6.3","ownerId":"p03","workstreamId":"C6","start":"2027-09-26","due":"2027-12-28","prog":0,"riskOverride":null},
      {"id":"l104","cells":["Calendrier des montées de version et correctifs","Laurent Garnier","client","Run","6.4 Mises à jour et innovations",""],"subphaseId":"SP6.4","ownerId":"p03","workstreamId":null,"start":"2027-11-29","due":"2027-12-17","prog":0,"riskOverride":null},
      {"id":"l105","cells":["Analyse d'impact des nouvelles releases Brand X","Laurent Garnier","client","Run","6.4 Mises à jour et innovations",""],"subphaseId":"SP6.4","ownerId":"p03","workstreamId":null,"start":"2027-12-02","due":"2027-12-21","prog":0,"riskOverride":null},
      {"id":"l106","cells":["Résultats des tests de non-régression","Laurent Garnier","client","Run","6.4 Mises à jour et innovations",""],"subphaseId":"SP6.4","ownerId":"p03","workstreamId":null,"start":"2027-12-04","due":"2027-12-24","prog":0,"riskOverride":null},
      {"id":"l107","cells":["Plan d'adoption des innovations","Laurent Garnier","client","Run","6.4 Mises à jour et innovations","Conduite du changement"],"subphaseId":"SP6.4","ownerId":"p03","workstreamId":"C7","start":"2027-12-07","due":"2027-12-28","prog":0,"riskOverride":null}
    ]
  }
};

export const modelGaps = [
  {"obj":"PROJECT_ASSIGNMENT","label":"2 affectations sans end_date","detail":"Laurent Garnier et Philippe Aubert : fin d'affectation à préciser pour le calcul de charge."},
  {"obj":"WAVE","label":"Lot 2 : owner non désigné","detail":"Aucun responsable affecté au Lot 2 ; le périmètre 2027 ne peut pas être planifié."}
];

export const referential = {"barometer":{"avg":"5,7","trend":["4,8","5,2","5,6","5,7"],"respondents":"38 / 75","ready":45,"capacity":37,"capacityPrev":48,"understand":87,"visibility":"5,13","domains":[["DSI","7,2","5 / 23"],["Logistique","6,0","3 / 8"],["Ventes","5,61","13 / 22"],["Finance / CG","5,55","9 / 13"],["Transverse","4,8","5"],["Achats","—","0"]]},"identity":[["Raison sociale","AMC Corp"],["Secteur","Distribution B2B d'équipements pour les professionnels de la restauration (CHR), du care et des collectivités"],["Siège","1 rue de l'Exemple, 75000 Paris"],["Fondation","1858 — Brand X"],["Présence","16 pays · France, Benelux, Italie, Allemagne, Autriche, UK, Espagne, Dubaï, Australie, NZ"],["Effectifs","~1 750 collaborateurs"],["Chiffre d'affaires","~800 M€ (2025) · ambition 3 Md€ en 2028"],["Actionnaire","AMC Corp — Henri Valmont, président du conseil de surveillance"],["Direction générale","Vincent Lambert, DG Groupe (août 2026)"]],"network":[["418","commerciaux · 149 en France"],["50","magasins · 12 Cash & Carry, 2 showrooms"],["40","centres logistiques · 10 en France"],["11","sites e-commerce · 4 en France"],["10","centres d'appels · 3 en France"],["19","ERP remplacés par Brand X"]],"brands":["Brand X","Brand X","Brand X","Brand X","Brand X","Brand X"],"scope":[["Finance","Comptabilité, contrôle de gestion, reporting Groupe, intra-groupe, consolidation"],["Achats / Approvisionnement","Commandes fournisseurs, tarification, promotions, stock multisite"],["Logistique","Entrepôts, transport, réapprovisionnement, multisites"],["Ventes / CRM","Clients (BP), articles, tarification, commandes, livraisons, facturation, réclamations, leads, opportunités"],["Interfaces & IT","Reprise de données, interfaces entrantes/sortantes, administration Brand X, lien Cloud"]],"systems":[["Brand X","ERP principal AMC Corp (Brand X & stores) — remplacé en Lot 1"],["Brand X","ERP Brand X — remplacé en Lot 1"],["Autres ERP (×16)","Filiales et entités internationales — Lots 2 à 4"]],"lots":[["Lot 1","AMC Corp, Brand X et stores","2024 → 2026","En cours · UAT","cur"],["Lot 2","Autres filiales France","2027 → 2028","À venir","next"],["Lot 3","Filiales EMEA","2028 → 2029","À venir","next"],["Lot 4","Hors Europe","2029 → 2030","À venir","next"]],"goliveHistory":[["1er déc. 2025","1re date","Reportée"],["11 avr. 2026","2e date","Reportée"],["1er juil. 2026","3e date","Reportée"],["1er nov. 2026","4e date · référence v4","Reportée"],["1er avr. 2027","5e date · référence v5 (D-007)","Officielle"]],"timeline":[["AO envoyé","juin 2023","done"],["Éditeurs / intégrateurs shortlistés","nov. 2023","done"],["Soutenances terminées","mars 2024","done"],["Cadrage de la vision cible terminé (30 ateliers)","avr. 2024","done"],["Éditeur / intégrateur sélectionnés — Brand X + AMC Corp","avr. 2024","done"],["Kick-off projet réalisé — siège","8 juil. 2024","done"],["Exploration terminée","sept. 2025","done"],["Réalisation (Build) terminée","févr. 2026","done"],["Recette utilisateur (UAT) terminée","sept. 2026","cur"],["Dry Run de bascule terminé","8 oct. 2026","cur"],["Go / No-Go prononcé","4 oct. 2026 · à revoir","next"],["Go-Live Lot 1 — AMC Corp","1er nov. 2026 (réf.) · prob. 1er mars 2027","next"],["Hypercare démarré","1er déc. 2026 · à confirmer","next"],["Lot 2 démarré — filiales France","à confirmer","next"]],"cutover":[["S-5","20-24 sept.","Montée des environnements techniques (Brand X + infra)"],["S-4","27-30 sept.","Reprise et enrichissement Master Data"],["S-3","4-8 oct.","Activation CRM Brand X — devis, commandes, factures, encours"],["S-2","11-15 oct.","Bascule réelle : flux critiques, smoke tests, montée en charge"],["S-1","25-31 oct.","Interfaces medium, écritures de clôture, immobilisations"],["J","1er nov.","Live — sous réserve Go / No-Go COPIL du 31 oct."],["S+1 → S+3","nov.","Extension live, hypercare, reprise factures financières"]],"governance":[["Sponsor global","Philippe Aubert","Directeur Général France","p04",["p04"]],["Sponsor IT","Nathalie Roux","DSI & Data Groupe","p05",["p05"]],["Directeur de programme","Laurent Garnier","Responsable projet RISE (freelance)","p03",["p03"]],["Direction générale","Vincent Lambert","DG AMC Corp, depuis août 2026","r01",["r01"]],["Actionnaire","Henri Valmont","Partner AMC Corp, président du conseil de surveillance","r02",["r02"]]],"sponsors":[["Finance Groupe","François Mallet","DG Finance, Legal, IT & Data","r03",["r03"]],["Finance France","Guillaume Picard","Directeur Financier France","r04",["r04"]],["Achats / Appros / Logistique","Catherine Vidal","Directrice Générale","r05",["r05"]],["Ventes","Philippe Aubert","Directeur Général France","p04",["p04"]],["Digital & Communication","Aurélie Masson","Directrice Marketing & Digital Groupe","r06",["r06"]],["Conduite du changement","Isabelle Perrin","DRH Groupe","p10",["p10"]]],"pilots":[["Finance","Sophie Marchand","Directrice Comptable","p07",["p07"]],["Achats","Valérie Collin","Directrice des Achats","r07",["r07"]],["Approvisionnement","Stéphane Noël","Responsable Service Appro","r08",["r08"]],["Logistique","Patrick Barbier","Directeur Logistique","r09",["r09"]],["Ventes","Thomas Girard","Directeur Commercial France","p08",["p08"]]],"amoaClient":[["AMOA Ventes","Mathieu Caron","Manager de projets (AMC Corp)","r10",["r10"]],["AMOA CRM","Inès Haddad","Data Analyst (AMC Corp)","r11",["r11"]],["AMOA Achat / Appro / Logistique","Hugo Lemaire","Consultant (AMC Corp)","r12",["r12"]],["AMOA Finance","Claire Dumont","Consultant (freelance)","r13",["r13"]]],"dsi":[["Sponsor IT","Nathalie Roux","DSI & Data Groupe","p05",["p05"]],["Responsable projet RISE","Karim Benali","Responsable IT ERP, Études & Développement","p06",["p06"]],["Référent SI multi-domaines","Nicolas Brun","Responsable domaine SI","r14",["r14"]],["Référent DSI Achats/Appros/Log./Ventes","Élodie Faure","","p09",["p09"]],["Référent DSI Finance","Sandrine Moulin","","r15",["r15"]],["RSSI","Marc Delorme","Responsable Sécurité des SI","p11",["p11"]]],"amoa":[["Partner entrant","Arnaud Leroy","Passation en cours de phase UAT","r16",["r16"]],["Partner sortant","Bernard Giraud","Suivi depuis le cadrage AO (septembre 2023)","r17",["r17"]],["Directeur de projet","Julien Morel","3 ans sur le projet","p02",["p02"]],["PMO projet","Robin Lefèvre","1 an","p01",["p01"]],["Responsable Cutover","Antoine Mercier","2 mois","p12",["p12"]],["PMO AMOA","Camille Rey","6 mois","p13",["p13"]],["AMOA Vente / CRM","Pauline Renard · Maxime Arnaud","5 mois · 2 mois","r18",["r18","r19"]],["AMOA Achat / Appro / Logistique","Chloé Bertin · Romain Gauthier","10 mois · 8 mois","r20",["r20","r21"]]],"integ":[["Président","Didier Carré","","r22",["r22"]],["Directeur de projet","Olivier Chevalier","","p14",["p14"]],["Chef de projet Brand X fonctionnel","Léa Fontaine","","p15",["p15"]],["PMO","Manon Petit","","r23",["r23"]]],"contract":[["Type de contrat","Régie forfaitaire"],["Valeur de la mission","~2,86 M€ (2024 → août 2026)"],["Extensions en cours","Tranche 6 en négociation — Arnaud Leroy"],["Satisfaction client","Bonne · la DSI souhaite AMC Corp sur les lots suivants"],["Relation actionnaire","L'actionnaire (AMC Corp) suit le projet ; pas de relation directe avec l'AMOA"],["Passation","Bernard Giraud → Arnaud Leroy · date à définir"]],"amoaRole":["Cadrage de la vision cible — 30 ateliers métiers et IT","Pilotage de l'appel d'offres éditeur / intégrateur (CDC, ~1 000 questions, 5 soutenances)","Aide à la décision pour la sélection du binôme Brand X / AMC Corp","Accompagnement au lancement — kick-off au siège, 8 juillet 2024","AMOA Finance, Achats, Appros, Logistique, Ventes, CRM","Gouvernance : reporting, gestion des risques, conduite du changement"],"pitch":"Programme de transformation digitale d'AMC Corp, nom de code de l'ambition « next level ». Intégrateur AMC Corp (fit-to-standard, forfait) ; éditeur Brand X. AMC Corp intervient en AMOA et conseil stratégique depuis le cadrage de l'appel d'offres (septembre 2023).","stakes":["Intégrer rapidement les entités acquises — core model Brand X comme accélérateur (30+ acquisitions en 5 ans)","Sortir de 19 ERP hétérogènes et de l'obsolescence de Brand X","Vision omnicanale unifiée : magasins, e-commerce, télévente, terrain","Fonction Finance réarmée pour piloter le Groupe à l'international"],"geo":["France","Belgique","Luxembourg","Allemagne","Italie","UK","UAE","Arabie Saoudite","Nouvelle Zélande","Australie"],"legal":["AMC Corp","AMC Corp","AMC Corp","AMC Corp","AMC Corp","AMC Corp","AMC Corp","AMC Corp","AMC Corp"]};

export const raci = {"cols":["Sponsors AMC Corp","Dir. programme (Laurent Garnier)","DSI AMC Corp","Pilotes métiers","AMOA AMC Corp","AMC Corp"],"rows":[["Décision Go-Live / report",["A","R","C","C","C","C"]],["Planning de référence (baseline)",["I","A","C","C","R","C"]],["Recette métier (UAT) par domaine",["I","A","C","R","C","C"]],["Corrections et paramétrage Brand X",["","I","C","C","I","R"]],["Migration des données (Runs)",["","A","R","C","C","R"]],["Interfaces et flux",["","A","R","I","C","R"]],["Cutover et bascule",["I","A","C","C","R","R"]],["Cartographie des risques",["I","A","C","C","R","C"]],["Support COPIL et relevé de décisions",["I","A","I","I","R","C"]],["Conduite du changement et formation",["A","C","I","R","C","I"]],["Budget programme",["A","R","C","I","C","I"]]]};

export const barometre = {"months":[["nov","nov. 25"],["dec","déc."],["fev","févr. 26"],["mar","mars"],["avr","avr."],["mai","mai"],["jul","juil."]],"ecf":{"label":"AMC Corp — ensemble","size":33,"series":[4.8,5.2,5.6,5.7,5.9,5.1,5.9]},"respondents":[31,30,34,33,34,35,33],"domains":[{"n":"Logistique","size":8,"resp":3,"series":[4.2,4.9,5.4,5.8,6.4,6.1,7.7],"range":"7 – 8"},{"n":"Ventes","size":22,"resp":14,"series":[4.6,5,5.5,5.6,5.8,5,6.4],"range":"3 – 9"},{"n":"Finance – CdG","size":13,"resp":7,"series":[5.4,5.7,6,6.2,6.3,6.3,6.3],"range":"4 – 8"},{"n":"DSI","size":23,"resp":1,"series":[5.2,5.5,6.1,6,6.2,5,5],"range":"5"},{"n":"Appros","size":2,"resp":1,"series":[null,null,4,4.5,4.5,4,5],"range":"5"},{"n":"Transverse","size":3,"resp":5,"series":[4,4.4,4.9,5,5.2,4.6,4.2],"range":"2 – 8"},{"n":"Achats","size":6,"resp":2,"series":[4.5,4.8,5,5.2,5,4.5,3],"range":"1 – 5"}],"sentiment":{"nov":[40,20,34],"dec":[36,22,42],"fev":[32,24,44],"mar":[30,24,46],"avr":[27,22,51],"mai":[29,31,37],"jul":[21,21,55]},"questions":[{"q":"Lisibilité de la trajectoire jusqu'au Go-Live","v":5.6,"delta":0.8},{"q":"Capacité à faire face aux attentes business pendant la recette","v":5.4,"delta":0.3}],"themes":[["Le progrès est réel — l'usage et l'équipe rassurent","ok"],["Reprise et bascule des données — sujet « le plus flou à date »","risk"],["Sujets structurants non tranchés — RFA, DAS2, DEB, FEC","risk"],["Supports de formation Ventes à améliorer","vig"],["Charge, fatigue, isolement — congés d'été redoutés","vig"]]};

// Habilitations (Utilisateur × Profil × Chantier). ADMIN et PMO : wsId = null (tous les chantiers). RESPONSABLE : gère le transactionnel du chantier. LECTEUR : consulte le transactionnel du chantier. Droits effectifs = le plus fort (RG5).
export const habilitations = [{"id":"h01","personId":"p01","profile":"PMO","wsId":null},{"id":"h02","personId":"p02","profile":"ADMIN","wsId":null},{"id":"h03","personId":"p13","profile":"PMO","wsId":null},{"id":"h04","personId":"p07","profile":"RESPONSABLE","wsId":"C1"},{"id":"h05","personId":"p09","profile":"RESPONSABLE","wsId":"C2"},{"id":"h06","personId":"p08","profile":"RESPONSABLE","wsId":"C3"},{"id":"h07","personId":"p09","profile":"RESPONSABLE","wsId":"C4"},{"id":"h08","personId":"p06","profile":"RESPONSABLE","wsId":"C5"},{"id":"h09","personId":"p06","profile":"RESPONSABLE","wsId":"C6"},{"id":"h10","personId":"p10","profile":"RESPONSABLE","wsId":"C7"},{"id":"h11","personId":"p03","profile":"RESPONSABLE","wsId":"C8"},{"id":"h12","personId":"p04","profile":"LECTEUR","wsId":"C3"},{"id":"h13","personId":"p05","profile":"LECTEUR","wsId":"C8"},{"id":"h14","personId":"p09","profile":"LECTEUR","wsId":"C3"},{"id":"h15","personId":"p11","profile":"LECTEUR","wsId":"C6"},{"id":"h16","personId":"p12","profile":"LECTEUR","wsId":"C8"},{"id":"h17","personId":"p14","profile":"LECTEUR","wsId":"C8"},{"id":"h18","personId":"p15","profile":"LECTEUR","wsId":"C8"},{"id":"h19","personId":"r01","profile":"LECTEUR","wsId":"C8"},{"id":"h20","personId":"r02","profile":"LECTEUR","wsId":"C8"},{"id":"h21","personId":"r03","profile":"LECTEUR","wsId":"C1"},{"id":"h22","personId":"r04","profile":"LECTEUR","wsId":"C1"},{"id":"h23","personId":"r05","profile":"LECTEUR","wsId":"C2"},{"id":"h24","personId":"r06","profile":"LECTEUR","wsId":"C8"},{"id":"h25","personId":"r07","profile":"LECTEUR","wsId":"C2"},{"id":"h26","personId":"r08","profile":"LECTEUR","wsId":"C2"},{"id":"h27","personId":"r09","profile":"LECTEUR","wsId":"C2"},{"id":"h28","personId":"r10","profile":"LECTEUR","wsId":"C3"},{"id":"h29","personId":"r11","profile":"LECTEUR","wsId":"C3"},{"id":"h30","personId":"r12","profile":"LECTEUR","wsId":"C2"},{"id":"h31","personId":"r13","profile":"LECTEUR","wsId":"C1"},{"id":"h32","personId":"r14","profile":"LECTEUR","wsId":"C8"},{"id":"h33","personId":"r15","profile":"LECTEUR","wsId":"C1"},{"id":"h34","personId":"r16","profile":"LECTEUR","wsId":"C8"},{"id":"h35","personId":"r17","profile":"LECTEUR","wsId":"C8"},{"id":"h36","personId":"r18","profile":"LECTEUR","wsId":"C3"},{"id":"h37","personId":"r19","profile":"LECTEUR","wsId":"C3"},{"id":"h38","personId":"r20","profile":"LECTEUR","wsId":"C2"},{"id":"h39","personId":"r21","profile":"LECTEUR","wsId":"C2"},{"id":"h40","personId":"r22","profile":"LECTEUR","wsId":"C8"},{"id":"h41","personId":"r23","profile":"LECTEUR","wsId":"C8"}];
