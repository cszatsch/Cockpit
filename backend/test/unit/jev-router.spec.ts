import { buildRouterRequest, parseRouterResponse, ROUTER_PROMPTS, ROUTER_PROMPT_VERSION, ROUTER_QUESTION_ID, RouterResponseError } from '../../src/domain/jev-router';
import fs from 'fs';
import path from 'path';

const answer = (choice: string, confidence: number, probabilities: Record<string, number>, extra: Record<string, unknown> = {}) => ({ model: 'jev-1.13.0', answers: { [ROUTER_QUESTION_ID]: { type: 'choice', choice, confidence, probabilities }, ...extra } });

describe('Aiguillage de Jev — requête et lecture de la réponse (décision du 30/09/2026)', () => {
  it('requête TypeSafe : modèle de la carte, question « Choice » à quatre options, questions précédentes limitées à 3', () => {
    const r = buildRouterRequest('Et pour le mois dernier ?', { model: 'jev-latest', page: 'Vue générale des coûts', history: ['a', 'b', 'c', 'd'].map((question) => ({ question })) });
    expect(r.model).toBe('jev-latest');
    expect(r.state).toMatchObject({ open_page: 'Vue générale des coûts', previous_questions: ['b', 'c', 'd'], latest_question: 'Et pour le mois dernier ?' });
    expect(Object.keys((r.questions as any)[ROUTER_QUESTION_ID].criteria)).toEqual(['usage', 'donnees', 'mixte', 'hors_sujet']);
    expect((r.questions as any)[ROUTER_QUESTION_ID].type).toBe('choice');
    expect(Object.keys(r.questions)).toEqual([ROUTER_QUESTION_ID]);
    expect(ROUTER_PROMPT_VERSION).toBe('v2');
  });

  it('version v3 : deux questions oui / non ajoutées dans le même appel', () => {
    const r = buildRouterRequest('x', { model: 'm', version: 'v3' });
    expect(Object.keys(r.questions)).toEqual([ROUTER_QUESTION_ID, 'besoin_fonctionnement', 'besoin_donnees']);
    expect((r.questions as any).besoin_donnees.type).toBe('noul');
  });

  it('les exemples des consignes ne reprennent aucune question du jeu de test (mesure non faussée)', () => {
    const dataset = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/jev-routage.json'), 'utf8')).questions.map((q: any) => q.question.toLowerCase());
    const examples = JSON.stringify(ROUTER_PROMPTS).toLowerCase();
    for (const q of dataset) expect(examples.includes(q)).toBe(false);
  });

  it('lecture : type, confiance, justification lisible ; mixte → AMBIGU ; confiance faible → AMBIGU ; hors sujet sûr gardé', () => {
    expect(parseRouterResponse(answer('usage', 0.93, { usage: 0.95, donnees: 0.03, mixte: 0.02, hors_sujet: 0 }))).toMatchObject({ type: 'USAGE', confiance: 0.93, choice: 'usage', justification: expect.stringMatching(/^usage retenu \(confiance 0\.93\) — usage 95 % · données 3 %/) });
    expect(parseRouterResponse(answer('mixte', 0.7, { mixte: 0.8, usage: 0.2 })).type).toBe('AMBIGU');
    expect(parseRouterResponse(answer('donnees', 0.3, { donnees: 0.45, usage: 0.4, mixte: 0.15 }))).toMatchObject({ type: 'AMBIGU', justification: expect.stringContaining('sous le seuil 0.5') });
    expect(parseRouterResponse(answer('hors_sujet', 0.45, { hors_sujet: 0.7, usage: 0.3 })).type).toBe('HORS_SUJET');
    expect(parseRouterResponse(answer('hors_sujet', 0.2, { hors_sujet: 0.45, usage: 0.4 })).type).toBe('AMBIGU');
  });

  it('v3 : fonctionnement et données tous deux au-dessus de 0,6 → AMBIGU', () => {
    const r = parseRouterResponse(answer('usage', 0.9, { usage: 0.95 }, { besoin_fonctionnement: { type: 'noul', noul: 0.9 }, besoin_donnees: { type: 'noul', noul: 0.7 } }));
    expect(r).toMatchObject({ type: 'AMBIGU', justification: expect.stringContaining('fonctionnement et données demandés tous deux') });
  });

  it('réponse illisible : erreur explicite (repli par le service)', () => {
    expect(() => parseRouterResponse({ answers: {} })).toThrow(RouterResponseError);
    expect(() => parseRouterResponse(answer('autre', 0.9, {}))).toThrow(RouterResponseError);
    expect(() => parseRouterResponse(null)).toThrow(RouterResponseError);
  });
});
