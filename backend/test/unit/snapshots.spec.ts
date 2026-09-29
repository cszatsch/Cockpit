import { consolidateChanges, counters, formatValue, frDay, isSnapshotDue, nextSnapshotRun, toDiffItems } from '../../src/domain/snapshots';

describe('Snapshots : consolidation, valeurs en clair, prochaine capture', () => {
  it('modifications successives d’un champ : première valeur → dernière valeur ; retour au départ : aucune différence', () => {
    const r = consolidateChanges([
      { op: 'mod', entity: 'Action', object: 'Migration', field: 'Avancement', before: '20 %', after: '40 %' },
      { op: 'mod', entity: 'Action', object: 'Migration', field: 'Date de fin', before: '30 sept.', after: '16 oct.' },
      { op: 'mod', entity: 'Action', object: 'Migration', field: 'Avancement', before: '40 %', after: '65 %' },
      { op: 'mod', entity: 'Risque', object: 'R1', field: 'Statut', before: 'Ouvert', after: 'Clos' },
      { op: 'mod', entity: 'Risque', object: 'R1', field: 'Statut', before: 'Clos', after: 'Ouvert' },
    ]);
    expect(r).toEqual([
      { op: 'mod', entity: 'Action', object: 'Migration', field: 'Avancement', before: '20 %', after: '65 %' },
      { op: 'mod', entity: 'Action', object: 'Migration', field: 'Date de fin', before: '30 sept.', after: '16 oct.' },
    ]);
  });

  it('ajouté puis modifié : un ajout ; ajouté puis supprimé : rien ; modifié puis supprimé : une suppression', () => {
    const r = consolidateChanges([
      { op: 'add', entity: 'Livrable', object: 'L1' },
      { op: 'mod', entity: 'Livrable', object: 'L1', field: 'Statut', before: 'En rédaction', after: 'Validé' },
      { op: 'add', entity: 'Action', object: 'A1' },
      { op: 'del', entity: 'Action', object: 'A1' },
      { op: 'mod', entity: 'Risque', object: 'R2', field: 'Probabilité', before: '3', after: '4' },
      { op: 'del', entity: 'Risque', object: 'R2' },
      { op: 'del', entity: 'Jalon', object: 'J1' },
      { op: 'add', entity: 'Jalon', object: 'J1' },
    ]);
    expect(r).toEqual([{ op: 'add', entity: 'Livrable', object: 'L1' }, { op: 'del', entity: 'Risque', object: 'R2' }]);
    expect(toDiffItems(r)).toEqual([{ type: 'add', entite: 'Livrable', nom: 'L1' }, { type: 'del', entite: 'Risque', nom: 'R2' }]);
  });

  it('valeurs lisibles : noms, dates, pourcentages, oui / non, statuts traduits, vide', () => {
    const names = new Map([['p06', 'Karim Benali']]);
    expect(formatValue('Action', 'ownerId', 'p06', names)).toBe('Karim Benali');
    expect(formatValue('Jalon', 'iso', '2026-09-12', names)).toBe('12 sept. 2026');
    expect(formatValue('Jalon', 'iso', '2026-11-01', names)).toBe('1er nov. 2026');
    expect(formatValue('Livrable', 'prog', 60, names)).toBe('60 %');
    expect(formatValue('Phase', 'critical', true, names)).toBe('Oui');
    expect(formatValue('Action', 'status', 'IN_PROGRESS', names)).toBe('En cours');
    expect(formatValue('Action', 'dueIso', null, names)).toBe('—');
    expect(frDay('2027-03-15T00:00:00.000Z')).toBe('15 mars 2027');
  });

  it('compteurs de la vue : tâches = actions', () => {
    expect(counters({ Action: 3, Jalon: 2, Risque: 1, Livrable: 4, Phase: 9 })).toEqual({ taches: 3, jalons: 2, risques: 1, livrables: 4 });
    expect(counters(null)).toEqual({ taches: 0, jalons: 0, risques: 0, livrables: 0 });
  });

  it('prochaine capture (heure de Paris) : quotidienne, hebdomadaire, mensuelle, suspendue ; changement d’heure', () => {
    const now = new Date('2026-09-26T08:24:00Z'); // samedi 10 h 24 à Paris
    const sc = (frequency: string, day = 'vendredi', hour = '04:00', enabled = true) => ({ enabled, frequency, day, hour });
    expect(nextSnapshotRun(sc('Quotidienne'), now)!.toISOString()).toBe('2026-09-27T02:00:00.000Z');
    expect(nextSnapshotRun(sc('Hebdomadaire'), now)!.toISOString()).toBe('2026-10-02T02:00:00.000Z');
    expect(nextSnapshotRun(sc('Hebdomadaire', 'samedi', '10:00'), now)!.toISOString()).toBe('2026-10-03T08:00:00.000Z');
    expect(nextSnapshotRun(sc('Mensuelle'), now)!.toISOString()).toBe('2026-10-01T02:00:00.000Z');
    expect(nextSnapshotRun(sc('Hebdomadaire', 'vendredi', '04:00', false), now)).toBeNull();
    // Heure d'hiver (25 oct. 2026) : 04:00 à Paris = 03:00 UTC.
    expect(nextSnapshotRun(sc('Hebdomadaire', 'lundi'), new Date('2026-10-24T12:00:00Z'))!.toISOString()).toBe('2026-10-26T03:00:00.000Z');
    expect(isSnapshotDue(sc('Hebdomadaire'), new Date('2026-10-02T02:00:00Z'))).toBe(true);
    expect(isSnapshotDue(sc('Hebdomadaire'), new Date('2026-10-02T03:00:00Z'))).toBe(false);
  });
});
