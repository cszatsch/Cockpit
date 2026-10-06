/**
 * Réponses simulées du modèle d'IA pour l'exemple ORION (préremplissage) : une réponse JSON par onglet, avec des
 * valeurs incertaines (confiance < 70 %), des champs obligatoires absents et deux onglets sans donnée (Instances,
 * Membres). Sert aux tests e2e (double de `fetch`, sans sortir sur Internet).
 */
type C = { v: string | number; c: number; p: number; m?: string };
const ok = (v: string | number, p: number, c = 95): C => ({ v, c, p });
const doubt = (v: string | number, p: number, c: number, m: string): C => ({ v, c, p, m });

export const ORION_EXTRACTION: Record<string, Array<Record<string, C>>> = {
  '01 Équipes': [
    { Nom: ok('AMC Corp', 4), Description: ok('Client', 4, 90) },
    { Nom: ok('Onepoint', 4), Description: ok('Assistance à maîtrise d’ouvrage et pilotage', 4) },
    { Nom: ok('Codilog', 4), Description: ok('Intégrateur', 4) },
    { Nom: ok('Brand X', 4), Description: ok('Éditeur de la solution', 4) },
  ],
  '02 Rôles': [
    { Libellé: ok('Directeur de programme', 4) }, { Libellé: ok('Sponsor', 4) }, { Libellé: ok('Directeur de projet intégrateur', 4) },
    { Libellé: ok('PMO', 4) }, { Libellé: ok('Pilote métier', 4) }, { Libellé: ok('Responsable données et migration', 4) },
  ],
  '03 Personnes': [
    { 'Nom complet': ok('Claire Dumont', 4), Équipe: ok('AMC Corp', 4), Fonction: ok('Directrice de programme', 4), Actif: ok('Oui', 4, 80) },
    { 'Nom complet': ok('Vincent Lambert', 1), Équipe: ok('AMC Corp', 1), Fonction: ok('Directeur général', 1) },
    { 'Nom complet': ok('Olivier Chevalier', 4), Équipe: ok('Codilog', 4), Fonction: ok('Directeur de projet', 4) },
    { 'Nom complet': ok('Robin Lefèvre', 4), Équipe: ok('Onepoint', 4), Fonction: ok('PMO', 4) },
    { 'Nom complet': ok('Thomas Girard', 4), Équipe: ok('AMC Corp', 4), Fonction: ok('Pilote métier Ventes', 4) },
    { 'Nom complet': ok('Élodie Faure', 4), Équipe: ok('AMC Corp', 4), Fonction: ok('Pilote métier Service client', 4) },
    { 'Nom complet': ok('Karim Benali', 4), Équipe: ok('AMC Corp', 4), Fonction: ok('Responsable données et migration', 4) },
    { 'Nom complet': ok('Luc Nguyen', 4), Équipe: ok('AMC Corp', 4), Fonction: doubt('Directeur des opérations', 4, 58, 'Deux intitulés différents dans le document.') },
  ],
  '04 Affectations': [
    { Personne: ok('Claire Dumont', 4), Rôle: ok('Directeur de programme', 4), Début: ok('02/11/2026', 4) },
    { Personne: ok('Vincent Lambert', 4), Rôle: ok('Sponsor', 4), Début: doubt('02/11/2026', 5, 62, 'Début déduit du lancement.') },
    { Personne: ok('Robin Lefèvre', 4), Rôle: ok('PMO', 4), Début: ok('02/11/2026', 5, 80) },
  ],
  '05 Projet': [{
    'Nom du client': ok('AMC Corp', 2), 'Secteur d’activité': ok('Distribution B2B', 2, 85), Pays: doubt('France', 2, 64, 'Six pays cités ; siège supposé en France.'),
    'Code projet': ok('ORION', 1), 'Nom du projet': ok('ORION — Déploiement CRM Europe', 1, 85), Objectifs: ok('Unifier la relation client des 6 filiales européennes sur un CRM commun.', 2),
    'Éditeur de la solution': ok('Brand X', 4), Intégrateur: ok('Codilog', 4), 'Date de démarrage': ok('02/11/2026', 5), 'Date de fin cible': ok('31/03/2028', 5),
    'Fuseau horaire': doubt('Europe/Paris', 2, 60, 'Fuseau déduit du siège.'), Statut: ok('Préparation', 1, 75), 'Directeur de programme': ok('Claire Dumont', 4), Sponsor: ok('Vincent Lambert', 1),
  }],
  '06 Info projet': [
    { Rubrique: ok('Programme en une phrase', 2), Valeur: ok('ORION donne à toutes les filiales une vision client unique, de la prospection à la facturation.', 2) },
    { Rubrique: ok('Enjeux stratégiques', 2), Valeur: ok('Offrir une vision client unifiée entre magasins, e-commerce, télévente et forces terrain.', 2) },
    { Rubrique: ok('Enjeux stratégiques', 2), Valeur: ok('Réduire le coût de possession des 6 outils actuels.', 2) },
    { Rubrique: ok('Le client', 2), Libellé: ok('Effectifs', 2), Valeur: ok('Environ 1 750 collaborateurs', 2) },
    { Rubrique: ok('Périmètre fonctionnel', 3), Libellé: ok('Ventes', 3), Valeur: ok('Comptes, contacts, opportunités, devis', 3) },
    { Rubrique: ok('Périmètre géographique', 3), Valeur: ok('France', 3) },
    { Rubrique: ok('Périmètre géographique', 3), Valeur: ok('Belgique', 3) },
  ],
  '07 Lots': [
    { 'N°': ok(1, 5), Périmètre: ok('France et Belgique', 5), Début: ok('02/11/2026', 5), Fin: ok('30/09/2027', 5), Statut: ok('Prévu', 5, 80), Responsable: doubt('Claire Dumont', 4, 55, 'Responsable du lot non nommé, directrice déduite.') },
    { 'N°': ok(2, 5), Périmètre: ok('Autres filiales européennes', 5), Début: ok('01/10/2027', 5), Fin: ok('31/03/2028', 5), Statut: ok('Prévu', 5, 80) },
  ],
  '08 Phases': [
    { 'N°': ok(1, 5), Nom: ok('Cadrage', 5), Lot: ok('Lot 1', 5), Début: ok('02/11/2026', 5), Fin: ok('18/12/2026', 5) },
    { 'N°': ok(2, 5), Nom: ok('Conception', 5), Lot: ok('Lot 1', 5), Début: ok('04/01/2027', 5), Fin: ok('26/03/2027', 5) },
    { 'N°': ok(3, 5), Nom: ok('Réalisation', 5), Lot: ok('Lot 1', 5), Début: ok('29/03/2027', 5), Fin: ok('25/06/2027', 5) },
    { 'N°': ok(4, 5), Nom: ok('Déploiement', 5), Lot: ok('Lot 1', 5), Début: ok('28/06/2027', 5), Fin: ok('30/09/2027', 5), Description: doubt('Recette de 3 semaines', 5, 61, 'Fourchette « 2 à 4 semaines » ramenée à la moyenne.') },
  ],
  '09 Sous-phases': [
    { Phase: ok('1 · Cadrage', 5), 'N°': ok('1.1', 5), Nom: ok('Note de cadrage', 5) },
    { Phase: ok('1 · Cadrage', 5), 'N°': ok('1.2', 5), Nom: ok('Feuille de route', 5) },
    { Phase: ok('2 · Conception', 5), 'N°': ok('2.1', 5), Nom: ok('Ateliers', 5) },
    { Phase: ok('2 · Conception', 5), 'N°': ok('2.2', 5), Nom: ok('Plan projet détaillé', 5) },
  ],
  '10 Chantiers': [
    { Nom: ok('Ventes et CRM', 6), Responsable: ok('Thomas Girard', 6), Lot: ok('Lot 1', 6, 80), Phases: ok('2 ; 3', 5, 75) },
    { Nom: ok('Service client', 6), Responsable: doubt('Élodie Faure', 6, 66, 'Personne absente de l’équipe décrite.') },
    { Nom: ok('Données et migration', 6), Responsable: ok('Karim Benali', 6), Dépendances: ok('Ventes et CRM ; Service client', 6) },
    { Nom: ok('Conduite du changement', 6), Responsable: ok('Claire Dumont', 6) },
  ],
  '11 Instances': [],
  '12 Membres': [],
  '13 Jalons': [
    { Libellé: ok('Lancement du programme', 7), Phase: ok('1 · Cadrage', 7), 'Date prévue': ok('02/11/2026', 7) },
    { Libellé: ok('Validation de la conception', 7), Phase: ok('2 · Conception', 7), 'Date prévue': ok('26/03/2027', 7) },
    { Libellé: ok('Mise en production du lot 1', 7), Phase: ok('4 · Déploiement', 7), 'Date prévue': doubt('19/04/2027', 7, 52, 'Date relative « S+24 » convertie.') },
  ],
  '14 Livrables': [
    { Nom: ok('Note de cadrage', 7), 'Sous-phase': ok('1.1 · Note de cadrage', 7), Responsable: ok('Claire Dumont', 7), Échéance: ok('27/11/2026', 7) },
    { Nom: ok('Feuille de route', 7), 'Sous-phase': ok('1.2 · Feuille de route', 7), Responsable: ok('Robin Lefèvre', 7), Échéance: ok('18/12/2026', 7) },
    { Nom: ok('Plan projet détaillé', 7), 'Sous-phase': ok('2.2 · Plan projet détaillé', 7), Échéance: ok('26/03/2027', 7) },
  ],
};

/**
 * Réponse au format compact (07/10/2026) pour la consigne d'un onglet (« ONGLET 07 Lots — … ») : colonnes une fois,
 * une liste de valeurs par ligne, page de la ligne, « doutes » pour les seules valeurs incertaines.
 */
export function orionAnswer(prompt: string): { colonnes: string[]; lignes: unknown[] } {
  const sheet = /ONGLET (\d\d [^—\n]+?) —/.exec(prompt)?.[1]?.trim() ?? '';
  const rows = ORION_EXTRACTION[sheet] ?? [];
  const colonnes = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return {
    colonnes,
    lignes: rows.map((r) => {
      const p = Object.values(r)[0]?.p ?? null;
      const doutes = Object.fromEntries(Object.entries(r).filter(([, c]) => c.c < 70).map(([k, c]) => [k, c.p !== p ? [c.c, c.m, c.p] : [c.c, c.m]]));
      return { p, v: colonnes.map((k) => r[k]?.v ?? null), ...(Object.keys(doutes).length ? { doutes } : {}) };
    }),
  };
}
