import { Injectable, OnModuleInit } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { Actor } from '../../core/auth/auth';
import { ProjectScope } from '../../core/access.service';
import { AuditService } from '../../core/audit.service';
import { ApiErrorWithBody, businessRule, conflict, forbidden, notFound } from '../../core/errors';
import { techId } from '../../core/ids';
import { LlmService } from '../../core/llm.service';
import { OfficeReadError, readDocx, readPptx, readXlsx } from '../../core/office-text';
import { PdfReadError, readPdfLines } from '../../core/pdf-text';
import { PrismaService } from '../../core/prisma.service';
import { StorageService } from '../../core/storage.service';
import { TodayService } from '../../core/today.service';
import { hnswIndexSql, HNSW_HALFVEC_MAX_DIMS, HNSW_VECTOR_MAX_DIMS, toBlocks, vectorLiteral } from '../../domain/guide-index';
import { canWriteTools } from '../../domain/rights';
import {
  chunkLocation, chunkMetadata, detectFormat, docxChunks, KbChunk, KbDocMeta, KbFormat, kbDuplicateContent, kbDuplicateName, kbEmbeddingText, KB_INTERRUPTED,
  KB_NO_TEXT, KB_SCANNED, KB_SUMMARY_MAX_TOKENS, KB_SUMMARY_SYSTEM, kbSizes, parseSummary, pdfChunks, pdfTextState, pptxChunks, summaryPrompt, xlsxChunks,
} from '../../domain/kb-documents';

/** Refus d'un fichier à l'extraction (scanné, sans texte). */
export class KbRefusal extends Error {}

/**
 * Nom du fichier en UTF-8 : multer le décode en latin1 (« SpÃ©cifications » pour « Spécifications ») ; il est relu en
 * UTF-8 quand c'est possible, sinon gardé tel quel.
 */
export function utf8Name(name: string): string {
  const b = Buffer.from(name, 'latin1');
  const u = b.toString('utf8');
  return /[\x80-\xff]/.test(name) && !u.includes(String.fromCharCode(0xfffd)) && Buffer.from(u, 'utf8').equals(b) ? u : name;
}

/** Fichier reçu (multer). */
export interface KbFile { originalname: string; size: number; buffer: Buffer }
export interface KbUploadMeta { n?: string; type?: string; conf?: 'INTERNAL' | 'RESTRICTED'; dateIso?: string }
/** Doublon de nom : remplacer un document existant, ou garder les deux. */
export interface KbDuplicateChoice { replaceId?: string; keepBoth?: boolean }

/** Extraits enregistrés par requête (vecteurs de 1 536 nombres : lots modestes). */
const INSERT_BATCH = 20;
/** Délai de la génération du résumé (document long). */
const SUMMARY_TIMEOUT_MS = 120_000;
/** Dossier des fichiers de la Base de connaissance (distinct de celui du guide de la Console). */
export const KB_STORAGE_DIR = 'base-connaissance';
/** Recherche : extraits lus au plus. */
export const KB_SEARCH_MAX = 20;

const FR_MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const frDate = (iso: string) => `${+iso.slice(8, 10)} ${FR_MONTHS[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}`;
const nextV = (v: string | null | undefined) => `v${(parseInt(String(v ?? 'v1').replace(/\D/g, ''), 10) || 1) + 1}`;

/**
 * Base de connaissance du Cockpit (décisions du 30/09/2026).
 * 1. Dépôt : type réel du fichier, taille, doublons, puis extraction et découpage immédiats (refus clair, tracé).
 * 2. Tâche de fond, un document après l'autre : résumé et description (fonction Synthèse), vectorisation des extraits
 *    enrichis de leurs métadonnées (fonction Vectorisation), enregistrement pgvector, index HNSW.
 * 3. Échec à n'importe quelle étape : aucun extrait, résumé ni description gardé, document « en échec » avec le motif.
 * 4. Remplacement : l'ancien document (fichier, extraits, résumé) n'est supprimé qu'une fois le nouveau indexé.
 */
