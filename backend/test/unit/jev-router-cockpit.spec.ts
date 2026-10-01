import {
  buildCockpitRouterRequest, COCKPIT_CASE_ROUTE, COCKPIT_Q_CASE, COCKPIT_Q_MULTI, COCKPIT_Q_WRITE, COCKPIT_ROUTER_PROMPTS, CockpitRouterResponseError, parseCockpitRouterResponse,
} from '../../src/domain/jev-router-cockpit';

const reply = (choice: string, confidence: number, extra: { w?: number; m?: number; probs?: Record<string, number> } = {}) => ({
  model: 'jev-1.13.0',
  answers: {
    [COCKPIT_Q_CASE]: { type: 'choice', choice, confidence, probabilities: extra.probs ?? { [choice]: confidence } },
    ...(extra.w !== undefined ? { [COCKPIT_Q_WRITE]: { type: 'noul', noul: extra.w } } : {}),
    ...(extra.m !== undefined ? { [COCKPIT_Q_MULTI]: { type: 'noul', noul: extra.m } } : {}),
  },
});

describe('Aiguillage de Jev dans le Cockpit : 5 cas d’usage', () => {
  it('requête : une question « choice » à 7 options et deux questions oui / non, périmètre et page transmis', () => {
    const r = buildCockpitRouterRequest('Quand a lieu le prochain COPIL ?', { model: 'jev-latest', page: 'pilotage › seances', history: [{ question: 'a' }, { question: 'b' }, { question: 'c' }, { question: 'd' }] });
    expect(r.model).toBe('jev-latest');
    expect(r.state.latest_question).toBe('Quand a lieu le prochain COPIL ?');
    expect(r.state.open_page).toBe('pilotage › seances');
    expect(r.state.previous_questions).toEqual(['b', 'c', 'd']);
    expect(Object.keys((r.questions as any)[COCKPIT_Q_CASE].criteria)).toEqual(['donnees', 'guide', 'modification', 'document', 'donnees_et_documents', 'clarification', 'hors_sujet']);
    expect((r.questions as any)[COCKPIT_Q_WRITE].type).toBe('noul');
    expect((r.questions as any)[COCKPIT_Q_MULTI].type).toBe('noul');
  });

  it('les exemples des consignes ne reprennent aucune question du jeu de test', () => {
    const qs: string[] = require('../fixtures/jev-routage-cockpit.json').questions.map((q: any) => q.question.toLowerCase());
    const ex = Object.values(COCKPIT_ROUTER_PROMPTS).flatMap((p) => Object.values(p.criteria).flatMap((c: any) => c.examples ?? []));
    for (const e of ex) expect(qs).not.toContain(String(e).toLowerCase());
  });

  it('cas, modèle et skill : chaque option a son cas', () => {
    expect(parseCockpitRouterResponse(reply('donnees', 0.9)).cas).toBe('1');
    expect(parseCockpitRouterResponse(reply('guide', 0.9)).cas).toBe('2');
    expect(parseCockpitRouterResponse(reply('modification', 0.9, { w: 0.9 })).cas).toBe('3');
    expect(parseCockpitRouterResponse(reply('document', 0.9)).cas).toBe('4a');
    expect(parseCockpitRouterResponse(reply('donnees_et_documents', 0.9)).cas).toBe('4b');
    expect(parseCockpitRouterResponse(reply('clarification', 0.9)).cas).toBe('5');
    expect(parseCockpitRouterResponse(reply('hors_sujet', 0.9)).cas).toBe('5');
    expect(COCKPIT_CASE_ROUTE['1']).toEqual({ functionId: 'insights', skill: 'Insights' });
    expect(COCKPIT_CASE_ROUTE['2']).toEqual({ functionId: 'guidage', skill: 'Guidage Cockpit' });
    expect(COCKPIT_CASE_ROUTE['3']).toEqual({ functionId: 'crud', skill: 'Gestion des données' });
    expect(COCKPIT_CASE_ROUTE['4a'].skill).toBe('Analyser un document');
  });

  it('seuil général : sous 0,45, clarification (cas 5), motif lisible', () => {
    const d = parseCockpitRouterResponse(reply('donnees', 0.42));
    expect(d.cas).toBe('5');
    expect(d.choice).toBe('donnees');
    expect(d.downgrade).toMatch(/sous le seuil 0.45/);
  });

  it('écriture : confiance ≥ 0,75 ET « demande d’écriture » ≥ 0,5 exigées, sinon clarification', () => {
    expect(parseCockpitRouterResponse(reply('modification', 0.7, { w: 0.95 })).cas).toBe('5');
    expect(parseCockpitRouterResponse(reply('modification', 0.9, { w: 0.2 })).cas).toBe('5');
    expect(parseCockpitRouterResponse(reply('modification', 0.9, { w: 0.2 })).downgrade).toMatch(/demande d’écriture non confirmée/);
    expect(parseCockpitRouterResponse(reply('modification', 0.8, { w: 0.6 })).cas).toBe('3');
  });

  it('plusieurs demandes : signalé au-dessus de 0,6, le cas reste celui de la première demande', () => {
    const d = parseCockpitRouterResponse(reply('donnees', 0.8, { w: 0.9, m: 0.85 }));
    expect(d).toMatchObject({ cas: '1', multi: true, ecriture: 0.9, multiScore: 0.85 });
    expect(parseCockpitRouterResponse(reply('donnees', 0.8, { m: 0.3 })).multi).toBe(false);
  });

  it('réponse illisible : erreur dédiée (repli en clarification dans le service)', () => {
    expect(() => parseCockpitRouterResponse({ answers: {} })).toThrow(CockpitRouterResponseError);
    expect(() => parseCockpitRouterResponse(reply('inconnu', 0.9))).toThrow(CockpitRouterResponseError);
  });
});
