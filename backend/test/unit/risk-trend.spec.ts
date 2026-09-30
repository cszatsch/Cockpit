import { isoWeek, riskTrend } from '../../src/domain/risk-trend';

/** Tendance des risques calculée depuis le registre (01/10/2026). */
describe('Tendance des risques', () => {
  const d = (iso: string) => new Date(`${iso}T10:00:00Z`);
  const r = (id: string, created: string, p = 4, i = 5, status = 'OPEN', updated = created) => ({ id, createdAt: d(created), updatedAt: d(updated), status, p, i });

  it('semaines ISO', () => {
    expect(isoWeek(d('2026-10-01'))).toBe(40);
    expect(isoWeek(d('2027-01-01'))).toBe(53);
  });

  it('ouverts et critiques en fin de semaine ; série à partir du premier risque, pas de semaines inventées', () => {
    const t = riskTrend([r('R1', '2026-09-27'), r('R2', '2026-09-27', 2, 3)], new Map(), '2026-10-01');
    expect(t.weeks).toEqual([[2, 1]]);
    expect(t).toMatchObject({ total: 2, critical: 1, since: '2026-09-27', labels: ['S40'] });
    expect(riskTrend([], new Map(), '2026-10-01')).toEqual({ weeks: [], labels: [], total: 0, critical: 0, since: null });
  });

  it('clôture datée par le journal d’audit, sinon par la dernière modification ; un risque rouvert compte toujours', () => {
    const risks = [r('R1', '2026-08-01', 5, 5, 'CLOSED', '2026-09-20'), r('R2', '2026-08-01', 5, 5, 'CLOSED', '2026-09-30'), r('R3', '2026-08-01', 1, 1, 'OPEN')];
    const t = riskTrend(risks, new Map([['R1', d('2026-09-10')]]), '2026-10-01');
    expect(t.weeks).toHaveLength(8);
    expect(t.weeks[0]).toEqual([3, 2]);
    // R1 clos le 10/09 (audit), R2 le 30/09 (dernière modification).
    expect(t.weeks[t.weeks.length - 1]).toEqual([1, 0]);
    expect(t.weeks[t.weeks.length - 2]).toEqual([2, 1]);
  });
});
