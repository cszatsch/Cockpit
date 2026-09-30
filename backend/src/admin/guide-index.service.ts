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
import { GUIDE_APP_LABELS, GUIDE_BUSY, GUIDE_INTERRUPTED, GUIDE_MAX_BYTES, GUIDE_NO_TEXT, GUIDE_PDF_ONLY, GUIDE_SCANNED, GUIDE_STEPS, GUIDE_TOO_BIG, GuideApp, isPdf, nextGuideVersion } from '../domain/guide';
import { chunkBlocks, embeddingText, GuideChunk, hnswIndexSql, scannedReason, toBlocks, vectorLiteral } from '../domain/guide-index';

/** Fichier reçu (multer). */
export interface GuideFile { originalname: string; size: number; buffer: Buffer }

/** Extraits enregistrés par requête (vecteurs de 1 536 nombres : lots modestes). */
const INSERT_BATCH = 20;

/**
 * Guide utilisateur, un par application (Console, Cockpit ; décisions du 30/09/2026) : dépôt, version, indexation.
 * - Contrôles immédiats (taille, PDF réel, lisible, non protégé, avec du texte) : refus tracé dans l'historique des dépôts.
 * - Dépôt accepté : la version suivante (1.0, puis +0.1) est créée et entre en vigueur ; le fichier de la version
 *   précédente n'est plus servi (supprimé). L'indexation part en tâche de fond.
 * - Index : l'ancien reste utilisé par Jev jusqu'à ce que le nouveau soit prêt, puis il est remplacé en une transaction.
 *   Échec : la version reste en vigueur, non indexée ; Jev garde le dernier index valide de l'application.
 * - Un seul dépôt en cours par application ; un traitement interrompu par un redémarrage est clos en échec.
 * - Aucune donnée partagée entre les applications (versions, dépôts, extraits, téléchargements, réglages).
 */
@Injectable()
export class GuideIndexService implements OnModuleInit {
  /** Traitements en cours, par application (les tests les attendent avec `idle()`). */
  private running = new Map<GuideApp, Promise<void>>();

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

  /** Attend la fin des traitements en cours (tests). */
  async idle() {
    await Promise.all([...this.running.values()]);
  }

  /** Dépôts restés « en cours » (serveur arrêté pendant l'indexation) : clos en échec, extraits partiels retirés. */
  async recoverInterrupted() {
    const stale = await this.prisma.guideUpload.findMany({ where: { status: 'INDEXING' } });
    for (const u of stale) await this.fail(u.id, GUIDE_INTERRUPTED);
  }

  /** Dépôt : contrôles et découpage immédiats (refus tracé), nouvelle version en vigueur, indexation en tâche de fond. */
  async submit(app: GuideApp, actor: Actor, file: GuideFile) {
    if (await this.prisma.guideUpload.findFirst({ where: { app, status: 'INDEXING' } })) throw conflict('INDEXING', GUIDE_BUSY);
    const base = { app, at: this.today.now(), accountId: actor.accountId, by: actor.fullName, fileName: (file.originalname || 'guide.pdf').slice(0, 200), size: file.size };
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

    const key = await this.storage.put(`guide/${app}`, file.buffer, '.pdf');
    let created: { uploadId: string; v: string; oldKeys: string[] };
    try {
      created = await this.prisma.$transaction(async (db) => {
        const upload = await db.guideUpload.create({ data: { ...base, pages: read.pages, chunks: chunks.length, status: 'INDEXING', step: 4, stepLabel: GUIDE_STEPS[3], progress: 0, storageKey: key } });
        const prev = await db.guideVersion.findFirst({ where: { app }, orderBy: { seq: 'desc' } });
        const v = nextGuideVersion(prev?.v);
        const row = await db.guideVersion.create({ data: { app, v, at: base.at, accountId: actor.accountId, by: actor.fullName, size: file.size, fileName: base.fileName, storageKey: key, uploadId: upload.id, pages: read.pages, chunks: chunks.length } });
        await db.guideUpload.update({ where: { id: upload.id }, data: { version: v } });
        // Un seul guide en vigueur : le fichier des versions précédentes n'est plus servi.
        const replaced = await db.guideVersion.findMany({ where: { app, id: { not: row.id }, storageKey: { not: '' } } });
        await db.guideVersion.updateMany({ where: { id: { in: replaced.map((r) => r.id) } }, data: { storageKey: '' } });
        await this.audit.action(db, adminCtx(actor), { action: `Publication du guide utilisateur ${GUIDE_APP_LABELS[app].of}`, target: `Guide utilisateur ${GUIDE_APP_LABELS[app].name} v${v}${prev ? ` · remplace la v${prev.v}` : ''}`, severity: 'SENSITIVE', entityType: 'GuideVersion', entityId: row.id, details: { app, v, size: file.size, fileName: base.fileName, pages: read.pages, chunks: chunks.length } });
        return { uploadId: upload.id, v, oldKeys: replaced.map((r) => r.storageKey) };
      });
    } catch (e) {
      await this.storage.remove(key);
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw conflict('INDEXING', GUIDE_BUSY);
      throw e;
    }
    for (const k of created.oldKeys) await this.storage.remove(k).catch((e) => console.warn(`[guide] ancien fichier non supprimé (${k}) : ${e instanceof Error ? e.message : e}`));
    const job = this.index(app, actor, created.uploadId, chunks).finally(() => { if (this.running.get(app) === job) this.running.delete(app); });
    this.running.set(app, job);
    return { uploadId: created.uploadId, v: created.v, status: 'INDEXING', pages: read.pages, chunks: chunks.length };
  }

