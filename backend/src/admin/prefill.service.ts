import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { AuditService } from '../core/audit.service';
import type { Actor } from '../core/auth/auth';
import { ApiError, conflict, notFound } from '../core/errors';
import { JobsService } from '../core/jobs.service';
import { INIT_PROJET_NEED_OUT, LlmService } from '../core/llm.service';
import { prefillSpecs, writePrefillWorkbook } from '../core/prefill-excel';
import { PrefillRefusal, readProposal } from '../core/prefill-text';
import { PrismaService } from '../core/prisma.service';
import { StorageService } from '../core/storage.service';
import {
  assessTab, documentContext, emptyKnown, knownAfter, normalizeRows, parseModelJson, prefillResult, PREFILL_RETENTION_HOURS_DEFAULT, PREFILL_SYSTEM,
  PrefillCheck, PrefillRow, PrefillTabSpec, rawEta, readingPage, smoothEta, TabOutcome, tabPrompt,
} from '../domain/prefill';
import { adminCtx } from './profiles.service';

/**
 * Préremplissage du fichier d'initialisation (07/10/2026, maquette « Initialisation projet v2 ») : la proposition
 * commerciale est lue, puis analysée onglet par onglet par la fonction d'IA « Initialisation projet » ; l'Excel
 * prérempli est généré à la fin. Analyse dans le processus du serveur (comme Partager Cockpit), état en base pour la
 * reprise et les reconnexions, événements en direct par flux SSE.
 *
 * Confidentialité : le document ne sert qu'à ce préremplissage ; le fichier et son texte sont supprimés dès l'Excel
 * généré (ou à l'annulation), le reste à l'échéance (`PREFILL_RETENTION_HOURS`, 24 h par défaut). Le journal ne garde
 * que des métadonnées : nom, taille, pages, durée, statut.
 */

export type PrefillEvent =
  | { type: 'progression'; ongletIndex: number; page: number; pagesTotal: number; champsExtraits: number; resteSecondes: number }
  | { type: 'onglet_termine'; ongletIndex: number; attendus: number; trouves: number; aVerifier: number; statut: TabOutcome['statut'] }
  | { type: 'termine'; resultat: 'complet' | 'partiel'; dureeSecondes: number }
  | { type: 'erreur'; code: 'ANALYSE'; ongletIndex: number; ongletsConserves: number }
  | { type: 'annule' };

interface SavedTab extends TabOutcome { rows: PrefillRow[]; ms: number }
interface Live { listeners: Set<(e: PrefillEvent) => void>; cancelled: boolean; eta: number | null; at: number }

/** Délai d'un appel au modèle pour un onglet (documents longs, réponses de plusieurs milliers de jetons). */
export const PREFILL_CALL_TIMEOUT_MS = 180_000;
/** Purge des documents, textes, résultats et Excel arrivés à échéance : toutes les heures. */
const PREFILL_PURGE_CRON = '20 * * * *';
/** Exemple fourni avec l'application (« Essayer avec l'exemple ORION »). */
export const PREFILL_EXAMPLE = path.join(__dirname, '../../assets/prefill/Proposition commerciale ORION v3.pdf');
const TEMPLATE = path.join(__dirname, '../../../frontends/Referentiel RISE - initialisation.xlsx');
const SYSTEM_ACTOR: Actor = { accountId: 'system', sessionId: 'system', email: 'system@rise.local', fullName: 'Système', personId: null, isAdmin: true, surface: null, restricted: false, viaCookie: false };

export const prefillRetentionMs = () => Math.max(1, Number(process.env.PREFILL_RETENTION_HOURS ?? PREFILL_RETENTION_HOURS_DEFAULT) || PREFILL_RETENTION_HOURS_DEFAULT) * 3_600_000;
const newId = (p: string) => `${p}_${randomBytes(9).toString('hex')}`;

