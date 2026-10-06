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
import { PREFILL_FORMAT_MESSAGE, PrefillRefusal, readProposal } from '../core/prefill-text';
import { PrismaService } from '../core/prisma.service';
import { StorageService } from '../core/storage.service';
import {
  assessTab, documentContext, emptyKnown, knownAfter, normalizeRows, pageSource, parseModelJson, prefillResult, PREFILL_MAX_FILES, PREFILL_WAVES, PREFILL_RETENTION_HOURS_DEFAULT, prefillSystem, PrefillFile,
  PrefillCheck, PrefillRow, PrefillTabSpec, rawEta, readingPage, smoothEta, TabOutcome, tabPrompt,
} from '../domain/prefill';
import { skillKey } from '../domain/jev-prompt';
import { PREFILL_SKILL } from '../domain/prefill-skill';
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
  | { type: 'progression'; ongletIndex: number; ongletsEnCours: number[]; page: number; pagesTotal: number; champsExtraits: number; resteSecondes: number }
  | { type: 'onglet_termine'; ongletIndex: number; attendus: number; trouves: number; aVerifier: number; statut: TabOutcome['statut'] }
  | { type: 'termine'; resultat: 'complet' | 'partiel'; dureeSecondes: number }
  | { type: 'erreur'; code: 'ANALYSE'; ongletIndex: number; ongletsConserves: number }
  | { type: 'annule' };

interface SavedTab extends TabOutcome { rows: PrefillRow[]; ms: number }
interface Live { listeners: Set<(e: PrefillEvent) => void>; cancelled: boolean; eta: number | null; at: number }

