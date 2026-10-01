import { addDays, daysBetween, isIsoDate } from './dates';
import { parisDay, parisTime } from './notification-rules';

/**
 * Analyse des temps de traitement (spécification TEMPS, 01/10/2026) : règles pures du rapport et de la courbe
 * d'évolution, calculées sur les lignes `StepTiming` (une par étape exécutée, une `e2e` par prompt).
 */

/** Périodes (jours) : se terminent la veille ; 3 et 6 mois en 13 et 27 semaines. */
export const LATENCY_PERIODS = { d: 1, '7': 7, '1m': 30, '3m': 91, '6m': 183 } as const;
export type LatencyPeriod = keyof typeof LATENCY_PERIODS;
/** Jour consulté : jusqu'à 182 jours avant la veille. */
export const LATENCY_MAX_DAYS_BACK = 182;
/** Conservation des lignes brutes (jours). */
export const LATENCY_RETENTION_DAYS = 190;
export const LATENCY_CATEGORY_ORDER = ['guide_cockpit', 'guide_console', 'data_cockpit', 'data_console', 'update_cockpit', 'kb_document'] as const;

export interface TimingRow {
  requestId: string;
  category: string;
  step: string;
  model: string;
  role: string;
  startedAt: Date;
  endedAt: Date;
  durationMs: number;
  errorType: string | null;
}

export interface Stats { med: number; min: number; max: number }
export interface LatencyReportBody {
  period: LatencyPeriod; from: string; to: string;
  categories: Array<{
    category: string; count: number; e2e: Stats;
    steps: Array<{ step: string; models: Array<{ model: string; role: 'primary' | 'fallback'; count: number } & Stats & { errors: Array<{ type: string; count: number; lastAt: string }> }> }>;
  }>;
}
export interface SeriesPoint { l: string; med: number | null; min: number | null; max: number | null; err: number }

export const isLatencyPeriod = (p: unknown): p is LatencyPeriod => typeof p === 'string' && p in LATENCY_PERIODS;

/** Bornes incluses de la période ; `day` (période Jour) entre la veille et 182 jours avant. */
export function latencyRange(period: LatencyPeriod, day: string | null, yesterday: string): { from: string; to: string } | { error: string } {
  if (period === 'd') {
    const to = day ?? yesterday;
    if (!isIsoDate(to)) return { error: 'day : date attendue au format AAAA-MM-JJ' };
    const back = daysBetween(to, yesterday);
    if (back < 0) return { error: 'day : la journée la plus récente est la veille' };
    if (back > LATENCY_MAX_DAYS_BACK) return { error: `day : ${LATENCY_MAX_DAYS_BACK} jours au plus avant la veille` };
    return { from: to, to };
  }
  return { from: addDays(yesterday, -(LATENCY_PERIODS[period] - 1)), to: yesterday };
}

/** Instants de début (inclus) et de fin (exclue) de la période, jours civils de Paris. */
export function latencyInstants(from: string, to: string): { gte: Date; lt: Date } {
  const at = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return parisTime(y, m, d, 0, 0); };
  return { gte: at(from), lt: at(addDays(to, 1)) };
}

/** Médiane exacte (percentile 50) : valeur centrale, ou moyenne des deux valeurs centrales. */
export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}
export function stats(values: number[]): Stats {
  if (!values.length) return { med: 0, min: 0, max: 0 };
  let min = Infinity, max = -Infinity;
  for (const v of values) { if (v < min) min = v; if (v > max) max = v; }
  return { med: median(values), min, max };
}

/**
 * Rapport de la période : par catégorie, le nombre de prompts, le bout en bout mesuré (prompts servis seulement) et les
 * étapes dans l'ordre d'exécution (médiane du début de leur première occurrence dans le prompt), chacune par modèle et
 * rôle (principal, secours), avec ses erreurs par type. Une étape en erreur garde sa durée jusqu'à l'échec.
 */
