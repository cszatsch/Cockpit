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
      return new Response(JSON.stringify({ model: 'jev-1.13.0', answers: { [qid]: { type: 'choice', choice: next, confidence: 0.95, probabilities: { [next]: 0.95 } } } }), { status: 200, headers: { 'content-type': 'application/json' } });
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

  it('question depuis le Cockpit : uniquement le guide du Cockpit, avec les réglages du Cockpit ; rédaction par la Synthèse', async () => {
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
    const call = llm.mock.calls.find((c) => c[0].functionId === 'doc_syn')![0];
    expect(call.system).toContain(guideAnswerRules('cockpit'));
    expect(call.systemTail).toMatch(/## Extraits du guide utilisateur/);
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
});
