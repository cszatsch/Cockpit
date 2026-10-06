import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { config } from '../core/config';
import { decryptSecret } from '../core/crypto';
import { businessRule } from '../core/errors';
import { JobsService } from '../core/jobs.service';
import { PrismaService } from '../core/prisma.service';
import { USD_PER_EUR } from '../domain/ai-pricing';
import {
  benchmarkPct, bestThroughput, matchOpenRouter, MODEL_STATS_BENCHMARK, MODEL_STATS_CRON, MODEL_STATS_TIMEOUT_MS, OPENROUTER_API, OpenRouterModel, sessionEur,
} from '../domain/model-stats';

/** Fournisseur dont la clé sert au relevé (l'API des benchmarks et les débits exigent une clé OpenRouter). */
export const MODEL_STATS_PROVIDER = 'openrouter';

/**
 * Mesures OpenRouter des modèles (06/10/2026) : relevé quotidien et à la demande (Console › Fournisseurs et modèles).
 * Pour chaque LLM retrouvé chez OpenRouter : score au τ²-Bench Airline, coût moyen d'une session, débit médian du
 * meilleur fournisseur. Un relevé n'efface jamais une valeur : seules les mesures disponibles remplacent les anciennes
 * (une valeur saisie à la main reste tant qu'OpenRouter ne publie rien pour ce modèle).
 */
@Injectable()
export class ModelStatsService implements OnModuleInit {
  private readonly log = new Logger('ModelStats');

  constructor(private readonly prisma: PrismaService, private readonly jobs: JobsService) {}

  onModuleInit() {
    this.jobs.register('models.stats', () => this.refresh().then(() => undefined).catch((e) => this.log.warn(`Relevé OpenRouter en échec : ${e.message}`)));
    this.jobs.schedule('models.stats', MODEL_STATS_CRON);
  }

  /** Appel à l'API d'OpenRouter, avec délai. */
  private async call<T>(path: string, key: string | null): Promise<T> {
    const r = await fetch(OPENROUTER_API + path, { headers: key ? { Authorization: `Bearer ${key}` } : {}, signal: AbortSignal.timeout(MODEL_STATS_TIMEOUT_MS) });
    if (!r.ok) throw new Error(`OpenRouter ${path.split('?')[0]} : HTTP ${r.status}`);
    return (await r.json()) as T;
  }

  async refresh(): Promise<{ total: number; matched: number; updated: number; at: string }> {
    if (config.offline) throw businessRule('Relevé impossible hors ligne.');
    const p = await this.prisma.provider.findUnique({ where: { id: MODEL_STATS_PROVIDER } });
    if (!p?.keyCipher) throw businessRule('Clé OpenRouter requise : saisissez-la dans Fournisseurs et modèles.');
    const key = decryptSecret(p.keyCipher);
    const [list, bench] = await Promise.all([
      this.call<{ data: OpenRouterModel[] }>('/models', null),
      this.call<{ data: Array<{ model_permaslug: string; accuracy: number; avg_cost_per_task: number }> }>(`/benchmarks?source=openrouter&benchmark_type=${MODEL_STATS_BENCHMARK}`, key),
    ]);
    const models = await this.prisma.aiModel.findMany({ where: { category: 'LLM' } });
    const at = new Date();
    let matched = 0, updated = 0;
    for (const m of models) {
      const or = matchOpenRouter(list.data, m);
      if (!or) continue;
      matched++;
      const slug = or.canonical_slug ?? or.id;
      const b = bench.data.find((x) => x.model_permaslug === slug || x.model_permaslug === or.id);
      let tps: number | null = null;
      try {
        const details = or.links?.details ?? `/models/${slug}/endpoints`;
        const e = await this.call<{ data: { endpoints: Parameters<typeof bestThroughput>[0] } }>(details.replace(/^\/api\/v1/, ''), key);
        tps = bestThroughput(e.data.endpoints);
      } catch (e) { this.log.warn(`Débit de ${or.id} indisponible : ${(e as Error).message}`); }
      const data = {
        openrouterId: or.id, statsAt: at,
        ...(b ? { benchmarkScore: benchmarkPct(b.accuracy), costPerSessionEur: sessionEur(b.avg_cost_per_task, USD_PER_EUR) } : {}),
        ...(tps != null ? { tokensPerSecond: tps } : {}),
      };
      await this.prisma.aiModel.update({ where: { id: m.id }, data });
      if (b || tps != null) updated++;
    }
    return { total: models.length, matched, updated, at: at.toISOString() };
  }
}
