import { foreignSubphases, keepSubphasesOf, multiValues } from '../../src/domain/workstream-links';

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
  it('choix multiple : « ; », espaces, vides et doublons', () => {
    expect(multiValues(' 1 ; 3 ;; 1 ')).toEqual(['1', '3']);
    expect(multiValues(null)).toEqual([]);
  });
});
