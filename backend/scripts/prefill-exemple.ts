/**
 * Proposition commerciale d'exemple (« Essayer avec l'exemple ORION » de l'écran Initialisation d'un projet) :
 * document fictif, régénéré par `npx ts-node --transpile-only scripts/prefill-exemple.ts`.
 */
import { mkdirSync, writeFileSync } from 'fs';
import * as path from 'path';
import { makeTextPdf } from '../test/fixtures/pdf';

export const ORION_PAGES: string[][] = [
  ['Proposition commerciale — Programme ORION', 'Déploiement d’un CRM commun aux filiales européennes d’AMC Corp', 'Version 3 · Onepoint · septembre 2026', '',
    'Destinataire : Vincent Lambert, Directeur général d’AMC Corp, sponsor du programme.',
    'Rédigée par : Arnaud Leroy, Partner, Onepoint.', '',
    'Document confidentiel, établi pour AMC Corp. Toute diffusion hors du comité de sélection est soumise à l’accord écrit d’Onepoint.'],
  ['# 1. Contexte et ambition', 'AMC Corp est un groupe de distribution B2B d’équipements pour les professionnels de la restauration, présent dans 6 pays européens : France, Belgique, Luxembourg, Allemagne, Italie et Espagne.',
    'Le groupe emploie environ 1 750 collaborateurs et réalise un chiffre d’affaires d’environ 800 M€.',
    'Chaque filiale utilise aujourd’hui son propre outil de relation client. ORION doit unifier la relation client des 6 filiales européennes sur un CRM commun, la solution Brand X.',
    'En une phrase : ORION donne à toutes les filiales une vision client unique, de la prospection à la facturation.',
    '# Enjeux stratégiques', '• Offrir une vision client unifiée entre magasins, e-commerce, télévente et forces terrain.',
    '• Réduire le coût de possession des 6 outils actuels.', '• Accélérer l’intégration des sociétés acquises grâce à un modèle commun.'],
  ['# 2. Périmètre', 'Périmètre fonctionnel :', '• Ventes : comptes, contacts, opportunités, devis.', '• Service client : demandes, réclamations, base de connaissances.', '• Marketing : campagnes et segmentation.',
    'Périmètre applicatif :', '• Brand X CRM : solution cible, en mode SaaS.', '• ERP Brand X : interfaces clients et commandes.',
    'Périmètre géographique : France, Belgique, Luxembourg, Allemagne, Italie, Espagne.', 'Périmètre juridique : AMC Corp SAS et ses 5 filiales européennes.'],
  ['# 3. Organisation proposée', 'Le programme réunit trois sociétés : AMC Corp (client), Onepoint (assistance à maîtrise d’ouvrage et pilotage) et Codilog (intégrateur de la solution).',
    'L’éditeur de la solution est Brand X.', '# Rôles', '• Directeur de programme : Claire Dumont (AMC Corp), à partir du 2 novembre 2026.',
    '• Sponsor : Vincent Lambert (AMC Corp).', '• Directeur de projet intégrateur : Olivier Chevalier (Codilog).', '• PMO : Robin Lefèvre (Onepoint), à mi-temps.',
    '• Pilotes métiers : Thomas Girard (Ventes) et Élodie Faure (Service client).', '• Responsable données et migration : Karim Benali (AMC Corp).',
    'Le directeur des opérations, Luc Nguyen, est désigné tantôt « Directeur des opérations », tantôt « Responsable des opérations ».'],
  ['# 4. Démarche et planning', 'Le programme est découpé en deux lots :', '• Lot 1 : France et Belgique, du 02/11/2026 au 30/09/2027.', '• Lot 2 : autres filiales européennes, du 01/10/2027 au 31/03/2028.',
    'Le lot 1 suit quatre phases :', '1. Cadrage, du 02/11/2026 au 18/12/2026.', '2. Conception, du 04/01/2027 au 26/03/2027.', '3. Réalisation, du 29/03/2027 au 25/06/2027.', '4. Déploiement, du 28/06/2027 au 30/09/2027.',
    'La phase de cadrage comprend la note de cadrage (1.1) et la feuille de route (1.2). La conception comprend les ateliers (2.1) et le plan projet détaillé (2.2).',
    'La recette durera de 2 à 4 semaines selon les filiales.'],
  ['# 5. Chantiers', '• Ventes et CRM, porté par Thomas Girard.', '• Service client, porté par Élodie Faure.', '• Données et migration, porté par Karim Benali ; ce chantier dépend des chantiers Ventes et CRM et Service client.',
    '• Conduite du changement, porté par Claire Dumont.'],
  ['# 6. Jalons et livrables', 'Jalons :', '• Lancement du programme : 02/11/2026.', '• Validation de la conception : 26/03/2027.', '• Mise en production du lot 1 : S+24 après le lancement.',
    'Livrables :', '• Note de cadrage, à remettre le 27/11/2026 par Claire Dumont.', '• Feuille de route, à remettre le 18/12/2026 par Robin Lefèvre.', '• Plan projet détaillé, à remettre le 26/03/2027.', '• Dossier d’exploitation.'],
  ['# 7. Engagement financier', 'Le budget du programme est estimé à 1 240 000 €.', 'Le volume d’intervention d’Onepoint est de 220 jours, dont 110 jours pour le PMO.', 'Conditions de règlement : 30 % à la commande, 70 % à l’avancement.'],
];

if (require.main === module) {
  const out = path.join(__dirname, '../assets/prefill/Proposition commerciale ORION v3.pdf');
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, makeTextPdf(ORION_PAGES));
  console.log(`Écrit : ${out}`);
}
