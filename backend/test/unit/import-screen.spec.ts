import { creationPercent, screenChecks, toScreen } from '../../src/import/import-screen';

describe('Initialisation d’un projet : contrôles de l’écran et avancement', () => {
  it('5 contrôles dans l’ordre de l’écran ; seuls les contrôles du serveur bloquent (Q4)', () => {
    const issues = [
      { lvl: 'err' as const, sheet: 'Personnes', row: 9 as const, msg: '« Email » est obligatoire' },
      { lvl: 'err' as const, sheet: 'Affectations', row: 10 as const, msg: 'Rôle « X » inconnu (onglet 02 Rôles)' },
      { lvl: 'warn' as const, sheet: 'Jalons', row: 12 as const, msg: 'Contrôle du fichier : Phase manquante' },
    ];
    const c = screenChecks('ORION', false, [], issues as any);
    expect(c.map((x) => [x.id, x.status, x.count])).toEqual([['structure', 'ok', 0], ['project', 'ok', 0], ['required', 'err', 1], ['consistency', 'err', 1], ['warnings', 'warn', 1]]);
    expect(screenChecks('RISE', true, ['03 Personnes'], [])[1]).toMatchObject({ status: 'err', detail: 'Code RISE · déjà utilisé dans la bibliothèque' });
    expect(screenChecks(null, false, ['03 Personnes'], [])[0]).toMatchObject({ status: 'err', detail: 'Onglets manquants : 03 Personnes' });
  });

  it('onglets manquants et code en double sortis des points listés ; fichier illisible sans vue', () => {
    const s = toScreen(null, [
      { level: 'ERROR', sheet: '03 Personnes', row: null, column: null, message: 'Onglet « 03 Personnes » manquant', source: 'SERVER' },
      { level: 'ERROR', sheet: '05 Projet', row: null, column: 'D', message: 'Le code RISE existe déjà', source: 'SERVER' },
      { level: 'WARNING', sheet: '12 Jalons', row: 14, column: null, message: 'Contrôle du fichier : ◔ à vérifier', source: 'FILE' },
    ] as any);
    expect(s).toEqual({ project: [], sheets: {}, missing: ['03 Personnes'], issues: [{ lvl: 'warn', sheet: 'Jalons', row: 14, msg: 'Contrôle du fichier : ◔ à vérifier' }] });
  });

  it('avancement : 20 % par phase, borné', () => {
    expect(creationPercent(1, 0)).toBe(0);
    expect(creationPercent(2, 0.5)).toBe(30);
    expect(creationPercent(5, 1)).toBe(100);
    expect(creationPercent(6, 2)).toBe(100);
  });
});
