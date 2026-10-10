import { Injectable } from '@nestjs/common';
import { PrismaService } from '../core/prisma.service';
import { TodayService } from '../core/today.service';
import { LlmService, AI_BUDGET_LINES, AI_FUNCTIONS, budgetLineOf } from '../core/llm.service';
import { CACHE_READ_FACTOR, CACHE_WRITE_FACTOR } from '../core/llm-client';
import { ModelCategory } from '../domain/ai-pricing';
import { addDays, daysBetween, isoInTimezone, lastDayOfMonth } from '../domain/dates';
import { csvFile, csvNum, encodeCursor, JournalFn, splitCost, stepsOf } from '../domain/journal';
import { Prisma, UsageRecord } from '@prisma/client';

/** Fuseau de la plateforme pour les agrégats de consommation (§ 7.4 : fuseau du projet ou de la plateforme). */
export const PLATFORM_TIMEZONE = 'Europe/Paris';
/** Fenêtre du rythme de dépense utilisé pour la projection (§ 7.4). */
export const PROJECTION_WINDOW_DAYS = 7;
/** Seuil d’alerte proposé pour une ligne budgétaire sans plafond enregistré. */
export const DEFAULT_WARN_PCT = 80;

export type FunctionState = 'NOMINAL' | 'FALLBACK' | 'UNAVAILABLE';
export type ThresholdStatus = 'EXCEEDED' | 'ALERT' | 'UNDER' | 'NO_LIMIT';

export interface ThresholdView {
  id: string;
  name: string;
  limitEur: number | null;
  warnPct: number;
  enabled: boolean;
  spent: number;
  projection: number;
  pct: number | null;
  status: ThresholdStatus;
  version: number;
}

export interface MonthView {
  today: string;
  monthStart: string;
  monthEnd: string;
  spent: number;
  projection: number;
  rate7d: number;
  crossDate: string | null;
  sameDateLastMonth: number;
  byFunction: Array<{ functionId: string; spent: number; tokensIn: number; tokensOut: number; fallbackCost: number; models: string[] }>;
  /** Jetons du mois (entrée + sortie), toutes fonctions. */
  tokensMonth: number;
  /** Dépense cumulée de chaque jour du mois écoulé (graphique Budget). */
  dailyCumul: Array<{ date: string; spent: number }>;
  fallbackDays: string[];
  thresholds: ThresholdView[];
}

/** Calculs de consommation, de projection, d'état des fonctions IA et de plafonds (brief Console § 7.3-7.4). */
@Injectable()
export class UsageService {
  constructor(private readonly prisma: PrismaService, private readonly today: TodayService, private readonly llm: LlmService) {}

  day(d: Date) {
    return isoInTimezone(d, PLATFORM_TIMEZONE);
  }

  todayIso() {
    return this.today.today(PLATFORM_TIMEZONE);
  }