@Injectable()
export class PrefillService implements OnModuleInit {
  private readonly log = new Logger('Préremplissage');
  private specsCache: PrefillTabSpec[] | null = null;
  private templateCache: Buffer | null = null;
  private readonly live = new Map<string, Live>();
  /** Progression émise toutes les secondes pendant l'analyse d'un onglet (réduit par les tests). */
  tickMs = 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly llm: LlmService,
    private readonly audit: AuditService,
    private readonly jobs: JobsService,
  ) {}

  async onModuleInit() {
    // Analyse coupée par un redémarrage : en échec à l'onglet en cours, reprise possible.
    await this.prisma.prefillTask.updateMany({ where: { status: 'RUNNING' }, data: { status: 'FAILED', error: 'Analyse interrompue par un redémarrage du serveur.' } });
    this.jobs.register('prefill.purge', () => this.purgeExpired(new Date()).then(() => undefined));
    await this.jobs.schedule('prefill.purge', PREFILL_PURGE_CRON);
  }

  private async template(): Promise<Buffer> {
    return (this.templateCache ??= await fs.readFile(TEMPLATE));
  }
  async specs(): Promise<PrefillTabSpec[]> {
    return (this.specsCache ??= await prefillSpecs(await this.template()));
  }

  /** Les 14 onglets et leur nombre de champs (état initial de l'écran). */
  async tabs() {
    return (await this.specs()).map((s) => ({ n: s.n, label: s.label, champs: s.fields.length }));
  }

  // ───────────── Dépôt ─────────────

  async upload(actor: Actor, file: { originalname: string; size: number; buffer: Buffer }) {
    const name = Buffer.from(file.originalname, 'latin1').toString('utf8').normalize('NFC');
    const ctx = adminCtx(actor);
    let read;
    try {
      read = await readProposal(file.buffer, name);
    } catch (e) {
      if (!(e instanceof PrefillRefusal)) throw e;
      await this.audit.action(this.prisma, ctx, { action: 'Préremplissage : proposition refusée', target: name, severity: 'INFO', entityType: 'PREFILL', details: { nom: name, taille: file.size, statut: e.code } });
      throw new ApiError(422, e.code, e.message);
    }
    const id = newId('prop');
    const ext = path.extname(name).toLowerCase();
    const fileKey = await this.storage.put('prefill', file.buffer, ext);
    const textKey = await this.storage.put('prefill', Buffer.from(JSON.stringify(read.pages), 'utf8'), '.json');
    await this.prisma.prefillDocument.create({ data: { id, name, sizeBytes: file.size, pages: read.pages.length, format: read.format, fileKey, textKey, accountId: actor.accountId, expiresAt: new Date(Date.now() + prefillRetentionMs()) } });
    await this.audit.action(this.prisma, ctx, { action: 'Préremplissage : proposition déposée', target: name, severity: 'INFO', entityType: 'PREFILL', entityId: id, details: { nom: name, taille: file.size, pages: read.pages.length, format: read.format } });
    return { id, nom: name, taille: file.size, pages: read.pages.length };
  }

  /** Exemple ORION fourni avec l'application, déposé comme une proposition ordinaire. */
  async example(actor: Actor) {
    const buffer = await fs.readFile(PREFILL_EXAMPLE);
    return this.upload(actor, { originalname: Buffer.from(path.basename(PREFILL_EXAMPLE), 'utf8').toString('latin1'), size: buffer.length, buffer });
  }

  // ───────────── Analyse ─────────────

  async analyse(actor: Actor, documentId: string) {
    const doc = await this.prisma.prefillDocument.findUnique({ where: { id: documentId } });
    if (!doc) throw notFound('Proposition introuvable');
    if (!doc.textKey) throw new ApiError(410, 'GONE', 'Proposition supprimée : déposez-la de nouveau.');
    if (await this.prisma.prefillTask.findFirst({ where: { documentId, status: 'RUNNING' } })) throw conflict('PREFILL_RUNNING', 'Une analyse de cette proposition est déjà en cours.');
    const id = newId('tache');
    await this.prisma.prefillTask.create({ data: { id, documentId, status: 'RUNNING', expiresAt: doc.expiresAt } });
    this.start(id, 0, actor);
    return { tacheId: id };
  }

  /** Reprise d'une analyse interrompue : à partir de l'onglet en échec ; les onglets déjà traités sont gardés. */
  async resume(actor: Actor, taskId: string) {
    const t = await this.prisma.prefillTask.findUnique({ where: { id: taskId }, include: { document: true } });
    if (!t) throw notFound('Analyse introuvable');
    if (t.status !== 'FAILED') throw conflict('PREFILL_NOT_FAILED', 'Seule une analyse interrompue peut être reprise.');
    if (!t.document.textKey) throw new ApiError(410, 'GONE', 'Proposition supprimée : déposez-la de nouveau.');
    await this.prisma.prefillTask.update({ where: { id: taskId }, data: { status: 'RUNNING', error: null } });
    this.start(taskId, t.tabIndex, actor);
    return { tacheId: taskId, ongletIndex: t.tabIndex };
  }

  /** Annulation : la tâche s'arrête (aucun onglet de plus) ; le document et son texte sont supprimés. */
  async cancel(actor: Actor, taskId: string) {
    const t = await this.prisma.prefillTask.findUnique({ where: { id: taskId }, include: { document: true } });
    if (!t) throw notFound('Analyse introuvable');
    const live = this.live.get(taskId);
    if (live) live.cancelled = true;
    if (t.status === 'RUNNING' || t.status === 'FAILED') {
      await this.prisma.prefillTask.update({ where: { id: taskId }, data: { status: 'CANCELLED', finishedAt: new Date() } });
      this.emit(taskId, { type: 'annule' }, true);
      await this.dropSource(t.document.id);
      await this.audit.action(this.prisma, adminCtx(actor), { action: 'Préremplissage : analyse annulée', target: t.document.name, severity: 'INFO', entityType: 'PREFILL', entityId: taskId, details: { nom: t.document.name, taille: t.document.sizeBytes, duree: Math.round(t.durationMs / 1000), statut: 'annule' } });
    }
  }

  private start(taskId: string, from: number, actor: Actor) {
    this.live.set(taskId, { listeners: this.live.get(taskId)?.listeners ?? new Set(), cancelled: false, eta: null, at: Date.now() });
    // Erreur imprévue (stockage, génération de l'Excel…) : analyse en échec à l'onglet en cours, reprise possible.
    // Seul le type d'erreur est journalisé, jamais le contenu du document.
    void this.run(taskId, from, actor).catch(async (e) => {
      this.log.error(`Analyse ${taskId} : ${e instanceof Error ? e.name : 'erreur'}`);
      const t = await this.prisma.prefillTask.findUnique({ where: { id: taskId } }).catch(() => null);
      if (!t || t.status !== 'RUNNING') return;
      await this.prisma.prefillTask.update({ where: { id: taskId }, data: { status: 'FAILED', error: 'ANALYSE' } });
      this.emit(taskId, { type: 'erreur', code: 'ANALYSE', ongletIndex: t.tabIndex, ongletsConserves: t.tabIndex }, true);
    });
  }

  private emit(taskId: string, e: PrefillEvent, end = false) {
    const live = this.live.get(taskId);
    if (!live) return;
    for (const l of live.listeners) l(e);
    if (end) this.live.delete(taskId);
  }

  /** Un onglet : consigne, appel au modèle (un nouvel essai si la réponse n'est pas du JSON), lignes normalisées. */
  private async extractTab(spec: PrefillTabSpec, system: string, known: ReturnType<typeof emptyKnown>): Promise<PrefillRow[]> {
    const prompt = tabPrompt(spec, known);
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await this.llm.complete({
        functionId: 'init_projet', system, cache: true, source: 'IMPORT', maxTokens: INIT_PROJET_NEED_OUT, timeoutMs: PREFILL_CALL_TIMEOUT_MS,
        prompt: attempt ? `${prompt}\n\nTa réponse précédente n’était pas un objet JSON valide : réponds uniquement par l’objet JSON demandé.` : prompt,
      });
      const json = parseModelJson(r.text);
      if (json) return normalizeRows(spec, json, known);
    }
    throw new Error('Réponse du modèle illisible');
  }

  private async run(taskId: string, from: number, actor: Actor) {
    const task = await this.prisma.prefillTask.findUniqueOrThrow({ where: { id: taskId }, include: { document: true } });
    const doc = task.document;
    const specs = await this.specs();
    const pages: string[] = JSON.parse((await this.storage.get(doc.textKey!))!.toString('utf8'));
    const system = `${PREFILL_SYSTEM}\n\n${documentContext(pages, doc.name)}`;
    const saved = ((task.tabs as unknown as SavedTab[]) ?? []).slice(0, from);
    let known = emptyKnown();
    saved.forEach((t, i) => { known = knownAfter(specs[i], t.rows, known); });
    let durationMs = task.durationMs;
    const live = this.live.get(taskId)!;
    for (let i = from; i < specs.length; i++) {
      if (live.cancelled) return;
      await this.prisma.prefillTask.update({ where: { id: taskId }, data: { tabIndex: i } });
      const t0 = Date.now();
      const doneMs = saved.reduce((n, s) => n + s.ms, 0), champs = saved.reduce((n, s) => n + s.trouves, 0);
      const tick = () => {
        const cur = (Date.now() - t0) / 1000;
        const raw = rawEta(saved.length, doneMs / 1000, specs.length, cur);
        const dt = (Date.now() - live.at) / 1000;
        live.eta = smoothEta(live.eta, raw, dt);
        live.at = Date.now();
        const per = saved.length ? doneMs / saved.length : 6000;
        this.emit(taskId, { type: 'progression', ongletIndex: i, page: readingPage(i, (Date.now() - t0) / per, doc.pages, specs.length), pagesTotal: doc.pages, champsExtraits: champs, resteSecondes: Math.max(1, live.eta) });
      };
      tick();
      const timer = setInterval(tick, this.tickMs);
      let rows: PrefillRow[];
      try {
        rows = await this.extractTab(specs[i], system, known);
      } catch (e) {
        clearInterval(timer);
        if (live.cancelled) return;
        durationMs += Date.now() - t0;
        await this.prisma.prefillTask.update({ where: { id: taskId }, data: { status: 'FAILED', tabIndex: i, durationMs, error: e instanceof ApiError ? e.code : 'ANALYSE' } });
        this.emit(taskId, { type: 'erreur', code: 'ANALYSE', ongletIndex: i, ongletsConserves: i }, true);
        await this.audit.action(this.prisma, adminCtx(actor), { action: 'Préremplissage : analyse interrompue', target: doc.name, severity: 'INFO', entityType: 'PREFILL', entityId: taskId, details: { nom: doc.name, taille: doc.sizeBytes, duree: Math.round(durationMs / 1000), statut: 'erreur', onglet: specs[i].sheet } });
        return;
      }
      clearInterval(timer);
      if (live.cancelled) return;
      const ms = Date.now() - t0;
      durationMs += ms;
      const outcome = assessTab(specs[i], rows);
      saved.push({ ...outcome, rows, ms });
      known = knownAfter(specs[i], rows, known);
      await this.prisma.prefillTask.update({ where: { id: taskId }, data: { tabs: saved as any, durationMs } });
      const { ongletIndex, attendus, trouves, aVerifier, statut } = outcome;
      this.emit(taskId, { type: 'onglet_termine', ongletIndex, attendus, trouves, aVerifier, statut });
    }
    // Excel généré, puis fichier et texte supprimés : seul le résultat reste, jusqu'à l'échéance.
    const excel = await writePrefillWorkbook(await this.template(), specs, saved);
    const excelKey = await this.storage.put('prefill', excel, '.xlsx');
    const resultat = prefillResult(saved);
    await this.prisma.prefillTask.update({ where: { id: taskId }, data: { status: 'DONE', result: resultat, excelKey, durationMs, finishedAt: new Date(), tabIndex: specs.length } });
    await this.dropSource(doc.id);
    const dureeSecondes = Math.max(1, Math.round(durationMs / 1000));
    this.emit(taskId, { type: 'termine', resultat, dureeSecondes }, true);
    await this.audit.action(this.prisma, adminCtx(actor), { action: 'Préremplissage : analyse terminée', target: doc.name, severity: 'INFO', entityType: 'PREFILL', entityId: taskId, details: { nom: doc.name, taille: doc.sizeBytes, pages: doc.pages, duree: dureeSecondes, statut: resultat } });
  }

  /** Fichier et texte extrait supprimés (la ligne garde les métadonnées). */
  private async dropSource(documentId: string) {
    const d = await this.prisma.prefillDocument.findUnique({ where: { id: documentId } });
    if (!d) return;
    for (const k of [d.fileKey, d.textKey]) if (k) await this.storage.remove(k);
    await this.prisma.prefillDocument.update({ where: { id: documentId }, data: { fileKey: null, textKey: null } });
  }

  // ───────────── Flux, résultats ─────────────

  /** Événements passés rejoués (onglets terminés, issue), puis en direct ; null si le flux est terminé. */
  async subscribe(taskId: string, send: (e: PrefillEvent) => void): Promise<(() => void) | null> {
    const t = await this.prisma.prefillTask.findUnique({ where: { id: taskId }, include: { document: true } });
    if (!t) throw notFound('Analyse introuvable');
    for (const s of (t.tabs as unknown as SavedTab[]) ?? []) send({ type: 'onglet_termine', ongletIndex: s.ongletIndex, attendus: s.attendus, trouves: s.trouves, aVerifier: s.aVerifier, statut: s.statut });
    if (t.status === 'DONE') { send({ type: 'termine', resultat: t.result as 'complet' | 'partiel', dureeSecondes: Math.max(1, Math.round(t.durationMs / 1000)) }); return null; }
    if (t.status === 'FAILED') { send({ type: 'erreur', code: 'ANALYSE', ongletIndex: t.tabIndex, ongletsConserves: t.tabIndex }); return null; }
    if (t.status === 'CANCELLED') { send({ type: 'annule' }); return null; }
    const live = this.live.get(taskId);
    if (!live) { send({ type: 'erreur', code: 'ANALYSE', ongletIndex: t.tabIndex, ongletsConserves: t.tabIndex }); return null; }
    live.listeners.add(send);
    return () => live.listeners.delete(send);
  }

  /** Liste « À vérifier » : une ligne par valeur incertaine ou manquante (onglet non trouvé : une seule ligne). */
  async checks(taskId: string) {
    const t = await this.prisma.prefillTask.findUnique({ where: { id: taskId } });
    if (!t) throw notFound('Analyse introuvable');
    return ((t.tabs as unknown as SavedTab[]) ?? []).flatMap((s) => s.checks).map((c: PrefillCheck) => ({
      ongletIndex: c.ongletIndex, onglet: c.onglet, champ: c.champ, valeur: c.valeur, type: c.type, confiance: c.confiance, motif: c.motif, page: c.page,
    }));
  }

  async excel(actor: Actor, taskId: string): Promise<{ buffer: Buffer; fileName: string }> {
    const t = await this.prisma.prefillTask.findUnique({ where: { id: taskId }, include: { document: true } });
    if (!t) throw notFound('Analyse introuvable');
    if (t.status !== 'DONE' || !t.excelKey) throw conflict('PREFILL_NOT_DONE', 'L’Excel prérempli n’est disponible qu’à la fin de l’analyse.');
    const buffer = await this.storage.get(t.excelKey);
    if (!buffer) throw new ApiError(410, 'GONE', 'Excel prérempli supprimé (durée de conservation dépassée) : relancez l’analyse.');
    const base = t.document.name.replace(/\.[a-z0-9]+$/i, '').replace(/[\\/:*?"<>|]+/g, ' ').trim();
    await this.audit.action(this.prisma, adminCtx(actor), { action: 'Préremplissage : Excel téléchargé', target: t.document.name, severity: 'INFO', entityType: 'PREFILL', entityId: taskId, details: { nom: t.document.name, statut: t.result } });
    return { buffer, fileName: `${base} · prérempli.xlsx` };
  }

  /** Purge : documents, textes, résultats et Excel arrivés à échéance (durée de conservation). */
  async purgeExpired(now: Date): Promise<number> {
    const docs = await this.prisma.prefillDocument.findMany({ where: { expiresAt: { lte: now } }, include: { tasks: true } });
    for (const d of docs) {
      for (const k of [d.fileKey, d.textKey, ...d.tasks.map((t) => t.excelKey)]) if (k) await this.storage.remove(k);
      for (const t of d.tasks) { const l = this.live.get(t.id); if (l) l.cancelled = true; }
      await this.prisma.prefillDocument.delete({ where: { id: d.id } });
    }
    if (docs.length) await this.audit.action(this.prisma, adminCtx(SYSTEM_ACTOR), { action: 'Préremplissage : purge', severity: 'INFO', entityType: 'PREFILL', details: { documents: docs.length } });
    return docs.length;
  }
}
