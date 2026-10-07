import { durationDays, weightedProgress } from '../../src/domain/progress-rollup';

describe('avancement d’une phase : moyenne pondérée par la durée', () => {
  it('durée en jours, début et fin inclus ; 1 jour si une date manque ou si la période est inversée', () => {
    expect(durationDays('2026-01-01', '2026-01-31')).toBe(31);
    expect(durationDays('2027-04-01', '2027-04-01')).toBe(1);
    expect(durationDays(null, '2026-01-31')).toBe(1);
    expect(durationDays('2026-02-01', '2026-01-01')).toBe(1);
  });
  it('exemple du commanditaire : 10 %, 30 %, 20 % sur 1, 2 et 3 mois → 22 %', () => {
    const v = weightedProgress([
      { startDate: '2026-01-01', endDate: '2026-01-31', progressPct: 10 },
      { startDate: '2026-02-01', endDate: '2026-03-31', progressPct: 30 },
      { startDate: '2026-04-01', endDate: '2026-06-30', progressPct: 20 },
    ]);
    expect(v).toBe(22); // (10×31 + 30×59 + 20×91) / 181 = 21,6
  });
  it('durées égales → moyenne simple ; sans sous-phase → null ; valeurs bornées à 0–100', () => {
    expect(weightedProgress([{ startDate: '2026-01-01', endDate: '2026-01-10', progressPct: 10 }, { startDate: '2026-02-01', endDate: '2026-02-10', progressPct: 30 }])).toBe(20);
    expect(weightedProgress([])).toBeNull();
    expect(weightedProgress([{ progressPct: 150 }, { progressPct: -5 }])).toBe(50);
  });
});
