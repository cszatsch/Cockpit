import { buildLatencyReport, buildLatencySeries, latencyRange, median, seriesSlots, stats, TimingRow } from '../../src/domain/latency';
import { latencyErrorType } from '../../src/core/latency';
import { parisTime } from '../../src/domain/notification-rules';
import { FIXTURE_TIMEOUT, latencyFixture } from '../fixtures/latency';

const Y = '2026-09-25';
const at = (iso: string, h: number, min = 0) => { const [y, m, d] = iso.split('-').map(Number); return parisTime(y, m, d, h, min); };
const row = (o: Partial<TimingRow> & { start: Date; ms: number }): TimingRow => ({
  requestId: 'r1', category: 'kb_document', step: 'gen', model: 'sonnet', role: 'primary', errorType: null, ...o, startedAt: o.start, endedAt: new Date(o.start.getTime() + o.ms), durationMs: o.ms,
});

describe('Temps de traitement : règles de calcul (TEMPS § 3)', () => {
  it('médiane exacte (percentile 50) ; min et max bruts', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(3); // (2 + 3) / 2 arrondi
    expect(stats([700])).toEqual({ med: 700, min: 700, max: 700 });
    expect(stats([])).toEqual({ med: 0, min: 0, max: 0 });
  });

  it('périodes : se terminent la veille ; Jour jusqu’à 182 jours avant ; au-delà ou après la veille : refus', () => {
    expect(latencyRange('7', null, Y)).toEqual({ from: '2026-09-19', to: Y });
    expect(latencyRange('1m', null, Y)).toEqual({ from: '2026-08-27', to: Y });
    expect(latencyRange('d', null, Y)).toEqual({ from: Y, to: Y });
    expect(latencyRange('d', '2026-03-27', Y)).toEqual({ from: '2026-03-27', to: '2026-03-27' }); // 182 jours avant
    expect(latencyRange('d', '2026-03-26', Y)).toHaveProperty('error');
    expect(latencyRange('d', '2026-09-26', Y)).toHaveProperty('error');
    expect(latencyRange('d', '2026-02-30', Y)).toHaveProperty('error');
  });

  it('créneaux : 24 heures, 7 et 30 jours, 13 et 27 semaines se terminant la veille', () => {
    expect(seriesSlots('d', Y, Y).labels).toHaveLength(24);
    expect(seriesSlots('7', '2026-09-19', Y).labels).toEqual(['sam. 19', 'dim. 20', 'lun. 21', 'mar. 22', 'mer. 23', 'jeu. 24', 'ven. 25']);
    expect(seriesSlots('1m', '2026-08-27', Y).labels).toHaveLength(30);
    const w13 = seriesSlots('3m', '2026-06-27', Y), w27 = seriesSlots('6m', '2026-03-27', Y);
    expect(w13.labels).toHaveLength(13);
    expect(w27.labels).toHaveLength(27);
    expect(w27.labels[0]).toBe('27 mars'); // première semaine incomplète : à partir du début de la période
    expect(w13.slotOf(at(Y, 12))).toBe(12);
    expect(w13.slotOf(at('2026-09-19', 12))).toBe(12);
    expect(w13.slotOf(at('2026-09-18', 12))).toBe(11);
    expect(w13.slotOf(at('2026-06-27', 0, 30))).toBe(0);
    expect(w13.slotOf(at('2026-06-26', 23))).toBe(-1);
  });

  it('rapport : 6 catégories ; étapes dans l’ordre d’exécution ; bout en bout mesuré (pas la somme des étapes)', () => {
    const r = buildLatencyReport(latencyFixture(Y, 7) as TimingRow[], '7', '2026-09-19', Y);
    expect(r.categories.map((c) => c.category)).toEqual(['guide_cockpit', 'guide_console', 'data_cockpit', 'data_console', 'update_cockpit', 'kb_document']);
    const kb = r.categories.find((c) => c.category === 'kb_document')!;
    expect(kb.count).toBe(14);
    expect(kb.steps.map((s) => s.step)).toEqual(['route', 'vec', 'rrk', 'gen']);
    const rrk = kb.steps.find((s) => s.step === 'rrk')!.models[0];
    expect(rrk.errors).toEqual([{ type: FIXTURE_TIMEOUT, count: 3, lastAt: expect.stringMatching(/^2026-09-25T\d\d:\d\d:\d\d\.\d{3}Z$/) }]);
    expect(rrk.max).toBe(5000); // l'étape en erreur garde sa durée jusqu'à l'échec
    const sumMed = kb.steps.reduce((a, s) => a + s.models[0].med, 0);
    expect(kb.e2e.med).not.toBe(sumMed);
  });

  it('ordre d’exécution : d’après le début des étapes dans le prompt, pas d’après une liste fixe', () => {
    const s = at(Y, 10);
    const t = (ms: number) => new Date(s.getTime() + ms);
    const rows = [
      row({ step: 'e2e', model: 'svc', start: s, ms: 900 }),
      row({ step: 'route', model: 'jev-typesafe', start: t(1), ms: 100 }),
      row({ step: 'qry', model: 'sonnet', start: t(110), ms: 200 }), // identification des documents
      row({ step: 'vec', model: 'te3large', start: t(320), ms: 100 }),
      row({ step: 'gen', model: 'sonnet', start: t(430), ms: 400 }),
    ];
    expect(buildLatencyReport(rows, 'd', Y, Y).categories[0].steps.map((x) => x.step)).toEqual(['route', 'qry', 'vec', 'gen']);
  });

  it('catégorie avec un seul prompt : médiane = min = max', () => {
    const s = at(Y, 10);
    const r = buildLatencyReport([row({ step: 'e2e', model: 'svc', start: s, ms: 1234 }), row({ step: 'gen', start: s, ms: 1000 })], 'd', Y, Y);
    expect(r.categories[0].e2e).toEqual({ med: 1234, min: 1234, max: 1234 });
    expect(r.categories[0].steps[0].models[0]).toMatchObject({ count: 1, med: 1000, min: 1000, max: 1000 });
  });

  it('étape en erreur sans réponse servie : prompt compté, exclu du bout en bout, erreur sur l’étape', () => {
    const s = at(Y, 10), s2 = at(Y, 11);
    const rows = [
      row({ requestId: 'ok', step: 'e2e', model: 'svc', start: s, ms: 3000 }), row({ requestId: 'ok', step: 'gen', start: s, ms: 2900 }),
      row({ requestId: 'ko', step: 'e2e', model: 'svc', start: s2, ms: 14000, errorType: 'Erreur HTTP 503' }),
      row({ requestId: 'ko', step: 'gen', start: s2, ms: 4000, errorType: 'Réponse vide' }),
      row({ requestId: 'ko', step: 'gen', model: 'gflash', role: 'fallback', start: new Date(s2.getTime() + 4000), ms: 9900, errorType: 'Erreur HTTP 503' }),
    ];
    const c = buildLatencyReport(rows, 'd', Y, Y).categories[0];
    expect(c.count).toBe(2);
    expect(c.e2e).toEqual({ med: 3000, min: 3000, max: 3000 });
    const gen = c.steps[0].models;
    expect(gen.map((m) => [m.model, m.role, m.count])).toEqual([['sonnet', 'primary', 2], ['gflash', 'fallback', 1]]);
    expect(gen[0].errors).toEqual([expect.objectContaining({ type: 'Réponse vide', count: 1 })]);
    // Courbe : le créneau compte les erreurs des étapes.
    const pts = buildLatencySeries(rows, 'd', Y, Y, 'cat', 'kb_document');
    expect(pts[10]).toEqual({ l: '10 h', med: 3000, min: 3000, max: 3000, err: 0 });
    expect(pts[11]).toEqual({ l: '11 h', med: null, min: null, max: null, err: 2 });
  });

  it('secours : principal et secours, chacun avec son nombre d’appels (part des appels)', () => {
    const r = buildLatencyReport(latencyFixture(Y, 7) as TimingRow[], '7', '2026-09-19', Y);
    const gen = r.categories.find((c) => c.category === 'guide_cockpit')!.steps.find((s) => s.step === 'gen')!.models;
    expect(gen.map((m) => [m.model, m.role])).toEqual([['sonnet', 'primary'], ['mlarge', 'fallback']]);
    expect(gen[0].count).toBe(14);
    expect(gen[1].count).toBeGreaterThan(0);
    expect(gen[0].errors[0]).toMatchObject({ type: 'Erreur HTTP 529', count: gen[1].count });
  });

  it('vue par modèle cohérente avec la vue par catégorie : même nombre total d’appels', () => {
    const rows = latencyFixture(Y, 7) as TimingRow[];
    const r = buildLatencyReport(rows, '7', '2026-09-19', Y);
    for (const model of ['haiku', 'sonnet', 'gpt5', 'te3large', 'rerank35', 'mlarge']) {
      const fromCats = r.categories.flatMap((c) => c.steps.flatMap((s) => s.models.filter((m) => m.model === model))).reduce((a, m) => a + m.count, 0);
      const series = buildLatencySeries(rows, '7', '2026-09-19', Y, 'mod', model);
      expect(fromCats).toBe(rows.filter((x) => x.model === model && x.step !== 'e2e').length);
      expect(series).toHaveLength(7);
      expect(series.reduce((a, p) => a + p.err, 0)).toBe(rows.filter((x) => x.model === model && x.errorType).length);
    }
  });

  it('types d’erreur lisibles', () => {
    expect(latencyErrorType(new Error('OpenRouter : délai de 10 s dépassé'))).toBe('Délai dépassé (10 s)');
    expect(latencyErrorType(new Error('Anthropic : réponse vide (arrêt : max_tokens · blocs : thinking)'))).toBe('Réponse vide');
    expect(latencyErrorType(new Error('Google Gemini · 503 : overloaded'))).toBe('Erreur HTTP 503');
  });
});
