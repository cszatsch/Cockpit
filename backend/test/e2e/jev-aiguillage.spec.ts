import { setup, TestCtx, Client, WHO } from '../helpers';
import { encryptSecret } from '../../src/core/crypto';
import { ApiCardsService } from '../../src/admin/api-cards.service';
import { LlmService } from '../../src/core/llm.service';
import { ROUTER_QUESTION_ID } from '../../src/domain/jev-router';
import { DATA_HINT } from '../../src/admin/jev-sql.service';
import { clarifyPrompt, CLARIFY_RULES } from '../../src/domain/jev-rag';

const A = '/api/admin';

/**
 * Aiguillage des questions de Jev (décision du 30/09/2026) : classification par l'API TypeSafe de la carte « JEV » du
 * Registre (simulée ici : aucun appel réseau), traitement selon le type, repli sur erreur, trace de chaque classification.
 */
describe('Console — aiguillage des questions de Jev', () => {
  let t: TestCtx;
  let admin: Client;
  let cards: ApiCardsService;
  let reply: { status: number; body: unknown } | 'timeout';
  let sent: any[];

  beforeAll(async () => {
    t = await setup();
    admin = await t.as(WHO.admin);
    cards = t.app.get(ApiCardsService);
    sent = [];
    cards.fetchImpl = (async (url: string, init: any) => {
      sent.push({ url, auth: init.headers.Authorization, body: JSON.parse(init.body) });
      if (reply === 'timeout') { const e = new Error('délai'); e.name = 'TimeoutError'; throw e; }
      return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { 'content-type': 'application/json' } });
    }) as any;
  });
  afterAll(() => t.close());

  const choice = (c: string, confidence: number) => ({ status: 200, body: { model: 'jev-1.13.0', answers: { [ROUTER_QUESTION_ID]: { type: 'choice', choice: c, confidence, probabilities: { [c]: confidence } } } } });
  const ask = (text: string, conversationId?: string) => admin.post(`${A}/assistant/messages`, { context: { section: 'users' }, text, ...(conversationId ? { conversationId } : {}) }).expect(200);

  it('sans carte JEV dans le Registre : repli sur le traitement complet, motif tracé', async () => {
    const r = await ask('Combien de comptes sont suspendus ?');
    expect(r.body.route).toBe('AMBIGU');
    expect(await t.db.jevClassification.findFirst({ orderBy: { at: 'desc' } })).toMatchObject({ status: 'NOT_CONFIGURED', type: 'AMBIGU', error: expect.stringMatching(/absente du Registre/) });
    expect(sent).toHaveLength(0);
  });

  it('carte JEV du Registre : endpoint, clé (Bearer) et modèle lus dans la carte ; hors sujet → clarification par la fonction Guidage', async () => {
    await t.db.apiCard.create({ data: { id: 'jev', name: 'JEV', category: 'Stratégie', endpoint: 'https://api.typesafe.test/v1/systemone', keyEncrypted: encryptSecret('cle-de-test-typesafe'), keyLast4: 'safe', authMode: 'BEARER', method: 'POST', body: JSON.stringify({ model: 'jev-latest', state: 'x', questions: {} }) } });
    reply = choice('hors_sujet', 0.97);
    const llm = jest.spyOn(t.app.get(LlmService), 'complete');
    const r = await ask('Quelle est la capitale de l’Australie ?');
    expect(r.body).toMatchObject({ route: 'HORS_SUJET', treatment: 'CLARIFICATION', sources: [] });
    expect(llm).toHaveBeenCalledTimes(1);
    expect(llm.mock.calls[0][0]).toMatchObject({ functionId: 'guidage', prompt: clarifyPrompt('Quelle est la capitale de l’Australie ?', 'HORS_SUJET') });
    expect(llm.mock.calls[0][0].system).toContain(CLARIFY_RULES);
    llm.mockRestore();
    expect(sent[0]).toMatchObject({ url: 'https://api.typesafe.test/v1/systemone', auth: 'Bearer cle-de-test-typesafe', body: { model: 'jev-latest', state: { latest_question: 'Quelle est la capitale de l’Australie ?', open_page: 'Utilisateurs' } } });
    expect(await t.db.jevClassification.findFirst({ orderBy: { at: 'desc' } })).toMatchObject({ status: 'OK', type: 'HORS_SUJET', confidence: 0.97, promptVersion: 'v2', model: 'jev-latest', source: 'LIVE', accountId: expect.any(String), conversationId: r.body.conversationId });
    expect(await t.db.apiCardCall.count({ where: { cardId: 'jev', source: 'JEV' } })).toBe(1);
  });

  it('USAGE sans guide indexé : clarification, motif tracé ; DONNÉES : requête orientée', async () => {
    const llm = jest.spyOn(t.app.get(LlmService), 'complete');
    reply = choice('usage', 0.95);
    const u = await ask('Comment inviter un utilisateur ?');
    expect(u.body).toMatchObject({ route: 'USAGE', treatment: 'CLARIFICATION' });
    expect(llm.mock.calls[0][0].prompt).toBe(clarifyPrompt('Comment inviter un utilisateur ?', 'GUIDE_NON_INDEXE'));
    expect(await t.db.jevAnswerLog.findFirst({ where: { conversationId: u.body.conversationId } })).toMatchObject({ route: 'USAGE', treatment: 'CLARIFICATION', reason: 'GUIDE_NON_INDEXE' });
    reply = choice('donnees', 0.92);
    const d = await ask('Combien de comptes sont suspendus ?', u.body.conversationId);
    expect(d.body.route).toBe('DONNEES');
    expect(llm.mock.calls[1][0].system).toContain(DATA_HINT);
    llm.mockRestore();
    // Question de suite : la question précédente de la conversation accompagne la nouvelle.
    reply = choice('donnees', 0.9);
    await ask('Et invités ?', u.body.conversationId);
    expect(sent[sent.length - 1].body.state.previous_questions).toEqual(['Comment inviter un utilisateur ?', 'Combien de comptes sont suspendus ?']);
  });

  it('erreurs de l’API : délai dépassé, HTTP 500, réponse illisible, carte désactivée → repli (traitement complet), motif tracé', async () => {
    const last = () => t.db.jevClassification.findFirst({ orderBy: { at: 'desc' } });
    reply = 'timeout';
    expect((await ask('Qui est PMO ?')).body.route).toBe('AMBIGU');
    expect(await last()).toMatchObject({ status: 'TIMEOUT' });
    reply = { status: 500, body: { error: 'panne' } };
    await ask('Qui est PMO ?');
    expect(await last()).toMatchObject({ status: 'ERROR', error: expect.stringContaining('HTTP 500') });
    reply = { status: 200, body: { answers: {} } };
    await ask('Qui est PMO ?');
    expect(await last()).toMatchObject({ status: 'INVALID' });
    await t.db.apiCard.update({ where: { id: 'jev' }, data: { enabled: false } });
    await ask('Qui est PMO ?');
    expect(await last()).toMatchObject({ status: 'NOT_CONFIGURED', error: 'Carte JEV désactivée' });
  });
});
