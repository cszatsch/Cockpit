import { Injectable } from '@nestjs/common';
import { PrismaService } from '../core/prisma.service';
import { TodayService } from '../core/today.service';
import { LlmService, AI_BUDGET_LINES, budgetLineOf } from '../core/llm.service';
import { ModelCategory } from '../domain/ai-pricing';
import { addDays, daysBetween, isoInTimezone, lastDayOfMonth } from '../domain/dates';

/** Fuseau de la plateforme pour les agrégats de consommation (§ 7.4 : fuseau du projet ou de la plateforme). */
export const PLATFORM_TIMEZONE = 'Europe/Paris';
/** Fenêtre du rythme de dépense utilisé pour la projection (§ 7.4). */
export const PROJECTION_WINDOW_DAYS = 7;

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
  byFunction: Array<{ functionId: string; spent: number; tokensIn: number; tokensOut: number; fallbackCost: number }>;
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

  async records(fromIso: string, toIso: string, projectId?: string) {
    return this.prisma.usageRecord.findMany({
      where: { at: { gte: this.startOf(fromIso), lt: this.startOf(addDays(toIso, 1)) }, ...(projectId ? { projectId } : {}) },
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
    return {
      today,
      monthStart,
      monthEnd,
      spent: round2(spent),
      projection: round2(projection),
      rate7d: round2(rate7d),
      crossDate,
      sameDateLastMonth: round2(prevRows.reduce((a, r) => a + r.costEur, 0)),
      byFunction: byFunction.map((x) => ({ ...x, spent: round2(x.spent), fallbackCost: round2(x.fallbackCost) })),
      fallbackDays,
      thresholds: await this.thresholds(spent, projection, byFunction, rate7d, remaining),
    };
  }

  /** Statut d'un plafond (§ 7.4) : Dépassement si projection > plafond, Alerte si dépense ≥ seuil, sinon Sous le plafond. */
  static status(limit: number | null, warnPct: number, spent: number, projection: number): ThresholdStatus {
    if (!limit) return 'NO_LIMIT';
    if (projection > limit) return 'EXCEEDED';
    if (spent >= (limit * warnPct) / 100) return 'ALERT';
    return 'UNDER';
  }

  async thresholds(spent?: number, projection?: number, byFunction?: Array<{ functionId: string; spent: number }>, rate7d?: number, remaining?: number): Promise<ThresholdView[]> {
    if (spent === undefined) {
      const m = await this.month();
      return m.thresholds;
    }
    const rows = await this.prisma.budgetThreshold.findMany({ orderBy: { id: 'asc' } });
    const order = ['all', ...AI_BUDGET_LINES.map((f) => f.id)];
    const today = this.todayIso();
    const last7 = await this.records(addDays(today, -(PROJECTION_WINDOW_DAYS - 1)), today);
    return rows
      .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
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
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}
function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}
