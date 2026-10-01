import { Injectable } from '@nestjs/common';
import { PrismaService } from '../core/prisma.service';
import { LlmService } from '../core/llm.service';
import { vectorLiteral, HNSW_HALFVEC_MAX_DIMS, HNSW_VECTOR_MAX_DIMS } from '../domain/guide-index';
import { GuideExtract, pagesOf, queryForEmbedding, RagSettings, RAG_DEFAULTS } from '../domain/jev-rag';
import { GUIDE_APP_LABELS, GuideApp } from '../domain/guide';
import { techErrors } from '../core/tech-errors';

/** Délai minimal de la seconde tentative de vectorisation de la question (latence très variable du fournisseur). */
export const GUIDE_EMBED_RETRY_TIMEOUT_MS = 25_000;

/** Résultat d'une recherche dans le guide, avec tout ce que le journal technique doit tracer. */
export interface GuideSearch {
  /** Motif si la recherche n'a rien donné d'exploitable. */
  empty: null | 'GUIDE_NON_INDEXE' | 'AUCUN_EXTRAIT';
  extracts: GuideExtract[];
  /** Extraits trouvés avant le seuil (8 plus proches), pour l'analyse. */
  candidates: Array<{ id: string; heading: string; pages: string; similarity: number }>;
  embedModel: string | null;
  reranker: string | null;
  rerankFallback: string | null;
  timings: { embedMs?: number; searchMs?: number; rerankMs?: number };
}

/**
 * Recherche sémantique dans le guide utilisateur (décision du 30/09/2026) :
 * 1. la question est vectorisée avec le modèle et la dimension qui ont servi à indexer le guide en vigueur ;
 * 2. les `searchK` extraits les plus proches sont lus dans pgvector (index HNSW partiel de la dimension), seuls ceux
 *    dont la similarité cosinus atteint `minSimilarity` sont gardés ;
 * 3. le modèle de la fonction Reclassement garde les `keepK` meilleurs ; s'il échoue (erreur, délai), les `keepK`
 *    premiers de la recherche sont gardés et l'incident est tracé.
 */