@Injectable()
export class KbService implements OnModuleInit {
  /** File des traitements (un à la fois) ; les tests l'attendent avec `idle()`. */
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly llm: LlmService,
    private readonly audit: AuditService,
    private readonly today: TodayService,
  ) {}

  async onModuleInit() {
    // Traitements interrompus par un arrêt du serveur : clos en échec, sans donnée partielle.
    const stale = await this.prisma.document.findMany({ where: { ext: 'PENDING', src: 'UPLOADED', uploadedAt: { not: null } } });
    for (const d of stale) await this.fail(d.id, KB_INTERRUPTED, null);
  }

  async idle() {
    await this.queue;
  }

  // ───────────── Dépôt ─────────────

  async submit(scope: ProjectScope, actor: Actor, file: KbFile, meta: KbUploadMeta, dup: KbDuplicateChoice) {
    if (!canWriteTools(scope.access)) throw forbidden('Dépôt de documents : profil PMO ou Responsable');
    const projectId = scope.project.id;
    const fileName = utf8Name(file.originalname || 'document').slice(0, 200);
    const refuse = async (message: string, code = 'BUSINESS_RULE') => {
      await this.event(projectId, actor, { documentId: null, documentName: meta.n || fileName, action: 'REFUS', status: 'REFUSE', detail: message });
      return code === 'BUSINESS_RULE' ? businessRule(message, { file: message }) : conflict(code, message);
    };
    const kind = await detectFormat(file.buffer, fileName);
    if ('error' in kind) throw await refuse(kind.error);

    // Doublons : contenu identique refusé ; même nom → remplacer ou garder les deux (choix de l'utilisateur).
    const hash = createHash('sha256').update(file.buffer).digest('hex');
    const same = await this.prisma.document.findFirst({ where: { projectId, contentHash: hash, ext: { not: 'FAILED' } } });
    if (same) throw await refuse(kbDuplicateContent(same.n, frDate((same.uploadedAt ?? same.createdAt).toISOString().slice(0, 10))), 'DUPLICATE_CONTENT');
    let name = (meta.n || fileName.replace(/\.[^.]+$/, '')).trim().slice(0, 300);
    let replaced: Awaited<ReturnType<typeof this.prisma.document.findFirst>> = null;
    if (dup.replaceId) {
      replaced = await this.prisma.document.findFirst({ where: { id: dup.replaceId, projectId } });
      if (!replaced) throw notFound('Document à remplacer introuvable');
      if (!this.canDelete(scope, actor, replaced)) throw forbidden('Remplacement réservé au PMO et à l’auteur du dépôt');
      if (replaced.ext === 'PENDING') throw conflict('PROCESSING', 'Le document à remplacer est encore en cours de traitement.');
    } else {
      const homonyms = await this.prisma.document.findMany({ where: { projectId, n: { equals: name, mode: 'insensitive' }, ext: { not: 'FAILED' } } });
      const visibleHomonym = homonyms.find((d) => this.visible(scope, actor, d));
      if (visibleHomonym && !dup.keepBoth) {
        throw new ApiErrorWithBody(409, { code: 'DUPLICATE_NAME', message: kbDuplicateName(name), existing: { id: visibleHomonym.id, n: visibleHomonym.n, v: visibleHomonym.v, dateIso: visibleHomonym.dateIso, by: visibleHomonym.uploadedBy, canReplace: this.canDelete(scope, actor, visibleHomonym) } });
      }
      if (homonyms.length) name = await this.freeName(projectId, name);
    }

    // Extraction et découpage immédiats : un fichier illisible, protégé, scanné ou sans texte est refusé tout de suite.
    const sizes = kbSizes(await this.embeddingContext());
    let extracted: { chunks: KbChunk[]; pages: number | null; note: string | null };
    try {
      extracted = await this.extract(file.buffer, kind.format, name, sizes);
    } catch (e) {
      throw await refuse(e instanceof PdfReadError || e instanceof OfficeReadError || e instanceof KbRefusal ? e.message : `Lecture impossible : ${e instanceof Error ? e.message : e}`);
    }

    const key = await this.storage.put(`${KB_STORAGE_DIR}/${projectId}`, file.buffer, kind.ext);
    const now = this.today.now();
    const doc = await this.prisma.$transaction(async (db) => {
      const d = await db.document.create({
        data: {
          id: techId('doc'), projectId, n: name, type: meta.type ?? replaced?.type ?? 'Livrable', conf: meta.conf ?? replaced?.conf ?? 'INTERNAL', v: replaced ? nextV(replaced.v) : 'v1',
          dateIso: meta.dateIso ?? this.today.today(scope.project.timezone), src: 'UPLOADED', ext: 'PENDING', mime: kind.mime, fileKey: key, sizeBytes: file.size, pages: extracted.pages,
          format: kind.format, fileName, uploadedById: actor.accountId, uploadedBy: actor.fullName, uploadedAt: now, contentHash: hash, progress: 5, stepLabel: 'Résumé du document', replacesId: replaced?.id ?? null,
        },
        include: { links: true },
      });
      await this.audit.record(db, { actor, projectId, profileUsed: scope.access.pmo ? 'PMO' : 'RESPONSABLE' }, { entityType: 'DOCUMENT', entityId: d.id, before: null, after: { n: d.n, type: d.type, conf: d.conf, v: d.v, format: d.format, remplace: replaced?.id ?? null }, target: d.n });
      return d;
    });
    await this.event(projectId, actor, { documentId: doc.id, documentName: doc.n, action: replaced ? 'REMPLACEMENT' : 'DEPOT', status: 'EN_COURS', detail: `${kind.format} · ${extracted.chunks.length} extraits${replaced ? ` · remplace ${replaced.n} ${replaced.v}` : ''}` });
    const job = { id: doc.id, projectId, name: doc.n, type: doc.type, format: kind.format, depositedAt: now.toISOString().slice(0, 10), chunks: extracted.chunks, note: extracted.note, replacesId: replaced?.id ?? null, actor };
    this.queue = this.queue.then(() => this.index(job)).catch(() => undefined);
    return doc;
  }

  /** Texte structuré et extraits, selon le format. */
  async extract(buf: Buffer, format: KbFormat, title: string, sizes: ReturnType<typeof kbSizes>): Promise<{ chunks: KbChunk[]; pages: number | null; note: string | null }> {
    let chunks: KbChunk[] = [], pages: number | null = null, note: string | null = null;
    if (format === 'PDF') {
      const r = await readPdfLines(buf);
      pages = r.pages;
      const st = pdfTextState(r.lines, r.pages);
      if (st.scanned) throw new KbRefusal(KB_SCANNED);
      chunks = pdfChunks(toBlocks(r.lines, r.pages), title, sizes);
      if (st.pagesWithoutText) note = `${st.pagesWithoutText} page${st.pagesWithoutText > 1 ? 's' : ''} sans texte (images)`;
    } else if (format === 'DOCX') chunks = docxChunks(await readDocx(buf), title, sizes);
    else if (format === 'PPTX') {
      const slides = await readPptx(buf);
      pages = slides.length;
      chunks = pptxChunks(slides, sizes);
      const empty = slides.filter((s) => !s.title && !s.lines.length && !s.notes.length).length;
      if (empty && empty < slides.length) note = `${empty} diapositive${empty > 1 ? 's' : ''} sans texte`;
    } else {
      const sheets = await readXlsx(buf);
      chunks = xlsxChunks(sheets, sizes);
      if (sheets.some((s) => s.truncated)) note = 'Classeur tronqué : 20 000 lignes lues au plus';
    }
    if (!chunks.length) throw new KbRefusal(KB_NO_TEXT);
    return { chunks, pages, note };
  }

  /** Résumé, vectorisation, enregistrement ; bascule du remplacement ; échec sans donnée partielle. */
  private async index(j: { id: string; projectId: string; name: string; type: string; format: KbFormat; depositedAt: string; chunks: KbChunk[]; note: string | null; replacesId: string | null; actor: Actor }) {
    await new Promise((r) => setImmediate(r));
    const step = (progress: number, stepLabel: string) => this.prisma.document.update({ where: { id: j.id }, data: { progress, stepLabel } });
    try {
      // 1. Résumé et description (fonction Synthèse).
      const { prompt } = summaryPrompt(j.name, j.type, j.format, j.chunks);
      const r = await this.llm.complete({ functionId: 'doc_syn', source: 'COCKPIT', projectId: j.projectId, system: KB_SUMMARY_SYSTEM, prompt, timeoutMs: SUMMARY_TIMEOUT_MS, maxTokens: KB_SUMMARY_MAX_TOKENS });
      const { description, summary } = parseSummary(r.text, j.chunks.map((c) => c.content).join(' ').slice(0, 2000));
      await step(25, 'Vectorisation des extraits');
      // 2. Extraits enrichis (nom, date de dépôt, description, repère) puis vectorisés.
      const meta: KbDocMeta = { name: j.name, depositedAt: j.depositedAt, description };
      const emb = await this.llm.embedTexts(j.chunks.map((c) => kbEmbeddingText(meta, c)), 'COCKPIT', (done, total) => step(25 + Math.round((done / total) * 65), 'Vectorisation des extraits').then(() => undefined), j.projectId);
      await step(92, 'Enregistrement de l’index');
      await this.prisma.kbChunk.deleteMany({ where: { documentId: j.id } });
      for (let i = 0; i < j.chunks.length; i += INSERT_BATCH) await this.insertChunks(j, meta, emb.modelId, emb.dims, j.chunks.slice(i, i + INSERT_BATCH), emb.vectors.slice(i, i + INSERT_BATCH));
      const idx = hnswIndexSql(emb.dims, 'kb_chunks');
      if (idx) await this.prisma.$executeRawUnsafe(idx);
      // 3. Document indexé ; remplacement : l'ancien document disparaît (liens repris), en une transaction.
      const oldKey = await this.prisma.$transaction(async (db) => {
        let key: string | null = null;
        if (j.replacesId) {
          const old = await db.document.findUnique({ where: { id: j.replacesId }, include: { links: true } });
          if (old) {
            key = old.fileKey;
            for (const l of old.links) await db.documentLink.upsert({ where: { documentId_entityType_entityId: { documentId: j.id, entityType: l.entityType, entityId: l.entityId } }, create: { documentId: j.id, entityType: l.entityType, entityId: l.entityId }, update: {} });
            await db.document.delete({ where: { id: old.id } });
          }
        }
        await db.document.update({ where: { id: j.id }, data: { ext: j.note ? 'PARTIAL' : 'SUCCEEDED', extNote: j.note, summary, description, chunkCount: j.chunks.length, embeddingModel: emb.modelId, embeddingName: emb.modelName, embeddingDims: emb.dims, progress: 100, stepLabel: null, error: null, replacesId: null, version: { increment: 1 } } });
        return key;
      }, { timeout: 30_000 });
      if (oldKey) await this.storage.remove(oldKey).catch((e) => console.warn(`[base de connaissance] fichier de l’ancienne version non supprimé (${oldKey}) : ${e instanceof Error ? e.message : e}`));
      await this.event(j.projectId, j.actor, { documentId: j.id, documentName: j.name, action: 'INDEXE', status: j.note ? 'PARTIEL' : 'INDEXE', detail: `${j.chunks.length} extraits · ${emb.modelName} (${emb.dims} dim.)${j.note ? ` · ${j.note}` : ''}${j.replacesId ? ' · version précédente supprimée' : ''}` });
    } catch (e) {
      const msg = e instanceof Error ? ((e as any).response?.message ?? e.message) : String(e);
      console.error(`[base de connaissance] échec du traitement de « ${j.name} » (${j.id}) : ${msg}`);
      await this.fail(j.id, `Échec du traitement : ${msg}`.slice(0, 500), j.actor);
    }
  }

  private async insertChunks(j: { id: string; projectId: string }, meta: KbDocMeta, model: string, dims: number, chunks: KbChunk[], vectors: number[][]) {
    const values: string[] = [];
    const params: unknown[] = [];
    chunks.forEach((c, k) => {
      const b = params.length;
      const ph = Array.from({ length: 18 }, (_, i) => `$${b + i + 1}`);
      ph[13] += '::jsonb';
      ph[17] += '::vector';
      values.push(`(${ph.join(', ')})`);
      params.push(`kc_${randomBytes(9).toString('hex')}`, j.id, j.projectId, c.position, c.section, c.heading, c.pageStart, c.pageEnd, c.slide, c.sheet, c.rowStart, c.rowEnd, c.content, JSON.stringify(chunkMetadata(meta, c)), c.tokens, dims, model, vectorLiteral(vectors[k]));
    });
    await this.prisma.$executeRawUnsafe(`INSERT INTO kb_chunks (id, document_id, project_id, position, section, heading, page_start, page_end, slide, sheet, row_start, row_end, content, metadata, tokens, dims, model, embedding) VALUES ${values.join(', ')}`, ...params);
  }

  /** Échec : extraits, résumé et description retirés ; le fichier reste téléchargeable ; motif tracé. */
  private async fail(id: string, message: string, actor: Actor | null) {
    await this.prisma.kbChunk.deleteMany({ where: { documentId: id } });
    const d = await this.prisma.document.update({ where: { id }, data: { ext: 'FAILED', error: message, summary: null, description: null, chunkCount: null, progress: null, stepLabel: null, replacesId: null, version: { increment: 1 } } });
    await this.event(d.projectId, actor, { documentId: id, documentName: d.n, action: 'ECHEC', status: 'ECHEC', detail: message });
  }

  /**
   * Nouveau traitement d'un document déjà déposé (résumé et vecteurs refaits à partir du fichier stocké), par exemple
   * après une évolution du résumé ou un échec : le document repasse « en cours », ses extraits sont remplacés.
   */
  async reprocess(scope: ProjectScope, actor: Actor, id: string) {
    const d = await this.prisma.document.findFirst({ where: { id, projectId: scope.project.id } });
    if (!d || !this.visible(scope, actor, d)) throw notFound();
    if (!this.canDelete(scope, actor, d)) throw forbidden('Réservé au PMO et à l’auteur du dépôt');
    if (d.ext === 'PENDING') throw conflict('PROCESSING', 'Le document est déjà en cours de traitement.');
    const buf = d.fileKey ? await this.storage.get(d.fileKey) : null;
    if (!buf || !d.format) throw notFound('Fichier du document introuvable');
    const extracted = await this.extract(buf, d.format as KbFormat, d.n, kbSizes(await this.embeddingContext()));
    await this.prisma.document.update({ where: { id }, data: { ext: 'PENDING', progress: 5, stepLabel: 'Résumé du document', error: null, pages: extracted.pages ?? d.pages, version: { increment: 1 } } });
    await this.event(scope.project.id, actor, { documentId: id, documentName: d.n, action: 'RETRAITEMENT', status: 'EN_COURS', detail: `${d.format} · ${extracted.chunks.length} extraits` });
    const job = { id, projectId: scope.project.id, name: d.n, type: d.type, format: d.format as KbFormat, depositedAt: (d.uploadedAt ?? d.createdAt).toISOString().slice(0, 10), chunks: extracted.chunks, note: extracted.note, replacesId: null, actor };
    this.queue = this.queue.then(() => this.index(job)).catch(() => undefined);
    return this.prisma.document.findUniqueOrThrow({ where: { id }, include: { links: true } });
  }

  // ───────────── Suppression ─────────────

  canDelete(scope: ProjectScope, actor: Actor, d: { uploadedById: string | null }) {
    return scope.access.pmo || scope.access.admin || (!!d.uploadedById && d.uploadedById === actor.accountId && canWriteTools(scope.access));
  }

  /** Fichier, résumé et tous les vecteurs supprimés ; historique et audit. */
  async remove(scope: ProjectScope, actor: Actor, id: string) {
    const d = await this.prisma.document.findFirst({ where: { id, projectId: scope.project.id }, include: { links: true } });
    if (!d || !this.visible(scope, actor, d)) throw notFound();
    if (!this.canDelete(scope, actor, d)) throw forbidden('Suppression réservée au PMO et à l’auteur du dépôt');
    if (d.ext === 'PENDING' && d.uploadedAt) throw conflict('PROCESSING', 'Le document est en cours de traitement : attendez la fin avant de le supprimer.');
    await this.prisma.$transaction(async (db) => {
      await db.document.delete({ where: { id } });
      await this.audit.record(db, { actor, projectId: scope.project.id, profileUsed: scope.access.pmo ? 'PMO' : 'RESPONSABLE' }, { entityType: 'DOCUMENT', entityId: id, before: { n: d.n, type: d.type, v: d.v, conf: d.conf, format: d.format, chunks: d.chunkCount }, after: null, target: d.n });
    });
    if (d.fileKey) await this.storage.remove(d.fileKey).catch((e) => console.warn(`[base de connaissance] fichier non supprimé (${d.fileKey}) : ${e instanceof Error ? e.message : e}`));
    await this.event(scope.project.id, actor, { documentId: id, documentName: d.n, action: 'SUPPRESSION', status: 'SUPPRIME', detail: `${d.format ?? d.mime} · ${d.v}${d.chunkCount ? ` · ${d.chunkCount} extraits supprimés` : ''}` });
  }

  // ───────────── Lecture ─────────────

  /** Documents Restreints : PMO, administrateur, et l'auteur du dépôt. */
  visible(scope: ProjectScope, actor: Actor | null, d: { conf: string; uploadedById?: string | null }) {
    return d.conf !== 'RESTRICTED' || scope.access.pmo || scope.access.admin || (!!actor && !!d.uploadedById && d.uploadedById === actor.accountId);
  }

  async history(scope: ProjectScope) {
    const rows = await this.prisma.documentEvent.findMany({ where: { projectId: scope.project.id }, orderBy: [{ at: 'desc' }, { id: 'desc' }], take: 500 });
    return rows.map((e) => ({ at: e.at, by: e.by, documentId: e.documentId, document: e.documentName, action: e.action, status: e.status, detail: e.detail }));
  }

  /**
   * Recherche sémantique dans les documents du projet visibles de l'utilisateur : question vectorisée avec le modèle de
   * la fonction Vectorisation ; seuls les extraits vectorisés avec ce modèle et cette dimension sont comparés.
   */
  async search(scope: ProjectScope, actor: Actor, question: string, k = 8) {
    const emb = await this.llm.embedTexts([question], 'COCKPIT', undefined, scope.project.id);
    const dims = emb.dims;
    const type = dims <= HNSW_VECTOR_MAX_DIMS ? 'vector' : dims <= HNSW_HALFVEC_MAX_DIMS ? 'halfvec' : 'vector';
    const expr = `c.embedding::${type}(${dims})`;
    const seeAll = scope.access.pmo || scope.access.admin;
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string; document_id: string; n: string; section: string; heading: string; page_start: number | null; page_end: number | null; slide: number | null; sheet: string | null; row_start: number | null; row_end: number | null; content: string; sim: number }>>(
      `SELECT c.id, c.document_id, d.n, c.section, c.heading, c.page_start, c.page_end, c.slide, c.sheet, c.row_start, c.row_end, c.content, 1 - (${expr} <=> $1::${type}(${dims})) AS sim
       FROM kb_chunks c JOIN "Document" d ON d.id = c.document_id
       WHERE c.project_id = $2 AND c.dims = ${dims} AND c.model = $3 AND d.ext IN ('SUCCEEDED', 'PARTIAL')
         AND (${seeAll ? 'true' : `d.conf = 'INTERNAL' OR d.uploaded_by_id = $5`})
       ORDER BY ${expr} <=> $1::${type}(${dims}) LIMIT $4`,
      vectorLiteral(emb.vectors[0]), scope.project.id, emb.modelId, Math.min(Math.max(1, k), KB_SEARCH_MAX), ...(seeAll ? [] : [actor.accountId]),
    );
    return {
      model: emb.modelName,
      results: rows.map((r) => {
        const c = { position: 0, section: r.section, heading: r.heading, content: r.content, pageStart: r.page_start, pageEnd: r.page_end, slide: r.slide, sheet: r.sheet, rowStart: r.row_start, rowEnd: r.row_end, tokens: 0 };
        return { documentId: r.document_id, document: r.n, location: chunkLocation(c), page: r.page_start, slide: r.slide, sheet: r.sheet, similarity: Math.round(Number(r.sim) * 1000) / 1000, excerpt: r.content.slice(0, 400) };
      }),
    };
  }

  // ───────────── Outils ─────────────

  private async event(projectId: string, actor: Actor | null, e: { documentId: string | null; documentName: string; action: string; status: string; detail?: string | null }) {
    await this.prisma.documentEvent.create({ data: { id: techId('dev'), at: this.today.now(), projectId, documentId: e.documentId, documentName: e.documentName.slice(0, 300), accountId: actor?.accountId ?? null, by: actor?.fullName ?? 'Système', action: e.action, status: e.status, detail: e.detail?.slice(0, 1000) ?? null } });
  }

  /** Fenêtre (jetons) du modèle de vectorisation affecté : taille des extraits. */
  private async embeddingContext(): Promise<number | null> {
    const a = await this.prisma.modelAssignment.findUnique({ where: { functionId: 'doc_vec' } });
    const m = a ? await this.prisma.aiModel.findUnique({ where: { id: a.primaryModelId } }) : null;
    return m?.contextTokens ?? null;
  }

  /** « Nom (2) », « Nom (3) »… pour garder les deux documents. */
  private async freeName(projectId: string, name: string) {
    for (let i = 2; i < 100; i++) {
      const n = `${name} (${i})`;
      if (!(await this.prisma.document.findFirst({ where: { projectId, n: { equals: n, mode: 'insensitive' } } }))) return n;
    }
    return `${name} (${Date.now()})`;
  }
}

