import ExcelJS from 'exceljs';
import path from 'path';

export const TEMPLATE = path.join(__dirname, '../../../frontends/Referentiel RISE - initialisation.xlsx');

type Rows = Record<string, Array<Record<string, string | number | Date | null>>>;

/**
 * Construit un classeur d'initialisation à partir du modèle fourni : lignes de données saisies
 * par en-tête (ligne 8), à partir de la ligne 9 ; formulaire « 05 Projet » par libellé (colonne D).
 */
export async function buildWorkbook(opts: { project?: Record<string, string | Date | null>; rows?: Rows; dropSheets?: string[]; dropHeaders?: Record<string, string[]> } = {}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE);
  for (const name of opts.dropSheets ?? []) {
    const ws = wb.getWorksheet(name);
    if (ws) wb.removeWorksheet(ws.id);
  }
  if (opts.project) {
    const ws = wb.getWorksheet('05 Projet')!;
    for (let r = 7; r <= 24; r++) {
      const label = String(ws.getRow(r).getCell(2).value ?? '');
      if (label in opts.project) ws.getRow(r).getCell(4).value = opts.project[label] as any;
    }
  }
  // Ancien modèle simulé : en-têtes effacés (ligne 8).
  for (const [sheet, heads] of Object.entries(opts.dropHeaders ?? {})) {
    wb.getWorksheet(sheet)!.getRow(8).eachCell((c) => { if (heads.includes(String(c.value))) c.value = null; });
  }
  for (const [sheet, rows] of Object.entries(opts.rows ?? {})) {
    if (opts.dropSheets?.includes(sheet)) continue;
    const ws = wb.getWorksheet(sheet)!;
    const headers: Record<string, number> = {};
    ws.getRow(8).eachCell((c, i) => (headers[String(c.value)] = i));
    rows.forEach((row, i) => {
      for (const [h, v] of Object.entries(row)) {
        if (!(h in headers)) throw new Error(`En-tête inconnu ${sheet} › ${h}`);
        ws.getRow(9 + i).getCell(headers[h]).value = v as any;
      }
    });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const d = (s: string) => new Date(`${s}T00:00:00Z`);

/** Référentiel minimal conforme (projet ATLAS). */
export function validAtlas(code = 'ATLAS') {
  return {
    project: {
      'Nom du client': 'AMC Corp',
      'Pays': 'France',
      'Code projet': code,
      'Nom du projet': 'ATLAS — Refonte finance groupe',
      'Objectifs': 'Unifier la finance du groupe.',
      'Intégrateur': 'Codilog',
      'Date de démarrage': d('2025-02-03'),
      'Date de fin cible': d('2027-06-30'),
      'Fuseau horaire': 'Europe/Paris',
      'Statut': 'Préparation',
      'Directeur de programme': 'Laurent Garnier',
      'Sponsor': 'Philippe Aubert',
    },
    rows: {
      '01 Équipes': [{ Nom: 'ECF' }, { Nom: 'Codilog', Description: 'Intégrateur' }],
      '02 Rôles': [{ Libellé: 'Directeur de programme' }, { Libellé: 'Pilotes métiers' }],
      '03 Personnes': [
        { 'Nom complet': 'Laurent Garnier', Email: 'laurent.garnier@example.com', Équipe: 'ECF', Fonction: 'Directeur de programme', Actif: 'Oui' },
        { 'Nom complet': 'Philippe Aubert', Email: 'philippe.aubert@example.com', Équipe: 'ECF' },
        { 'Nom complet': 'Sophie Marchand', Email: 'sophie.marchand@example.com', Équipe: 'ECF' },
      ],
      '04 Affectations': [
        { Personne: 'Laurent Garnier', Rôle: 'Directeur de programme', Début: d('2025-02-03') },
        { Personne: 'Sophie Marchand', Rôle: 'Pilotes métiers', Début: d('2025-02-03'), Fin: d('2026-12-31') },
      ],
      '06 Lots': [{ 'N°': 1, Périmètre: 'Finance France', Début: d('2025-02-03'), Fin: d('2027-06-30'), Statut: 'En cours', Responsable: 'Laurent Garnier' }],
      '07 Phases': [
        { 'N°': 1, Nom: 'Explore', Lot: 'Lot 1', Début: d('2025-02-03'), Fin: d('2025-09-30'), Statut: 'Terminée' },
        { 'N°': 2, Nom: 'Realize', Lot: 'Lot 1', Début: d('2025-10-01'), Fin: d('2027-06-30'), Statut: 'En cours' },
      ],
      '08 Sous-phases': [
        { Phase: '1 · Explore', 'N°': '1.1', Nom: 'Ateliers', Début: d('2025-02-03'), Fin: d('2025-06-30') },
        { Phase: '2 · Realize', 'N°': '2.1', Nom: 'Paramétrage', Début: d('2025-10-01'), Fin: d('2026-12-31') },
      ],
      '05b Info projet': [
        { Rubrique: 'Programme en une phrase', Valeur: 'Refonte de la finance du groupe.' },
        { Rubrique: 'Enjeux stratégiques', Valeur: 'Clôturer en 5 jours' },
        { Rubrique: 'Le client', Libellé: 'Effectifs', Valeur: '1 750 collaborateurs' },
        { Rubrique: 'Périmètre géographique', Valeur: 'France' },
      ],
      '09 Chantiers': [{ Nom: 'Comptabilité', Responsable: 'Sophie Marchand', Lot: 'Lot 1', Statut: 'Actif', Phases: '1 ; Realize', 'Sous-phases': '1.1' }],
      '10 Instances': [{ Nom: 'Comité de pilotage', 'Nom court': 'COPIL', Couleur: 'Marine', Fréquence: 'Mensuelle', Niveau: 'Stratégique' }],
      '11 Membres': [
        { Instance: 'Comité de pilotage', Personne: 'Philippe Aubert', 'Rôle dans l’instance': 'Président' },
        { Instance: 'Comité de pilotage', Personne: 'Laurent Garnier' },
      ],
      '12 Jalons': [
        { Libellé: 'Fin des ateliers', Phase: '1 · Explore', 'Sous-phase': '1.1 · Ateliers', Chantier: 'Comptabilité', Responsable: 'Sophie Marchand', 'Date prévue': d('2025-06-30') },
        { Libellé: 'Go-Live', Phase: '2 · Realize', 'Date prévue': d('2027-07-15') },
      ],
      '13 Livrables': [{ Nom: 'Dossier de conception', 'Sous-phase': '1.1 · Ateliers', Chantier: 'Comptabilité', Responsable: 'Sophie Marchand', Échéance: d('2025-06-30') }],
    } as Rows,
  };
}
