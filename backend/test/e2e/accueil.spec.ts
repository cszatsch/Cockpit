import { setup, TestCtx, WHO } from '../helpers';
import { LlmService } from '../../src/core/llm.service';
import { ApiError } from '../../src/core/errors';
import { TodayGreetingService } from '../../src/cockpit/today/today-greeting.service';
import { GREETING_MODULE_ID, GREETING_PROMPT_VERSION } from '../../src/domain/today-greeting';

const R = '/api/projects/RISE';

/** Message d'accueil de l'écran Aujourd'hui rédigé par Jev (02/10/2026). */
describe('Cockpit — message d’accueil de Jev', () => {
  let t: TestCtx;
  let llm: LlmService;
  /** Génération réelle simulée : le vrai appel (bouchon, consommation enregistrée), avec le texte voulu. */
  const live = (text: string | (() => Promise<never>)) => {
    jest.spyOn(llm, 'isLive').mockReturnValue(true);
    const real = llm.complete.bind(llm);
    return jest.spyOn(llm, 'complete').mockImplementation(async (input: any) => (typeof text === 'function' ? text() : { ...(await real(input)), text }));
  };

  beforeAll(async () => {
    t = await setup();
    llm = t.app.get(LlmService);
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => t.close());

  it('hors ligne : message par règles, identique à celui de l’écran, rien d’enregistré', async () => {
    const c = await t.as(WHO.lecteurC3);
    const g = (await c.get(`${R}/today/greeting`).expect(200)).body;
    const today = (await c.get(`${R}/today`).expect(200)).body;
    expect(g).toMatchObject({ source: 'regles', reason: 'génération réelle indisponible', day: '2026-09-26', text: today.message });
    expect(await t.db.todayGreeting.count()).toBe(0);
  });

  it('message de Jev : fonction Insights, ton de la Personnalité, vouvoiement ; une seule génération par jour', async () => {
    const spy = live('Bonjour Philippe, le COPIL du 26 oct. approche : gardons le cap.');
    const c = await t.as(WHO.lecteurC3);
    const g = (await c.get(`${R}/today/greeting`).expect(200)).body;
    expect(g).toEqual({ text: 'Bonjour Philippe, le COPIL du 26 oct. approche : gardons le cap.', source: 'jev', reason: null, day: '2026-09-26' });
    expect(spy).toHaveBeenCalledTimes(1);
    const input = spy.mock.calls[0][0];
    expect(input).toMatchObject({ functionId: 'insights', source: 'COCKPIT', projectId: 'RISE' });
    expect(input.system).toContain('## Personnalité');
    expect(input.system).toContain('Vouvoie toujours');
    expect(input.prompt).toContain('Prénom : Philippe');
    // Même jour : le message gardé, sans nouvel appel ; deux ouvertures simultanées n'en font qu'un.
    await Promise.all([c.get(`${R}/today/greeting`).expect(200), c.get(`${R}/today/greeting`).expect(200)]);
    expect(spy).toHaveBeenCalledTimes(1);
    const row = await t.db.todayGreeting.findFirstOrThrow({ where: { projectId: 'RISE' } });
    expect(row).toMatchObject({ status: 'JEV', promptVersion: GREETING_PROMPT_VERSION, day: '2026-09-26' });
    // Consommation enregistrée sur la ligne Insights, source Cockpit.
    expect(await t.db.usageRecord.count({ where: { functionId: 'insights', source: 'COCKPIT', projectId: 'RISE' } })).toBeGreaterThan(0);
  });

  it('réponse refusée (tutoiement, chiffre inventé) : message par règles toute la journée, sans nouvel essai', async () => {
    const spy = live('Salut Pierre, tu as 42 actions en retard.');
    const c = await t.as(WHO.pmo);
    const g = (await c.get(`${R}/today/greeting`).expect(200)).body;
    expect(g).toMatchObject({ source: 'regles', reason: 'tutoiement' });
    expect(g.text).toMatch(/^(Bonjour|Bonne semaine|Bonsoir) /);
    await c.get(`${R}/today/greeting`).expect(200);
    expect(spy).toHaveBeenCalledTimes(1);
    expect((await t.db.todayGreeting.findFirstOrThrow({ where: { status: 'REFUSE' } })).text).toContain('42');
  });

  it('modèle indisponible : message par règles, échec tracé', async () => {
    live(() => Promise.reject(new ApiError(503, 'AI_UNAVAILABLE', 'Aucun modèle disponible pour Insights')));
    const g = (await (await t.as(WHO.respC5)).get(`${R}/today/greeting`).expect(200)).body;
    expect(g).toMatchObject({ source: 'regles', reason: 'Aucun modèle disponible pour Insights' });
    expect(await t.db.todayGreeting.count({ where: { status: 'ECHEC' } })).toBe(1);
  });

  it('module désactivé dans la Console : message par règles, même si Jev a déjà écrit ; modification auditée', async () => {
    const admin = await t.as(WHO.admin);
    expect((await admin.get('/api/admin/modules').expect(200)).body.find((m: any) => m.id === GREETING_MODULE_ID)).toMatchObject({ scope: 'ALL' });
    await admin.patch(`/api/admin/modules/${GREETING_MODULE_ID}`, { scope: 'OFF' }).expect(200);
    const spy = live('ne doit pas être appelé');
    const g = (await (await t.as(WHO.lecteurC3)).get(`${R}/today/greeting`).expect(200)).body;
    expect(g).toMatchObject({ source: 'regles', reason: 'module désactivé' });
    expect(spy).not.toHaveBeenCalled();
    expect(await t.db.auditEntry.count({ where: { entityType: 'Module', entityId: GREETING_MODULE_ID } })).toBeGreaterThan(0);
    await admin.patch(`/api/admin/modules/${GREETING_MODULE_ID}`, { scope: 'ALL' }).expect(200);
    expect((await (await t.as(WHO.lecteurC3)).get(`${R}/today/greeting`).expect(200)).body.source).toBe('jev');
  });

  it('faits limités aux chantiers visibles : un Lecteur ne voit pas les risques des autres chantiers', async () => {
    const svc = t.app.get(TodayGreetingService);
    const facts = async (who: any) => {
      const c = await t.as(who);
      let captured: any = null;
      jest.spyOn(svc, 'facts').mockImplementationOnce(async function (this: TodayGreetingService, ...a: any[]) {
        captured = await (TodayGreetingService.prototype.facts as any).apply(svc, a);
        return captured;
      });
      await c.get(`${R}/today`).expect(200);
      return captured;
    };
    const pmo = await facts(WHO.pmo), lect = await facts(WHO.lecteurC3);
    expect(pmo.criticalRisks.count).toBeGreaterThan(0);
    expect(lect.criticalRisks.count).toBeLessThan(pmo.criticalRisks.count);
  });

  it('consignes modifiées (nouvelle version) : le message du jour est réécrit une fois', async () => {
    const c = await t.as(WHO.director);
    const spy = live('Bonjour Laurent, le COPIL du 26 oct. approche.');
    await c.get(`${R}/today/greeting`).expect(200);
    const row = await t.db.todayGreeting.findFirstOrThrow({ where: { text: 'Bonjour Laurent, le COPIL du 26 oct. approche.' } });
    await t.db.todayGreeting.update({ where: { id: row.id }, data: { promptVersion: 'accueil-v1', text: 'ancien message' } });
    const g = (await c.get(`${R}/today/greeting`).expect(200)).body;
    expect(g).toMatchObject({ source: 'jev', text: 'Bonjour Laurent, le COPIL du 26 oct. approche.' });
    await c.get(`${R}/today/greeting`).expect(200);
    expect(spy).toHaveBeenCalledTimes(2);
    expect((await t.db.todayGreeting.findFirstOrThrow({ where: { accountId: row.accountId, day: '2026-09-26' } })).promptVersion).toBe(GREETING_PROMPT_VERSION);
  });

  it('purge au-delà de 30 jours', async () => {
    await t.db.todayGreeting.create({ data: { accountId: 'u1', projectId: 'RISE', day: '2026-08-01', status: 'JEV', text: 'ancien', promptVersion: GREETING_PROMPT_VERSION, createdAt: new Date('2026-08-01T08:00:00Z') } });
    expect(await t.app.get(TodayGreetingService).purge(new Date('2026-09-26T08:00:00Z'))).toBe(1);
  });
});