  /** Vectorisation, enregistrement, puis bascule de l'index de l'application (l'ancien sert jusque-là). */
  private async index(app: GuideApp, actor: Actor, uploadId: string, chunks: GuideChunk[]) {
    await new Promise((r) => setImmediate(r));
    try {
      const emb = await this.llm.embedTexts(chunks.map(embeddingText), 'GUIDE', (done, total) =>
        this.prisma.guideUpload.update({ where: { id: uploadId }, data: { progress: Math.round((done / total) * 90) } }).then(() => undefined));
      await this.prisma.guideUpload.update({ where: { id: uploadId }, data: { step: 5, stepLabel: GUIDE_STEPS[4], progress: 92, embeddingModel: emb.modelId, embeddingName: emb.modelName, embeddingDims: emb.dims } });
      for (let i = 0; i < chunks.length; i += INSERT_BATCH) await this.insertChunks(uploadId, emb.dims, chunks.slice(i, i + INSERT_BATCH), emb.vectors.slice(i, i + INSERT_BATCH));
      const idx = hnswIndexSql(emb.dims);
      if (idx) await this.prisma.$executeRawUnsafe(idx);
      await this.prisma.$transaction(async (db) => {
        await db.guideUpload.update({ where: { id: uploadId }, data: { status: 'SUCCESS', progress: 100, finishedAt: this.today.now() } });
        await db.guideChunk.deleteMany({ where: { uploadId: { not: uploadId }, upload: { app } } });
      }, { timeout: 30_000 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[guide] échec de l’indexation du guide ${GUIDE_APP_LABELS[app].of} : ${msg}`);
      await this.fail(uploadId, `Échec de l’indexation : ${msg}`.slice(0, 500));
      await this.audit.action(this.prisma, adminCtx(actor), { action: `Échec de l’indexation du guide utilisateur ${GUIDE_APP_LABELS[app].of}`, target: msg.slice(0, 200), severity: 'INFO', entityType: 'GuideUpload', entityId: uploadId });
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

  /** Échec : extraits partiels retirés ; la version reste en vigueur (non indexée), l'ancien index n'est pas touché. */
  private async fail(uploadId: string, message: string) {
    await this.prisma.guideChunk.deleteMany({ where: { uploadId } });
    await this.prisma.guideUpload.update({ where: { id: uploadId }, data: { status: 'FAILED', error: message, finishedAt: this.today.now() } });
  }

  // ───────────── Lecture ─────────────

  /** Version en vigueur de l'application (la plus récente). */
  current(app: GuideApp) {
    return this.prisma.guideVersion.findFirst({ where: { app }, orderBy: { seq: 'desc' } });
  }

  /**
   * Données de l'écran pour une application (format `Guide` de la maquette) : versions (la première en vigueur),
   * téléchargements, état de l'index de la version en vigueur (`run` pendant l'indexation, `ok` une fois indexée,
   * null sinon).
   */
  async data(app: GuideApp) {
    const versions = await this.prisma.guideVersion.findMany({ where: { app }, orderBy: { seq: 'desc' } });
    const downloads = await this.prisma.guideDownload.findMany({ where: { app }, orderBy: { at: 'desc' } });
    const cur = versions[0];
    const up = cur?.uploadId ? await this.prisma.guideUpload.findUnique({ where: { id: cur.uploadId } }) : null;
    const indexed = up?.status === 'SUCCESS' ? await this.prisma.guideChunk.count({ where: { uploadId: up.id } }) : 0;
    const index = !up ? null : up.status === 'INDEXING' ? { status: 'run' as const, pages: up.pages, chunks: up.chunks, progress: up.progress } : up.status === 'SUCCESS' && indexed ? { status: 'ok' as const, pages: up.pages, chunks: indexed, model: up.embeddingName, dims: up.embeddingDims } : null;
    return {
      versions: versions.map((r) => ({ v: r.v, at: r.at, by: r.by, size: r.size, fileName: r.fileName })),
      downloads: downloads.map((r) => ({ user: r.user, role: r.role, at: r.at, version: r.version })),
      index,
      lastError: up?.status === 'FAILED' ? up.error : null,
    };
  }
}
