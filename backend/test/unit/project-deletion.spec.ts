import { confirmsCode, deletionOrder, ForeignKey, KEPT_TABLES, selectionPlan, TRASH_RETENTION_HOURS, trashExpiry } from '../../src/domain/project-deletion';

/** Suppression d'un projet (10/10/2026) : tables retenues, ordre de suppression, conservation, confirmation. */
describe('Suppression d’un projet : règles', () => {
  const fk = (child: string, childCol: string, parent: string, deleteRule = 'c', parentCol = 'id'): ForeignKey => ({ child, childCol, parent, parentCol, deleteRule });
  const FKS = [
    fk('Phase', 'projectId', 'Project'), fk('Subphase', 'phaseId', 'Phase', 'r'), fk('Workstream', 'projectId', 'Project'),
    fk('WorkstreamPhase', 'workstreamId', 'Workstream'), fk('WorkstreamPhase', 'phaseId', 'Phase'),
    fk('KbChunk', 'document_id', 'Document'), fk('Account', 'personId', 'Person', 'n'), fk('Dependency', 'fromId', 'Workstream'), fk('Dependency', 'toId', 'Workstream'),
    fk('Workstream', 'parentId', 'Workstream'),
  ];
  const direct = [{ table: 'Phase', column: 'projectId' }, { table: 'Subphase', column: 'projectId' }, { table: 'Workstream', column: 'projectId' }, { table: 'Document', column: 'projectId' },
    { table: 'Person', column: 'projectId' }, { table: 'UsageRecord', column: 'projectId' }, { table: 'AuditEntry', column: 'projectId' }, { table: 'usage_events', column: 'projectId' }];

  it('tables retenues : colonne du projet, projet lui-même, enfants en cascade ; jamais la consommation ni l’audit', () => {
    const plan = selectionPlan(direct, FKS);
    expect(plan.get('Project')).toBe('("id" = $1)');
    expect(plan.get('Phase')).toBe('("projectId" = $1)');
    expect(plan.get('WorkstreamPhase')).toContain('"workstreamId" IN (SELECT "id" FROM "Workstream" WHERE');
    expect(plan.get('WorkstreamPhase')).toContain(' OR ');
    expect(plan.get('KbChunk')).toContain('"document_id" IN (SELECT "id" FROM "Document"');
    // Clé non en cascade (SET NULL) : le compte n'est jamais supprimé ; tables conservées : jamais retenues.
    expect(plan.has('Account')).toBe(false);
    for (const t of ['UsageRecord', 'AuditEntry', 'usage_events']) expect(plan.has(t)).toBe(false);
    expect(KEPT_TABLES.has('usage_agg_day')).toBe(true);
  });

  it('ordre de suppression : enfants avant parents, références à soi-même ignorées ; restauration dans l’ordre inverse', () => {
    const tables = ['Project', 'Phase', 'Subphase', 'Workstream', 'WorkstreamPhase', 'Dependency'];
    const order = deletionOrder(tables, FKS);
    const at = (t: string) => order.indexOf(t);
    expect(order).toHaveLength(tables.length);
    expect(at('WorkstreamPhase')).toBeLessThan(at('Workstream'));
    expect(at('WorkstreamPhase')).toBeLessThan(at('Phase'));
    expect(at('Subphase')).toBeLessThan(at('Phase'));
    expect(at('Dependency')).toBeLessThan(at('Workstream'));
    expect(at('Phase')).toBeLessThan(at('Project'));
    expect(order[order.length - 1]).toBe('Project');
  });

  it('sauvegarde de sécurité conservée 48 h ; confirmation par le code du projet', () => {
    expect(TRASH_RETENTION_HOURS).toBe(48);
    expect(trashExpiry(new Date('2026-10-10T10:00:00Z')).toISOString()).toBe('2026-10-12T10:00:00.000Z');
    expect(confirmsCode(' pms ', 'PMS')).toBe(true);
    expect(confirmsCode('PM', 'PMS')).toBe(false);
    expect(confirmsCode(undefined, 'PMS')).toBe(false);
  });
});