/** Délai d'un appel au modèle pour un onglet (documents longs, réponses de plusieurs milliers de jetons). */
export const PREFILL_CALL_TIMEOUT_MS = 180_000;
/** Essais par onglet avant l'échec (07/10/2026) : réponse illisible, ou principal et secours en échec. */
export const PREFILL_TAB_ATTEMPTS = 2;
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

  /**
   * Dépôt d'un ou de plusieurs fichiers (proposition et annexes, 07/10/2026), lus comme un seul document : pages
   * numérotées à la suite. Un fichier refusé fait refuser tout le dépôt (`fields.fichier` le désigne).
   */
  async upload(actor: Actor, uploaded: Array<{ originalname: string; size: number; buffer: Buffer }>) {
    const ctx = adminCtx(actor);
    if (!uploaded.length) throw new ApiError(422, 'FORMAT', PREFILL_FORMAT_MESSAGE);
    if (uploaded.length > PREFILL_MAX_FILES) throw new ApiError(422, 'FORMAT', `${PREFILL_MAX_FILES} fichiers au plus par dépôt.`);
    const read: Array<{ nom: string; taille: number; buffer: Buffer; format: string; pages: string[] }> = [];
    for (const file of uploaded) {
      const nom = Buffer.from(file.originalname, 'latin1').toString('utf8').normalize('NFC');
      try {
        const r = await readProposal(file.buffer, nom);
        read.push({ nom, taille: file.size, buffer: file.buffer, format: r.format, pages: r.pages });
      } catch (e) {
        if (!(e instanceof PrefillRefusal)) throw e;
        await this.audit.action(this.prisma, ctx, { action: 'Préremplissage : proposition refusée', target: nom, severity: 'INFO', entityType: 'PREFILL', details: { nom, taille: file.size, fichiers: uploaded.length, statut: e.code } });
        throw new ApiError(422, e.code, uploaded.length > 1 ? `« ${nom} » : ${e.message}` : e.message, { fichier: nom });
      }
    }
    const id = newId('prop');
    const files: PrefillFile[] = [];
    for (const f of read) files.push({ nom: f.nom, taille: f.taille, pages: f.pages.length, format: f.format, cle: await this.storage.put('prefill', f.buffer, path.extname(f.nom).toLowerCase()) });
    const pages = read.flatMap((f) => f.pages);
    const name = read[0].nom, size = read.reduce((n, f) => n + f.taille, 0);
    const textKey = await this.storage.put('prefill', Buffer.from(JSON.stringify(pages), 'utf8'), '.json');
    await this.prisma.prefillDocument.create({ data: { id, name, sizeBytes: size, pages: pages.length, format: [...new Set(read.map((f) => f.format))].join('+'), fileKey: files[0].cle, textKey, files: files as any, accountId: actor.accountId, expiresAt: new Date(Date.now() + prefillRetentionMs()) } });
    await this.audit.action(this.prisma, ctx, { action: 'Préremplissage : proposition déposée', target: name, severity: 'INFO', entityType: 'PREFILL', entityId: id, details: { nom: name, taille: size, pages: pages.length, fichiers: files.map((f) => ({ nom: f.nom, taille: f.taille, pages: f.pages, format: f.format })) } });
    return { id, nom: name, taille: size, pages: pages.length, fichiers: files.map((f) => ({ nom: f.nom, taille: f.taille, pages: f.pages })) };
  }

  /** Exemple ORION fourni avec l'application, déposé comme une proposition ordinaire. */
  async example(actor: Actor) {
    const buffer = await fs.readFile(PREFILL_EXAMPLE);
    return this.upload(actor, [{ originalname: Buffer.from(path.basename(PREFILL_EXAMPLE), 'utf8').toString('latin1'), size: buffer.length, buffer }]);
  }

  // ───────────── Analyse ─────────────

  async analyse(actor: Actor, documentId: string) {
    const doc = await this.prisma.prefillDocument.findUnique({ where: { id: documentId } });
    if (!doc) throw notFound('Proposition introuvable');
    if (!doc.textKey) throw new ApiError(410, 'GONE', 'Proposition supprimée : déposez-la de nouveau.');
    if (await this.prisma.prefillTask.findFirst({ where: { documentId, status: 'RUNNING' } })) throw conflict('PREFILL_RUNNING', 'Une analyse de cette proposition est déjà en cours.');
    const id = newId('tache');
    await this.prisma.prefillTask.create({ data: { id, documentId, status: 'RUNNING', expiresAt: doc.expiresAt } });
    this.start(id, actor);
    return { tacheId: id };
  }

  /** Reprise d'une analyse interrompue : à partir de l'onglet en échec ; les onglets déjà traités sont gardés. */
  async resume(actor: Actor, taskId: string) {
    const t = await this.prisma.prefillTask.findUnique({ where: { id: taskId }, include: { document: true } });
    if (!t) throw notFound('Analyse introuvable');
    if (t.status !== 'FAILED') throw conflict('PREFILL_NOT_FAILED', 'Seule une analyse interrompue peut être reprise.');
    if (!t.document.textKey) throw new ApiError(410, 'GONE', 'Proposition supprimée : déposez-la de nouveau.');
    await this.prisma.prefillTask.update({ where: { id: taskId }, data: { status: 'RUNNING', error: null } });
    this.start(taskId, actor);
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

  private start(taskId: string, actor: Actor) {
    this.live.set(taskId, { listeners: this.live.get(taskId)?.listeners ?? new Set(), cancelled: false, eta: null, at: Date.now() });
    // Erreur imprévue (stockage, génération de l'Excel…) : analyse en échec à l'onglet en cours, reprise possible.
    // Seul le type d'erreur est journalisé, jamais le contenu du document.
    void this.run(taskId, actor).catch(async (e) => {
      this.log.error(`Analyse ${taskId} : ${e instanceof Error ? e.name : 'erreur'}`);
      const t = await this.prisma.prefillTask.findUnique({ where: { id: taskId } }).catch(() => null);
      if (!t || t.status !== 'RUNNING') return;
      await this.prisma.prefillTask.update({ where: { id: taskId }, data: { status: 'FAILED', error: 'ANALYSE' } });
      this.emit(taskId, { type: 'erreur', code: 'ANALYSE', ongletIndex: t.tabIndex, ongletsConserves: ((t.tabs as unknown as unknown[]) ?? []).filter(Boolean).length }, true);
    });
  }

  private emit(taskId: string, e: PrefillEvent, end = false) {
    const live = this.live.get(taskId);
    if (!live) return;
    for (const l of live.listeners) l(e);
    if (end) this.live.delete(taskId);
  }

  /**
   * Un onglet : consigne, appel au modèle (raisonnement coupé : extraction, pas de calcul), lignes normalisées. Un nouvel
   * essai si la réponse n'est pas du JSON ou si les deux modèles échouent (réponse vide, délai) : l'onglet n'est mis en
   * échec qu'après `PREFILL_TAB_ATTEMPTS` essais.
   */
  private async extractTab(spec: PrefillTabSpec, system: string, known: ReturnType<typeof emptyKnown>, live: Live): Promise<PrefillRow[]> {
    const prompt = tabPrompt(spec, known);
    let lastError: unknown = new Error('Réponse du modèle illisible');
    for (let attempt = 0; attempt < PREFILL_TAB_ATTEMPTS; attempt++) {
      if (live.cancelled) break;
      let text: string;
      try {
        text = (await this.llm.complete({
          functionId: 'init_projet', system, cache: true, source: 'IMPORT', maxTokens: INIT_PROJET_NEED_OUT, timeoutMs: PREFILL_CALL_TIMEOUT_MS, reasoning: 'off',
          prompt: lastError instanceof SyntaxError ? `${prompt}\n\nTa réponse précédente n’était pas un objet JSON valide : réponds uniquement par l’objet JSON demandé.` : prompt,
        })).text;
      } catch (e) {
        if (!(e instanceof ApiError && e.code === 'AI_UNAVAILABLE')) throw e;
        lastError = e;
        continue;
      }
      const json = parseModelJson(text);
      if (json) return normalizeRows(spec, json, known);
      lastError = new SyntaxError('Réponse du modèle illisible');
    }
    throw lastError;
  }

  /**
   * Analyse en vagues (07/10/2026, `PREFILL_WAVES`) : les onglets d'une vague partent ensemble ; le premier appel de
   * l'analyse part seul (il remplit le cache du document pour les suivants). Résultats enregistrés un par un, à leur
   * place (tableau de 14, onglets non traités à null) ; une reprise ne relance que les onglets manquants. Interruption :
   * les onglets de la vague déjà partis vont à leur terme et sont conservés ; l'onglet en échec (le premier, dans
   * l'ordre) est celui de la reprise.
   */
  private async run(taskId: string, actor: Actor) {
    const task = await this.prisma.prefillTask.findUniqueOrThrow({ where: { id: taskId }, include: { document: true } });
    const doc = task.document;
    const specs = await this.specs();
    const pages: string[] = JSON.parse((await this.storage.get(doc.textKey!))!.toString('utf8'));
    const docFiles = (doc.files as unknown as PrefillFile[]) ?? [];
    // Skill « Préremplissage d’un projet » (Console › Skills) : lue qu'elle soit active ou non ; absente, règles du code seules.
    const skill = (await this.prisma.skill.findMany({ select: { n: true, t: true } })).find((s) => skillKey(s.n) === skillKey(PREFILL_SKILL)) ?? null;
    const system = `${prefillSystem(skill)}\n\n${documentContext(pages, doc.name, docFiles)}`;
    const saved: Array<SavedTab | null> = specs.map((_, i) => ((task.tabs as unknown as Array<SavedTab | null>) ?? [])[i] ?? null);
    const live = this.live.get(taskId)!;
    const t0 = Date.now(), before = task.durationMs;
    const running = new Set<number>();
    let doneHere = 0;
    const knownNow = () => saved.reduce((k, t, i) => (t ? knownAfter(specs[i], t.rows, k) : k), emptyKnown());
    // Enregistrements l'un après l'autre : les onglets d'une vague se terminent en même temps.
    let writes: Promise<unknown> = Promise.resolve();
    const persist = (data: Record<string, unknown>) => (writes = writes.then(() => this.prisma.prefillTask.update({ where: { id: taskId }, data: data as any })));
    const tick = () => {
      if (!running.size) return;
      const remaining = saved.filter((t) => !t).length;
      const elapsed = (Date.now() - t0) / 1000;
      live.eta = smoothEta(live.eta, rawEta(doneHere, elapsed, remaining), (Date.now() - live.at) / 1000);
      live.at = Date.now();
      const cur = Math.min(...running);
      const per = doneHere ? (Date.now() - t0) / doneHere : 6000;
      this.emit(taskId, { type: 'progression', ongletIndex: cur, ongletsEnCours: [...running].sort((a, b) => a - b), page: readingPage(cur, ((Date.now() - t0) % per) / per, doc.pages, specs.length), pagesTotal: doc.pages, champsExtraits: saved.reduce((n, t) => n + (t ? t.trouves : 0), 0), resteSecondes: Math.max(1, live.eta) });
    };
    const timer = setInterval(tick, this.tickMs);
    const failures: Array<{ index: number; error: unknown }> = [];
    const runTab = async (i: number) => {
      running.add(i);
      await persist({ tabIndex: Math.min(...running) });
      tick();
      const s0 = Date.now();
      try {
        const rows = await this.extractTab(specs[i], system, knownNow(), live);
        if (live.cancelled) return;
        const outcome = assessTab(specs[i], rows);
        saved[i] = { ...outcome, rows, ms: Date.now() - s0 };
        doneHere++;
        await persist({ tabs: saved as any, durationMs: before + Date.now() - t0 });
        const { ongletIndex, attendus, trouves, aVerifier, statut } = outcome;
        this.emit(taskId, { type: 'onglet_termine', ongletIndex, attendus, trouves, aVerifier, statut });
      } catch (error) {
        failures.push({ index: i, error });
      } finally {
        running.delete(i);
      }
    };
    try {
      let first = true;
      for (const wave of PREFILL_WAVES) {
        const todo = wave.filter((i) => !saved[i]);
        if (!todo.length) continue;
        if (live.cancelled) return;
        if (first) { await runTab(todo.shift()!); first = false; }
        if (!failures.length && todo.length && !live.cancelled) await Promise.all(todo.map(runTab));
        if (live.cancelled) return;
        if (failures.length) break;
      }
    } finally {
      clearInterval(timer);
      await writes.catch(() => undefined);
    }
    const durationMs = before + Date.now() - t0;
    if (failures.length) {
      const failed = failures.sort((a, b) => a.index - b.index)[0];
      const kept = saved.filter(Boolean).length;
      await this.prisma.prefillTask.update({ where: { id: taskId }, data: { status: 'FAILED', tabIndex: failed.index, durationMs, error: failed.error instanceof ApiError ? failed.error.code : 'ANALYSE' } });
      this.emit(taskId, { type: 'erreur', code: 'ANALYSE', ongletIndex: failed.index, ongletsConserves: kept }, true);
      await this.audit.action(this.prisma, adminCtx(actor), { action: 'Préremplissage : analyse interrompue', target: doc.name, severity: 'INFO', entityType: 'PREFILL', entityId: taskId, details: { nom: doc.name, taille: doc.sizeBytes, duree: Math.round(durationMs / 1000), statut: 'erreur', onglet: specs[failed.index].sheet } });
      return;
    }
    // Excel généré, puis fichier et texte supprimés : seul le résultat reste, jusqu'à l'échéance.
    const done = saved as SavedTab[];
    const excel = await writePrefillWorkbook(await this.template(), specs, done, docFiles);
    const excelKey = await this.storage.put('prefill', excel, '.xlsx');
    const resultat = prefillResult(done);
    await this.prisma.prefillTask.update({ where: { id: taskId }, data: { status: 'DONE', result: resultat, excelKey, durationMs, finishedAt: new Date(), tabIndex: specs.length } });
    await this.dropSource(doc.id);
    const dureeSecondes = Math.max(1, Math.round(durationMs / 1000));
    this.emit(taskId, { type: 'termine', resultat, dureeSecondes }, true);
    await this.audit.action(this.prisma, adminCtx(actor), { action: 'Préremplissage : analyse terminée', target: doc.name, severity: 'INFO', entityType: 'PREFILL', entityId: taskId, details: { nom: doc.name, taille: doc.sizeBytes, pages: doc.pages, duree: dureeSecondes, statut: resultat } });
  }

  /** Fichiers et texte extrait supprimés (la ligne garde les métadonnées). */
  private async dropSource(documentId: string) {
    const d = await this.prisma.prefillDocument.findUnique({ where: { id: documentId } });
    if (!d) return;
    const files = (d.files as unknown as PrefillFile[]) ?? [];
    for (const k of new Set([d.fileKey, d.textKey, ...files.map((f) => f.cle)])) if (k) await this.storage.remove(k);
    await this.prisma.prefillDocument.update({ where: { id: documentId }, data: { fileKey: null, textKey: null, files: files.map((f) => ({ ...f, cle: null })) as any } });
  }

  // ───────────── Flux, résultats ─────────────

  /** Événements passés rejoués (onglets terminés, issue), puis en direct ; null si le flux est terminé. */
  async subscribe(taskId: string, send: (e: PrefillEvent) => void): Promise<(() => void) | null> {
    const t = await this.prisma.prefillTask.findUnique({ where: { id: taskId }, include: { document: true } });
    if (!t) throw notFound('Analyse introuvable');
    for (const s of ((t.tabs as unknown as Array<SavedTab | null>) ?? []).filter((x): x is SavedTab => !!x)) send({ type: 'onglet_termine', ongletIndex: s.ongletIndex, attendus: s.attendus, trouves: s.trouves, aVerifier: s.aVerifier, statut: s.statut });
    if (t.status === 'DONE') { send({ type: 'termine', resultat: t.result as 'complet' | 'partiel', dureeSecondes: Math.max(1, Math.round(t.durationMs / 1000)) }); return null; }
    if (t.status === 'FAILED') { send({ type: 'erreur', code: 'ANALYSE', ongletIndex: t.tabIndex, ongletsConserves: ((t.tabs as unknown as unknown[]) ?? []).filter(Boolean).length }); return null; }
    if (t.status === 'CANCELLED') { send({ type: 'annule' }); return null; }
    const live = this.live.get(taskId);
    if (!live) { send({ type: 'erreur', code: 'ANALYSE', ongletIndex: t.tabIndex, ongletsConserves: ((t.tabs as unknown as unknown[]) ?? []).filter(Boolean).length }); return null; }
    live.listeners.add(send);
    return () => live.listeners.delete(send);
  }

  /**
   * Liste « À vérifier » : une ligne par valeur incertaine ou manquante (onglet non trouvé : une seule ligne). Dépôt de
   * plusieurs fichiers : `fichier` et `pageFichier` situent la page (numérotée à la suite) dans son fichier.
   */
  async checks(taskId: string) {
    const t = await this.prisma.prefillTask.findUnique({ where: { id: taskId }, include: { document: true } });
    if (!t) throw notFound('Analyse introuvable');
    const files = (t.document.files as unknown as PrefillFile[]) ?? [];
    return ((t.tabs as unknown as Array<SavedTab | null>) ?? []).filter((x): x is SavedTab => !!x).flatMap((s) => s.checks).map((c: PrefillCheck) => {
      const src = files.length > 1 ? pageSource(files, c.page) : null;
      return { ongletIndex: c.ongletIndex, onglet: c.onglet, champ: c.champ, valeur: c.valeur, type: c.type, confiance: c.confiance, motif: c.motif, page: c.page, ...(src ? { fichier: src.fichier, pageFichier: src.page } : {}) };
    });
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
      const files = (d.files as unknown as PrefillFile[]) ?? [];
      for (const k of new Set([d.fileKey, d.textKey, ...files.map((f) => f.cle), ...d.tasks.map((t) => t.excelKey)])) if (k) await this.storage.remove(k);
      for (const t of d.tasks) { const l = this.live.get(t.id); if (l) l.cancelled = true; }
      await this.prisma.prefillDocument.delete({ where: { id: d.id } });
    }
    if (docs.length) await this.audit.action(this.prisma, adminCtx(SYSTEM_ACTOR), { action: 'Préremplissage : purge', severity: 'INFO', entityType: 'PREFILL', details: { documents: docs.length } });
    return docs.length;
  }
}
