import { setup, TestCtx, WHO } from '../helpers';
import { encryptSecret } from '../../src/core/crypto';
import { ApiCardsService } from '../../src/admin/api-cards.service';
import { LlmService } from '../../src/core/llm.service';
import { COCKPIT_Q_CASE } from '../../src/domain/jev-router-cockpit';
import { INSIGHT_UNAVAILABLE_REPLY } from '../../src/domain/jev-cockpit-answers';
import { JEV_SQL_MAX_STATEMENTS } from '../../src/domain/jev-sql';

const C = '/api/projects/RISE/assistant/messages';

/**
 * Jev du Cockpit — cas 1, données du projet (brief du 01/10/2026) : requête SQL écrite par le modèle Insights (skill
 * « Insights »), exécutée en lecture seule sur les vues jev_cockpit filtrées par les droits de l'utilisateur, réponse
 * à partir des seuls résultats ; une correction au plus ; jamais de valeur inventée.
 */
describe('Jev du Cockpit — cas 1 : données du projet', () => {
  let t: TestCtx;
  let next = 'donnees';

  beforeAll(async () => {
    t = await setup();
    await t.db.apiCard.create({ data: { id: 'jev', name: 'JEV', category: 'Stratégie', endpoint: 'https://api.typesafe.test/v1/systemone', keyEncrypted: encryptSecret('cle-de-test'), keyLast4: 'test', authMode: 'BEARER', method: 'POST', body: JSON.stringify({ model: 'jev-latest' }) } });
    t.app.get(ApiCardsService).fetchImpl = (async () => new Response(JSON.stringify({ answers: { [COCKPIT_Q_CASE]: { type: 'choice', choice: next, confidence: 0.95, probabilities: { [next]: 0.95 } } } }), { status: 200, headers: { 'content-type': 'application/json' } })) as any;
    await t.db.skill.createMany({ data: [
      { n: 'Insights', t: '## Objectif\nLire l’état réel du projet.', on: true, position: 90, updatedBy: 'Test' },
      { n: 'Guidage Cockpit', t: '## Objectif\nGuider.', on: true, position: 91, updatedBy: 'Test' },
    ] });
  });
  afterAll(() => t.close());

  /** Modèle simulé : réponses successives (requête, puis rédaction). */
  const scripted = (...texts: string[]) => {
    const llm = t.app.get(LlmService);
    const real = llm.complete.bind(llm);
    let i = 0;
    return jest.spyOn(llm, 'complete').mockImplementation(async (input: any) => ({ ...(await real(input)), text: texts[Math.min(i++, texts.length - 1)] }));
  };

  it('PMO : requête sur tout le projet, réponse rédigée à partir des résultats, sources = vues consultées', async () => {
    next = 'donnees';
    const spy = scripted('```sql\nSELECT code, libelle FROM jev_cockpit.risques ORDER BY code\n```', '**3** risques critiques : R01, R02, R03.');
    const r = await (await t.as(WHO.pmo)).post(C, { context: { space: 'pilotage', tab: 'risques' }, text: 'Quels sont les risques critiques ?' }).expect(200);
    expect(r.body).toMatchObject({ route: '1', insight: 'ANSWERED', reply: '**3** risques critiques : R01, R02, R03.', proposedChanges: [] });
    expect(r.body.sources).toEqual([{ entityType: 'DATA', id: 'Données · risques', label: 'Données · risques' }]);
    const [q, a] = spy.mock.calls.map((c) => c[0] as any);
    expect(q.functionId).toBe('insights');
    expect(q.system).toContain('## Skill : Insights');
    expect(q.system).not.toContain('## Skill : Guidage Cockpit');
    expect(q.system).toMatch(/## Données du projet[\s\S]*jev_cockpit\.risques/);
    expect(q.system).toContain('L’utilisateur voit tout le projet');
    expect(q.cache).toBe(true);
    // Résultats transmis à la rédaction : tous les risques du projet.
    const rows = JSON.parse(a.prompt.split('\n').slice(-1)[0]);
    expect(rows.length).toBe(await t.db.risk.count({ where: { projectId: 'RISE' } }));
    expect(a.system).toMatch(/## Réponse à partir des données du projet/);
    spy.mockRestore();
    // Trace de la question : étapes de la question à la réponse, enregistrée (jev_traces).
    await new Promise((r) => setTimeout(r, 50));
    const tr = await t.db.jevTrace.findFirst({ where: { label: 'Jev Cockpit' }, orderBy: { at: 'desc' } });
    const names = (tr!.spans as any[]).map((x) => x.name);
    expect(tr!.meta).toMatchObject({ projet: 'RISE', cas: '1' });
    for (const n of ['projet et droits (base)', 'conversation et mémoire (base)', 'aiguillage (API JEV)', 'cas 1 · données du projet', 'génération · fonction insights', 'requête SQL en lecture seule (tentative 1, base)', 'enregistrement de l’échange dans la mémoire (base)']) expect(names).toContain(n);
    expect(names.some((n) => /^HTTP POST carte « JEV »/.test(n))).toBe(true);
  });

  it('Responsable : la même requête ne lit que ses chantiers (filtre posé par le serveur)', async () => {
    const spy = scripted('```sql\nSELECT code, chantier_id FROM jev_cockpit.risques\n```', 'Réponse.');
    await (await t.as(WHO.respC5)).post(C, { context: { space: 'pilotage', tab: 'risques' }, text: 'Liste les risques' }).expect(200);
    const [q, a] = spy.mock.calls.map((c) => c[0] as any);
    expect(q.system).toMatch(/L’utilisateur ne voit que les chantiers C5/);
    const rows: Array<{ code: string; chantier_id: string }> = JSON.parse(a.prompt.split('\n').slice(-1)[0]);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((x) => x.chantier_id === 'C5')).toBe(true);
    expect(rows.length).toBeLessThan(await t.db.risk.count({ where: { projectId: 'RISE' } }));
    spy.mockRestore();
  });

  it('requête interdite : corrigée une fois, puis refus explicite sans valeur inventée', async () => {
    const spy = scripted('```sql\nDELETE FROM jev_cockpit.risques\n```', '```sql\nSELECT * FROM public.risks\n```');
    const r = await (await t.as(WHO.pmo)).post(C, { context: { space: 'pilotage' }, text: 'Combien de risques ?' }).expect(200);
    expect(r.body).toMatchObject({ route: '1', insight: 'FAILED', sources: [] });
    // Jamais de motif technique montré (incident du 20/10/2026) : il reste dans la trace de la question.
    expect(r.body.reply).toBe(INSIGHT_UNAVAILABLE_REPLY);
    expect(r.body.reply).not.toMatch(/jev|instruction|SELECT/i);
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
    await new Promise((r) => setTimeout(r, 50));
    const tr = await t.db.jevTrace.findFirst({ where: { label: 'Jev Cockpit' }, orderBy: { at: 'desc' } });
    expect((tr!.meta as any).erreur).toBe('seules les vues jev.* sont lisibles');
  });

  // Incident du 20/10/2026 : « Résumer la situation du jour » → le modèle écrit une requête par sujet ; auparavant
  // refusées (« une seule instruction est permise »), elles sont désormais contrôlées et exécutées une à une.
  it('synthèse sur plusieurs sujets : plusieurs requêtes exécutées, résultats transmis requête par requête', async () => {
    next = 'donnees';
    const spy = scripted('```sql\nSELECT code, libelle FROM jev_cockpit.risques ORDER BY code;\nSELECT code, libelle FROM jev_cockpit.jalons ORDER BY code;\n```', 'Synthèse du jour : risques et jalons.');
    const r = await (await t.as(WHO.pmo)).post(C, { context: { space: 'today' }, text: 'Résumer la situation du jour' }).expect(200);
    expect(r.body).toMatchObject({ route: '1', insight: 'ANSWERED', reply: 'Synthèse du jour : risques et jalons.' });
    expect(r.body.sources.map((x: any) => x.label)).toEqual(expect.arrayContaining(['Données · risques', 'Données · jalons']));
    expect(spy).toHaveBeenCalledTimes(2); // aucune correction : les deux requêtes sont acceptées du premier coup
    const a = spy.mock.calls[1][0] as any;
    expect(a.prompt).toContain('## Résultats des 2 requêtes');
    // Lignes de la requête n : la ligne JSON qui suit son bloc ```sql … ```.
    const block = (n: number) => JSON.parse(a.prompt.split(`### Requête ${n} `)[1].split('```\n')[1].split('\n')[0]);
    expect(block(1).length).toBe(await t.db.risk.count({ where: { projectId: 'RISE' } }));
    expect(block(2).length).toBe(await t.db.milestone.count({ where: { projectId: 'RISE' } }));
    spy.mockRestore();
  });

  it(`plus de ${JEV_SQL_MAX_STATEMENTS} requêtes : refusées, puis corrigées une fois`, async () => {
    const five = Array.from({ length: JEV_SQL_MAX_STATEMENTS + 1 }, () => 'SELECT code FROM jev_cockpit.risques').join(';\n');
    const spy = scripted(`\`\`\`sql\n${five}\n\`\`\``, '```sql\nSELECT code FROM jev_cockpit.risques\n```', 'Réponse.');
    const r = await (await t.as(WHO.pmo)).post(C, { context: { space: 'today' }, text: 'Tout résumer' }).expect(200);
    expect(r.body).toMatchObject({ insight: 'ANSWERED', reply: 'Réponse.' });
    expect((spy.mock.calls[1][0] as any).prompt).toContain(`Motif du refus ou de l’échec : ${JEV_SQL_MAX_STATEMENTS} instructions SELECT au plus`);
    spy.mockRestore();
  });

  it('réponse directe (pas de données nécessaires) : affichée telle quelle', async () => {
    const spy = scripted('Bonjour, je peux répondre sur les données du projet.');
    const r = await (await t.as(WHO.pmo)).post(C, { context: { space: 'today' }, text: 'Bonjour' }).expect(200);
    expect(r.body).toMatchObject({ route: '1', insight: 'DIRECT', reply: 'Bonjour, je peux répondre sur les données du projet.' });
    spy.mockRestore();
  });
});
