import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { config } from '../core/config';
import { businessRule } from '../core/errors';
import { JobsService } from '../core/jobs.service';
import { PrismaService } from '../core/prisma.service';
import { USD_PER_EUR } from '../domain/ai-pricing';
import {
  BenchmarksData, intelligenceIndex, matchOpenRouter, MODEL_STATS_CRON, MODEL_STATS_TIMEOUT_MS, OPENROUTER_API, OPENROUTER_RANKINGS_API, OpenRouterModel,
  PerformanceData, SessionCostData, sessionCostUsd, sessionEur, throughputOf,
} from '../domain/model-stats';

/**
 * Mesures OpenRouter des modèles (06/10/2026) : relevé quotidien et à la demande (Console › Fournisseurs et modèles),
 * sur les données de la page Rankings d'OpenRouter (sans clé). Pour chaque LLM retrouvé : Intelligence Index, coût d'une
 * session de 10 à 49 tours (Hermes Agent), débit médian du meilleur fournisseur. Un relevé n'efface jamais une valeur :
 * seules les mesures publiées remplacent les anciennes (une valeur saisie à la main reste sinon).
 */
@Injectable()
export class ModelStatsService implements OnModuleInit {
  private readonly log = new Logger('ModelStats');

  constructor(private readonly prisma: PrismaService, private readonly jobs: JobsService) {}

  onModuleInit() {
    this.jobs.register('models.stats', () => this.refresh().then(() => undefined).catch((e) => this.log.warn(`Relevé OpenRouter en échec : ${e.message}`)));
    this.jobs.schedule('models.stats', MODEL_STATS_CRON);
  }

  private async call<T>(url: string): Promise<T> {
    const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(MODEL_STATS_TIMEOUT_MS) });
    if (!r.ok) throw new Error(`OpenRouter ${new URL(url).pathname} : HTTP ${r.status}`);
    return (await r.json()) as T;
  }

  async refresh(): Promise<{ total: number; matched: number; updated: number; at: string }> {
    if (config.offline) throw businessRule('Relevé impossible hors ligne.');
    const [list, sessions, bench, perf] = await Promise.all([
      this.call<{ data: OpenRouterModel[] }>(`${OPENROUTER_API}/models`),
      this.call<{ data: SessionCostData }>(`${OPENROUTER_RANKINGS_API}/session-cost`),
      this.call<{ data: BenchmarksData }>(`${OPENROUTER_RANKINGS_API}/benchmarks`),
      this.call<{ data: PerformanceData }>(`${OPENROUTER_RANKINGS_API}/performance`),
    ]);
    const models = await this.prisma.aiModel.findMany({ where: { category: 'LLM' } });
    const at = new Date();
    let matched = 0, updated = 0;
    for (const m of models) {
      const or = matchOpenRouter(list.data, m);
      if (!or) continue;
      matched++;
      const slug = or.canonical_slug ?? or.id;
      const score = intelligenceIndex(bench.data, slug), usd = sessionCostUsd(sessions.data, slug), tps = throughputOf(perf.data, slug);
      await this.prisma.aiModel.update({
        where: { id: m.id },
        data: {
          openrouterId: or.id, statsAt: at,
          ...(score != null ? { benchmarkScore: score } : {}),
          ...(usd != null ? { costPerSessionEur: sessionEur(usd, USD_PER_EUR) } : {}),
          ...(tps != null ? { tokensPerSecond: tps } : {}),
        },
      });
      if (score != null || usd != null || tps != null) updated++;
    }
    return { total: models.length, matched, updated, at: at.toISOString() };
  }
}
