import { currentLatencyKind, LATENCY_CATEGORIES, latencyCategory, latencyIdle, latencyKind, latencySinks, measuredPrompt, measuredTask, StepTimingRow, timedStep } from '../../src/core/latency';
import { LATENCY_CATEGORY_ORDER } from '../../src/domain/latency';

/** Mesure étendue à toutes les fonctions d'IA (11/10/2026) : traitements hors questions à Jev. */
describe('Temps de traitement : traitements hors questions à Jev', () => {
  const rows: StepTimingRow[] = [];
  const sink = (r: StepTimingRow[]) => { rows.push(...r); };
  beforeAll(() => latencySinks.push(sink));
  afterAll(() => latencySinks.splice(latencySinks.indexOf(sink), 1));
  beforeEach(() => { rows.length = 0; });

  it('chaque fonction a sa catégorie, dans l’ordre du rapport', () => {
    for (const c of ['report_writing', 'report_roles', 'project_init', 'greeting', 'notification', 'kb_indexing', 'guide_indexing', 'revectorize']) {
      expect(LATENCY_CATEGORIES).toContain(c);
      expect(LATENCY_CATEGORY_ORDER).toContain(c);
    }
    expect([...LATENCY_CATEGORY_ORDER].sort()).toEqual([...LATENCY_CATEGORIES].sort());
  });

  it('traitement isolé : ses étapes et son bout en bout, sous sa catégorie', async () => {
    await measuredTask('notification', async () => {
      await latencyKind('qry', () => timedStep(currentLatencyKind(), 'gpt', 'primary', async () => 1));
      await timedStep('exe', 'svc', 'primary', async () => 1);
      await timedStep('gen', 'gpt', 'primary', async () => 1);
    });
    await latencyIdle();
    expect(rows.map((r) => `${r.category}/${r.step}`)).toEqual(['notification/qry', 'notification/exe', 'notification/gen', 'notification/e2e']);
    expect(new Set(rows.map((r) => r.requestId)).size).toBe(1);
  });

  it('pendant une question à Jev : le traitement compte pour la question, pas de seconde mesure', async () => {
    await measuredPrompt(async () => {
      latencyCategory('kb_document');
      await measuredTask('kb_indexing', () => timedStep('vec', 'qwen', 'primary', async () => 1));
    });
    await latencyIdle();
    expect(rows.map((r) => `${r.category}/${r.step}`)).toEqual(['kb_document/vec', 'kb_document/e2e']);
  });

  it('traitement en échec : bout en bout en erreur, l’erreur repart à l’appelant', async () => {
    await expect(measuredTask('greeting', () => timedStep('gen', 'haiku', 'primary', async () => { throw new Error('Délai dépassé'); }))).rejects.toThrow('Délai dépassé');
    await latencyIdle();
    expect(rows.find((r) => r.step === 'e2e')).toMatchObject({ category: 'greeting', errorType: 'Délai dépassé' });
  });
});

