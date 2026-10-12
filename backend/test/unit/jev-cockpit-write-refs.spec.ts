import { barometerMonth, barometerMonthLabel, entityOfCode, normalizeWriteCode } from '../../src/domain/jev-cockpit-write';

// Références citées à Jev (09/10/2026) : l'identifiant d'un objet porte le préfixe du projet quand son code est déjà pris.
describe('Jev du Cockpit — référence citée ramenée au code', () => {
  it('retire le préfixe du projet ouvert', () => {
    expect(normalizeWriteCode('PMS-R02', 'PMS')).toBe('R02');
    expect(normalizeWriteCode(' pms-a-04 ', 'PMS')).toBe('A-04');
    expect(normalizeWriteCode('PMS-D-005', 'pms')).toBe('D-005');
    expect(entityOfCode(normalizeWriteCode('PMS-P01', 'PMS'))).toBe('ISSUE');
  });
  it('laisse un code simple, ou le préfixe d’un autre projet', () => {
    expect(normalizeWriteCode('r02', 'PMS')).toBe('R02');
    expect(normalizeWriteCode('RISE-R02', 'PMS')).toBe('RISE-R02');
    expect(normalizeWriteCode('PMS-Budget', 'PMS')).toBe('PMS-BUDGET');
  });
});

describe('Jev du Cockpit — mois d’un relevé du baromètre (12/10/2026)', () => {
  it('formats reconnus', () => {
    expect(barometerMonth('2026-11', '2026-10-12')).toBe('2026-11');
    expect(barometerMonth('11/2026', '2026-10-12')).toBe('2026-11');
    expect(barometerMonth('novembre 2026', '2026-10-12')).toBe('2026-11');
    expect(barometerMonth('Décembre', '2026-10-12')).toBe('2026-12');
    expect(barometerMonth('nov. 26', '2026-10-12')).toBe('2026-11');
    expect(barometerMonth('m2026-07', '2026-10-12')).toBe('2026-07');
    expect(barometerMonth('août 2026', '2026-10-12')).toBe('2026-08');
    expect(barometerMonth('le dernier', '2026-10-12')).toBeNull();
    expect(barometerMonthLabel('2026-12')).toBe('décembre 2026');
  });
});
