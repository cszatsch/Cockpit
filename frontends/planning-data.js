// Planning RISE — Lot 1. Aligné sur le Référentiel (source de vérité) : mêmes ids de phases (P1…), sous-phases (SP<code>), chantiers (C1…C8). reel = % d'avancement saisi.
export const projectEnd = '2028-06-30';
export const phases = [
  {"id":"P1","code":"1","n":"Discover","start":"2023-06-01","end":"2024-04-30","reel":100,"owner":"p03"},
  {"id":"P2","code":"2","n":"Prepare","start":"2024-07-01","end":"2024-08-31","reel":100,"owner":"p03"},
  {"id":"P3","code":"3","n":"Explore","start":"2024-08-01","end":"2025-09-30","reel":100,"owner":"p03"},
  {"id":"P4","code":"4","n":"Realize","start":"2025-09-01","end":"2026-02-28","reel":100,"owner":"p03","crit":true},
  {"id":"P5","code":"5","n":"Deploy","start":"2026-02-01","end":"2027-06-30","reel":48,"owner":"p03","crit":true},
  {"id":"P6","code":"6","n":"Run","start":"2027-07-01","end":"2028-06-30","reel":0,"owner":"p03"}
];
export const subphases = [
  {"id":"SP1.1","code":"1.1","ph":"P1","n":"Analyse du portefeuille Brand X","start":"2023-06-01","end":"2023-10-31","reel":100,"crit":false,"owner":"p03"},
  {"id":"SP1.2","code":"1.2","ph":"P1","n":"Stratégie de transformation","start":"2023-10-01","end":"2024-02-29","reel":100,"crit":false,"owner":"p03"},
  {"id":"SP1.3","code":"1.3","ph":"P1","n":"Accès système d’essai / évaluation","start":"2024-01-01","end":"2024-04-30","reel":100,"crit":false,"owner":"p03"},
  {"id":"SP2.1","code":"2.1","ph":"P2","n":"Initialisation du projet","start":"2024-07-01","end":"2024-07-31","reel":100,"crit":false,"owner":"p03"},
  {"id":"SP2.2","code":"2.2","ph":"P2","n":"Mobilisation des équipes","start":"2024-07-01","end":"2024-08-31","reel":100,"crit":false,"owner":"p03"},
  {"id":"SP2.3","code":"2.3","ph":"P2","n":"Mise à disposition des environnements","start":"2024-07-01","end":"2024-08-31","reel":100,"crit":false,"owner":"p03"},
  {"id":"SP2.4","code":"2.4","ph":"P2","n":"Cadrage des stratégies clés","start":"2024-08-01","end":"2024-08-31","reel":100,"crit":false,"owner":"p03"},
  {"id":"SP3.1","code":"3.1","ph":"P3","n":"Ateliers Fit-to-Standard","start":"2024-08-01","end":"2025-02-28","reel":100,"crit":false,"owner":"p03"},
  {"id":"SP3.2","code":"3.2","ph":"P3","n":"Conception de la solution","start":"2024-11-01","end":"2025-05-31","reel":100,"crit":false,"owner":"p03"},
  {"id":"SP3.3","code":"3.3","ph":"P3","n":"Planification de l’intégration","start":"2025-01-01","end":"2025-06-30","reel":100,"crit":false,"owner":"p03"},
  {"id":"SP3.4","code":"3.4","ph":"P3","n":"Préparation des données","start":"2025-03-01","end":"2025-08-31","reel":100,"crit":false,"owner":"p03"},
  {"id":"SP3.5","code":"3.5","ph":"P3","n":"Planification des tests","start":"2025-06-01","end":"2025-09-30","reel":100,"crit":false,"owner":"p03"},
  {"id":"SP4.1","code":"4.1","ph":"P4","n":"Construction / configuration","start":"2025-09-01","end":"2025-12-31","reel":100,"crit":false,"owner":"p03"},
  {"id":"SP4.2","code":"4.2","ph":"P4","n":"Développements spécifiques","start":"2025-10-01","end":"2026-01-31","reel":100,"crit":false,"owner":"p03"},
  {"id":"SP4.3","code":"4.3","ph":"P4","n":"Intégration technique","start":"2025-10-01","end":"2026-02-28","reel":100,"crit":false,"owner":"p03"},
  {"id":"SP4.4","code":"4.4","ph":"P4","n":"Migration des données (legacy)","start":"2025-11-01","end":"2026-02-28","reel":100,"crit":true,"owner":"p03"},
  {"id":"SP4.5","code":"4.5","ph":"P4","n":"Tests (unitaires, intégration, UAT)","start":"2025-12-01","end":"2026-02-28","reel":100,"crit":true,"owner":"p03"},
  {"id":"SP4.6","code":"4.6","ph":"P4","n":"Préparation du cutover","start":"2026-01-01","end":"2026-02-28","reel":100,"crit":true,"owner":"p03"},
  {"id":"SP5.1","code":"5.1","ph":"P5","n":"Environnement de production","start":"2026-02-01","end":"2026-06-30","reel":100,"crit":false,"owner":"p12"},
  {"id":"SP5.2","code":"5.2","ph":"P5","n":"Formation des utilisateurs finaux","start":"2026-07-01","end":"2027-03-31","reel":55,"crit":false,"owner":"p12"},
  {"id":"SP5.3","code":"5.3","ph":"P5","n":"Répétition générale (dress rehearsal)","start":"2026-09-01","end":"2027-03-31","reel":20,"crit":true,"owner":"p12"},
  {"id":"SP5.4","code":"5.4","ph":"P5","n":"Cutover / Go-live","start":"2027-04-01","end":"2027-04-01","reel":0,"crit":true,"owner":"p12"},
  {"id":"SP5.5","code":"5.5","ph":"P5","n":"Hypercare","start":"2027-04-01","end":"2027-06-30","reel":0,"crit":true,"owner":"p12"},
  {"id":"SP6.1","code":"6.1","ph":"P6","n":"Exploitation courante","start":"2027-07-01","end":"2027-12-31","reel":0,"crit":false,"owner":"p03"},
  {"id":"SP6.2","code":"6.2","ph":"P6","n":"Amélioration continue","start":"2027-07-01","end":"2027-12-31","reel":0,"crit":false,"owner":"p03"},
  {"id":"SP6.3","code":"6.3","ph":"P6","n":"Intégration de nouveaux utilisateurs","start":"2027-09-01","end":"2027-12-31","reel":0,"crit":false,"owner":"p03"},
  {"id":"SP6.4","code":"6.4","ph":"P6","n":"Mises à jour et innovations","start":"2027-12-01","end":"2027-12-31","reel":0,"crit":false,"owner":"p03"}
];
export const chantiers = [
  {"id":"C1","code":"C1","n":"Finance","start":"2023-06-01","end":"2028-06-30","reel":82,"owner":"p07","phases":["P1","P2","P3","P4","P5","P6"]},
  {"id":"C2","code":"C2","n":"Achats / Appros / Logistique","start":"2024-08-01","end":"2027-04-01","reel":86,"owner":"p09","phases":["P3","P4","P5"]},
  {"id":"C3","code":"C3","n":"Ventes / CRM","start":"2024-08-01","end":"2027-04-01","reel":68,"owner":"p08","phases":["P3","P4","P5"]},
  {"id":"C4","code":"C4","n":"Interfaces","start":"2025-09-01","end":"2027-04-01","reel":58,"owner":"p09","phases":["P4","P5"],"crit":true},
  {"id":"C5","code":"C5","n":"Migration des données","start":"2024-08-01","end":"2028-06-30","reel":71,"owner":"p06","phases":["P3","P4","P5","P6"],"crit":true},
  {"id":"C6","code":"C6","n":"Rôles et autorisations","start":"2025-09-01","end":"2027-04-01","reel":80,"owner":"p06","phases":["P4","P5"]},
  {"id":"C7","code":"C7","n":"Conduite du changement","start":"2024-07-01","end":"2028-06-30","reel":75,"owner":"p10","phases":["P2","P3","P4","P5","P6"]},
  {"id":"C8","code":"C8","n":"Pilotage et transverse","start":"2023-06-01","end":"2028-06-30","reel":60,"owner":"p03","phases":["P1","P2","P3","P4","P5","P6"]}
];