export function buildLatencyReport(rows: TimingRow[], period: LatencyPeriod, from: string, to: string): LatencyReportBody {
  const byCat = new Map<string, TimingRow[]>();
  for (const r of rows) (byCat.get(r.category) ?? byCat.set(r.category, []).get(r.category)!).push(r);
  const categories: LatencyReportBody['categories'] = [];
  for (const category of [...LATENCY_CATEGORY_ORDER, ...[...byCat.keys()].filter((k) => !(LATENCY_CATEGORY_ORDER as readonly string[]).includes(k))]) {
    const list = byCat.get(category);
    if (!list) continue;
    const e2e = list.filter((r) => r.step === 'e2e');
    if (!e2e.length) continue;
    const start = new Map(e2e.map((r) => [r.requestId, r.startedAt.getTime()]));
    const steps = new Map<string, TimingRow[]>();
    const firstOffset = new Map<string, Map<string, number>>();
    for (const r of list) {
      if (r.step === 'e2e') continue;
      (steps.get(r.step) ?? steps.set(r.step, []).get(r.step)!).push(r);
      const off = r.startedAt.getTime() - (start.get(r.requestId) ?? r.startedAt.getTime());
      const m = firstOffset.get(r.step) ?? firstOffset.set(r.step, new Map()).get(r.step)!;
      if (!m.has(r.requestId) || off < m.get(r.requestId)!) m.set(r.requestId, off);
    }
    const order = [...steps.keys()].sort((a, b) => median([...firstOffset.get(a)!.values()]) - median([...firstOffset.get(b)!.values()]));
    categories.push({
      category,
      count: e2e.length,
      e2e: stats(e2e.filter((r) => !r.errorType).map((r) => r.durationMs)),
      steps: order.map((step) => {
        const groups = new Map<string, TimingRow[]>();
        for (const r of steps.get(step)!) { const k = `${r.role}\u0000${r.model}`; (groups.get(k) ?? groups.set(k, []).get(k)!).push(r); }
        const models = [...groups.values()].map((g) => {
          const errs = new Map<string, { count: number; last: number }>();
          for (const r of g) if (r.errorType) { const e = errs.get(r.errorType) ?? { count: 0, last: 0 }; e.count++; e.last = Math.max(e.last, r.endedAt.getTime()); errs.set(r.errorType, e); }
          return {
            model: g[0].model, role: (g[0].role === 'fallback' ? 'fallback' : 'primary') as 'primary' | 'fallback', count: g.length, ...stats(g.map((r) => r.durationMs)),
            errors: [...errs].map(([type, e]) => ({ type, count: e.count, lastAt: new Date(e.last).toISOString() })).sort((a, b) => b.count - a.count),
          };
        }).sort((a, b) => (a.role === b.role ? b.count - a.count : a.role === 'primary' ? -1 : 1));
        return { step, models };
      }),
    });
  }
  return { period, from, to, categories };
}

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const DAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const dayOf = (iso: string) => new Date(iso + 'T00:00:00Z');
const fdate = (iso: string) => { const d = dayOf(iso); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
const parisHour = (d: Date) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' }).format(d));

/** Créneaux de la courbe : par heure (Jour), par jour (7 jours, 1 mois), par semaine se terminant la veille (3 et 6 mois). */
export function seriesSlots(period: LatencyPeriod, from: string, to: string): { labels: string[]; slotOf: (d: Date) => number } {
  if (period === 'd') return { labels: Array.from({ length: 24 }, (_, h) => `${h} h`), slotOf: (d) => (parisDay(d) === from ? parisHour(d) : -1) };
  const n = daysBetween(from, to) + 1;
  if (period === '7' || period === '1m') {
    const labels = Array.from({ length: n }, (_, i) => { const iso = addDays(from, i); return period === '7' ? `${DAYS[dayOf(iso).getUTCDay()]} ${dayOf(iso).getUTCDate()}` : fdate(iso); });
    return { labels, slotOf: (d) => { const i = daysBetween(from, parisDay(d)); return i >= 0 && i < n ? i : -1; } };
  }
  const w = Math.ceil(n / 7);
  const labels = Array.from({ length: w }, (_, i) => { const start = addDays(to, -(w - 1 - i) * 7 - 6); return fdate(daysBetween(start, from) > 0 ? from : start); });
  return { labels, slotOf: (d) => { const back = daysBetween(parisDay(d), to); return back >= 0 && back < n ? w - 1 - Math.floor(back / 7) : -1; } };
}

/**
 * Courbe d'évolution : par catégorie, le bout en bout des prompts servis ; par modèle, tous ses appels. Chaque point
 * porte ses erreurs (étapes en erreur de la catégorie, ou appels en erreur du modèle) ; créneau vide : valeurs nulles.
 */
export function buildLatencySeries(rows: TimingRow[], period: LatencyPeriod, from: string, to: string, axis: 'cat' | 'mod', id: string): SeriesPoint[] {
  const { labels, slotOf } = seriesSlots(period, from, to);
  const vals: number[][] = labels.map(() => []), err = labels.map(() => 0);
  for (const r of rows) {
    const mine = axis === 'cat' ? r.category === id : r.model === id && r.step !== 'e2e';
    if (!mine) continue;
    const i = slotOf(r.startedAt);
    if (i < 0) continue;
    if (axis === 'cat') {
      if (r.step === 'e2e') { if (!r.errorType) vals[i].push(r.durationMs); } else if (r.errorType) err[i]++;
    } else {
      vals[i].push(r.durationMs);
      if (r.errorType) err[i]++;
    }
  }
  return labels.map((l, i) => (vals[i].length ? { l, ...stats(vals[i]), err: err[i] } : { l, med: null, min: null, max: null, err: err[i] }));
}
