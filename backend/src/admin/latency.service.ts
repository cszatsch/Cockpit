import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../core/prisma.service';
import { JobsService } from '../core/jobs.service';
import { TodayService } from '../core/today.service';
import { badRequest } from '../core/errors';
import { LATENCY_ROUTER_MODEL, LATENCY_SERVICE_MODEL, latencySinks, StepTimingRow } from '../core/latency';
import { addDays } from '../domain/dates';
import {
  buildLatencyReport, buildLatencySeries, LATENCY_RETENTION_DAYS, LatencyPeriod, latencyInstants, latencyRange, LatencyReportBody, SeriesPoint, TimingRow,
} from '../domain/latency';

/** Nom et fournisseur des « modèles » qui ne sont pas des modèles d'IA du catalogue. */
export const LATENCY_PSEUDO_MODELS: Record<string, { name: string; provider: string; service?: boolean }> = {
  [LATENCY_ROUTER_MODEL]: { name: 'JEV · TypeSafe', provider: 'Aiguillage (carte du Registre)' },
  [LATENCY_SERVICE_MODEL]: { name: 'Service RISE', provider: 'Traitement interne', service: true },
};

export type LatencyReport = LatencyReportBody & { models: Record<string, { name: string; provider: string; service?: boolean }> };

/**
 * Temps de traitement de Jev (spécification TEMPS, 01/10/2026) : enregistrement des mesures (après la réponse, jamais
 * bloquant), rapport et courbe d'une période, purge au-delà de 190 jours (tâche `latency.purge`, chaque nuit).
 */
@Injectable()
export class LatencyService implements OnModuleInit, OnModuleDestroy {
  private readonly sink = (rows: StepTimingRow[]) =>
    this.prisma.stepTiming.createMany({ data: rows.map((r) => ({ ...r, durationMs: Math.max(0, r.endedAt.getTime() - r.startedAt.getTime()) })) });

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly today: TodayService,
  ) {}

  onModuleInit() {
    latencySinks.push(this.sink);
    this.jobs.register('latency.purge', () => this.purge(new Date()).then(() => undefined));
    this.jobs.schedule('latency.purge', '40 3 * * *');
  }

  onModuleDestroy() {
    const i = latencySinks.indexOf(this.sink);
    if (i >= 0) latencySinks.splice(i, 1);
  }

  /** Lignes de plus de `LATENCY_RETENTION_DAYS` jours supprimées. */
  purge(now: Date) {
    return this.prisma.stepTiming.deleteMany({ where: { startedAt: { lt: new Date(now.getTime() - LATENCY_RETENTION_DAYS * 86_400_000) } } });
  }

  private range(period: LatencyPeriod, day: string | null) {
    const r = latencyRange(period, day, addDays(this.today.today(), -1));
    if ('error' in r) throw badRequest(r.error, { day: r.error });
    return r;
  }

  private rows(from: string, to: string): Promise<TimingRow[]> {
    return this.prisma.stepTiming.findMany({
      where: { startedAt: latencyInstants(from, to) },
      select: { requestId: true, category: true, step: true, model: true, role: true, startedAt: true, endedAt: true, durationMs: true, errorType: true },
    });
  }

  async report(period: LatencyPeriod, day: string | null): Promise<LatencyReport> {
    const { from, to } = this.range(period, day);
    const body = buildLatencyReport(await this.rows(from, to), period, from, to);
    // Noms et fournisseurs des modèles cités (l'écran n'en connaît aucun à l'avance).
    const ids = new Set(body.categories.flatMap((c) => c.steps.flatMap((s) => s.models.map((m) => m.model))));
    const found = await this.prisma.aiModel.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true, providerId: true } });
    const providers = await this.prisma.provider.findMany({ where: { id: { in: found.map((m) => m.providerId) } }, select: { id: true, name: true } });
    const models: LatencyReport['models'] = {};
    for (const id of ids) {
      const m = found.find((x) => x.id === id);
      models[id] = LATENCY_PSEUDO_MODELS[id] ?? (m ? { name: m.name, provider: providers.find((p) => p.id === m.providerId)?.name ?? '' } : { name: id, provider: '' });
    }
    return { ...body, models };
  }

  async series(period: LatencyPeriod, day: string | null, axis: 'cat' | 'mod', id: string): Promise<SeriesPoint[]> {
    const { from, to } = this.range(period, day);
    return buildLatencySeries(await this.rows(from, to), period, from, to, axis, id);
  }
}
