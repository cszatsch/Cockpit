import { setup, TestCtx, Client, WHO } from '../helpers';
import { PlatformUsageService } from '../../src/admin/platform-usage.service';
import { ProjectDeletionService } from '../../src/admin/project-deletion.service';

const A = '/api/admin';

/**
 * Suppression d'un projet (Console › Projets, demande du commanditaire du 10/10/2026) : réservée au Super Admin, confirmée par
 * le code du projet, sauvegarde de sécurité restaurable 48 h ; Consommation et coûts (IA et Accès) inchangés.
 */
describe('Console — suppression d’un projet', () => {
  let t: TestCtx;
  let sup: Client;
  let adm: Client;
  const ADM = 'acc-admin-suppr';
  const SOLO = 'acc-solo-rise';

  /** Empreinte de la consommation : vue IA (appels) et vue Accès (agrégats). */
  const usage = async () => {
    const [ia] = await t.db.$queryRawUnsafe<Array<{ n: bigint; cost: number }>>(`SELECT count(*) AS n, coalesce(sum("costEur"), 0)::float8 AS cost FROM "UsageRecord"`);
    const [acc] = await t.db.$queryRawUnsafe<Array<{ n: bigint; cost: number; act: number }>>(`SELECT count(*) AS n, coalesce(sum("costEur"), 0)::float8 AS cost, coalesce(sum("activeSec"), 0)::float8 AS act FROM usage_agg_day`);
    return { ia: [Number(ia.n), ia.cost], acces: [Number(acc.n), acc.cost, acc.act] };
  };

  beforeAll(async () => {
    t = await setup();
    await t.db.account.create({ data: { id: ADM, email: 'admin.suppr@example.com', fullName: 'Alice Admin', status: 'ACTIVE' } });
    await t.db.adminGrant.create({ data: { accountId: ADM } });
    // Compte qui n'a accès qu'à RISE : proposé à la suspension.
    await t.db.account.create({ data: { id: SOLO, email: 'solo.rise@example.com', fullName: 'Sam Solo', status: 'ACTIVE' } });
    await t.db.accountProject.create({ data: { accountId: SOLO, projectId: 'RISE' } });
    // Usage du projet dans les agrégats de la vue Accès.
    await t.db.usageEvent.create({ data: { at: new Date('2026-09-20T09:00:00Z'), accountId: SOLO, sessionId: 's-solo', feature: 'projets', kind: 'click', projectId: 'RISE' } });
    await t.app.get(PlatformUsageService).aggregate();
    sup = await t.as(WHO.admin);
    adm = await t.as({ accountId: ADM });
  });
  afterAll(() => t.close());

  it('aperçu : ce qui sera supprimé et les comptes sans autre accès ; réservé au Super Admin', async () => {
    await adm.get(`${A}/projects/RISE/deletion-preview`).expect(403);
    const p = (await sup.get(`${A}/projects/RISE/deletion-preview`).expect(200)).body;
    expect(p.project).toMatchObject({ id: 'RISE', code: 'RISE' });
    expect(p.retentionHours).toBe(48);
    expect(p.counts.chantiers).toBe(await t.db.workstream.count({ where: { projectId: 'RISE' } }));
    expect(p.counts.chantiers).toBeGreaterThan(0);
    expect(p.counts.risques).toBe(await t.db.risk.count({ where: { projectId: 'RISE' } }));
    // Comptes sans autre projet ni rôle d'administrateur (le Super Admin u1 et l'Admin n'y sont jamais).
    expect(p.accounts.map((a: any) => a.id)).toContain(SOLO);
    expect(p.accounts.map((a: any) => a.id)).not.toContain('u1');
    expect(p.accounts.map((a: any) => a.id)).not.toContain(ADM);
    for (const kept of ['UsageRecord', 'AuditEntry', 'usage_agg_day', 'usage_events']) expect(p.rows[kept]).toBeUndefined();
    expect(p.totalRows).toBeGreaterThan(p.counts.chantiers);
  });

  it('suppression : code exigé, Admin refusé ; consommation inchangée ; projet gardé dans le filtre Accès', async () => {
    await t.app.get(PlatformUsageService).aggregate();
    const before = await usage();
    const rows = (await sup.get(`${A}/projects/RISE/deletion-preview`).expect(200)).body.totalRows;
    await adm.del(`${A}/projects/RISE`).send({ confirmCode: 'RISE' }).expect(403);
    expect((await sup.del(`${A}/projects/RISE`).send({ confirmCode: 'RIS' }).expect(422)).body.code).toBe('CONFIRMATION');
    const r = (await sup.del(`${A}/projects/RISE`).send({ confirmCode: ' rise ', suspendAccounts: true }).expect(200)).body;
    expect(r).toMatchObject({ projectId: 'RISE', code: 'RISE', deletedBy: expect.any(String) });
    expect(new Date(r.expiresAt).getTime() - new Date(r.deletedAt).getTime()).toBe(48 * 3_600_000);
    expect(await t.db.project.count({ where: { id: 'RISE' } })).toBe(0);
    expect(await t.db.workstream.count({ where: { projectId: 'RISE' } })).toBe(0);
    expect(await t.db.person.count({ where: { projectId: 'RISE' } })).toBe(0);
    expect((await t.db.account.findUniqueOrThrow({ where: { id: SOLO } })).status).toBe('SUSPENDED');
    expect(Object.values(r.stats.rows as Record<string, number>).reduce((a, b) => a + b, 0)).toBe(rows);
    // Consommation et coûts (IA et Accès) : rien n'a bougé, même après une nouvelle agrégation.
    await t.app.get(PlatformUsageService).aggregate();
    expect(await usage()).toEqual(before);
    const opts = (await sup.get(`${A}/consumption/options`).expect(200)).body;
    expect(opts.projects).toContainEqual({ id: 'RISE', code: 'RISE', name: expect.stringContaining('(supprimé)') });
    // Journal d'audit gardé et complété.
    expect(await t.db.auditEntry.count({ where: { action: 'Suppression d’un projet', entityId: 'RISE' } })).toBe(1);
    expect((await sup.get(`${A}/project-trash`).expect(200)).body.map((x: any) => x.code)).toEqual(['RISE']);
  });

  it('restauration : refusée à l’Admin, puis tout revient (lignes, comptes réactivés) ; 409 si le code est repris', async () => {
    const [tr] = (await sup.get(`${A}/project-trash`).expect(200)).body;
    await adm.post(`${A}/project-trash/${tr.id}/restore`, {}).expect(403);
    // Un projet du même code existe : restauration refusée.
    await t.db.project.create({ data: { id: 'RISE-BIS', clientId: (await t.db.client.findFirstOrThrow()).id, code: 'RISE', name: 'Doublon', startDate: '2026-01-01', targetEndDate: '2026-12-31' } as any });
    expect((await sup.post(`${A}/project-trash/${tr.id}/restore`, {}).expect(409)).body.code).toBe('PROJECT_EXISTS');
    await t.db.project.delete({ where: { id: 'RISE-BIS' } });
    await sup.post(`${A}/project-trash/${tr.id}/restore`, {}).expect(201);
    const total = Object.values(tr.stats.rows as Record<string, number>).reduce((a, b) => a + b, 0);
    expect((await sup.get(`${A}/projects/RISE/deletion-preview`).expect(200)).body.totalRows).toBe(total);
    expect((await t.db.account.findUniqueOrThrow({ where: { id: SOLO } })).status).toBe('ACTIVE');
    expect((await sup.get(`${A}/project-trash`).expect(200)).body).toEqual([]);
    // Le Cockpit relit le projet restauré.
    await (await t.as(WHO.pmo)).get('/api/projects/RISE/bootstrap').expect(200);
  });

  it('purge : au-delà de 48 h, la sauvegarde est effacée et n’est plus restaurable', async () => {
    const r = (await sup.del(`${A}/projects/ATLAS`).send({ confirmCode: 'ATLAS' }).expect(200)).body;
    const svc = t.app.get(ProjectDeletionService);
    expect(await svc.purge(new Date(Date.now() + 47 * 3_600_000))).toBe(0);
    expect(await svc.purge(new Date(Date.now() + 49 * 3_600_000))).toBe(1);
    await sup.post(`${A}/project-trash/${r.id}/restore`, {}).expect(404);
    expect(await t.db.auditEntry.count({ where: { action: 'Purge de la sauvegarde d’un projet supprimé', entityId: 'ATLAS' } })).toBe(1);
  });
});
