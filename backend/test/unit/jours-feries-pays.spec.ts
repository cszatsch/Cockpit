import { holidayCountryIso, holidaysOf } from '../../src/domain/jours-feries';

/** Jours fériés ajoutés le 16/10/2026 : Royaume-Uni (et régions), Italie, Espagne (et régions), Portugal, Pays-Bas. */
const dates = (cc: string, rg: string, y: number) => holidaysOf(cc, rg, y).map((h) => h.date.slice(5) + ' ' + h.name);

describe('Jours fériés : Royaume-Uni, Italie, Espagne, Portugal, Pays-Bas', () => {
  it('Royaume-Uni : jours fixes d’un week-end reportés au jour ouvré suivant', () => {
    expect(dates('GB', '', 2026)).toEqual(['01-01 Jour de l\'an', '04-03 Vendredi saint', '04-06 Lundi de Pâques', '05-04 Jour férié de début mai', '05-25 Jour férié de printemps', '08-31 Jour férié d\'été', '12-25 Noël', '12-28 Boxing Day']);
    expect(holidaysOf('GB', '', 2027).filter((h) => h.date >= '2027-12-01')).toEqual([{ date: '2027-12-27', name: 'Noël', observedFrom: '2027-12-25' }, { date: '2027-12-28', name: 'Boxing Day', observedFrom: '2027-12-26' }]);
    expect(dates('GB', 'SCT', 2026)).toEqual(expect.arrayContaining(['01-02 2 janvier', '08-03 Jour férié d\'été', '11-30 Saint-André']));
    expect(dates('GB', 'SCT', 2026).some((d) => d.includes('Lundi de Pâques'))).toBe(false);
    expect(holidaysOf('GB', 'NIR', 2026).find((h) => h.name === 'Bataille de la Boyne')).toEqual({ date: '2026-07-13', name: 'Bataille de la Boyne', observedFrom: '2026-07-12' });
  });
  it('Italie, Espagne (Madrid, Catalogne), Portugal, Pays-Bas', () => {
    expect(dates('IT', '', 2026)).toEqual(expect.arrayContaining(['04-25 Fête de la Libération', '06-02 Fête de la République', '10-04 Saint-François d\'Assise', '12-08 Immaculée Conception']));
    expect(dates('IT', '', 2025).some((d) => d.startsWith('10-04'))).toBe(false);
    expect(dates('ES', '', 2026)).toEqual(expect.arrayContaining(['04-03 Vendredi saint', '10-12 Fête nationale', '12-06 Jour de la Constitution']));
    expect(dates('ES', 'MD', 2026)).toEqual(expect.arrayContaining(['04-02 Jeudi saint', '05-02 Fête de la Communauté de Madrid']));
    expect(dates('ES', 'CT', 2026)).toEqual(expect.arrayContaining(['04-06 Lundi de Pâques', '06-24 Saint-Jean', '09-11 Fête nationale de Catalogne']));
    expect(dates('PT', '', 2026)).toEqual(expect.arrayContaining(['06-04 Fête-Dieu', '06-10 Jour du Portugal', '12-01 Restauration de l\'indépendance']));
    expect(dates('NL', '', 2026)).toEqual(expect.arrayContaining(['04-27 Jour du Roi', '05-05 Jour de la Libération', '05-25 Lundi de Pentecôte']));
    expect(holidaysOf('NL', '', 2025).find((h) => h.name === 'Jour du Roi')).toEqual({ date: '2025-04-26', name: 'Jour du Roi', observedFrom: '2025-04-27' }); // 27 avril 2025 : dimanche
  });
  it('noms de pays du Référentiel', () => {
    expect(['Royaume-Uni', 'UK', 'Italie', 'Espagne', 'Portugal', 'Pays-Bas', 'Hollande', 'Maroc'].map(holidayCountryIso)).toEqual(['GB', 'GB', 'IT', 'ES', 'PT', 'NL', 'NL', '']);
  });
});
