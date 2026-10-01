import { setup, TestCtx, Client, WHO } from '../helpers';
import { encryptSecret } from '../../src/core/crypto';
import { ApiCardsService } from '../../src/admin/api-cards.service';
import { LlmClient } from '../../src/core/llm-client';
import { latencyIdle } from '../../src/core/latency';
import { LatencyService } from '../../src/admin/latency.service';
import { ROUTER_QUESTION_ID } from '../../src/domain/jev-router';
import { FIXTURE_TIMEOUT, latencyFixture } from '../fixtures/latency';

const L = '/api/ai/latency';
const JEV = '/api/admin/assistant/messages';
const Y = '2026-09-25'; // veille de DEMO_TODAY

/**
 * Analyse des temps de traitement (spécification TEMPS) : API, droits, purge, et mesures prises sur les vrais
 * traitements de Jev (aiguillage, formulation, exécution, génération, secours, réponse non servie).
 */
describe('Analyse des temps de traitement', () => {
  let t: TestCtx;
  let admin: Client;
  let pmo: Client;
  let route = 'donnees';

  beforeAll(async () => {
    t = await setup();
    admin = await t.as(WHO.admin);
    pmo = await t.as(WHO.pmo);
    await t.db.apiCard.create({ data: { id: 'jev', name: 'JEV', category: 'Stratégie', endpoint: 'https://api.typesafe.test/v1/systemone', keyEncrypted: encryptSecret('cle-de-test'), keyLast4: 'test', authMode: 'BEARER', method: 'POST', body: JSON.stringify({ model: 'jev-latest', state: 'x', questions: {} }) } });
    t.app.get(ApiCardsService).fetchImpl = (async () => new Response(JSON.stringify({ model: 'jev-1', answers: { [ROUTER_QUESTION_ID]: { type: 'choice', choice: route, confidence: 0.95, probabilities: { [route]: 0.95 } } } }), { status: 200, headers: { 'content-type': 'application/json' } })) as any;
  });
  afterAll(() => t.close());
  beforeEach(() => t.db.stepTiming.deleteMany());

  const load = (days: number) => t.db.stepTiming.createMany({ data: latencyFixture(Y, days) });

  describe('API', () => {
    it('réservée aux administrateurs de la Console (403 sinon)', async () => {
      await pmo.get(`${L}?period=7`).expect(403);
      await pmo.get(`${L}/series?period=7&axis=cat&id=kb_document`).expect(403);
    });

    it('paramètres contrôlés : période, jour (veille au plus tard, 182 jours avant au plus), axe', async () => {
      await admin.get(`${L}?period=2w`).expect(400);
      await admin.get(`${L}?period=d&day=2026-09-26`).expect(400);
      await admin.get(`${L}?period=d&day=2026-03-26`).expect(400);
      await admin.get(`${L}?period=d&day=2026-03-27`).expect(200);
      await admin.get(`${L}/series?period=7&axis=x&id=kb_document`).expect(400);
    });

    it('période sans prompt : aucune catégorie (écran « Aucun traitement sur la période »)', async () => {
      const r = (await admin.get(`${L}?period=7`).expect(200)).body;
      expect(r).toEqual({ period: '7', from: '2026-09-19', to: Y, categories: [], models: {} });
    });

    it('recette 1 à 3 : 7 jours, 6 catégories ; Base de connaissance en 4 étapes dans l’ordre ; erreurs du reclassement', async () => {
      await load(10);
      const r = (await admin.get(`${L}?period=7`).expect(200)).body;
      expect(r).toMatchObject({ period: '7', from: '2026-09-19', to: Y });
      expect(r.categories).toHaveLength(6);
      const kb = r.categories.find((c: any) => c.category === 'kb_document');
      expect(kb.count).toBe(14); // 2 prompts par jour, 7 jours (les 3 jours plus anciens sont hors période)
      expect(kb.steps.map((s: any) => s.step)).toEqual(['route', 'vec', 'rrk', 'gen']);
      expect(kb.e2e.min).toBeLessThanOrEqual(kb.e2e.med);
      expect(kb.e2e.med).toBeLessThanOrEqual(kb.e2e.max);
      const rrk = kb.steps[2].models[0];
      expect(rrk.errors).toEqual([{ type: FIXTURE_TIMEOUT, count: 3, lastAt: expect.any(String) }]);
      // Noms et fournisseurs des modèles cités, « Service RISE » pour les traitements internes.
      expect(r.models.haiku).toEqual({ name: 'Claude Haiku 4.5', provider: 'Anthropic' });
      expect(r.models.svc).toEqual({ name: 'Service RISE', provider: 'Traitement interne', service: true });
    });

    it('recette 4 : Jour — veille par défaut ; le jour précédent change la date et les valeurs', async () => {
      await load(3);
      const a = (await admin.get(`${L}?period=d`).expect(200)).body;
      const b = (await admin.get(`${L}?period=d&day=2026-09-24`).expect(200)).body;
      expect([a.from, a.to, b.from, b.to]).toEqual([Y, Y, '2026-09-24', '2026-09-24']);
      expect(a.categories[0].count).toBe(2);
      expect(a.categories[0].e2e).not.toEqual(b.categories[0].e2e);
      const s = (await admin.get(`${L}/series?period=d&axis=cat&id=kb_document`).expect(200)).body;
      expect(s).toHaveLength(24);
      expect(s.filter((p: any) => p.med !== null).map((p: any) => p.l)).toEqual(['9 h', '13 h']);
    });

    it('recette 5 : par modèle, Claude Haiku 4.5 intervient au Routage et à la Génération, dans les 6 catégories', async () => {
      await load(7);
      const r = (await admin.get(`${L}?period=7`).expect(200)).body;
      const uses = r.categories.flatMap((c: any) => c.steps.filter((s: any) => s.models.some((m: any) => m.model === 'haiku')).map((s: any) => [c.category, s.step]));
      expect([...new Set(uses.map((u: any) => u[1]))].sort()).toEqual(['gen', 'route']);
      expect(new Set(uses.map((u: any) => u[0])).size).toBe(6);
    });

    it('recette 6 : 3 et 6 mois par semaine (13 et 27 points), erreurs placées à leur semaine', async () => {
      await load(183);
      const s3 = (await admin.get(`${L}/series?period=3m&axis=cat&id=kb_document`).expect(200)).body;
      const s6 = (await admin.get(`${L}/series?period=6m&axis=cat&id=kb_document`).expect(200)).body;
      expect(s3).toHaveLength(13);
      expect(s6).toHaveLength(27);
      // Reclassement en erreur un jour sur trois (jours 0, 3, 6… avant la veille) : semaine la plus récente = jours 0 à 6.
      expect(s3[12].err).toBe(3);
      expect(s3[11].err).toBe(2); // jours 9 et 12
      expect(s6.reduce((a: number, p: any) => a + p.err, 0)).toBe(61);
      const mod = (await admin.get(`${L}/series?period=7&axis=mod&id=rerank35`).expect(200)).body;
      expect(mod.reduce((a: number, p: any) => a + p.err, 0)).toBe(3);
    });

    it('purge : lignes de plus de 190 jours supprimées', async () => {
      const old = new Date(Date.now() - 191 * 86_400_000), recent = new Date(Date.now() - 189 * 86_400_000);
      const base = { requestId: 'r', category: 'kb_document', step: 'e2e', model: 'svc', role: 'primary', durationMs: 10 };
      await t.db.stepTiming.createMany({ data: [{ ...base, startedAt: old, endedAt: old }, { ...base, startedAt: recent, endedAt: recent }] });
      await t.app.get(LatencyService).purge(new Date());
      expect(await t.db.stepTiming.count()).toBe(1);
    });
  });

  describe('mesures prises sur les traitements de Jev (Console)', () => {
    type Answer = (body: any) => { status: number; json: unknown };
    const live = (answer: Answer) => {
      const client = t.app.get(LlmClient);
      client.live = true;
      client.fetchImpl = (async (url: string, init: any) => { const a = answer({ url, ...JSON.parse(init.body) }); return new Response(JSON.stringify(a.json), { status: a.status, headers: { 'Content-Type': 'application/json' } }); }) as any;
    };
    const text = (s: string) => ({ status: 200, json: { content: [{ type: 'text', text: s }], usage: { input_tokens: 100, output_tokens: 20 } } });
    const rows = async () => { await latencyIdle(); return t.db.stepTiming.findMany({ orderBy: { id: 'asc' } }); };
    beforeEach(async () => {
      await t.db.provider.updateMany({ where: { id: { in: ['anthropic', 'openai'] } }, data: { status: 'OK' } });
      await t.db.modelAssignment.update({ where: { functionId: 'guidage' }, data: { primaryModelId: 'haiku', fallbackModelId: 'gpt5mini' } });
    });
    afterEach(() => { const c = t.app.get(LlmClient); c.live = false; c.fetchImpl = (...a) => fetch(...a); });

    it('question de données : Routage, Formulation, Exécution, Génération et bout en bout, horodatés au serveur, sans retarder la réponse', async () => {
      route = 'donnees';
      let n = 0;
      live(() => text(n++ === 0 ? '```sql\nSELECT 1 AS n\n```' : 'Il y a **1** élément.'));
      const before = Date.now();
      await admin.post(JEV, { context: { section: 'overview' }, text: 'Combien de comptes ?' }).expect(200);
      const r = await rows();
      expect(r.map((x) => [x.step, x.model, x.role])).toEqual([
        ['route', 'jev-typesafe', 'primary'], ['qry', 'haiku', 'primary'], ['exe', 'svc', 'primary'], ['gen', 'haiku', 'primary'], ['e2e', 'svc', 'primary'],
      ]);
      expect(new Set(r.map((x) => x.category))).toEqual(new Set(['data_console']));
      expect(new Set(r.map((x) => x.requestId)).size).toBe(1);
      const e2e = r[4];
      expect(e2e.startedAt.getTime()).toBeGreaterThanOrEqual(before - 5);
      for (const x of r.slice(0, 4)) {
        expect(x.startedAt.getTime()).toBeGreaterThanOrEqual(e2e.startedAt.getTime());
        expect(x.endedAt.getTime()).toBeLessThanOrEqual(e2e.endedAt.getTime());
        expect(x.durationMs).toBe(x.endedAt.getTime() - x.startedAt.getTime());
      }
      expect(r.every((x) => x.errorType === null)).toBe(true);
    });

    it('réponse directe sans requête : l’appel est une Génération', async () => {
      route = 'donnees';
      live(() => text('Je ne lis pas cette donnée ; ouvrez la page Utilisateurs.'));
      await admin.post(JEV, { context: { section: 'overview' }, text: 'Bonjour' }).expect(200);
      expect((await rows()).map((x) => x.step)).toEqual(['route', 'gen', 'e2e']);
    });

    it('basculement sur le secours : le principal en erreur (sa durée jusqu’à l’échec), puis le secours', async () => {
      route = 'donnees';
      live((b) => (b.url.includes('anthropic') ? { status: 529, json: { error: { message: 'Overloaded' } } } : { status: 200, json: { choices: [{ message: { content: 'Réponse du secours.' } }], usage: { prompt_tokens: 90, completion_tokens: 9 } } }));
      await admin.post(JEV, { context: { section: 'overview' }, text: 'Combien de comptes ?' }).expect(200);
      const r = await rows();
      expect(r.map((x) => [x.step, x.model, x.role, x.errorType])).toEqual([
        ['route', 'jev-typesafe', 'primary', null], ['gen', 'haiku', 'primary', 'Erreur HTTP 529'], ['gen', 'gpt5mini', 'fallback', null], ['e2e', 'svc', 'primary', null],
      ]);
    });

    it('aucune réponse servie : le prompt est en erreur (exclu du bout en bout) ; les étapes gardent leur erreur', async () => {
      route = 'donnees';
      live(() => ({ status: 503, json: { error: { message: 'Overloaded' } } }));
      const res = await admin.post(JEV, { context: { section: 'overview' }, text: 'Combien de comptes ?' }).expect(200);
      expect(res.body.reply).toMatch(/^Je ne peux pas répondre pour l’instant/);
      const r = await rows();
      expect(r.map((x) => [x.step, x.role, x.errorType])).toEqual([
        ['route', 'primary', null], ['qry', 'primary', 'Erreur HTTP 503'], ['qry', 'fallback', 'Erreur HTTP 503'], ['e2e', 'primary', 'Erreur HTTP 503'],
      ]);
      const rep = buildReportOf(r);
      expect(rep.count).toBe(1);
      expect(rep.e2e).toEqual({ med: 0, min: 0, max: 0 });
    });

    it('question d’usage : catégorie « guide_console » ; question hors sujet ou ambiguë : non comptée', async () => {
      live(() => text('Précisez la page.'));
      route = 'usage';
      await admin.post(JEV, { context: { section: 'overview' }, text: 'Comment inviter un utilisateur ?' }).expect(200);
      let r = await rows();
      expect(r.map((x) => x.category)).toEqual(expect.arrayContaining(['guide_console']));
      expect(r[0]).toMatchObject({ step: 'route', model: 'jev-typesafe' });
      await t.db.stepTiming.deleteMany();
      route = 'hors_sujet';
      await admin.post(JEV, { context: { section: 'overview' }, text: 'Qui a gagné le match ?' }).expect(200);
      r = await rows();
      expect(r).toHaveLength(0);
    });
  });
});

/** Catégorie unique du rapport calculé sur des lignes lues en base. */
function buildReportOf(rows: any[]) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { buildLatencyReport } = require('../../src/domain/latency');
  return buildLatencyReport(rows, 'd', Y, Y).categories[0];
}
