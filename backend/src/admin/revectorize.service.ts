import { Injectable } from '@nestjs/common';
import { PrismaService } from '../core/prisma.service';
import { LlmService } from '../core/llm.service';
import { hnswIndexSql, vectorLiteral } from '../domain/guide-index';
import { embeddingText } from '../domain/guide-index';
import { KbChunk, kbEmbeddingText } from '../domain/kb-documents';
import { effectiveDimension } from '../domain/ai-pricing';

/** Textes vectorisés par appel (lots de l'API d'embedding). */
export const REVECTORIZE_BATCH = 32;
/** Clé de la notification de la Console (avancement, puis fin ou échec). */
export const REVECTORIZE_NOTIFICATION_KEY = 'revector:documents';

export interface RevectorizeState { status: 'IDLE' | 'RUNNING' | 'DONE' | 'FAILED'; model: string | null; dims: number | null; done: number; total: number; error: string | null }

/**
 * Revectorisation des documents (décision du 02/10/2026, vue « Fournisseurs et modèles ») : après un changement du
 * modèle ou de la dimension de la Vectorisation, une tâche de fond revectorise tous les extraits — Base de connaissance
 * de chaque projet (`kb_chunks`) et guides utilisateur (`guide_chunks`) — avec le modèle et la dimension affectés, en
 * vectorisant le même texte qu'à l'indexation. Un nouveau changement pendant la tâche la relance. Avancement, fin ou
 * échec : notification « Revectorisation des documents » de la Console.
 */
