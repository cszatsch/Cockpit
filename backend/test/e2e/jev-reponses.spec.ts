import request from 'supertest';
import { setup, TestCtx, Client, WHO } from '../helpers';
import { guidePdf } from '../pdf-fixture';
import { encryptSecret } from '../../src/core/crypto';
import { ApiError } from '../../src/core/errors';
import { ApiCardsService } from '../../src/admin/api-cards.service';
import { GuideIndexService } from '../../src/admin/guide-index.service';
import { LlmService } from '../../src/core/llm.service';
import { ROUTER_QUESTION_ID } from '../../src/domain/jev-router';
import { DATA_HINT } from '../../src/admin/jev-sql.service';
import { clarifyPrompt, GUIDE_ANSWER_RULES, RAG_DEFAULTS, REFORMULATE_SYSTEM } from '../../src/domain/jev-rag';

const A = '/api/admin';

/**
 * Réponses de Jev après l'aiguillage (décision du 30/09/2026) : USAGE → recherche dans le guide (vectorisation,
 * pgvector, seuil, reclassement ou repli) et rédaction par la fonction Synthèse avec sources (section, page) ;
 * DONNÉES → requête SQL ; AMBIGU, HORS_SUJET ou aucun extrait → clarification. Mémoire commune et journal technique.
 * Hors ligne : vectorisation et reclassement simulés (aucun appel réseau), API de JEV simulée.
 */
