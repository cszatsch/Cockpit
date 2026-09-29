import { setup, TestCtx, Client, WHO } from '../helpers';
import { InboxService } from '../../src/admin/inbox.service';
import { MailerService } from '../../src/core/mailer.service';
import { techErrors } from '../../src/core/tech-errors';

const NT = '/api/admin/notifications';
const R = '/api/projects/RISE';
const later = () => new Date(Date.now() + 11_000);

/** Notifications de l'administrateur (spécification NOTIFICATIONS § 5). */
describe('Console — notifications de l’administrateur', () => {
  let t: TestCtx;
  let admin: Client;
  let inbox: InboxService;
  let mailer: MailerService;
  beforeAll(async () => {
    t = await setup();
    admin = await t.as(WHO.admin);
    inbox = t.app.get(InboxService);
    mailer = t.app.get(MailerService);
  });
  afterAll(() => t.close());

  it('liste : incident de clé refusée, demande de module ; compteurs non lus', async () => {
    const r = await admin.get(NT).expect(200);
    const key = r.body.items.find((i: any) => i.title === 'Clé API Google refusée');
    expect(key).toMatchObject({ type: 'err', unread: true, actLabel: 'Remplacer la clé', target: 'providers' });
    expect(r.body.items.find((i: any) => i.type === 'module')).toMatchObject({ title: 'Activer « Suivi des bénéfices »', meta: { project: 'RISE', by: 'Camille Rey' } });
    expect(r.body).toMatchObject({ hasError: true, unreadCount: r.body.items.filter((i: any) => i.unread).length });
    await (await t.as(WHO.pmo)).get(NT).expect(403);
  });

  /** Nouvelle personne du RISE, sans compte : cible d'une demande d'invitation. */
  let seq = 0;
  const noAccount = async () => {
    const project = await t.db.project.findUniqueOrThrow({ where: { code: 'RISE' } });
    seq++;
    return [await t.db.person.create({ data: { id: `pz${seq}`, projectId: project.id, firstName: 'Léa', lastName: `Martin ${seq}`, email: `lea.martin${seq}@client.fr` } })];
  };

  it('invitation : accepter puis annuler dans les 10 s ne crée rien ; accepter pour de bon crée le compte, envoie l’invitation et prévient le demandeur', async () => {
    const pmo = await t.as(WHO.pmo);
    const person = (await noAccount())[0];
    expect((await pmo.post(`${R}/invitation-requests`, { personId: person.id }).expect(201)).body.status).toBe('PENDING');
    let list = (await admin.get(NT).expect(200)).body;
    const n = list.items.find((i: any) => i.type === 'invite');
    expect(n).toMatchObject({ pending: true, meta: { project: 'RISE' } });
    const pending0 = list.pendingInvitations;

    const mails0 = mailer.outbox.length;
    await admin.post(`${NT}/${n.id}/decision`, { decision: 'accept' }).expect(200);
    list = (await admin.get(NT).expect(200)).body;
    expect(list.pendingInvitations).toBe(pending0 - 1);
    await admin.post(`${NT}/${n.id}/undo`).expect(200);
    await inbox.finalizeDue(later());
    expect(mailer.outbox.length).toBe(mails0);
    expect((await t.db.invitationRequest.findFirst({ where: { personId: person.id } }))?.status).toBe('PENDING');

    await admin.post(`${NT}/${n.id}/decision`, { decision: 'accept' }).expect(200);
    await admin.post(`${NT}/${n.id}/decision`, { decision: 'accept' }).expect(409);
    expect(mailer.outbox.length).toBe(mails0); // aucun e-mail avant la fin du délai
    expect(await inbox.finalizeDue(later())).toBe(1);
    await admin.post(`${NT}/${n.id}/undo`).expect(409);
    expect((await t.db.invitationRequest.findFirst({ where: { personId: person.id } }))?.status).toBe('APPROVED');
    const sent = mailer.outbox.slice(mails0);
    expect(sent.some((m) => /invitation/i.test(m.subject))).toBe(true);
    expect(sent.some((m) => m.subject.includes('Demande d’invitation acceptée'))).toBe(true);
    const audit = (await t.db.auditEntry.findMany({ where: { entityType: 'Notification', entityId: n.id } })).map((a) => a.action);
    expect(audit).toEqual(expect.arrayContaining(['Demande d’invitation acceptée', 'Décision annulée']));
    expect((await admin.get(NT).expect(200)).body.items.find((i: any) => i.id === n.id)).toBeUndefined();
  });

  it('invitation : état réel dans le Référentiel, droits proposés par le référentiel à l’acceptation, retour au PMO dans le Cockpit', async () => {
    const pmo = await t.as(WHO.pmo);
    const person = (await noAccount())[0];
    const owned = (await t.db.workstream.findMany({ where: { projectId: 'RISE', ownerId: person.id } })).map((w) => w.id).sort();
    const pr = await t.db.person.findUniqueOrThrow({ where: { id: person.id } });
    const lec = pr.wsIds.filter((w) => !owned.includes(w)).sort();
    const states = async () => (await pmo.get(`${R}/account-states`).expect(200)).body;
    expect((await states())[person.id]).toEqual({ state: 'none', at: null });
    expect((await states()).p01.state).toBe('active');
    await (await t.as(WHO.respC5)).get(`${R}/account-states`).expect(403);

    await pmo.post(`${R}/invitation-requests`, { personId: person.id }).expect(201);
    expect((await states())[person.id]).toMatchObject({ state: 'pending', at: expect.any(String) });
    const n = (await admin.get(NT).expect(200)).body.items.find((i: any) => i.type === 'invite' && i.meta.name === `${pr.firstName} ${pr.lastName}`.trim());
    const droits = [owned.length ? `Responsable de ${owned.join(', ')}` : '', lec.length ? `Lecteur de ${lec.join(', ')}` : ''].filter(Boolean).join(' · ') || 'aucun chantier au référentiel : droits à compléter';
    expect(n.text).toContain(droits);

    await admin.post(`${NT}/${n.id}/decision`, { decision: 'accept' }).expect(200);
    await inbox.finalizeDue(later());
    expect((await states())[person.id]).toMatchObject({ state: 'invited', at: expect.any(String) });
    const acc = await t.db.account.findFirstOrThrow({ where: { email: { equals: pr.email, mode: 'insensitive' } } });
    const view = (await admin.get(`/api/admin/accounts/${acc.id}`).expect(200)).body;
    expect(view.habilitations.find((h: any) => h.code === 'RISE')).toMatchObject({ pmo: false, responsable: owned, lecteur: lec });
    expect(view.referentiel[0].ecarts).toEqual({ responsableManquant: [], responsableEnTrop: [], lectureManquante: [], accesARetirer: [] });
    // Retour au PMO : notification dans la cloche du Cockpit.
    const bell = (await pmo.get('/api/me/notifications').expect(200)).body;
    expect(bell.items.some((x: any) => /Demande d’invitation acceptée/.test(x.title))).toBe(true);
  });

  it('invitation partie à une adresse erronée : l’e-mail corrigé au référentiel est appliqué, l’invitation renvoyée, l’ancien lien invalide', async () => {
    const pmo = await t.as(WHO.pmo);
    const person = await t.db.person.update({ where: { id: (await noAccount())[0].id }, data: { email: 'robin.test@gmaail.com' } });
    await pmo.post(`${R}/invitation-requests`, { personId: person.id }).expect(201);
    const n = (await admin.get(NT).expect(200)).body.items.find((i: any) => i.type === 'invite' && i.text.includes('robin.test@gmaail.com'));
    await admin.post(`${NT}/${n.id}/decision`, { decision: 'accept' }).expect(200);
    await inbox.finalizeDue(later());
    const acc = await t.db.account.findFirstOrThrow({ where: { email: 'robin.test@gmaail.com' } });
    const oldToken = await t.db.passwordToken.findFirstOrThrow({ where: { accountId: acc.id, usedAt: null } });

    await pmo.patch(`${R}/persons/${person.id}`, { email: 'robin.test@gmail.com' }).expect(200);
    expect((await admin.get(NT).expect(200)).body.items.find((i: any) => i.title === `E-mail différent du référentiel : ${acc.fullName}`)?.text).toContain('L’invitation est partie à l’adresse du compte');
    const mails0 = mailer.outbox.length;
    const r = (await admin.post(`/api/admin/accounts/${acc.id}/referential-email`).expect(200)).body;
    expect(r).toMatchObject({ email: 'robin.test@gmail.com', status: 'INVITED', inviteSent: true });
    const sent = mailer.outbox.slice(mails0);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: ['robin.test@gmail.com'], subject: 'Invitation à RISE Cockpit (relance)' });
    expect((await t.db.passwordToken.findUniqueOrThrow({ where: { id: oldToken.id } })).usedAt).not.toBeNull(); // lien envoyé à gmaail.com : inutilisable
    expect(await t.db.passwordToken.count({ where: { accountId: acc.id, usedAt: null } })).toBe(1);
  });

  it('module : refuser prévient le demandeur ; la demande est close', async () => {
    const n = (await admin.get(NT).expect(200)).body.items.find((i: any) => i.type === 'module');
    const mails0 = mailer.outbox.length;
    await admin.post(`${NT}/${n.id}/decision`, { decision: 'refuse' }).expect(200);
    await inbox.finalizeDue(later());
    expect((await t.db.moduleRequest.findUnique({ where: { id: 'q1' } }))?.status).toBe('REJECTED');
    expect(mailer.outbox.slice(mails0).some((m) => m.subject.includes('Demande de module refusée'))).toBe(true);
  });

  it('incident de clé : fermé seul une fois la clé remplacée et testée ; « Tout lire » garde les demandes', async () => {
    await admin.put('/api/admin/providers/google/key', { apiKey: 'AIza-nouvelle-cle-valide-000000000000' }).expect(200);
    await admin.post('/api/admin/providers/google/test').expect(200);
    const list = (await admin.get(NT).expect(200)).body;
    expect(list.items.find((i: any) => i.title === 'Clé API Google refusée')).toBeUndefined();

    const other = (await noAccount()).find((p) => true)!;
    expect((await (await t.as(WHO.pmo)).post(`${R}/invitation-requests`, { personId: other.id }).expect(201)).body.status).toBe('PENDING');
    await admin.post(`${NT}/read-all`).expect(200);
    const after = (await admin.get(NT).expect(200)).body;
    expect(after.unreadCount).toBe(0);
    expect(after.items.find((i: any) => i.type === 'invite' && i.pending)).toBeTruthy();
  });

  it('erreur technique : incident à l’échec d’une route, fermé à sa réussite suivante', async () => {
    techErrors.open.add('GET /api/admin/notifications');
    techErrors.onError?.('GET /api/admin/notifications', 'panne simulée');
    await new Promise((r) => setTimeout(r, 200));
    expect(await t.db.notification.findUnique({ where: { key: 'tech:GET /api/admin/notifications' } })).toMatchObject({ kind: 'ERR', status: 'OPEN' });
    await admin.get(NT).expect(200); // réussite de la même route
    await new Promise((r) => setTimeout(r, 200));
    expect((await t.db.notification.findUnique({ where: { key: 'tech:GET /api/admin/notifications' } }))?.status).toBe('RESOLVED');
  });
});
