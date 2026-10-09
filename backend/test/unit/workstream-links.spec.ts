import { subphaseCodeError, workstreamSpan, foreignSubphases, keepSubphasesOf, multiValues, nextSubphaseCode, periodOfPhases } from '../../src/domain/workstream-links';

/** Rattachements d'un chantier : phases, sous-phases, dépendances (06/10/2026). */
describe('Rattachements d’un chantier — règles', () => {
  const phaseOf = new Map([['s11', 'p1'], ['s12', 'p1'], ['s31', 'p3']]);
  it('une sous-phase doit appartenir à une phase du chantier', () => {
    expect(foreignSubphases(['s11', 's31'], ['p1'], phaseOf)).toEqual(['s31']);
    expect(foreignSubphases(['s11', 's12'], ['p1'], phaseOf)).toEqual([]);
    expect(foreignSubphases(['inconnue'], ['p1'], phaseOf)).toEqual(['inconnue']);
  });
  it('phase retirée : ses sous-phases sont retirées du chantier (D3)', () => {
    expect(keepSubphasesOf(['s11', 's31'], ['p3'], phaseOf)).toEqual({ kept: ['s31'], dropped: ['s11'] });
  });
  it('dates d’un chantier : saisies, sinon sous-phases, puis phases, puis projet (chaque borne à part)', () => {
    const P = { start: '2026-01-01', end: '2028-12-31' };
    const sp = [{ start: '2027-03-01', end: '2027-06-30' }, { start: '2027-01-15', end: '2027-10-31' }];
    const ph = [{ start: '2026-06-01', end: '2027-12-31' }];
    expect(workstreamSpan({ start: null, end: null }, sp, ph, P)).toEqual({ start: '2027-01-15', end: '2027-10-31' });
    expect(workstreamSpan({ start: '2026-11-02', end: null }, sp, ph, P)).toEqual({ start: '2026-11-02', end: '2027-10-31' });
    expect(workstreamSpan({ start: null, end: null }, [{ start: null, end: null }], ph, P)).toEqual({ start: '2026-06-01', end: '2027-12-31' });
    expect(workstreamSpan({ start: null, end: null }, [], [], P)).toEqual(P);
  });
  it('N° de sous-phase : numérotation libre ; espace, « ; » et « · » refusés', () => {
    for (const ok of ['5.1', '4.2.1', 'C2.1', 'R1']) expect(subphaseCodeError(ok)).toBeNull();
    for (const ko of ['5 1', '5;1', '5·1']) expect(subphaseCodeError(ko)).toMatch(/sans espace/);
    expect(subphaseCodeError('')).toBe('N° obligatoire');
  });
  it('choix multiple : « ; », espaces, vides et doublons', () => {
    expect(multiValues(' 1 ; 3 ;; 1 ')).toEqual(['1', '3']);
    expect(multiValues(null)).toEqual([]);
  });
});

describe('Chantier sans dates : période de ses phases (09/10/2026)', () => {
  it('du début de la première phase à la fin de la dernière ; aucune phase datée : null', () => {
    expect(periodOfPhases([{ startDate: '2027-01-01', endDate: '2027-06-30' }, { startDate: '2026-09-29', endDate: '2026-11-30' }])).toEqual({ startDate: '2026-09-29', endDate: '2027-06-30' });
    expect(periodOfPhases([{ startDate: null, endDate: null }])).toBeNull();
    expect(periodOfPhases([])).toBeNull();
  });
});

describe('Code d’une nouvelle sous-phase (09/10/2026)', () => {
  const PMS = ['1.1', '1.2', '2.1', '2.2', '3.1', '4.1', '5.1', '5.2', '1.3', '1.4', '2.3', '2.4', '2.5', '3.2', '5.3', '5.4', '5.5', '1.5', '5.6'];
  it('préfixe du chantier (C6 → 6.1), rang suivant parmi les codes du projet ; jamais un code déjà pris', () => {
    expect(nextSubphaseCode(6, PMS)).toBe('6.1');
    expect(nextSubphaseCode(5, PMS)).toBe('5.7');
    // Préfixe de la phase 1 : 1.6 (et non 1.3, déjà pris par une sous-phase de la phase 2).
    expect(nextSubphaseCode(1, PMS)).toBe('1.6');
    expect(nextSubphaseCode('2', ['2.1', '2.3', '2.2x'])).toBe('2.4');
  });
});
