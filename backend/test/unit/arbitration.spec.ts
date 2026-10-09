import { legacyCriteria } from '../../src/domain/arbitration';

describe('Fiche d’arbitrage — critères par option → ancien format (09/10/2026)', () => {
  it('réunit par intitulé (casse et accents ignorés), poids de A sinon de B, note 0 si absente, intitulés vides ignorés', () => {
    const r = legacyCriteria([
      { code: 'A', label: 'A', criteria: [{ name: 'Délai', weightPct: 35, score: 4, comment: 'a' }, { name: '', weightPct: 10, score: 1, comment: '' }] },
      { code: 'B', label: 'B', criteria: [{ name: 'delai ', weightPct: 30, score: 2, comment: 'b' }, { name: 'Couverture', weightPct: 25, score: 4, comment: '' }] },
    ]);
    expect(r).toEqual([
      { name: 'Délai', weightPct: 35, scoreA: 4, commentA: 'a', scoreB: 2, commentB: 'b' },
      { name: 'Couverture', weightPct: 25, scoreA: 0, commentA: '', scoreB: 4, commentB: '' },
    ]);
  });
  it('sans critères par option : rien à déduire', () => {
    expect(legacyCriteria([{ code: 'A', label: 'A' }, { code: 'B', label: 'B' }])).toBeNull();
  });
});
