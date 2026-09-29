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

    it('un texte par profil, sur les données que tous ses membres peuvent lire ; notifications « Dans l’application »', async () => {
      const svc = t.app.get(NotificationsService);
      const rule = await t.db.notificationRule.update({ where: { id: 'n2' }, data: { body: '{reponse_llm}', channels: ['APP'] } });
      const groups = await t.app.get(NotificationsService)['profiles'].audiences(rule.targetProfiles, RISE);
      expect(groups.map((g: any) => g.profile)).toEqual(['pmo', 'resp']);
      const pmoGroup = groups[0], respGroup = groups[1];
      expect(pmoGroup.chantiers).toBe('*');
      expect(Array.isArray(respGroup.chantiers)).toBe(true);
      const exec = jest.spyOn(jev, 'executeCockpit');
      const out = await svc.deliver(rule, RISE, { projet: 'RISE' }, 'test|profils');
      expect(out.map((d) => [d.profile, d.channel, d.status])).toEqual([['pmo', 'APP', 'OK'], ['resp', 'APP', 'OK']]);
      // Étapes : dictionnaire et périmètre dans le prompt système, requête exécutée sur le périmètre du profil, rédaction.
      expect(calls[0].system).toMatch(/### jev_cockpit\.risques/);
      expect(calls[0].system).toMatch(/profil PMO du projet RISE/);
      expect(calls[0].system).toMatch(/tout le projet/);
      expect(exec.mock.calls.map((c) => c[2])).toEqual(['*', respGroup.chantiers]);
      const all = (await sql<{ n: number }>(`SELECT count(*)::int AS n FROM "Risk" WHERE "projectId" = '${RISE}'`))[0].n;
      const respCount = respGroup.chantiers.length ? (await sql<{ n: number }>(`SELECT count(*)::int AS n FROM "Risk" WHERE "projectId" = '${RISE}' AND "wsId" = ANY(ARRAY[${respGroup.chantiers.map((w: string) => `'${w}'`).join(',')}]::text[])`))[0].n : 0;
      expect(out[0].body).toBe(`Risques ouverts : ${all}.`);
      expect(out[1].body).toBe(`Risques ouverts : ${respCount}.`);
      // Une notification par destinataire, avec le texte de son profil.
      const notes = await t.db.userNotification.findMany({ where: { ruleId: 'n2' } });
      expect(notes.length).toBe(pmoGroup.accounts.length + respGroup.accounts.length);
      const pmoAccount = pmoGroup.accounts[0].id;
      expect(notes.find((n) => n.accountId === pmoAccount)).toMatchObject({ kind: 'ALERT', body: `Risques ouverts : ${all}.`, projectId: RISE, readAt: null });
      exec.mockRestore();
    });

    it('Cockpit : la cloche liste mes notifications, compte les non lues, marque lu ; chacun ne voit que les siennes', async () => {
      const pmo = await t.as(WHO.pmo);
      const me = (await pmo.get('/api/me/notifications').expect(200)).body;
      expect(me.unread).toBeGreaterThan(0);
      expect(me.items[0]).toMatchObject({ kind: 'alerte', project: 'RISE', read: false, title: expect.any(String), body: expect.stringMatching(/^Risques ouverts/) });
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
    });

    it('« M’envoyer un test » : texte du premier profil destinataire, remis au seul testeur', async () => {
      const n0 = await t.db.userNotification.count();
      const sent = (await admin.post(`${A}/notification-rules/n2/test`).expect(200)).body;
      expect(sent).toEqual([expect.objectContaining({ channel: 'APP', status: 'OK', recipientsCount: 1 })]);
      expect(await t.db.userNotification.count()).toBe(n0 + 1);
      expect(await t.db.userNotification.findFirst({ where: { accountId: 'u1' }, orderBy: { createdAt: 'desc' } })).toMatchObject({ body: expect.stringMatching(/^Risques ouverts/) });
    });
  });
});