describe('Console — réponses de Jev (guide, données, clarification)', () => {
  let t: TestCtx;
  let admin: Client;
  let llm: LlmService;
  let next: string;

  beforeAll(async () => {
    t = await setup();
    admin = await t.as(WHO.admin);
    llm = t.app.get(LlmService);
    // Carte JEV du Registre, réponse de l'API choisie par chaque test.
    await t.db.apiCard.create({ data: { id: 'jev', name: 'JEV', category: 'Stratégie', endpoint: 'https://api.typesafe.test/v1/systemone', keyEncrypted: encryptSecret('cle-de-test'), keyLast4: 'test', authMode: 'BEARER', method: 'POST', body: JSON.stringify({ model: 'jev-latest', state: 'x', questions: {} }) } });
    t.app.get(ApiCardsService).fetchImpl = (async () => new Response(JSON.stringify({ model: 'jev-1.13.0', answers: { [ROUTER_QUESTION_ID]: { type: 'choice', choice: next, confidence: 0.95, probabilities: { [next]: 0.95 } } } }), { status: 200, headers: { 'content-type': 'application/json' } })) as any;
    // Guide indexé (vectorisation simulée).
    const token = await t.token(WHO.admin);
    await request(t.app.getHttpServer()).post(`${A}/guides/console`).set('Authorization', `Bearer ${token}`).attach('file', guidePdf('A'), { filename: 'Guide.pdf', contentType: 'application/pdf' }).expect(202);
    await t.app.get(GuideIndexService).idle();
    // Seuil à 0 : la similarité des vecteurs simulés n'a pas de sens ; le seuil est testé à part.
    await admin.put(`${A}/guides/console/settings`, { k: 8, keep: 4, thr: 0, tv: 10, tr: 8, tw: 30 }).expect(200);
  });
  afterAll(() => t.close());

  const ask = (type: string, text: string, conversationId?: string) => {
    next = type;
    return admin.post(`${A}/assistant/messages`, { context: { section: 'users' }, text, ...(conversationId ? { conversationId } : {}) }).expect(200);
  };
  // Date figée dans les tests : le journal est retrouvé par conversation (et question).
  const lastLog = (conversationId: string, question?: string) => t.db.jevAnswerLog.findFirst({ where: { conversationId, ...(question ? { question } : {}) } });

  it('réglages de la Console : seuil enregistré, les réglages du Cockpit restent par défaut (tests détaillés : guide.spec)', async () => {
    const r = (await admin.get(`${A}/guides/console`).expect(200)).body;
    expect(r.settings).toEqual({ k: 8, keep: 4, thr: 0, tv: 10, tr: 8, tw: 30 });
    expect((await admin.get(`${A}/guides/cockpit`).expect(200)).body.settings).toEqual({ k: 8, keep: 4, thr: 0.58, tv: 10, tr: 8, tw: 30 });
  });

  it('USAGE : extraits du guide reclassés, rédaction par la fonction Synthèse (règles en cache, extraits ensuite), sources section et page', async () => {
    const spy = jest.spyOn(llm, 'complete');
    const rr = jest.spyOn(llm, 'rerankTexts');
    const r = await ask('usage', 'Combien de temps le lien d’invitation est-il valable ?');
    expect(r.body).toMatchObject({ route: 'USAGE', treatment: 'GUIDE', ai: { functionId: 'doc_syn' } });
    expect(r.body.sources.length).toBeGreaterThan(0);
    expect(r.body.sources.length).toBeLessThanOrEqual(4);
    for (const s of r.body.sources) expect(s).toMatch(/^Guide · .+ · p\. \d+(-\d+)?$/);
    expect(r.body.sources[0]).toMatch(/Inviter un utilisateur/);
    // Un seul appel : pas de reformulation sans historique.
    expect(spy).toHaveBeenCalledTimes(1);
    const c = spy.mock.calls[0][0];
    expect(c).toMatchObject({ functionId: 'doc_syn', cache: true });
    expect(c.system).toContain(GUIDE_ANSWER_RULES);
    expect(c.system).not.toContain('## Extraits du guide utilisateur');
    expect(c.systemTail).toMatch(/## Extraits du guide utilisateur\n\n### Extrait 1 · .+ · p\. \d/);
    expect(c.systemTail).toContain('quatorze jours A');
    expect(rr).toHaveBeenCalledWith(expect.any(String), expect.any(Array), 4, 'JEV', RAG_DEFAULTS.rerankTimeoutMs);
    spy.mockRestore(); rr.mockRestore();
    const log = await lastLog(r.body.conversationId);
    expect(log).toMatchObject({ route: 'USAGE', treatment: 'GUIDE', reranker: expect.any(String), rerankFallback: null, model: r.body.ai.modelId, error: null, conversationId: r.body.conversationId, classificationId: expect.any(String) });
    const ex = log!.extracts as any;
    expect(ex.candidates).toHaveLength(await t.db.guideChunk.count()); // 8 au plus : le guide de test en a moins
    expect(ex.candidates[0]).toMatchObject({ pages: expect.stringMatching(/^p\. \d/) });
    expect(ex.kept[0]).toMatchObject({ heading: expect.any(String), pages: expect.stringMatching(/^p\. /), similarity: expect.any(Number), rerankScore: expect.any(Number) });
    expect(log!.timings).toMatchObject({ embedMs: expect.any(Number), searchMs: expect.any(Number), rerankMs: expect.any(Number), answerMs: expect.any(Number) });
    // Mémoire : question (type USAGE), réponse et sources gardées.
    const msgs = await t.db.jevMessage.findMany({ where: { conversationId: r.body.conversationId }, orderBy: { seq: 'asc' } });
    expect(msgs.map((m) => [m.role, m.route])).toEqual([['user', 'USAGE'], ['assistant', 'USAGE']]);
    expect(msgs[1].sources).toEqual(r.body.sources);
  });

  it('reclassement en panne : les 4 premiers extraits de la recherche, incident tracé', async () => {
    const rr = jest.spyOn(llm, 'rerankTexts').mockRejectedValue(new ApiError(503, 'AI_UNAVAILABLE', 'Reclassement indisponible : Voyage rerank hors service'));
    const r = await ask('usage', 'Comment suspendre un compte ?');
    rr.mockRestore();
    expect(r.body).toMatchObject({ route: 'USAGE', treatment: 'GUIDE' });
    const log = await lastLog(r.body.conversationId);
    expect(log).toMatchObject({ treatment: 'GUIDE', reranker: null, rerankFallback: expect.stringContaining('Voyage rerank hors service') });
    const ex = log!.extracts as any;
    expect(ex.kept.map((k: any) => k.id)).toEqual(ex.candidates.slice(0, 4).map((c: any) => c.id));
    expect(ex.kept.every((k: any) => k.rerankScore === null)).toBe(true);
  });

  it('aucun extrait au-dessus du seuil : pas de rédaction à vide, clarification (motif tracé)', async () => {
    await admin.put(`${A}/guides/console/settings`, { k: 8, keep: 4, thr: 0.95, tv: 10, tr: 8, tw: 30 }).expect(200);
    const spy = jest.spyOn(llm, 'complete');
    const rr = jest.spyOn(llm, 'rerankTexts');
    const r = await ask('usage', 'Comment changer la couleur du logo ?');
    expect(r.body).toMatchObject({ route: 'USAGE', treatment: 'CLARIFICATION', sources: [], ai: { functionId: 'guidage' } });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].functionId).toBe('guidage');
    expect(spy.mock.calls[0][0].prompt).toBe(clarifyPrompt('Comment changer la couleur du logo ?', 'AUCUN_EXTRAIT'));
    expect(rr).not.toHaveBeenCalled();
    spy.mockRestore(); rr.mockRestore();
    expect(await lastLog(r.body.conversationId)).toMatchObject({ treatment: 'CLARIFICATION', reason: 'AUCUN_EXTRAIT', extracts: { kept: [], candidates: expect.any(Array) } });
    await admin.put(`${A}/guides/console/settings`, { k: 8, keep: 4, thr: 0, tv: 10, tr: 8, tw: 30 }).expect(200);
  });

  it('conversation : suite après USAGE (reformulée), suite après DONNÉES (« Et le mois dernier ? »), changement de type ; mémoire commune', async () => {
    const spy = jest.spyOn(llm, 'complete');
    const u = await ask('usage', 'Comment inviter un utilisateur ?');
    const conv = u.body.conversationId;
    spy.mockClear();
    // Suite d'une question d'usage : reformulée avec l'historique avant la recherche.
    const u2 = await ask('usage', 'Et pour le relancer ?', conv);
    expect(u2.body).toMatchObject({ route: 'USAGE', treatment: 'GUIDE' });
    expect(spy.mock.calls[0][0]).toMatchObject({ functionId: 'guidage', system: REFORMULATE_SYSTEM, prompt: 'Dernière question : Et pour le relancer ?' });
    expect(spy.mock.calls[0][0].history!.map((h) => h.content)).toContain('Comment inviter un utilisateur ?');
    expect(spy.mock.calls[1][0].functionId).toBe('doc_syn');
    expect((await lastLog(conv, 'Et pour le relancer ?'))!.reformulated).toEqual(expect.any(String));
    // Changement de type : question de données dans la même conversation, historique d'usage compris.
    spy.mockClear();
    const d = await ask('donnees', 'Combien d’appels d’IA ce mois-ci ?', conv);
    expect(d.body).toMatchObject({ route: 'DONNEES', treatment: 'DONNEES' });
    expect(spy.mock.calls[0][0].system).toContain(DATA_HINT);
    expect(spy.mock.calls[0][0].history!.map((h) => h.content)).toEqual(expect.arrayContaining(['Comment inviter un utilisateur ?', 'Et pour le relancer ?']));
    // Suite d'une question de données : l'échange précédent accompagne l'appel.
    spy.mockClear();
    const d2 = await ask('donnees', 'Et le mois dernier ?', conv);
    expect(d2.body.route).toBe('DONNEES');
    expect(spy.mock.calls[0][0].history!.map((h) => h.content)).toContain('Combien d’appels d’IA ce mois-ci ?');
    // Retour à une clarification : l'historique complet est transmis.
    spy.mockClear();
    const a = await ask('mixte', 'Et ça ?', conv);
    expect(a.body).toMatchObject({ route: 'AMBIGU', treatment: 'CLARIFICATION' });
    expect(spy.mock.calls[0][0].history!.map((h) => h.content)).toContain('Et le mois dernier ?');
    spy.mockRestore();
    // Mémoire commune : chaque question et sa réponse, avec leur type, quel que soit le traitement.
    const msgs = await t.db.jevMessage.findMany({ where: { conversationId: conv, role: 'user' }, orderBy: { seq: 'asc' } });
    expect(msgs.map((m) => [m.text, m.route])).toEqual([
      ['Comment inviter un utilisateur ?', 'USAGE'], ['Et pour le relancer ?', 'USAGE'], ['Combien d’appels d’IA ce mois-ci ?', 'DONNEES'], ['Et le mois dernier ?', 'DONNEES'], ['Et ça ?', 'AMBIGU'],
    ]);
    expect(msgs[1].reformulated).toEqual(expect.any(String));
    expect(await t.db.jevMessage.count({ where: { conversationId: conv, role: 'assistant' } })).toBe(5);
    // Relecture de la conversation : les sources du guide sont restituées.
    const cur = (await admin.get(`${A}/assistant/conversations/current`).expect(200)).body;
    expect(cur.messages.find((m: any) => m.role === 'assistant').sources[0]).toMatch(/^Guide · /);
  });

  it('modèle de rédaction indisponible : message d’indisponibilité, erreur tracée, échange non gardé', async () => {
    const spy = jest.spyOn(llm, 'complete').mockRejectedValue(new ApiError(503, 'AI_UNAVAILABLE', 'Synthèse indisponible'));
    const r = await ask('usage', 'Comment inviter un utilisateur ?');
    spy.mockRestore();
    expect(r.body).toMatchObject({ treatment: 'ERREUR', unavailable: 'Synthèse indisponible', reply: expect.stringMatching(/^Je ne peux pas répondre pour l’instant/) });
    expect(await lastLog(r.body.conversationId)).toMatchObject({ treatment: 'ERREUR', error: 'Synthèse indisponible' });
    expect(await t.db.jevMessage.count({ where: { conversationId: r.body.conversationId } })).toBe(0);
  });
});