@Injectable()
export class RevectorizeService {
  private seq = 0;
  private running: Promise<void> | null = null;
  state: RevectorizeState = { status: 'IDLE', model: null, dims: null, done: 0, total: 0, error: null };

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
  ) {}

  /** Planifie la revectorisation (après la réponse de la requête d'affectation). */
  start(): void {
    const run = ++this.seq;
    const q: Promise<void> = new Promise<void>((res) => setImmediate(res)).then(() => this.run(run)).finally(() => { if (this.running === q) this.running = null; });
    this.running = q;
  }

  /** Attente de la tâche en cours (essais automatiques). */
  async idle(): Promise<void> {
    while (this.running) await this.running;
  }

  private stale(run: number) {
    return run !== this.seq;
  }

  private async notify(title: string, text: string) {
    const data = { kind: 'WARN' as const, title, text, actLabel: 'Voir les fournisseurs et modèles', target: 'providers' };
    await this.prisma.notification.upsert({
      where: { key: REVECTORIZE_NOTIFICATION_KEY },
      create: { key: REVECTORIZE_NOTIFICATION_KEY, ...data },
      update: { ...data, status: 'OPEN', readAt: null, resolvedAt: null, clearedAt: null },
    });
  }

  private async run(run: number) {
    try {
      const asg = await this.prisma.modelAssignment.findUnique({ where: { functionId: 'doc_vec' } });
      if (!asg) return;
      const model = await this.prisma.aiModel.findUniqueOrThrow({ where: { id: asg.primaryModelId } });
      const dims = effectiveDimension(asg.primaryDimension, model);
      const kb = await this.prisma.$queryRawUnsafe<Array<{ id: string; position: number; section: string; heading: string; content: string; page_start: number | null; page_end: number | null; slide: number | null; sheet: string | null; row_start: number | null; row_end: number | null; tokens: number; metadata: any }>>(
        `SELECT id, position, section, heading, content, page_start, page_end, slide, sheet, row_start, row_end, tokens, metadata FROM kb_chunks WHERE model IS DISTINCT FROM $1 OR dims IS DISTINCT FROM $2 ORDER BY document_id, position`, model.id, dims,
      );
      const uploads = await this.prisma.guideUpload.findMany({ where: { status: 'SUCCESS', OR: [{ embeddingModel: { not: model.id } }, { embeddingDims: { not: dims } }, { embeddingModel: null }] }, select: { id: true } });
      const guide = uploads.length
        ? await this.prisma.$queryRawUnsafe<Array<{ id: string; upload_id: string; position: number; section_path: string; heading: string; content: string; page_start: number; page_end: number; tokens: number }>>(
            `SELECT id, upload_id, position, section_path, heading, content, page_start, page_end, tokens FROM guide_chunks WHERE upload_id = ANY($1::text[]) ORDER BY upload_id, position`, uploads.map((u) => u.id),
          )
        : [];
      const total = kb.length + guide.length;
      this.state = { status: 'RUNNING', model: model.id, dims, done: 0, total, error: null };
      if (!total) { this.state.status = 'DONE'; return; }
      const label = `${model.name}${dims ? ` (${dims} dimensions)` : ''}`;
      await this.notify('Revectorisation des documents en cours', `${total} extraits (Base de connaissance et guides) revectorisés avec ${label}. La recherche dans les documents reprend à la fin.`);

      // Base de connaissance : texte enrichi des métadonnées du document, comme à l'indexation.
      const kbTexts = kb.map((r) => {
        const m = r.metadata ?? {};
        const c: KbChunk = { position: r.position, section: r.section, heading: r.heading, content: r.content, pageStart: r.page_start, pageEnd: r.page_end, slide: r.slide, sheet: r.sheet, rowStart: r.row_start, rowEnd: r.row_end, tokens: r.tokens };
        return kbEmbeddingText({ name: m.document ?? '', depositedAt: m.deposeLe ?? '', description: m.description ?? '' } as any, c);
      });
      for (let i = 0; i < kb.length; i += REVECTORIZE_BATCH) {
        if (this.stale(run)) return;
        const part = kb.slice(i, i + REVECTORIZE_BATCH);
        const emb = await this.llm.embedWithModel(model.id, dims, kbTexts.slice(i, i + REVECTORIZE_BATCH), 'COCKPIT');
        await this.prisma.$transaction(part.map((r, k) => this.prisma.$executeRawUnsafe(`UPDATE kb_chunks SET embedding = $1::vector, dims = $2, model = $3 WHERE id = $4`, vectorLiteral(emb.vectors[k]), emb.dims, model.id, r.id)));
        this.state.done += part.length;
      }
      if (kb.length) { const idx = hnswIndexSql(dims ?? 0, 'kb_chunks'); if (idx) await this.prisma.$executeRawUnsafe(idx); }
      // Les documents portent le modèle de leur index (affiché dans la Base de connaissance).
      if (kb.length) await this.prisma.document.updateMany({ where: { chunkCount: { gt: 0 } }, data: { embeddingModel: model.id, embeddingName: model.name } });

      // Guides : un index par dépôt, remplacé d'un bloc (la recherche garde l'ancien jusqu'à la fin).
      for (const up of uploads) {
        const rows = guide.filter((g) => g.upload_id === up.id);
        const vectors: number[][] = [];
        let used = dims;
        for (let i = 0; i < rows.length; i += REVECTORIZE_BATCH) {
          if (this.stale(run)) return;
          const texts = rows.slice(i, i + REVECTORIZE_BATCH).map((g) => embeddingText({ position: g.position, path: g.section_path.split(' › '), heading: g.heading, content: g.content, pageStart: g.page_start, pageEnd: g.page_end, tokens: g.tokens }));
          const emb = await this.llm.embedWithModel(model.id, dims, texts, 'GUIDE');
          vectors.push(...emb.vectors);
          used = emb.dims;
          this.state.done += texts.length;
        }
        await this.prisma.$transaction([
          ...rows.map((g, k) => this.prisma.$executeRawUnsafe(`UPDATE guide_chunks SET embedding = $1::vector, dims = $2 WHERE id = $3`, vectorLiteral(vectors[k]), used, g.id)),
          this.prisma.guideUpload.update({ where: { id: up.id }, data: { embeddingModel: model.id, embeddingName: model.name, embeddingDims: used } }),
        ]);
        const idx = hnswIndexSql(used ?? 0);
        if (idx) await this.prisma.$executeRawUnsafe(idx);
      }
      if (this.stale(run)) return;
      this.state.status = 'DONE';
      await this.notify('Revectorisation des documents terminée', `${total} extraits (Base de connaissance et guides) revectorisés avec ${label}.`);
    } catch (e) {
      if (this.stale(run)) return;
      const msg = e instanceof Error ? ((e as any).response?.message ?? e.message) : String(e);
      this.state = { ...this.state, status: 'FAILED', error: msg };
      console.error(`[revectorisation] échec : ${msg}`);
      await this.notify('Revectorisation des documents en échec', `${msg.slice(0, 300)}. Les extraits non traités gardent leurs anciens vecteurs ; modifiez de nouveau la Vectorisation pour relancer.`).catch(() => {});
    }
  }
}
