import { setup, TestCtx, Client, WHO } from '../helpers';
import { JevSqlService } from '../../src/admin/jev-sql.service';
import { NotificationsService } from '../../src/admin/notifications.service';
import { LlmService } from '../../src/core/llm.service';
import { JEV_COCKPIT_SCHEMA } from '../../src/domain/jev-dictionnaire-cockpit';

const A = '/api/admin';

/**
 * Notifications internes du Cockpit (point 6) et rédaction des alertes à partir des données, un texte par profil
 * (point 7, arbitrage du 29/09/2026).
 */
describe('Notifications du Cockpit et rédaction à partir des données', () => {
  let t: TestCtx;
  let admin: Client;
  let jev: JevSqlService;
  let RISE: string;
  const sql = <T = any>(q: string) => t.db.$queryRawUnsafe<T[]>(q);

  beforeAll(async () => {
    t = await setup();
    admin = await t.as(WHO.admin);
    jev = t.app.get(JevSqlService);
    RISE = (await t.db.project.findFirstOrThrow({ where: { code: 'RISE' } })).id;
  });
  afterAll(() => t.close());

  describe('vues du Cockpit : filtrées par droits pour le rôle de lecture', () => {
    it('projet et chantiers posés par le serveur ; lignes sans chantier réservées à « * »', async () => {
      const all = (await sql<{ n: number }>(`SELECT count(*)::int AS n FROM "Risk" WHERE "projectId" = '${RISE}'`))[0].n;
      const one = (await sql<{ ws: string; n: number }>(`SELECT "wsId" AS ws, count(*)::int AS n FROM "Risk" WHERE "projectId" = '${RISE}' GROUP BY 1 ORDER BY 2 DESC LIMIT 1`))[0];
      const count = async (v: string, chantiers: '*' | string[], p = RISE) => Number((await jev.executeCockpit(`SELECT count(*) AS n FROM ${v}`, p, chantiers))[0].n);
      expect(await count('risques', '*')).toBe(all);
      expect(await count('risques', [one.ws])).toBe(one.n);
      expect(await count('risques', [])).toBe(0);
      expect(await count('risques', '*', 'autre-projet')).toBe(0);
      expect(await count('chantiers', [one.ws])).toBe(1);
      // Exceptions : livrables visibles de tout le projet ; commentaires et documents RESTRICTED réservés à « * ».
      expect(await count('livrables', [])).toBe(await count('livrables', '*'));
      expect(await count('commentaires', [])).toBe(0);
      const restricted = (await sql<{ n: number }>(`SELECT count(*)::int AS n FROM "Document" WHERE "projectId" = '${RISE}' AND conf::text = 'RESTRICTED'`))[0].n;
      expect(await count('documents', [])).toBe((await count('documents', '*')) - restricted);
      // Le compte de l'application voit tout (tests, dictionnaire) ; le rôle ne lit ni les vues de la Console ni les tables.
      expect((await sql<{ n: number }>(`SELECT count(*)::int AS n FROM ${JEV_COCKPIT_SCHEMA}.risques WHERE projet_id = '${RISE}'`))[0].n).toBe(all);
      await expect(jev.executeCockpit('SELECT * FROM jev.comptes', RISE, '*')).rejects.toThrow(/permission denied/);
      await expect(jev.executeCockpit('SELECT * FROM public."Risk"', RISE, '*')).rejects.toThrow(/permission denied/);
      // Le Jev de la Console ne lit toujours pas les vues du Cockpit.
      await expect(jev.executeReadOnly(`SELECT * FROM ${JEV_COCKPIT_SCHEMA}.risques`)).rejects.toThrow(/permission denied/);
    });
  });

  describe('rédaction par profil et notifications du Cockpit', () => {
    let calls: Array<{ prompt: string; system: string }>;
    let spy: jest.SpyInstance;
    beforeAll(() => {
      // Modèle simulé : il écrit la requête, puis rédige à partir des résultats.
      calls = [];
      spy = jest.spyOn(t.app.get(LlmService), 'completeWithModelLive').mockImplementation(async (modelId, input) => {
        calls.push({ prompt: input.prompt, system: input.system ?? '' });
        const text = /## Résultats de la requête/.test(input.prompt)
          ? `Risques ouverts : ${/"n":\s*"?(\d+)/.exec(input.prompt)?.[1] ?? '?'}.`
          : '```sql\nSELECT count(*) AS n FROM jev_cockpit.risques\n```';
        return { text, modelId, providerId: 'anthropic', tokensIn: 100, tokensOut: 20, costEur: 0.001, fallbackUsed: false, ms: 5 };
      });
    });
    afterAll(() => spy.mockRestore());

    it('un texte par profil et par périmètre exact (12/10/2026) ; notifications « Dans l’application »', async () => {
      const svc = t.app.get(NotificationsService);
      const rule = await t.db.notificationRule.update({ where: { id: 'n4' }, data: { body: '{reponse_llm}', channels: ['APP'] } });
      const groups = await t.app.get(NotificationsService)['profiles'].audiences(rule.targetProfiles, RISE);
      // PMO : tout le projet ; Responsables : un groupe par ensemble exact de chantiers (plus d'intersection commune).
      expect(groups[0]).toMatchObject({ profile: 'pmo', chantiers: '*' });
      const resp = groups.slice(1);
      expect(resp.length).toBeGreaterThan(1);
      expect(resp.every((g: any) => g.profile === 'resp' && Array.isArray(g.chantiers) && g.chantiers.length > 0)).toBe(true);
      expect(new Set(resp.map((g: any) => g.chantiers.join(','))).size).toBe(resp.length);
      const exec = jest.spyOn(jev, 'executeCockpitSets');
      const out = await svc.deliver(rule, RISE, { projet: 'RISE' }, 'test|profils');
      expect(out.map((d) => [d.profile, d.channel, d.status])).toEqual(groups.map((g: any) => [g.profile, 'APP', 'OK']));
      expect(out.map((d) => d.scope)).toEqual(groups.map((g: any) => (g.chantiers === '*' ? '*' : g.chantiers.join(','))));
      // Étapes : dictionnaire et périmètre dans le prompt système, requête exécutée sur le périmètre du groupe, rédaction.
      expect(calls[0].system).toMatch(/### jev_cockpit\.risques/);
      expect(calls[0].system).toMatch(/profil PMO du projet RISE/);
      expect(calls[0].system).toMatch(/tout le projet/);
      expect(exec.mock.calls.map((c) => c[2])).toEqual(groups.map((g: any) => g.chantiers));
      const count = async (ws: '*' | string[]) => (await sql<{ n: number }>(`SELECT count(*)::int AS n FROM "Risk" WHERE "projectId" = '${RISE}'` + (ws === '*' ? '' : ` AND "wsId" = ANY(ARRAY[${ws.map((w) => `'${w}'`).join(',')}]::text[])`)))[0].n;
      for (const [i, g] of groups.entries()) expect(out[i].body).toBe(`Risques ouverts : ${await count(g.chantiers)}.`);
      // Une notification par destinataire, avec le texte de son groupe.
      const notes = await t.db.userNotification.findMany({ where: { ruleId: 'n4' } });
      expect(notes.length).toBe(groups.reduce((n: number, g: any) => n + g.accounts.length, 0));
      const pmoAccount = groups[0].accounts[0].id;
      expect(notes.find((n) => n.accountId === pmoAccount)).toMatchObject({ body: `Risques ouverts : ${await count('*')}.`, projectId: RISE, readAt: null });
      exec.mockRestore();
    });

    it('désabonnement (Mon profil › Notifications) : liste des règles qui me visent, exclusion de l’envoi, règle obligatoire', async () => {
      const svc = t.app.get(NotificationsService);
      const resp5 = await t.as(WHO.respC5);
      const mine = (await resp5.get('/api/me/notification-rules?project=RISE').expect(200)).body;
      const n4 = mine.find((r: any) => r.id === 'n4');
      expect(n4).toMatchObject({ name: 'Synthèse hebdomadaire du projet', freq: 'week', profile: 'Responsable', mandatory: false, subscribed: true, channels: ['app'] });
      expect(Array.isArray(n4.scope) && n4.scope.includes('C5')).toBe(true);
      // Le PMO la reçoit en tant que PMO, sur tout le projet ; une règle désactivée n'apparaît pas.
      const pmo = await t.as(WHO.pmo);
      expect((await pmo.get('/api/me/notification-rules?project=RISE').expect(200)).body.find((r: any) => r.id === 'n4')).toMatchObject({ profile: 'PMO', scope: '*' });
      expect(mine.some((r: any) => r.id === 'n5')).toBe(false);
      // Se désabonner : exclu de l'envoi suivant ; l'historique compte le désabonné.
      expect((await resp5.put('/api/me/notification-rules/n4', { subscribed: false }).expect(200)).body).toEqual({ id: 'n4', subscribed: false });
      expect((await resp5.get('/api/me/notification-rules?project=RISE').expect(200)).body.find((r: any) => r.id === 'n4').subscribed).toBe(false);
      const me5 = (await t.db.account.findMany()).filter((a) => a.personId === 'p06').map((a) => a.id);
      const rule = await t.db.notificationRule.findUniqueOrThrow({ where: { id: 'n4' } });
      const out = await svc.deliver(rule, RISE, { projet: 'RISE' }, 'test|desabonnement');
      expect(out.every((d) => !d.recipients.some((id) => me5.includes(id)))).toBe(true);
      // Groupe de plusieurs membres dont un se désabonne : le texte part aux autres, l'envoi compte un désabonné. (Un
      // groupe entièrement désabonné ne part pas : aucun appel au modèle.)
      const big = (await svc['profiles'].audiences(rule.targetProfiles, RISE)).find((g: any) => g.accounts.length > 1)!;
      await t.db.notificationOptOut.create({ data: { accountId: big.accounts[0].id, ruleId: 'n4' } });
      const out2 = await svc.deliver(rule, RISE, { projet: 'RISE' }, 'test|desabonnement-2');
      const key = big.chantiers === '*' ? '*' : big.chantiers.join(',');
      expect(out2.find((d) => d.profile === big.profile && d.scope === key)).toMatchObject({ optedOut: 1, recipientsCount: big.accounts.length - 1 });
      await t.db.notificationOptOut.deleteMany({ where: { accountId: big.accounts[0].id, ruleId: 'n4' } });
      const hist = (await admin.get(`${A}/notifications/history`).expect(200)).body;
      expect(hist.some((h: any) => /désabonné/.test(h.d))).toBe(true);
      // Règle obligatoire : pas de désabonnement possible (409), et le compte la reçoit malgré un ancien désabonnement.
      await t.db.notificationRule.update({ where: { id: 'n4' }, data: { mandatory: true } });
      await resp5.put('/api/me/notification-rules/n4', { subscribed: false }).expect(409);
      expect((await resp5.get('/api/me/notification-rules?project=RISE').expect(200)).body.find((r: any) => r.id === 'n4')).toMatchObject({ mandatory: true, subscribed: true });
      const forced = await svc.deliver(await t.db.notificationRule.findUniqueOrThrow({ where: { id: 'n4' } }), RISE, { projet: 'RISE' }, 'test|obligatoire');
      expect(forced.some((d) => d.recipients.some((id) => me5.includes(id)))).toBe(true);
      // Remise en état ; se réabonner.
      await t.db.notificationRule.update({ where: { id: 'n4' }, data: { mandatory: false } });
      expect((await resp5.put('/api/me/notification-rules/n4', { subscribed: true }).expect(200)).body).toEqual({ id: 'n4', subscribed: true });
      await resp5.put('/api/me/notification-rules/inconnue', { subscribed: false }).expect(404);
      await resp5.get('/api/me/notification-rules').expect(400);
    });

    it('Console › Mon profil › Notifications : règles visant le profil Admin, désabonnement ; réservé à l’Admin', async () => {
      await t.db.notificationRule.update({ where: { id: 'n4' }, data: { targetProfiles: ['admin', 'pmo', 'resp'] } });
      const list = (await admin.get(`${A}/me/notification-rules`).expect(200)).body;
      expect(list.find((r: any) => r.id === 'n4')).toMatchObject({ name: 'Synthèse hebdomadaire du projet', profile: 'Admin', projects: expect.anything(), subscribed: true, mandatory: false });
      expect(list.some((r: any) => r.id === 'n5')).toBe(false); // inactive, et sans le profil Admin
      expect((await admin.put(`${A}/me/notification-rules/n4`, { subscribed: false }).expect(200)).body).toEqual({ id: 'n4', subscribed: false });
      expect((await admin.get(`${A}/me/notification-rules`).expect(200)).body.find((r: any) => r.id === 'n4').subscribed).toBe(false);
      await admin.put(`${A}/me/notification-rules/n4`, { subscribed: true }).expect(200);
      await (await t.as(WHO.pmo)).get(`${A}/me/notification-rules`).expect(403);
      await t.db.notificationRule.update({ where: { id: 'n4' }, data: { targetProfiles: ['pmo', 'resp'] } });
    });

    it('Cockpit : la cloche liste mes notifications, compte les non lues, marque lu ; chacun ne voit que les siennes', async () => {
      const pmo = await t.as(WHO.pmo);
      const me = (await pmo.get('/api/me/notifications').expect(200)).body;
      expect(me.unread).toBeGreaterThan(0);
      expect(me.items[0]).toMatchObject({ project: 'RISE', read: false, title: expect.any(String), body: expect.stringMatching(/^Risques ouverts/) });
      const id = me.items[0].id;
      await pmo.post(`/api/me/notifications/${id}/read`).expect(204);
      expect((await pmo.get('/api/me/notifications').expect(200)).body.unread).toBe(me.unread - 1);
      // Un autre utilisateur ne peut ni lire ni marquer la notification d'autrui.
      const lec = await t.as(WHO.lecteurC3);
      const other = (await lec.get('/api/me/notifications').expect(200)).body;
      expect(other.items.some((n: any) => n.id === id)).toBe(false);
      await lec.post(`/api/me/notifications/${id}/read`).expect(404);
      await pmo.post('/api/me/notifications/read-all').expect(204);
      expect((await pmo.get('/api/me/notifications?unreadOnly=true').expect(200)).body).toEqual({ unread: 0, items: [] });
      // Effacer tout (30/09/2026) : mes notifications seulement ; celles des autres et l'historique des envois restent.
      const othersBefore = await t.db.userNotification.count({ where: { accountId: { not: me.items.length ? (await t.db.userNotification.findUniqueOrThrow({ where: { id } })).accountId : '' } } });
      const deliveries = await t.db.delivery.count();
      await pmo.del('/api/me/notifications').expect(204);
      expect((await pmo.get('/api/me/notifications').expect(200)).body).toEqual({ unread: 0, items: [] });
      expect(await t.db.userNotification.count()).toBe(othersBefore);
      expect(await t.db.delivery.count()).toBe(deliveries);
    });

    it('« M’envoyer un test » : texte du premier profil destinataire, remis au seul testeur', async () => {
      const n0 = await t.db.userNotification.count();
      const sent = (await admin.post(`${A}/notification-rules/n4/test`).expect(200)).body;
      expect(sent).toEqual([expect.objectContaining({ channel: 'APP', status: 'OK', recipientsCount: 1 })]);
      expect(await t.db.userNotification.count()).toBe(n0 + 1);
      expect(await t.db.userNotification.findFirst({ where: { accountId: 'u1' }, orderBy: { createdAt: 'desc' } })).toMatchObject({ body: expect.stringMatching(/^Risques ouverts/) });
    });

    it('requête coupée par la limite de sortie : réécrite puis exécutée ; jamais de SQL dans une notification (30/09/2026)', async () => {
      const svc = t.app.get(NotificationsService);
      const rule = await t.db.notificationRule.findUniqueOrThrow({ where: { id: 'n4' } });
      const r = (text: string) => ({ text, modelId: rule.modelId, providerId: 'anthropic', tokensIn: 100, tokensOut: 1024, costEur: 0.001, fallbackUsed: false, ms: 5 });
      const cut = 'Bonjour,\nVoici l’analyse.\n\n```sql\nWITH r AS (\n  SELECT code FROM jev_cockpit.risques';
      // 1. Première réponse coupée, correction correcte : le contenu est rédigé à partir des résultats.
      calls.length = 0;
      spy.mockImplementationOnce(async () => r(cut));
      const [ok] = await svc.deliver({ ...rule, channels: ['APP'], body: '{reponse_llm}' }, RISE, { projet: 'RISE' }, 'test|coupee', { accountIds: ['u1'] });
      expect(ok.body).toMatch(/^Risques ouverts : \d+\.$/);
      // `calls` ne note que les appels simulés par défaut : le premier est la demande de correction.
      expect(calls[0].prompt).toMatch(/requête coupée car trop longue/);
      // 2. Le modèle ne rend que du SQL, même après correction : texte de repli, sans SQL.
      spy.mockImplementation(async () => r(cut));
      const [ko] = await svc.deliver({ ...rule, channels: ['APP'], body: '{reponse_llm}' }, RISE, { projet: 'RISE' }, 'test|coupee2', { accountIds: ['u1'] });
      expect(ko.body).not.toMatch(/```|SELECT|WITH/i);
      expect(ko.body).toMatch(/consultez le détail dans le Cockpit/);
    });
  });
});
