import request from 'supertest';
import { setup, TestCtx, WHO } from '../helpers';
import { makePptx } from '../office-fixture';
import { encryptSecret } from '../../src/core/crypto';
import { ApiCardsService } from '../../src/admin/api-cards.service';
import { LlmService } from '../../src/core/llm.service';
import { KbService } from '../../src/cockpit/documents/kb.service';
import { COCKPIT_Q_CASE } from '../../src/domain/jev-router-cockpit';
import { COCKPIT_INSIGHT_ANSWER_RULES, DOC_ANSWER_RULES, DOC_COMPLEMENT_RULES, DOC_DATA_ANSWER_RULES, DOC_EMPTY_REPLY, DOCS_MODULE_ID, DOCS_PART_TITLE, parseDocIdentification } from '../../src/domain/jev-cockpit-answers';

const R = '/api/projects/RISE';
const C = `${R}/assistant/messages`;

/**
 * Jev du Cockpit — cas 4, documents de la Base de connaissance (brief du 01/10/2026) : identification des documents
 * visés (catalogue visible de l'utilisateur, séances tenues), recherche limitée à ces documents, réponse par le modèle
 * Documents / Synthèse (skill « Analyser un document ») avec document et repère en sources ; 4b : données puis documents,
 * parties distinctes.
 */
