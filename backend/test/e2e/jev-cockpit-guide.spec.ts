import request from 'supertest';
import { setup, TestCtx, Client, WHO } from '../helpers';
import { cockpitGuidePdf, guidePdf } from '../pdf-fixture';
import { encryptSecret } from '../../src/core/crypto';
import { ApiCardsService } from '../../src/admin/api-cards.service';
import { GuideIndexService } from '../../src/admin/guide-index.service';
import { guideMissingReply } from '../../src/admin/guide-answer.service';
import { LlmService } from '../../src/core/llm.service';
import { ROUTER_QUESTION_ID } from '../../src/domain/jev-router';
import { COCKPIT_Q_CASE } from '../../src/domain/jev-router-cockpit';
import { guideAnswerRules } from '../../src/domain/jev-rag';

const A = '/api/admin';
const C = '/api/projects/RISE/assistant/messages';
const COCKPIT_HEADINGS = /Pilotage du projet|Créer une action de pilotage|Jalons non confirmés|Base de connaissance|Déposer un document|Guide utilisateur du Cockpit/;
const CONSOLE_HEADINGS = /Comptes et accès|Inviter un utilisateur|Relancer une invitation|Suspendre un compte|Notifications|Règle de rattrapage|Historique des envois|Guide utilisateur de test/;

/**
 * Jev et le guide de chaque application (décision du 30/09/2026) : une question posée depuis le Cockpit n'interroge que
 * le guide du Cockpit, avec ses réglages ; depuis la Console, que le guide de la Console. Sans guide publié, Jev ne
 * répond pas aux questions d'usage de l'application (message fixe, sans modèle).
 */
