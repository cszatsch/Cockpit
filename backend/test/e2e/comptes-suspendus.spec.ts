import { setup, TestCtx, Client, WHO } from '../helpers';
import { ProjectDeletionService } from '../../src/admin/project-deletion.service';

const A = '/api/admin';

/**
 * Utilisateurs › « Supprimer les comptes suspendus » (11/10/2026) : seuls les comptes suspendus sans lien sont supprimés ;
 * gardés, avec leur raison : administrateurs, comptes suspendus par la suppression d'un projet encore restaurable, comptes liés
 * à des données (journal d'audit…).
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
    // Compte qui n'a accès qu'à NOVA, suspendu par la suppression de NOVA (encore restaurable).
    await acc('s-nova', 'ACTIVE');
    await t.db.accountProject.create({ data: { accountId: 's-nova', projectId: 'NOVA' } });
    sup = await t.as(WHO.admin);
    await sup.del(`${A}/projects/NOVA`).send({ confirmCode: 'NOVA', suspendAccounts: true }).expect(200);
  });
  afterAll(() => t.close());

  it('aperçu : supprimables et gardés, avec la raison', async () => {
    const r = (await sup.get(`${A}/accounts-suspended`).expect(200)).body;
    expect(r.deletable.map((a: any) => a.id)).toEqual(['s-libre']);
    const why = Object.fromEntries(r.kept.map((k: any) => [k.id, k.reason]));
    expect(why['s-admin']).toMatch(/Administrateur/);
    expect(why['s-nova']).toMatch(/NOVA, encore restaurable/);
    expect(why['s-audit']).toMatch(/journal d'audit/);
    expect(why['a-actif']).toBeUndefined();
  });

  it('suppression : seuls les supprimables, journalisée ; les autres gardés', async () => {
    const r = (await sup.del(`${A}/accounts-suspended`).expect(200)).body;
    expect(r.deleted).toBe(1);
    expect(await t.db.account.findUnique({ where: { id: 's-libre' } })).toBeNull();
    for (const id of ['s-admin', 's-audit', 's-nova', 'a-actif']) expect(await t.db.account.findUnique({ where: { id } })).not.toBeNull();
    expect(await t.db.auditEntry.count({ where: { action: 'Suppression d’un utilisateur', entityId: 's-libre' } })).toBe(1);
    expect((await sup.del(`${A}/accounts-suspended`).expect(200)).body.deleted).toBe(0);
  });

  it('après 48 h (sauvegarde purgée), le compte suspendu par la suppression du projet devient supprimable', async () => {
    await t.app.get(ProjectDeletionService).purge(new Date(Date.now() + 49 * 3_600_000));
    const r = (await sup.get(`${A}/accounts-suspended`).expect(200)).body;
    expect(r.deletable.map((a: any) => a.id)).toEqual(['s-nova']);
  });
});