describe('Jev du Cockpit — cas 4 : documents', () => {
  let t: TestCtx;
  let next = 'document';
  let kickoff: string;
  let copil: string;

  beforeAll(async () => {
    t = await setup();
    await t.db.apiCard.create({ data: { id: 'jev', name: 'JEV', category: 'Stratégie', endpoint: 'https://api.typesafe.test/v1/systemone', keyEncrypted: encryptSecret('cle-de-test'), keyLast4: 'test', authMode: 'BEARER', method: 'POST', body: JSON.stringify({ model: 'jev-latest' }) } });
    t.app.get(ApiCardsService).fetchImpl = (async () => new Response(JSON.stringify({ answers: { [COCKPIT_Q_CASE]: { type: 'choice', choice: next, confidence: 0.95, probabilities: { [next]: 0.95 } } } }), { status: 200, headers: { 'content-type': 'application/json' } })) as any;
    await t.db.skill.createMany({ data: [
      { n: 'Analyser un document', t: '## Objectif\nAnalyser un document du projet.', on: true, position: 90, updatedBy: 'Test' },
      { n: 'Insights', t: '## Objectif\nLire l’état du projet.', on: true, position: 91, updatedBy: 'Test' },
    ] });
  });
  afterAll(() => t.close());

  const deposit = async (who: { personId: string }, buf: Buffer, name: string, fields: Record<string, string> = {}) => {
    const token = await t.token(who);
    let r = request(t.app.getHttpServer()).post(`${R}/documents`).set('Authorization', `Bearer ${token}`);
    for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
    const up = (await r.attach('file', buf, name).expect(201)).body;
    await t.app.get(KbService).idle();
    return up.id as string;
  };
  /** Modèle simulé : réponses successives ; les autres appels (vectorisation, reclassement) restent simulés par le bouchon. */
  const scripted = (...texts: string[]) => {
    const llm = t.app.get(LlmService);
    const real = llm.complete.bind(llm);
    let i = 0;
    return jest.spyOn(llm, 'complete').mockImplementation(async (input: any) => ({ ...(await real(input)), text: texts[Math.min(i++, texts.length - 1)] }));
  };

  it('aucun document consultable : réponse fixe, sans appel au modèle', async () => {
    await t.db.document.updateMany({ where: { projectId: 'RISE' }, data: { ext: 'FAILED' } });
    const llm = jest.spyOn(t.app.get(LlmService), 'complete');
    const r = await (await t.as(WHO.pmo)).post(C, { context: { space: 'documents' }, text: 'Résume le support du dernier COPIL' }).expect(200);
    expect(r.body).toMatchObject({ route: '4a', docs: 'EMPTY', reply: DOC_EMPTY_REPLY, sources: [] });
    expect(llm).not.toHaveBeenCalled();
    llm.mockRestore();
  });

  it('4a : document identifié (catalogue et séances tenues), recherche limitée à ce document, réponse sourcée', async () => {
    kickoff = await deposit(WHO.pmo, await makePptx([{ title: 'Sommaire', lines: ['1. Contexte', '2. Planning', '3. Gouvernance'] }, { title: 'Gouvernance', lines: ['COPIL mensuel présidé par le sponsor'] }]), 'Kick-off RISE.pptx', { type: 'Support de comité', dateIso: '2024-02-08' });
    copil = await deposit(WHO.pmo, await makePptx([{ title: 'COPIL n°20', lines: ['Risques présentés : R01 et R03'] }]), 'Support COPIL 20.pptx', { type: 'Support de comité', dateIso: '2026-09-26' });
    next = 'document';
    const spy = scripted(JSON.stringify({ documents: [kickoff], recherche: 'sommaire du support de lancement', motif: 'support du kick-off' }), 'Le sommaire du kick-off compte trois parties (Kick-off RISE, diapositive 1).');
    const r = await (await t.as(WHO.pmo)).post(C, { context: { space: 'documents' }, text: 'Quel était le sommaire du support de lancement (kick-off) du projet ?' }).expect(200);
    expect(r.body).toMatchObject({ route: '4a', docs: 'ANSWERED', reply: 'Le sommaire du kick-off compte trois parties (Kick-off RISE, diapositive 1).', proposedChanges: [] });
    expect(r.body.sources.length).toBeGreaterThan(0);
    for (const s of r.body.sources) expect(s).toMatchObject({ entityType: 'DOCUMENT', label: expect.stringMatching(/^Kick-off RISE · /) });
    const [ident, answer] = spy.mock.calls.map((c) => c[0] as any);
    expect(ident.functionId).toBe('doc_syn');
    expect(ident.systemTail).toContain(`${kickoff} · Kick-off RISE · Support de comité · 2024-02-08`);
    expect(ident.systemTail).toMatch(/## Séances de comité tenues[\s\S]*n°20 · 2026-09-26/);
    expect(answer.functionId).toBe('doc_syn');
    expect(answer.system).toContain('## Skill : Analyser un document');
    expect(answer.system).not.toContain('## Skill : Insights');
    expect(answer.system).toContain(DOC_ANSWER_RULES);
    expect(answer.systemTail).toMatch(/## Documents visés[\s\S]*Diapositive 1 · Sommaire/);
    expect(answer.systemTail).toMatch(/## Extraits des documents/);
    expect(answer.systemTail).not.toContain('Support COPIL 20');
    spy.mockRestore();
  });

  /**
   * Modèle simulé par fonction (13/10/2026) : données et documents partent en parallèle, l'ordre des appels n'est plus
   * fixe ; chaque fonction (insights, doc_syn) reçoit ses réponses dans l'ordre de ses propres appels.
   */
  const byFn = (script: Record<string, string[]>) => {
    const llm = t.app.get(LlmService);
    const real = llm.complete.bind(llm);
    const seen: Record<string, number> = {};
    return jest.spyOn(llm, 'complete').mockImplementation(async (input: any) => {
      const q = script[input.functionId] ?? [''], i = seen[input.functionId] = (seen[input.functionId] ?? -1) + 1;
      return { ...(await real(input)), text: q[Math.min(i, q.length - 1)] };
    });
  };
  const SQL = '```sql\nSELECT code, libelle FROM jev_cockpit.risques\n```';
  const fnCalls = (spy: jest.SpyInstance) => spy.mock.calls.map((c) => c[0] as any);
  const setAuto = (scope: 'ALL' | 'OFF') => t.db.module.update({ where: { id: DOCS_MODULE_ID }, data: { scope } });

  it('4b : données et documents en parallèle ; consignes de deux parties distinctes ; sources des deux', async () => {
    next = 'donnees_et_documents';
    const spy = byFn({ insights: [SQL, 'Trois risques critiques ouverts : R01, R02, R03.'], doc_syn: [JSON.stringify({ documents: [copil], recherche: 'risques présentés au COPIL 20' }), 'Réponse en deux parties.'] });
    const r = await (await t.as(WHO.pmo)).post(C, { context: { space: 'pilotage', tab: 'risques' }, text: 'Quels risques critiques actuels n’ont pas été présentés au dernier COPIL ?' }).expect(200);
    expect(r.body).toMatchObject({ route: '4b', docs: 'ANSWERED', insight: 'ANSWERED', reply: 'Réponse en deux parties.' });
    expect(r.body.sources.map((s: any) => s.entityType)).toEqual(expect.arrayContaining(['DATA', 'DOCUMENT']));
    const calls = fnCalls(spy);
    expect(calls.map((c) => c.functionId).sort()).toEqual(['doc_syn', 'doc_syn', 'insights', 'insights']);
    const last = calls[calls.length - 1];
    expect(last.functionId).toBe('doc_syn');
    expect(last.system).toContain(DOC_DATA_ANSWER_RULES);
    expect(last.systemTail).toMatch(/## Réponse tirée des données du projet[\s\S]*R01, R02, R03[\s\S]*## Extraits des documents[\s\S]*Support COPIL 20/);
    spy.mockRestore();
  });

  it('règles : les données font foi ; une information de document qui les contredit n’est pas citée (13/10/2026)', () => {
    expect(DOC_DATA_ANSWER_RULES).toContain('Les données du projet font foi pour l’état actuel');
    expect(DOC_DATA_ANSWER_RULES).toContain('ne cite pas celle du document');
    expect(DOC_ANSWER_RULES).toContain('ne fais aucun rapprochement avec le Cockpit');
  });

  it('module coupé : cas 1 seul, suggestion « Chercher dans les documents » (docsSuggest)', async () => {
    next = 'donnees';
    const spy = byFn({ insights: [SQL, 'Trois risques critiques ouverts.'] });
    const r = await (await t.as(WHO.pmo)).post(C, { context: { space: 'pilotage', tab: 'risques' }, text: 'Quels sont les principaux risques ?' }).expect(200);
    expect(r.body).toMatchObject({ route: '1', docsSuggest: true });
    expect(fnCalls(spy).map((c) => c.functionId)).toEqual(['insights', 'insights']);
    // Objet nommé introuvable (13/10/2026) : jamais un autre objet à sa place ; consigne envoyée à l'étape de rédaction.
    const answer = fnCalls(spy).find((c) => String(c.system ?? '').includes('## Réponse à partir des données du projet'));
    expect(answer?.system).toContain(COCKPIT_INSIGHT_ANSWER_RULES);
    expect(COCKPIT_INSIGHT_ANSWER_RULES).toContain('Ne présente jamais un autre objet à sa place');
    spy.mockRestore();
  });

  it('« Chercher dans les documents » (searchDocs) : données et documents (4b), même si l’aiguillage dit données', async () => {
    next = 'donnees';
    const spy = byFn({ insights: [SQL, 'Trois risques critiques ouverts.'], doc_syn: [JSON.stringify({ documents: [copil], recherche: 'risques présentés' }), 'Réponse données et documents.'] });
    const r = await (await t.as(WHO.pmo)).post(C, { context: { space: 'pilotage', tab: 'risques' }, text: 'Cherche dans les documents : Quels sont les principaux risques ?', searchDocs: true }).expect(200);
    expect(r.body).toMatchObject({ route: '4b', docs: 'ANSWERED', insight: 'ANSWERED', reply: 'Réponse données et documents.' });
    expect(fnCalls(spy).map((c) => c.functionId).sort()).toEqual(['doc_syn', 'doc_syn', 'insights', 'insights']);
    spy.mockRestore();
  });

  describe('double recherche (module « Recherche documentaire systématique » actif)', () => {
    beforeAll(() => setAuto('ALL'));
    afterAll(() => setAuto('OFF'));

    it('les documents apportent un élément : partie « documents », sources données et documents, consignes de la double recherche', async () => {
      next = 'donnees';
      const spy = byFn({ insights: [SQL, 'Trois risques critiques ouverts : R01, R02, R03.'], doc_syn: [JSON.stringify({ documents: [copil], recherche: 'risques' }), '- Présentés au COPIL n°20 du 26/09/2026 (Support COPIL 20, diapositive 1).'] });
      const r = await (await t.as(WHO.pmo)).post(C, { context: { space: 'pilotage', tab: 'risques' }, text: 'Quels sont les principaux risques ?' }).expect(200);
      expect(r.body).toMatchObject({ route: '1', insight: 'ANSWERED', docs: 'ANSWERED', docsUsed: true });
      // Réponse des données affichée telle quelle, puis le complément sous le titre de la partie documents (14/10/2026).
      expect(r.body.reply).toBe(`Trois risques critiques ouverts : R01, R02, R03.\n\n${DOCS_PART_TITLE}\n- Présentés au COPIL n°20 du 26/09/2026 (Support COPIL 20, diapositive 1).`);
      expect(r.body.docsSuggest).toBeUndefined();
      expect(r.body.sources.map((s: any) => s.entityType)).toEqual(expect.arrayContaining(['DATA', 'DOCUMENT']));
      const last = fnCalls(spy).pop();
      expect(last.system).toContain(DOC_COMPLEMENT_RULES);
      expect(last.systemTail).toMatch(/## Réponse tirée des données du projet[\s\S]*R01, R02, R03/);
      spy.mockRestore();
    });

    it('les documents n’apportent rien : pas de partie « documents », sources des données seules', async () => {
      next = 'donnees';
      const spy = byFn({ insights: [SQL, 'Trois risques critiques ouverts.'], doc_syn: [JSON.stringify({ documents: [copil], recherche: 'risques' }), 'RIEN'] });
      const r = await (await t.as(WHO.pmo)).post(C, { context: { space: 'pilotage', tab: 'risques' }, text: 'Quels sont les principaux risques ?' }).expect(200);
      expect(r.body).toMatchObject({ route: '1', docsUsed: false, reply: 'Trois risques critiques ouverts.' });
      expect(r.body.sources.every((s: any) => s.entityType === 'DATA')).toBe(true);
      spy.mockRestore();
    });

    it('chaîne Documents indisponible : réponse des données seule, sans message d’erreur', async () => {
      next = 'donnees';
      const spy = byFn({ insights: [SQL, 'Trois risques critiques ouverts.'], doc_syn: ['{}'] });
      const kb = jest.spyOn(t.app.get(KbService), 'searchChunks').mockRejectedValue(new Error('Vectorisation indisponible'));
      const r = await (await t.as(WHO.pmo)).post(C, { context: { space: 'pilotage', tab: 'risques' }, text: 'Quels sont les principaux risques ?' }).expect(200);
      expect(r.body).toMatchObject({ route: '1', insight: 'ANSWERED', reply: 'Trois risques critiques ouverts.', docsUsed: false });
      kb.mockRestore();
      spy.mockRestore();
    });

    it('« d’après le Cockpit uniquement » : données seules, aucune recherche dans les documents', async () => {
      next = 'donnees';
      const spy = byFn({ insights: [SQL, 'Trois risques critiques ouverts.'] });
      const r = await (await t.as(WHO.pmo)).post(C, { context: { space: 'pilotage', tab: 'risques' }, text: 'Quels sont les principaux risques, d’après le Cockpit uniquement ?' }).expect(200);
      expect(r.body).toMatchObject({ route: '1', insight: 'ANSWERED' });
      expect(fnCalls(spy).map((c) => c.functionId)).toEqual(['insights', 'insights']);
      spy.mockRestore();
    });

    it('« seulement dans les documents » : documents seuls (4a), même si l’aiguillage dit données', async () => {
      next = 'donnees';
      const spy = byFn({ doc_syn: [JSON.stringify({ documents: [copil], recherche: 'risques' }), 'D’après le support du COPIL n°20…'] });
      const r = await (await t.as(WHO.pmo)).post(C, { context: { space: 'pilotage', tab: 'risques' }, text: 'Quels risques, seulement dans les documents ?' }).expect(200);
      expect(r.body).toMatchObject({ route: '4a', docs: 'ANSWERED' });
      expect(fnCalls(spy).map((c) => c.functionId)).toEqual(['doc_syn', 'doc_syn']);
      spy.mockRestore();
    });
  });

  it('confidentialité : un document restreint n’entre pas dans le catalogue d’un lecteur', async () => {
    await deposit(WHO.pmo, await makePptx([{ title: 'Note confidentielle', lines: ['Arbitrage budgétaire'] }]), 'Note sponsor.pptx', { conf: 'RESTRICTED' });
    next = 'document';
    const spy = scripted(JSON.stringify({ documents: [] }), 'Réponse.');
    await (await t.as(WHO.lecteurC3)).post(C, { context: { space: 'documents' }, text: 'Que dit la note du sponsor ?' }).expect(200);
    expect((spy.mock.calls[0][0] as any).systemTail).not.toContain('Note sponsor');
    expect((spy.mock.calls[0][0] as any).systemTail).toContain('Kick-off RISE');
    spy.mockRestore();
  });

  it('identification : identifiants inconnus ignorés, requête de repli = la question, JSON illisible toléré', () => {
    expect(parseDocIdentification('{"documents":["x","d1"],"recherche":"budget"}', ['d1', 'd2'], 'Q')).toEqual({ ids: ['d1'], query: 'budget', why: '' });
    expect(parseDocIdentification('{"documents":[]}', ['d1'], 'Question ?')).toMatchObject({ ids: [], query: 'Question ?' });
    expect(parseDocIdentification('Le document d2 répond.', ['d1', 'd2'], 'Q')).toMatchObject({ ids: ['d2'], query: 'Q' });
  });
});