  /** Début (inclus) d'un jour civil de la plateforme, en UTC. */
  private startOf(iso: string): Date {
    // Europe/Paris : UTC+1 ou +2 ; on prend minuit local via le décalage du jour.
    const probe = new Date(`${iso}T12:00:00Z`);
    const local = new Intl.DateTimeFormat('en-GB', { timeZone: PLATFORM_TIMEZONE, hour: '2-digit', hourCycle: 'h23' }).format(probe);
    const offsetH = Number(local) - 12;
    return new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10), -offsetH));
  }

  /** Appels de la période (10/10/2026 : sans les appels simulés par le bouchon, jamais facturés). */
  async records(fromIso: string, toIso: string, projectId?: string) {
    return this.prisma.usageRecord.findMany({
      where: { at: { gte: this.startOf(fromIso), lt: this.startOf(addDays(toIso, 1)) }, simulated: false, ...(projectId ? { projectId } : {}) },
      orderBy: { at: 'asc' },
    });
  }

  /** État d'une fonction : Nominal / Sur secours / Indisponible (§ 7.3), selon la catégorie qu'elle accepte. */
  async functionState(primary: string, fallback: string | null, category: ModelCategory = 'LLM'): Promise<FunctionState> {
    if (await this.llm.modelAvailable(primary, category)) return 'NOMINAL';
    if (await this.llm.modelAvailable(fallback, category)) return 'FALLBACK';
    return 'UNAVAILABLE';
  }

  /** Dépense du mois, projection au rythme des 7 derniers jours, date de franchissement du plafond global. */
  async month(): Promise<MonthView> {
    const today = this.todayIso();
    const monthStart = `${today.slice(0, 8)}01`;
    const monthEnd = `${today.slice(0, 8)}${String(lastDayOfMonth(+today.slice(0, 4), +today.slice(5, 7))).padStart(2, '0')}`;
    const rows = await this.records(monthStart, today);
    const spent = rows.reduce((a, r) => a + r.costEur, 0);
    const winFrom = addDays(today, -(PROJECTION_WINDOW_DAYS - 1));
    const last7 = await this.records(winFrom, today);
    const rate7d = last7.reduce((a, r) => a + r.costEur, 0) / PROJECTION_WINDOW_DAYS;
    const remaining = daysBetween(today, monthEnd);
    const projection = spent + rate7d * remaining;
    const all = await this.prisma.budgetThreshold.findUnique({ where: { id: 'all' } });
    let crossDate: string | null = null;
    if (all?.limitEur && rate7d > 0) {
      if (spent >= all.limitEur) crossDate = today;
      else {
        const k = Math.ceil((all.limitEur - spent) / rate7d);
        if (k <= remaining) crossDate = addDays(today, k);
      }
    }
    // Même date du mois précédent (comparaison).
    const prevEnd = new Date(`${monthStart}T12:00:00Z`);
    prevEnd.setUTCDate(0);
    const prevMonthStart = `${prevEnd.toISOString().slice(0, 8)}01`;
    const sameDay = `${prevEnd.toISOString().slice(0, 8)}${String(Math.min(+today.slice(8, 10), prevEnd.getUTCDate())).padStart(2, '0')}`;
    const prevRows = await this.records(prevMonthStart, sameDay);
    // Par ligne budgétaire : les étapes d'une chaîne (ex. Documents) sont regroupées (spécification IA § 2).
    const byFunction = AI_BUDGET_LINES.map((f) => {
      const fr = rows.filter((r) => budgetLineOf(r.functionId) === f.id);
      return { functionId: f.id, spent: fr.reduce((a, r) => a + r.costEur, 0), tokensIn: fr.reduce((a, r) => a + r.tokensIn, 0), tokensOut: fr.reduce((a, r) => a + r.tokensOut, 0), fallbackCost: fr.filter((r) => r.fallbackUsed).reduce((a, r) => a + r.costEur, 0) };
    });
    const fallbackDays = [...new Set(rows.filter((r) => r.fallbackUsed).map((r) => this.day(r.at)))].sort();
    // Modèles de chaque ligne budgétaire : principal affecté de chacune de ses étapes (Documents : 3).
    const [asg, models] = await Promise.all([this.prisma.modelAssignment.findMany(), this.prisma.aiModel.findMany({ select: { id: true, name: true } })]);
    const modelsOf = (line: string) => [...new Set(AI_FUNCTIONS.filter((f) => budgetLineOf(f.id) === line).map((f) => asg.find((a) => a.functionId === f.id)?.primaryModelId).filter(Boolean).map((id) => models.find((m) => m.id === id)?.name ?? id!))];
    // Dépense cumulée jour par jour depuis le 1er (graphique Budget).
    const perDay = new Map<string, number>();
    for (const r of rows) perDay.set(this.day(r.at), (perDay.get(this.day(r.at)) ?? 0) + r.costEur);
    const dailyCumul: Array<{ date: string; spent: number }> = [];
    let cum = 0;
    for (let d = monthStart; d <= today; d = addDays(d, 1)) { cum += perDay.get(d) ?? 0; dailyCumul.push({ date: d, spent: round2(cum) }); }
    return {
      today,
      monthStart,
      monthEnd,
      spent: round2(spent),
      projection: round2(projection),
      rate7d: round2(rate7d),
      crossDate,
      sameDateLastMonth: round2(prevRows.reduce((a, r) => a + r.costEur, 0)),
      byFunction: byFunction.map((x) => ({ ...x, spent: round2(x.spent), fallbackCost: round2(x.fallbackCost), models: modelsOf(x.functionId) })),
      tokensMonth: rows.reduce((a, r) => a + r.tokensIn + r.tokensOut, 0),
      dailyCumul,
      fallbackDays,
      thresholds: await this.thresholds(spent, projection, byFunction, rate7d, remaining),
    };
  }

  /**
   * Statut d'un plafond (vue Consommation et coûts, 02/10/2026) : projection fin de mois ≥ plafond → Dépassement projeté ;
   * projection au-delà du seuil d'alerte → Alerte projetée ; sinon Sous le plafond. `spent` n'intervient plus (gardé pour la signature).
   */
  static status(limit: number | null, warnPct: number, spent: number, projection: number): ThresholdStatus {
    void spent;
    if (!limit) return 'NO_LIMIT';
    if (projection >= limit) return 'EXCEEDED';
    if (projection > (limit * warnPct) / 100) return 'ALERT';
    return 'UNDER';
  }

  async thresholds(spent?: number, projection?: number, byFunction?: Array<{ functionId: string; spent: number }>, rate7d?: number, remaining?: number): Promise<ThresholdView[]> {
    if (spent === undefined) {
      const m = await this.month();
      return m.thresholds;
    }
    const saved = await this.prisma.budgetThreshold.findMany();
    const order = ['all', ...AI_BUDGET_LINES.map((f) => f.id)];
    // Une ligne par ligne budgétaire, même sans plafond enregistré (Rapports, Guidage console…) : sans plafond, seuil 80 %.
    const rows = [
      ...order.map((id) => saved.find((t) => t.id === id) ?? { id, limitEur: null, warnPct: DEFAULT_WARN_PCT, enabled: false, version: 0 }),
      ...saved.filter((t) => !order.includes(t.id)),
    ];
    const today = this.todayIso();
    const last7 = await this.records(addDays(today, -(PROJECTION_WINDOW_DAYS - 1)), today);
    return rows
      .map((t) => {
        const s = t.id === 'all' ? spent : byFunction!.find((f) => f.functionId === t.id)?.spent ?? 0;
        const rate = t.id === 'all' ? rate7d! : last7.filter((r) => budgetLineOf(r.functionId) === t.id).reduce((a, r) => a + r.costEur, 0) / PROJECTION_WINDOW_DAYS;
        const proj = t.id === 'all' ? projection! : s + rate * remaining!;
        return {
          id: t.id,
          name: t.id === 'all' ? 'Budget mensuel global' : AI_BUDGET_LINES.find((f) => f.id === t.id)?.name ?? t.id,
          limitEur: t.limitEur,
          warnPct: t.warnPct,
          enabled: t.enabled,
          spent: round2(s),
          projection: round2(proj),
          pct: t.limitEur ? Math.round((s / t.limitEur) * 1000) / 10 : null,
          status: (t.enabled ? UsageService.status(t.limitEur, t.warnPct, s, proj) : 'NO_LIMIT') as ThresholdStatus,
          version: t.version,
        };
      });
  }

  /** Séries et agrégats (€ et jetons) pour l'écran Consommation et coûts. */
  async series(fromIso: string, toIso: string, groupBy: string, projectId?: string) {
    const rows = await this.records(fromIso, toIso, projectId);
    const key = (r: (typeof rows)[number]) => (groupBy === 'function' ? budgetLineOf(r.functionId) : groupBy === 'step' ? r.functionId : groupBy === 'model' ? r.modelId : groupBy === 'provider' ? r.providerId : this.day(r.at));
    const map = new Map<string, { key: string; costEur: number; tokensIn: number; tokensOut: number; calls: number; fallbackCost: number }>();
    if (groupBy === 'day') for (let d = fromIso; d <= toIso; d = addDays(d, 1)) map.set(d, { key: d, costEur: 0, tokensIn: 0, tokensOut: 0, calls: 0, fallbackCost: 0 });
    for (const r of rows) {
      const k = key(r);
      const e = map.get(k) ?? { key: k, costEur: 0, tokensIn: 0, tokensOut: 0, calls: 0, fallbackCost: 0 };
      e.costEur += r.costEur;
      e.tokensIn += r.tokensIn;
      e.tokensOut += r.tokensOut;
      e.calls += 1;
      if (r.fallbackUsed) e.fallbackCost += r.costEur;
      map.set(k, e);
    }
    const items = [...map.values()].map((e) => ({ ...e, costEur: round4(e.costEur), fallbackCost: round4(e.fallbackCost) }));
    return {
      from: fromIso,
      to: toIso,
      groupBy,
      items,
      totals: { costEur: round2(rows.reduce((a, r) => a + r.costEur, 0)), tokensIn: rows.reduce((a, r) => a + r.tokensIn, 0), tokensOut: rows.reduce((a, r) => a + r.tokensOut, 0), calls: rows.length },
      // Détail jour × fonction × modèle, pour les graphiques empilés du frontend.
      detail: groupBy === 'day' ? rows.map((r) => ({ day: this.day(r.at), functionId: budgetLineOf(r.functionId), stepId: r.functionId, requests: r.requests, modelId: r.modelId, providerId: r.providerId, tokensIn: r.tokensIn, tokensOut: r.tokensOut, costEur: round4(r.costEur), fallbackUsed: r.fallbackUsed })) : undefined,
    };
  }

  // ───────────── Journal des appels (spécification JOURNAL) ─────────────

  private journalWhere(fromIso: string, toIso: string, fn?: JournalFn, provider?: string): Prisma.UsageRecordWhereInput {
    return {
      at: { gte: this.startOf(fromIso), lt: this.startOf(addDays(toIso, 1)) },
      // Appels simulés par le bouchon : ni coût réel ni appel au fournisseur, absents du journal (10/10/2026).
      simulated: false,
      ...(fn ? { functionId: { in: stepsOf(fn) } } : {}),
      ...(provider ? { providerId: provider } : {}),
    };
  }

  /**
   * Un point par jour de la période (jours vides inclus) : jetons, coût entrée / sortie, appels (§ 4). `byHour` (période
   * Jour du sélecteur, 01/10/2026) : un point par heure de la journée (heure de Paris), `hour` de 0 à 23.
   */
  async daily(fromIso: string, toIso: string, fn?: JournalFn, byHour = false) {
    const [rows, models] = await Promise.all([
      this.prisma.usageRecord.findMany({ where: this.journalWhere(fromIso, toIso, fn), select: { at: true, modelId: true, tokensIn: true, tokensOut: true, requests: true, costEur: true, priceIn: true, priceOut: true, pricePer1k: true } }),
      this.prisma.aiModel.findMany({ select: { id: true, priceInPerMTok: true } }),
    ]);
    const catalogIn = new Map(models.map((m) => [m.id, m.priceInPerMTok]));
    const days = new Map<string, { date: string; hour?: number; tokensIn: number; tokensOut: number; costIn: number; costOut: number; calls: number }>();
    const hourOf = new Intl.DateTimeFormat('en-GB', { timeZone: PLATFORM_TIMEZONE, hour: '2-digit', hourCycle: 'h23' });
    if (byHour) for (let h = 0; h < 24; h++) days.set(String(h), { date: fromIso, hour: h, tokensIn: 0, tokensOut: 0, costIn: 0, costOut: 0, calls: 0 });
    else for (let d = fromIso; d <= toIso; d = addDays(d, 1)) days.set(d, { date: d, tokensIn: 0, tokensOut: 0, costIn: 0, costOut: 0, calls: 0 });
    for (const r of rows) {
      const e = days.get(byHour ? String(Number(hourOf.format(r.at))) : this.day(r.at));
      if (!e) continue;
      const c = splitCost(r, catalogIn.get(r.modelId));
      e.tokensIn += r.tokensIn;
      e.tokensOut += r.tokensOut;
      e.costIn += c.costIn;
      e.costOut += c.costOut;
      e.calls += 1;
    }
    return [...days.values()].map((e) => ({ ...e, costIn: round6(e.costIn), costOut: round6(e.costOut) }));
  }

  /** Page du journal : du plus récent au plus ancien, pagination par curseur (§ 4). */
  async calls(fromIso: string, toIso: string, opts: { fn?: JournalFn; provider?: string; cursor?: { at: Date; id: string } | null; limit: number }) {
    const where = this.journalWhere(fromIso, toIso, opts.fn, opts.provider);
    const page: Prisma.UsageRecordWhereInput = opts.cursor ? { AND: [where, { OR: [{ at: { lt: opts.cursor.at } }, { at: opts.cursor.at, id: { lt: opts.cursor.id } }] }] } : where;
    const [rows, total] = await Promise.all([
      this.prisma.usageRecord.findMany({ where: page, orderBy: [{ at: 'desc' }, { id: 'desc' }], take: opts.limit + 1 }),
      this.prisma.usageRecord.count({ where }),
    ]);
    const more = rows.length > opts.limit;
    const items = await this.callViews(rows.slice(0, opts.limit));
    const last = rows[opts.limit - 1];
    return { items, nextCursor: more && last ? encodeCursor(last.at, last.id) : null, total };
  }

  /** Tous les appels du filtre, pour l'export CSV (mêmes colonnes que le journal). */
  async callsCsv(fromIso: string, toIso: string, fn?: JournalFn, provider?: string): Promise<{ csv: string; count: number }> {
    const rows = await this.prisma.usageRecord.findMany({ where: this.journalWhere(fromIso, toIso, fn, provider), orderBy: [{ at: 'desc' }, { id: 'desc' }] });
    const items = await this.callViews(rows);
    const time = new Intl.DateTimeFormat('fr-FR', { timeZone: PLATFORM_TIMEZONE, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    const header = ['Date', 'Heure', 'Fonction', 'Fournisseur', 'Modèle', 'Secours', 'Tokens', 'Tokens entrée', 'Tokens sortie', 'Tarif entrée (€/M)', 'Tarif sortie (€/M)', 'Coût (€)', 'Requête', 'Durée (ms)'];
    const lines = items.map((c) => [
      this.day(new Date(c.at)), time.format(new Date(c.at)), JOURNAL_FN_NAMES[c.fn] ?? c.fn, c.providerName, c.modelName, c.fallback ? 'oui' : 'non',
      String(c.tokensIn + c.tokensOut), String(c.tokensIn), String(c.tokensOut), csvNum(c.priceIn), csvNum(c.priceOut), csvNum(c.costEur, 6), c.id, c.durationMs == null ? '' : String(c.durationMs),
    ]);
    return { csv: csvFile(header, lines), count: lines.length };
  }

  /** Vue d'un appel : noms du modèle et du fournisseur, ligne budgétaire ; jamais de prompt ni de réponse (non stockés). */
  private async callViews(rows: UsageRecord[]) {
    const [models, providers] = await Promise.all([this.prisma.aiModel.findMany({ select: { id: true, name: true } }), this.prisma.provider.findMany({ select: { id: true, name: true } })]);
    const mn = new Map(models.map((m) => [m.id, m.name])), pn = new Map(providers.map((p) => [p.id, p.name]));
    return rows.map((r) => ({
      id: r.id, at: r.at.toISOString(), fn: budgetLineOf(r.functionId), step: r.functionId,
      provider: r.providerId, providerName: pn.get(r.providerId) ?? r.providerId, model: r.modelId, modelName: mn.get(r.modelId) ?? r.modelId,
      fallback: r.fallbackUsed, tokensIn: r.tokensIn, tokensOut: r.tokensOut, requests: r.requests,
      priceIn: r.priceIn, priceOut: r.priceOut, pricePer1k: r.pricePer1k, costEur: round6(r.costEur), durationMs: r.durationMs, source: r.source,
      cacheRead: r.cacheReadTokens, cacheWrite: r.cacheWriteTokens, billedIn: billedInOf(r),
    }));
  }
}

/**
 * Jetons d'entrée facturés d'un appel (calcul affiché du coût, 02/10/2026) : jetons lus en cache à 10 %, écrits à 125 %,
 * les autres au tarif plein ; pour un appel antérieur à l'enregistrement du cache, déduits du coût stocké (le calcul
 * affiché retombe alors exactement sur le coût de la ligne). Null sans tarif au jeton.
 */
export function billedInOf(r: Pick<UsageRecord, 'tokensIn' | 'tokensOut' | 'costEur' | 'priceIn' | 'priceOut' | 'cacheReadTokens' | 'cacheWriteTokens'>): number | null {
  if (r.priceIn == null) return null;
  if (r.cacheReadTokens || r.cacheWriteTokens) return Math.max(0, r.tokensIn - r.cacheReadTokens - r.cacheWriteTokens) + r.cacheReadTokens * CACHE_READ_FACTOR + r.cacheWriteTokens * CACHE_WRITE_FACTOR;
  if (!r.priceIn) return r.tokensIn;
  const derived = ((r.costEur - (r.tokensOut * (r.priceOut ?? 0)) / 1e6) * 1e6) / r.priceIn;
  return Math.abs(derived - r.tokensIn) < 0.5 ? r.tokensIn : Math.max(0, derived);
}

/** Libellés des lignes budgétaires dans le journal et son export. */
export const JOURNAL_FN_NAMES: Record<string, string> = { insights: 'Insights', rapports: 'Rapports', guidage: 'Guidage console', docs: 'Documents', crud: 'Gestion des données', init_projet: 'Initialisation projet' };

function round6(n: number) {
  return Math.round(n * 1e6) / 1e6;
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}
function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}
