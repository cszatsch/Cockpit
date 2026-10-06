import { checkResult, checkTabs, DUPLICATE_CODE_MOTIF, sentence, shownValue, toAnomaly, WHOLE_TAB } from '../../src/domain/init-check';
import { SHEETS, type ParsedWorkbook } from '../../src/import/excel-reader';
import type { ImportIssue } from '../../src/import/referential-import';

/** Contrôle de conformité de la voie Excel (écran unique, maquette v3) : anomalies par onglet, cellule exacte. */
const wb: ParsedWorkbook = {
  missingSheets: [],
  projectControl: null,
  projectForm: [{ label: 'Code projet', type: 'REQUIRED', row: 12, value: 'RISE' }, { label: 'Date de démarrage', type: 'REQUIRED', row: 15, value: new Date('2026-11-02T00:00:00Z') }],
  sheets: {
    '03 Personnes': {
      name: '03 Personnes',
      columns: [
        { header: 'Nom complet', type: 'REQUIRED', col: 2, letter: 'B' }, { header: 'Email', type: 'REQUIRED', col: 3, letter: 'C' },
        { header: 'Équipe', type: 'REQUIRED', col: 4, letter: 'D' }, { header: 'Contrôle', type: 'CONTROL', col: 8, letter: 'H' },
      ],
      rows: [{ row: 11, values: { 'Nom complet': 'J. Petit', Email: 'j.petit@orion', Équipe: 'Data & IA' }, control: '⚠ Équipe inconnue' }],
    },
  },
};
const issue = (sheet: string, row: number | null, column: string | null, message: string, level: 'ERROR' | 'WARNING' = 'ERROR', source: 'SERVER' | 'FILE' = 'SERVER'): ImportIssue => ({ level, sheet, row, column, message, source });

describe('Contrôle de conformité de l’Excel (voie Excel)', () => {
  it('cellule, champ et valeur lue : colonne donnée par sa lettre ou par son en-tête', () => {
    expect(toAnomaly(issue('03 Personnes', 11, 'D', 'Équipe « Data & IA » inconnue (onglet 01 Équipes)'), wb, SHEETS)).toEqual({ ongletIndex: 2, onglet: '03 Personnes', champ: 'Équipe', valeur: 'Data & IA', motif: 'Équipe « Data & IA » inconnue (onglet 01 Équipes).', gravite: 'bloquant', cellule: 'D11' });
    expect(toAnomaly(issue('03 Personnes', 11, 'Email', 'Email : adresse invalide'), wb, SHEETS)).toMatchObject({ champ: 'Email', valeur: 'j.petit@orion', cellule: 'C11' });
  });

  it('colonne CONTRÔLE du fichier : avertissement à sa cellule ; formulaire 05 Projet : libellé et colonne D', () => {
    expect(toAnomaly(issue('03 Personnes', 11, null, 'Contrôle du fichier : Équipe inconnue', 'WARNING', 'FILE'), wb, SHEETS)).toMatchObject({ champ: 'Contrôle', valeur: '⚠ Équipe inconnue', gravite: 'avertissement', cellule: 'H11' });
    expect(toAnomaly(issue('05 Projet', 15, 'D', 'Fin cible avant démarrage'), wb, SHEETS)).toMatchObject({ champ: 'Date de démarrage', valeur: '02/11/2026', cellule: 'D15' });
  });

  it('anomalie de structure (onglet absent) : onglet entier, sans cellule ; onglet hors des 14 ignoré', () => {
    expect(toAnomaly(issue('09 Sous-phases', null, null, 'Onglet « 09 Sous-phases » manquant'), wb, SHEETS)).toMatchObject({ ongletIndex: 8, champ: WHOLE_TAB, valeur: '', cellule: '—' });
    expect(toAnomaly(issue('Références', 3, 'B', 'x'), wb, SHEETS)).toBeNull();
  });

  it('décompte par onglet, statut ; code déjà pris → bloquant sur la cellule du code ; seules les bloquantes rendent non conforme', () => {
    const tabs = checkTabs([issue('03 Personnes', 11, 'D', 'x'), issue('13 Jalons', 10, 'I', 'Date prévue hors de la période de la phase', 'WARNING')], wb, SHEETS, SHEETS.map(() => 3), 'RISE');
    expect(tabs).toHaveLength(14);
    expect(tabs[2]).toMatchObject({ anomaliesBloquantes: 1, avertissements: 0, statut: 'anomalies', attendus: 3 });
    expect(tabs[12]).toMatchObject({ anomaliesBloquantes: 0, avertissements: 1, statut: 'avertissements' });
    expect(tabs[4].anomalies).toEqual([{ ongletIndex: 4, onglet: '05 Projet', champ: 'Code projet', valeur: 'RISE', motif: DUPLICATE_CODE_MOTIF, gravite: 'bloquant', cellule: 'D12' }]);
    expect(checkResult(tabs)).toBe('anomalies');
    expect(checkResult(checkTabs([issue('13 Jalons', 10, 'I', 'x', 'WARNING')], wb, SHEETS, [], null))).toBe('conforme');
  });

  it('motifs en phrase ; valeurs lues affichées comme dans l’écran', () => {
    expect(sentence('« Nom » est obligatoire')).toBe('« Nom » est obligatoire.');
    expect(sentence('déjà une phrase.')).toBe('Déjà une phrase.');
    expect([shownValue(null), shownValue(3), shownValue(new Date('2027-03-15T00:00:00Z'))]).toEqual(['', '3', '15/03/2027']);
  });
});
