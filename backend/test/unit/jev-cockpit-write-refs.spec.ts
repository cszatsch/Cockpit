import { entityOfCode, normalizeWriteCode } from '../../src/domain/jev-cockpit-write';

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