describe('Jev — guide de l’application d’où vient la question', () => {
  let t: TestCtx;
  let admin: Client;
  let pmo: Client;
  let next: string;
  let nextConf = 0.95;
  let nextWrite: number | null = null;
  let sent: any[];
  let token: string;

  beforeAll(async () => {
    t = await setup();
    admin = await t.as(WHO.admin);
    pmo = await t.as(WHO.pmo);
    token = await t.token(WHO.admin);
    sent = [];
    await t.db.apiCard.create({ data: { id: 'jev', name: 'JEV', category: 'Stratégie', endpoint: 'https://api.typesafe.test/v1/systemone', keyEncrypted: encryptSecret('cle-de-test'), keyLast4: 'test', authMode: 'BEARER', method: 'POST', body: JSON.stringify({ model: 'jev-latest', state: 'x', questions: {} }) } });
    t.app.get(ApiCardsService).fetchImpl = (async (_url: string, init: any) => {
      const req = JSON.parse(init.body);
      sent.push(req);
      // Cockpit : question « cas_usage » (5 cas) ; Console : question « type_question ».
      const qid = req.questions[COCKPIT_Q_CASE] ? COCKPIT_Q_CASE : ROUTER_QUESTION_ID;
      return new Response(JSON.stringify({ model: 'jev-1.13.0', answers: { [qid]: { type: 'choice', choice: next, confidence: nextConf, probabilities: { [next]: nextConf } }, ...(nextWrite === null ? {} : { demande_ecriture: { type: 'noul', noul: nextWrite } }) } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as any;
  });
  afterAll(() => t.close());

  const deposit = async (app: string, buf: Buffer) => {
    await request(t.app.getHttpServer()).post(`${A}/guides/${app}`).set('Authorization', `Bearer ${token}`).attach('file', buf, { filename: 'Guide.pdf', contentType: 'application/pdf' }).expect(202);
    await t.app.get(GuideIndexService).idle();
  };
  const askCockpit = (text: string, type = 'guide') => { next = type; return pmo.post(C, { context: { space: 'pilotage', tab: 'actions' }, text }).expect(200); };

  it('Cockpit sans guide publié : Jev le dit, sans appeler de modèle ; périmètre du Cockpit transmis à l’aiguillage', async () => {
    const llm = jest.spyOn(t.app.get(LlmService), 'complete');
    const r = await askCockpit('Comment créer une action de pilotage ?');
    expect(r.body).toMatchObject({ reply: guideMissingReply('cockpit'), sources: [], route: '2', guide: 'NO_GUIDE' });
    expect(llm).not.toHaveBeenCalled();
    llm.mockRestore();
    expect(sent[sent.length - 1].state.assistant_scope).toMatch(/^RISE Cockpit/);
    expect(sent[sent.length - 1].state.open_page).toBe('pilotage › actions');
  });

  it('guide de la Console seul publié : le Cockpit ne s’en sert pas', async () => {
    await deposit('console', guidePdf('A'));
    const r = await askCockpit('Comment inviter un utilisateur ?');
    expect(r.body).toMatchObject({ reply: guideMissingReply('cockpit'), sources: [] });
  });

  it('question depuis le Cockpit : uniquement le guide du Cockpit, avec les réglages du Cockpit ; rédaction par le Guidage, skill « Guidage Cockpit » seule', async () => {
    await t.db.skill.createMany({ data: [
      { n: 'Guidage Cockpit', t: '## Objectif\nGuider l’utilisateur du Cockpit.', on: true, position: 90, updatedBy: 'Test' },
      { n: 'Insights', t: '## Objectif\nAnalyser les données.', on: true, position: 91, updatedBy: 'Test' },
    ] });
    await deposit('cockpit', cockpitGuidePdf('A'));
    // Réglages propres au Cockpit (seuil à 0 : similarités des vecteurs simulés ; 2 extraits conservés).
    await admin.put(`${A}/guides/cockpit/settings`, { k: 8, keep: 2, thr: 0, tv: 10, tr: 8, tw: 30 }).expect(200);
    const llm = jest.spyOn(t.app.get(LlmService), 'complete');
    const rr = jest.spyOn(t.app.get(LlmService), 'rerankTexts');
    const r = await askCockpit('Comment créer une action de pilotage ?');
    expect(r.body).toMatchObject({ route: '2', guide: 'ANSWERED', proposedChanges: [] });
    expect(r.body.sources.length).toBeGreaterThan(0);
    for (const s of r.body.sources) {
      expect(s).toMatchObject({ entityType: 'GUIDE', label: expect.stringMatching(/^Guide · .+ · p\. \d/) });
      expect(s.label).toMatch(COCKPIT_HEADINGS);
      expect(s.label).not.toMatch(CONSOLE_HEADINGS);
    }
    expect(rr.mock.calls[0][2]).toBe(2);
    const call = llm.mock.calls.find((c) => c[0].functionId === 'guidage')![0];
    expect(llm.mock.calls.some((c) => c[0].functionId === 'doc_syn')).toBe(false);
    expect(call.system).toContain(guideAnswerRules('cockpit'));
    expect(call.system).toContain('## Skill : Guidage Cockpit');
    expect(call.system).not.toContain('## Skill : Insights');
    expect(call.cache).toBe(true);
    expect(call.systemTail).toMatch(/Écran ouvert du Cockpit : pilotage › actions[\s\S]*## Extraits du guide utilisateur/);
    expect(call.systemTail).not.toMatch(CONSOLE_HEADINGS);
    llm.mockRestore(); rr.mockRestore();
  });

  it('question depuis la Console : uniquement le guide de la Console', async () => {
    await admin.put(`${A}/guides/console/settings`, { k: 8, keep: 4, thr: 0, tv: 10, tr: 8, tw: 30 }).expect(200);
    next = 'usage';
    const r = await admin.post(`${A}/assistant/messages`, { context: { section: 'users' }, text: 'Comment créer une action de pilotage ?' }).expect(200);
    expect(r.body).toMatchObject({ route: 'USAGE', treatment: 'GUIDE' });
    for (const s of r.body.sources) expect(s).not.toMatch(COCKPIT_HEADINGS);
    expect(sent[sent.length - 1].state.assistant_scope).toMatch(/^Console d’administration/);
  });

  it('question de données dans le Cockpit : traitement habituel, sans le guide', async () => {
    const r = await askCockpit('Quels risques sont critiques ?', 'donnees');
    expect(r.body.route).toBe('1');
    expect((r.body.sources || []).every((s: any) => s.entityType !== 'GUIDE')).toBe(true);
  });

  it('vectorisation lente ou en panne : seconde tentative ; échec persistant → incident à la Console, fermé au succès suivant', async () => {
    const llm = t.app.get(LlmService);
    const real = llm.embedWithModel.bind(llm);
    const timeouts: number[] = [];
    let fail = 1;
    const spy = jest.spyOn(llm, 'embedWithModel').mockImplementation(async (...args: any[]) => {
      timeouts.push(args[4]?.timeoutMs);
      if (fail-- > 0) throw new Error('Délai dépassé');
      return (real as any)(...args);
    });
    // Une défaillance : rattrapée par la seconde tentative, avec un délai plus long.
    let r = await askCockpit('Comment créer une action de pilotage ?');
    expect(r.body).toMatchObject({ route: '2', guide: 'ANSWERED' });
    expect(timeouts[1]).toBeGreaterThanOrEqual(25_000);
    // Deux défaillances : réponse « indisponible » et incident dans les notifications de l'administrateur.
    fail = 2;
    r = await askCockpit('Comment créer une action de pilotage ?');
    expect(r.body).toMatchObject({ route: '2', guide: 'UNAVAILABLE' });
    const key = 'tech:JEV Cockpit · recherche dans le guide';
    await new Promise((res) => setTimeout(res, 50));
    expect(await t.db.notification.findUnique({ where: { key } })).toMatchObject({ kind: 'ERR', status: 'OPEN', text: expect.stringMatching(/vectorisation de la question impossible/) });
    // Recherche réussie : incident fermé.
    fail = 0;
    await askCockpit('Comment créer une action de pilotage ?');
    await new Promise((res) => setTimeout(res, 50));
    expect((await t.db.notification.findUnique({ where: { key } }))!.status).toBe('RESOLVED');
    spy.mockRestore();
  });

  describe('cas 5 — clarification par le modèle Guidage', () => {
    afterEach(() => { nextConf = 0.95; nextWrite = null; });
    const clarify = async (text: string) => {
      const llm = jest.spyOn(t.app.get(LlmService), 'complete');
      const r = await pmo.post(C, { context: { space: 'pilotage', tab: 'risques' }, text }).expect(200);
      const call = llm.mock.calls.find((c) => c[0].functionId === 'guidage')?.[0];
      llm.mockRestore();
      return { body: r.body, call };
    };

    it('question ambiguë : demande de précision rédigée par Guidage, sans proposition ni source, modèle tracé', async () => {
      next = 'clarification';
      const { body, call } = await clarify('planning ?');
      expect(body).toMatchObject({ route: '5', reason: 'AMBIGU', sources: [], proposedChanges: [] });
      expect(typeof body.reply).toBe('string');
      expect(call!.prompt).toMatch(/^Génère une réponse à cette demande qui nécessite une clarification de l’utilisateur :\nplanning \?/);
      expect(call!.system).toMatch(/## Demander une précision/);
      expect(call!.cache).toBe(true);
      expect(call!.systemTail).toMatch(/Écran ouvert du Cockpit : pilotage › risques/);
      const trace = await t.db.jevClassification.findFirst({ where: { app: 'cockpit', question: 'planning ?' }, orderBy: { at: 'desc' } });
      expect(trace).toMatchObject({ type: '5', choice: 'clarification' });
    });

    it('hors sujet : rappel du périmètre', async () => {
      next = 'hors_sujet';
      const { body, call } = await clarify('Quelle est la capitale du Pérou ?');
      expect(body).toMatchObject({ route: '5', reason: 'HORS_SUJET' });
      expect(call!.prompt).toMatch(/sans rapport avec le Cockpit/);
    });

    it('écriture incertaine (sous le seuil d’écriture) : confirmation demandée, aucune proposition enregistrée', async () => {
      next = 'modification'; nextConf = 0.7; nextWrite = 0.9;
      const before = await t.db.assistantChange.count();
      const { body, call } = await clarify('Note que la décision D-005 est arbitrée.');
      expect(body).toMatchObject({ route: '5', reason: 'ECRITURE', proposedChanges: [] });
      expect(call!.prompt).toMatch(/confirmer ce qu’il veut enregistrer/);
      expect(await t.db.assistantChange.count()).toBe(before);
    });

    it('confiance insuffisante : la piste probable est donnée au modèle', async () => {
      next = 'donnees_et_documents'; nextConf = 0.3;
      const { body, call } = await clarify('les jalons du kick off ?');
      expect(body).toMatchObject({ route: '5', reason: 'CONFIANCE' });
      expect(call!.prompt).toMatch(/données \+ documents/);
    });
  });
});
