import { Injectable, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { Actor } from '../core/auth/auth';
import { AuditService } from '../core/audit.service';
import { conflict, businessRule } from '../core/errors';
import { LlmService } from '../core/llm.service';
import { PdfReadError, readPdfLines } from '../core/pdf-text';
import { PrismaService } from '../core/prisma.service';
import { StorageService } from '../core/storage.service';
import { TodayService } from '../core/today.service';
import { adminCtx } from './profiles.service';
import { GUIDE_BUSY, GUIDE_INTERRUPTED, GUIDE_MAX_BYTES, GUIDE_NO_TEXT, GUIDE_PDF_ONLY, GUIDE_SCANNED, GUIDE_STEPS, GUIDE_TOO_BIG, isPdf, nextGuideVersion } from '../domain/guide';
import { chunkBlocks, embeddingText, GuideChunk, hnswIndexSql, scannedReason, toBlocks, vectorLiteral } from '../domain/guide-index';

/** Fichier reçu (multer). */
export interface GuideFile { originalname: string; size: number; buffer: Buffer }

/** Extraits enregistrés par requête (vecteurs de 1 536 nombres : lots modestes). */
const INSERT_BATCH = 20;

/**
 * Guide utilisateur : dépôt, indexation et remplacement sûr (décision du 30/09/2026).
 * - Contrôles immédiats (taille, PDF réel, lisible, non protégé, avec du texte) : refus tracé dans l'historique.
 * - Structure et découpage en extraits (`domain/guide-index.ts`), puis, en tâche de fond : vectorisation par le modèle
 *   de la fonction Vectorisation (sans secours) et enregistrement des vecteurs (pgvector, index HNSW par dimension).
 * - Le nouveau guide ne remplace l'ancien qu'une fois l'indexation réussie, en une transaction ; l'ancien fichier est
 *   supprimé ensuite. En cas d'échec, l'ancien guide (fichier et vecteurs) reste en place et l'échec est tracé.
 * - Un seul dépôt en cours à la fois (index unique partiel) ; un traitement interrompu par un redémarrage est clos en échec.
 */
@Injectable()
export class GuideIndexService implements OnModuleInit {
  /** Traitement en cours (les tests l'attendent avec `idle()`). */
  private running: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly llm: LlmService,
    private readonly audit: AuditService,
    private readonly today: TodayService,
  ) {}

  async onModuleInit() {
    await this.recoverInterrupted();
  }

  /** Attend la fin du traitement en cours (tests). */
  async idle() {
    await this.running;
  }

  /** Dépôts restés « en cours » (serveur arrêté pendant l'indexation) : clos en échec, extraits et fichier retirés. */
  async recoverInterrupted() {
    const stale = await this.prisma.guideUpload.findMany({ where: { status: 'INDEXING' } });
    for (const u of stale) await this.fail(u.id, u.storageKey, GUIDE_INTERRUPTED);
  }

  /** Dépôt : contrôles et découpage immédiats (refus tracé), puis indexation en tâche de fond. */
  async submit(actor: Actor, file: GuideFile) {
    if (await this.prisma.guideUpload.findFirst({ where: { status: 'INDEXING' } })) throw conflict('INDEXING', GUIDE_BUSY);
    const base = { at: this.today.now(), accountId: actor.accountId, by: actor.fullName, fileName: (file.originalname || 'guide.pdf').slice(0, 200), size: file.size };
    const refuse = async (message: string, extra: { pages?: number } = {}) => {
      await this.prisma.guideUpload.create({ data: { ...base, ...extra, status: 'FAILED', error: message, finishedAt: this.today.now() } });
      return businessRule(message, { file: message });
    };
    if (file.size > GUIDE_MAX_BYTES) throw await refuse(GUIDE_TOO_BIG);
    if (!isPdf(file.buffer)) throw await refuse(GUIDE_PDF_ONLY);
    let read: Awaited<ReturnType<typeof readPdfLines>>;
    try {
      read = await readPdfLines(file.buffer);
    } catch (e) {
      throw await refuse(e instanceof PdfReadError ? e.message : GUIDE_PDF_ONLY);
    }
    if (scannedReason(read.lines, read.pages)) throw await refuse(GUIDE_SCANNED, { pages: read.pages });
    const chunks = chunkBlocks(toBlocks(read.lines, read.pages));
    if (!chunks.length) throw await refuse(GUIDE_NO_TEXT, { pages: read.pages });

    const key = await this.storage.put('guide', file.buffer, '.pdf');
    let upload;
    try {
      upload = await this.prisma.guideUpload.create({ data: { ...base, pages: read.pages, chunks: chunks.length, status: 'INDEXING', step: 4, stepLabel: GUIDE_STEPS[3], progress: 0, storageKey: key } });
    } catch (e) {
      await this.storage.remove(key);
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw conflict('INDEXING', GUIDE_BUSY);
      throw e;
    }
    this.running = this.index(actor, upload.id, key, chunks).finally(() => { this.running = null; });
    return { uploadId: upload.id, status: 'INDEXING', pages: read.pages, chunks: chunks.length };
  }

  /** Vectorisation, enregistrement, puis bascule vers le nouveau guide (ou échec sans toucher à l'ancien). */
  private async index(actor: Actor, uploadId: string, key: string, chunks: GuideChunk[]) {
    await new Promise((r) => setImmediate(r));
    try {
      const emb = await this.llm.embedTexts(chunks.map(embeddingText), 'GUIDE', (done, total) =>
        this.prisma.guideUpload.update({ where: { id: uploadId }, data: { progress: Math.round((done / total) * 90) } }).then(() => undefined));
      await this.prisma.guideUpload.update({ where: { id: uploadId }, data: { step: 5, stepLabel: GUIDE_STEPS[4], progress: 92, embeddingModel: emb.modelId, embeddingName: emb.modelName, embeddingDims: emb.dims } });
      for (let i = 0; i < chunks.length; i += INSERT_BATCH) await this.insertChunks(uploadId, emb.dims, chunks.slice(i, i + INSERT_BATCH), emb.vectors.slice(i, i + INSERT_BATCH));
      const idx = hnswIndexSql(emb.dims);
      if (idx) await this.prisma.$executeRawUnsafe(idx);

      // Bascule : la nouvelle version entre en vigueur, les anciens extraits disparaissent, en une seule transaction.
      const old = await this.prisma.$transaction(async (db) => {
        const prev = await db.guideVersion.findFirst({ orderBy: { seq: 'desc' } });
        const v = nextGuideVersion(prev?.v);
        const up = await db.guideUpload.findUniqueOrThrow({ where: { id: uploadId } });
        const row = await db.guideVersion.create({ data: { v, at: this.today.now(), accountId: up.accountId, by: up.by, size: up.size, fileName: up.fileName, storageKey: key, uploadId, pages: up.pages, chunks: chunks.length } });
        await db.guideUpload.update({ where: { id: uploadId }, data: { status: 'SUCCESS', version: v, progress: 100, finishedAt: this.today.now() } });
        await db.guideChunk.deleteMany({ where: { uploadId: { not: uploadId } } });
        const replaced = await db.guideVersion.findMany({ where: { id: { not: row.id }, storageKey: { not: '' } } });
        await db.guideVersion.updateMany({ where: { id: { in: replaced.map((r) => r.id) } }, data: { storageKey: '' } });
        await this.audit.action(db, adminCtx(actor), { action: 'Publication du guide utilisateur', target: `Guide utilisateur v${v}${prev ? ` · remplace la v${prev.v}` : ''}`, severity: 'SENSITIVE', entityType: 'GuideVersion', entityId: row.id, details: { v, size: up.size, fileName: up.fileName, pages: up.pages, chunks: chunks.length, model: emb.modelName, dims: emb.dims } });
        return replaced.map((r) => r.storageKey);
      }, { timeout: 30_000 });
      // Ancien fichier supprimé seulement après la bascule réussie.
      for (const k of old) await this.storage.remove(k).catch(() => {});
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.fail(uploadId, key, `Échec de l’indexation : ${msg}`.slice(0, 500));
      await this.audit.action(this.prisma, adminCtx(actor), { action: 'Échec de publication du guide utilisateur', target: msg.slice(0, 200), severity: 'INFO', entityType: 'GuideUpload', entityId: uploadId });
    }
  }

  private async insertChunks(uploadId: string, dims: number, chunks: GuideChunk[], vectors: number[][]) {
    const values: string[] = [];
    const params: unknown[] = [];
    chunks.forEach((c, k) => {
      const b = params.length;
      values.push(`($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8}, $${b + 9}, $${b + 10}, $${b + 11}::vector)`);
      params.push(`gc_${randomBytes(9).toString('hex')}`, uploadId, c.position, c.path.join(' › '), c.heading, c.pageStart, c.pageEnd, c.content, c.tokens, dims, vectorLiteral(vectors[k]));
    });
    await this.prisma.$executeRawUnsafe(`INSERT INTO guide_chunks (id, upload_id, position, section_path, heading, page_start, page_end, content, tokens, dims, embedding) VALUES ${values.join(', ')}`, ...params);
  }

  /** Échec : extraits partiels et fichier du dépôt retirés ; l'ancien guide n'est pas touché. */
  private async fail(uploadId: string, key: string | null, message: string) {
    await this.prisma.guideChunk.deleteMany({ where: { uploadId } });
    if (key) await this.storage.remove(key).catch(() => {});
    await this.prisma.guideUpload.update({ where: { id: uploadId }, data: { status: 'FAILED', error: message, finishedAt: this.today.now(), storageKey: null } });
  }

  // ───────────── Lecture ─────────────

  /** État affiché par la vue : guide en vigueur et son index, dépôt en cours, dernier échec plus récent que le guide. */
  async status() {
    const cur = await this.prisma.guideVersion.findFirst({ orderBy: { seq: 'desc' } });
    const curUpload = cur?.uploadId ? await this.prisma.guideUpload.findUnique({ where: { id: cur.uploadId } }) : null;
    const indexing = await this.prisma.guideUpload.findFirst({ where: { status: 'INDEXING' } });
    // Dernier dépôt, s'il a échoué (l'horloge peut être figée : l'identifiant départage les dépôts d'un même instant).
    const last = await this.prisma.guideUpload.findFirst({ where: { status: { not: 'INDEXING' } }, orderBy: [{ at: 'desc' }, { id: 'desc' }] });
    const lastFailure = last?.status === 'FAILED' ? last : null;
    const indexed = cur?.uploadId ? await this.prisma.guideChunk.count({ where: { uploadId: cur.uploadId } }) : 0;
    return {
      current: cur ? { v: cur.v, fileName: cur.fileName, at: cur.at, by: cur.by, size: cur.size, pages: cur.pages, chunks: indexed, model: curUpload?.embeddingName ?? null, modelId: curUpload?.embeddingModel ?? null, dims: curUpload?.embeddingDims ?? null, indexed: indexed > 0 } : null,
      indexing: indexing ? { uploadId: indexing.id, fileName: indexing.fileName, at: indexing.at, by: indexing.by, step: indexing.step, steps: GUIDE_STEPS.length, stepLabel: indexing.stepLabel, progress: indexing.progress, pages: indexing.pages, chunks: indexing.chunks } : null,
      lastFailure: lastFailure ? { at: lastFailure.at, by: lastFailure.by, fileName: lastFailure.fileName, error: lastFailure.error } : null,
    };
  }

  /** Historique des dépôts, du plus récent au plus ancien. */
  async uploads() {
    const rows = await this.prisma.guideUpload.findMany({ orderBy: [{ at: 'desc' }, { id: 'desc' }], take: 200 });
    return rows.map((u) => ({ id: u.id, at: u.at, by: u.by, fileName: u.fileName, size: u.size, pages: u.pages, chunks: u.chunks, status: u.status, error: u.error, version: u.version, model: u.embeddingName, modelId: u.embeddingModel, dims: u.embeddingDims, finishedAt: u.finishedAt }));
  }
}
