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
