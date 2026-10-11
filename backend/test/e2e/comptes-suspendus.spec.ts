import { setup, TestCtx, Client, WHO } from '../helpers';
import { ProjectDeletionService } from '../../src/admin/project-deletion.service';
import { PlatformUsageService } from '../../src/admin/platform-usage.service';

const A = '/api/admin';

/**
 * Utilisateurs › « Supprimer les comptes suspendus » (11/10/2026) : seuls les comptes suspendus sans lien sont supprimés ;
 * gardés, avec leur raison : administrateurs, comptes suspendus par la suppression d'un projet encore restaurable, comptes
 * responsables d'éléments d'un projet. Le journal d'audit ne bloque plus (11/10/2026) : ses entrées restent, au nom de l'auteur.
 */
describe('Console — supprimer les comptes suspendus', () => {
  let t: TestCtx;
  let sup: Client;
  const acc = (id: string, status: 'ACTIVE' | 'SUSPENDED') => t.db.account.create({ data: { id, email: id + '@example.com', fullName: 'Compte ' + id, status } });

  beforeAll(async () => {
    t = await setup();
    // Les comptes déjà suspendus du jeu de démonstration sont mis hors jeu (actifs) : seuls ceux du test comptent.
    await t.db.account.updateMany({ where: { status: 'SUSPENDED' }, data: { status: 'ACTIVE' } });
    await acc('s-libre', 'SUSPENDED');
    await acc('s-admin', 'SUSPENDED');
    await t.db.adminGrant.create({ data: { accountId: 's-admin' } });
    await acc('s-audit', 'SUSPENDED');
    await t.db.auditEntry.create({ data: { accountId: 's-audit', actorName: 'Compte s-audit', action: 'Modification', entityType: 'Risk' } });
    await acc('a-actif', 'ACTIVE');
    // Compte responsable d'un risque de RISE (personne du référentiel de même e-mail) : gardé.
    await acc('s-resp', 'SUSPENDED');
    await t.db.person.create({ data: { id: 'p-s-resp', projectId: 'RISE', firstName: 'Compte', lastName: 's-resp', email: 's-resp@example.com' } });
    const risk = await t.db.risk.findFirstOrThrow({ where: { projectId: 'RISE' } });
    await t.db.risk.update({ where: { id: risk.id }, data: { ownerId: 'p-s-resp' } });
    // Usage de s-libre (vue Accès) avant sa suppression : 2 événements, 6 et 3 min d'écart.
    for (const m of ['09:00', '09:04']) await t.db.usageEvent.create({ data: { at: new Date(`2026-09-10T${m}:00Z`), accountId: 's-libre', feature: 'projets', kind: 'clic' } });
    await t.app.get(PlatformUsageService).aggregate();
    // Compte qui n'a accès qu'à NOVA, suspendu par la suppression de NOVA (encore restaurable).
    await acc('s-nova', 'ACTIVE');
    await t.db.accountProject.create({ data: { accountId: 's-nova', projectId: 'NOVA' } });
    sup = await t.as(WHO.admin);
    await sup.del(`${A}/projects/NOVA`).send({ confirmCode: 'NOVA', suspendAccounts: true }).expect(200);
  });
  afterAll(() => t.close());

  it('aperçu : supprimables et gardés, avec la raison', async () => {
    const r = (await sup.get(`${A}/accounts-suspended`).expect(200)).body;
    expect(r.deletable.map((a: any) => a.id)).toEqual(['s-audit', 's-libre']);
    const why = Object.fromEntries(r.kept.map((k: any) => [k.id, k.reason]));
    expect(why['s-admin']).toMatch(/Administrateur/);
    expect(why['s-nova']).toMatch(/NOVA, encore restaurable/);
    expect(why['s-resp']).toMatch(/Responsable de RISK/);
    expect(why['a-actif']).toBeUndefined();
  });

  it('suppression : seuls les supprimables, journalisée ; les autres gardés', async () => {
    const r = (await sup.del(`${A}/accounts-suspended`).expect(200)).body;
    expect(r.deleted).toBe(2);
    expect(await t.db.account.findUnique({ where: { id: 's-libre' } })).toBeNull();
    for (const id of ['s-admin', 's-resp', 's-nova', 'a-actif']) expect(await t.db.account.findUnique({ where: { id } })).not.toBeNull();
    // Le journal d'audit du compte supprimé est intact, toujours au nom de son auteur.
    expect(await t.db.auditEntry.findFirst({ where: { accountId: 's-audit', action: 'Modification' } })).toMatchObject({ actorName: 'Compte s-audit' });
    expect(await t.db.auditEntry.count({ where: { action: 'Suppression d’un utilisateur', entityId: 's-libre' } })).toBe(1);
    expect((await sup.del(`${A}/accounts-suspended`).expect(200)).body.deleted).toBe(0);
  });

  it('vue Accès : l’usage d’un compte supprimé reste, sous son nom suivi de « (supprimé) »', async () => {
    const svc = t.app.get(PlatformUsageService);
    (svc as any).accCache = null;
    const rows = (await sup.get(`/api/admin/consumption/breakdown?by=user&gran=mois&start=2026-09-01`).expect(200)).body.rows;
    const r = rows.find((x: any) => x.id === 's-libre');
    expect(r).toMatchObject({ name: 'Compte s-libre (supprimé)' });
    expect(r.activeH).toBeGreaterThan(0);
    const opts = (await sup.get(`/api/admin/consumption/options`).expect(200)).body;
    expect(opts.users).toContainEqual(expect.objectContaining({ id: 's-libre', name: 'Compte s-libre (supprimé)' }));
  });

  it('après 48 h (sauvegarde purgée), le compte suspendu par la suppression du projet devient supprimable', async () => {
    await t.app.get(ProjectDeletionService).purge(new Date(Date.now() + 49 * 3_600_000));
    const r = (await sup.get(`${A}/accounts-suspended`).expect(200)).body;
    expect(r.deletable.map((a: any) => a.id)).toEqual(['s-nova']);
  });
});