@Injectable()
export class GuideSearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
  ) {}

  /** Réglages en vigueur de l'application, valeurs par défaut sinon. */
  async settings(app: GuideApp): Promise<RagSettings> {
    const r = await this.prisma.jevRagSettings.findUnique({ where: { id: app } });
    return r ? { searchK: r.searchK, keepK: r.keepK, minSimilarity: r.minSimilarity, embedTimeoutMs: r.embedTimeoutMs, rerankTimeoutMs: r.rerankTimeoutMs, llmTimeoutMs: r.llmTimeoutMs } : { ...RAG_DEFAULTS };
  }

  /**
   * Recherche dans le guide d'une seule application. Sans guide publié : GUIDE_NON_INDEXE (Jev ne répond pas). Index
   * utilisé : le dernier dépôt indexé de l'application (pendant une réindexation, ou après son échec, l'ancien).
   */
  async search(app: GuideApp, question: string, s: RagSettings): Promise<GuideSearch> {
    const out: GuideSearch = { empty: null, extracts: [], candidates: [], embedModel: null, reranker: null, rerankFallback: null, timings: {} };
    const cur = await this.prisma.guideVersion.findFirst({ where: { app }, orderBy: { seq: 'desc' } });
    const up = cur ? await this.prisma.guideUpload.findFirst({ where: { app, status: 'SUCCESS' }, orderBy: [{ at: 'desc' }, { id: 'desc' }] }) : null;
    if (!up?.embeddingModel || !up.embeddingDims || !(await this.prisma.guideChunk.count({ where: { uploadId: up.id } }))) return { ...out, empty: 'GUIDE_NON_INDEXE' };
    const dims = up.embeddingDims;
    out.embedModel = up.embeddingName ?? up.embeddingModel;

    let t0 = Date.now();
    let vector: number[];
    const text = [queryForEmbedding(`${up.embeddingModel} ${up.embeddingName ?? ''}`, question)];
    const incident = `JEV ${GUIDE_APP_LABELS[app].name} · recherche dans le guide`;
    try {
      vector = (await this.llm.embedWithModel(up.embeddingModel, dims, text, 'JEV', { timeoutMs: s.embedTimeoutMs })).vectors[0];
    } catch (first) {
      // Latence très variable du modèle de vectorisation (de 0,4 s à plus de 30 s constatés le 01/10/2026) : une
      // seconde tentative, avec un délai plus long, avant de renoncer.
      try {
        vector = (await this.llm.embedWithModel(up.embeddingModel, dims, text, 'JEV', { timeoutMs: Math.max(2 * s.embedTimeoutMs, GUIDE_EMBED_RETRY_TIMEOUT_MS) })).vectors[0];
      } catch (e) {
        // Modèle de l'index indisponible : aucun autre modèle ne peut interroger ces vecteurs. Incident dans les
        // notifications de l'administrateur (fermé à la recherche réussie suivante).
        const msg = `vectorisation de la question impossible (${up.embeddingName ?? up.embeddingModel}) : ${e instanceof Error ? e.message : e}`;
        techErrors.open.add(incident);
        techErrors.onError?.(incident, msg);
        throw Object.assign(new Error(`Vectorisation de la question impossible : ${e instanceof Error ? e.message : e}`), { reason: 'GUIDE_NON_INDEXE' as const });
      }
    }
    if (techErrors.open.delete(incident)) techErrors.onRecovered?.(incident);
    out.timings.embedMs = Date.now() - t0;

    // Même expression que l'index HNSW (partiel sur la dimension) pour qu'il serve à la recherche.
    t0 = Date.now();
    const type = dims <= HNSW_VECTOR_MAX_DIMS ? 'vector' : dims <= HNSW_HALFVEC_MAX_DIMS ? 'halfvec' : 'vector';
    const expr = `embedding::${type}(${dims})`;
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string; section_path: string; heading: string; page_start: number; page_end: number; content: string; sim: number }>>(
      `SELECT id, section_path, heading, page_start, page_end, content, 1 - (${expr} <=> $1::${type}(${dims})) AS sim FROM guide_chunks WHERE dims = ${dims} AND upload_id = $2 ORDER BY ${expr} <=> $1::${type}(${dims}) LIMIT $3`,
      vectorLiteral(vector), up.id, s.searchK,
    );
    out.timings.searchMs = Date.now() - t0;
    const found: GuideExtract[] = rows.map((r) => ({ id: r.id, sectionPath: r.section_path, heading: r.heading, pageStart: r.page_start, pageEnd: r.page_end, content: r.content, similarity: Math.round(Number(r.sim) * 1000) / 1000 }));
    out.candidates = found.map((x) => ({ id: x.id, heading: x.heading, pages: pagesOf(x), similarity: x.similarity }));
    const kept = found.filter((x) => x.similarity >= s.minSimilarity);
    if (!kept.length) return { ...out, empty: 'AUCUN_EXTRAIT' };

    // Reclassement ; repli : les premiers de la recherche.
    t0 = Date.now();
    try {
      const r = await this.llm.rerankTexts(question, kept.map((x) => `${x.sectionPath}\n${x.content}`), Math.min(s.keepK, kept.length), 'JEV', s.rerankTimeoutMs);
      out.reranker = `${r.modelName}${r.fallbackUsed ? ' (secours)' : ''}`;
      out.extracts = r.results.map((x) => ({ ...kept[x.index], rerankScore: Math.round(x.score * 1000) / 1000 }));
    } catch (e) {
      out.rerankFallback = e instanceof Error ? e.message : String(e);
      out.extracts = kept.slice(0, s.keepK).map((x) => ({ ...x, rerankScore: null }));
      console.warn(`[jev] reclassement indisponible, repli sur la recherche : ${out.rerankFallback}`);
    }
    out.timings.rerankMs = Date.now() - t0;
    return out;
  }
}
