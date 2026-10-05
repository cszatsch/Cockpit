import { Injectable, OnModuleInit } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { existsSync, promises as fs, readFileSync, statSync } from 'fs';
import * as path from 'path';
import { AuditService, WriteCtx } from '../core/audit.service';
import type { Actor } from '../core/auth/auth';
import { config } from '../core/config';
import { ApiError, badRequest, notFound } from '../core/errors';
import { JobsService } from '../core/jobs.service';
import { PrismaService } from '../core/prisma.service';
import {
  dataLabel, estimateSize, keyMask, packageFileName, possibleSpend, secretCount, SHARE_CODE_TTL_MS, SHARE_STEPS,
  SHARE_FILE_TTL_MS, SHARE_URL_TTL_MS, ShareDataMode, shareRequestErrors, ShareUpdate, unlockCode,
} from '../domain/share';
import { ShareBuilder, ShareBuildOptions } from './share-builder';
import { adminCtx } from './profiles.service';

/** Profils proposés pour le préremplissage du compte du destinataire. */
export const SHARE_PROFILES = ['Administrateur', 'PMO', 'Responsable', 'Lecteur'] as const;
/** Taille des données du jeu de démonstration et d'un Cockpit vide dans le ZIP (estimations, octets). */
export const DEMO_DATA_BYTES = 14 * 1e6;
export const EMPTY_DATA_BYTES = 1 * 1e6;
/** Taux de compression observé du ZIP (application et base : 04/10/2026, 470 Mo → 188 Mo). */
export const ZIP_RATIO = 0.4;
/** Identifiant d'une carte API dans la liste des clés (les fournisseurs d'IA gardent leur identifiant). */
export const CARD_KEY = 'card:';
/** Vérification horaire des fichiers arrivés à échéance. */
export const SHARE_PURGE_CRON = '10 * * * *';
const SYSTEM_ACTOR: Actor = { accountId: 'system', sessionId: 'system', email: 'system@rise.local', fullName: 'Système', personId: null, isAdmin: true, surface: null, restricted: false, viaCookie: false };
/** Nouveautés affichées au plus (tuile Version). */
const NEWS_MAX = 3;

export interface ShareRequest {
  data: ShareDataMode;
  projects: string[];
  keys: string[];
  smtp: boolean;
  files: boolean;
  code: boolean;
  recipient: { name: string; email: string };
  prefill: { enabled: boolean; profiles: string[] };
  update: ShareUpdate;
}
export type ShareEvent =
  | { step: (typeof SHARE_STEPS)[number]; status: 'running' | 'done' | 'skipped' }
  | { done: true; size: number; sha256: string; fileName: string; code?: string }
  | { failed: true; message: string };

/** Génération en cours ou terminée dans ce processus : abonnés du flux et code pas encore remis. */
interface Live {
  listeners: Set<(e: ShareEvent) => void>;
  code: string | null;
  timer?: NodeJS.Timeout;
}

/** Faux constructeur des tests : quatre étapes brèves et un petit fichier (aucun outil externe). */
class FakeBuilder {
  async build(o: ShareBuildOptions, step: (n: number) => Promise<void> | void) {
    for (let i = 0; i < SHARE_STEPS.length; i++) {
      await step(i);
      await new Promise((r) => setTimeout(r, Number(process.env.SHARE_FAKE_DELAY_MS ?? 30)));
    }
    const dir = path.resolve(config.storageDir, 'share', o.id);
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, o.fileName);
    await fs.writeFile(file, Buffer.from(`paquet de test ${o.id}`));
    const { sha256 } = await import('./share-builder');
    return { file, size: (await fs.stat(file)).size, sha256: await sha256(file) };
  }
}

/**
 * Partager Cockpit (spécification `docs/specs/PARTAGE - specification.md`, 05/10/2026) : contexte de l'écran,
 * génération asynchrone du paquet en 4 étapes (état en base, diffusé en direct), historique, liens de
 * téléchargement signés, suppression du fichier. Le code de déverrouillage n'existe qu'en mémoire jusqu'à sa remise.
 */
@Injectable()
export class ShareService implements OnModuleInit {
  private readonly live = new Map<string, Live>();
  private appBytes: Promise<number> | null = null;
  private readonly builder = process.env.NODE_ENV === 'test' || process.env.SHARE_FAKE_BUILD === 'true' ? new FakeBuilder() : new ShareBuilder();

  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly jobs: JobsService) {}

  /** Une génération interrompue par un arrêt du serveur ne reprendra pas : marquée en échec. */
  async onModuleInit() {
    // ZIP supprimés automatiquement 2 jours après leur génération (décision du 05/10/2026), vérifié chaque heure.
    this.jobs.register('share.purge', () => this.purgeExpired(new Date()).then(() => undefined));
    this.jobs.schedule('share.purge', SHARE_PURGE_CRON);
    await this.prisma.sharePackage.updateMany({ where: { status: 'RUNNING' }, data: { status: 'FAILED', error: 'Génération interrompue par un redémarrage du serveur.', finishedAt: new Date() } }).catch(() => {});
  }

  // ───────────── Contexte ─────────────

  version() {
    const backend = process.cwd();
    let version = '0.0.0';
    try { version = JSON.parse(readFileSync(path.join(backend, 'package.json'), 'utf8')).version; } catch { /* défaut */ }
    let build = '';
    try { build = statSync(path.join(backend, 'dist')).mtime.toISOString().slice(0, 10).replace(/-/g, ''); } catch { /* non compilé */ }
    return { version, build };
  }

  /** Nouveautés : titres datés de `docs/DECISIONS.md` postérieurs au dernier paquet (les plus récents d'abord). */
  news(since: Date | null): string[] {
    const file = path.resolve(process.cwd(), '..', 'docs', 'DECISIONS.md');
    if (!existsSync(file)) return [];
    const items: Array<{ t: string; d: Date }> = [];
    for (const m of readFileSync(file, 'utf8').matchAll(/^## (.+?) \((\d{2})\/(\d{2})\/(\d{4})\)\s*$/gm)) {
      items.push({ t: m[1], d: new Date(`${m[4]}-${m[3]}-${m[2]}T23:59:59Z`) });
    }
    return items.filter((i) => !since || i.d >= since).reverse().slice(0, NEWS_MAX).map((i) => i.t + '.');
  }

  private async dirStats(dir: string): Promise<{ n: number; bytes: number }> {
    let n = 0, bytes = 0;
    const walk = async (d: string) => {
      for (const e of await fs.readdir(d, { withFileTypes: true }).catch(() => [])) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) await walk(p);
        else { n++; bytes += (await fs.stat(p)).size; }
      }
    };
    await walk(dir);
    return { n, bytes };
  }

  /** Taille de l'application dans le ZIP (calculée une fois : application, dépendances, Node.js et PostgreSQL). */
  private appSize(): Promise<number> {
    if (this.appBytes) return this.appBytes;
    if (this.builder instanceof FakeBuilder) return (this.appBytes = Promise.resolve(286 * 1e6));
    const b = this.builder as ShareBuilder;
    return (this.appBytes = (async () => {
      const P = b.paths();
      const parts = [path.join(b.backendDir, 'dist'), path.join(b.backendDir, 'node_modules'), path.resolve(config.frontendDir || '../frontends'), path.join(path.dirname(P.pgBin), 'bin'), path.join(path.dirname(P.pgBin), 'lib'), path.join(path.dirname(P.pgBin), 'share')];
      let raw = statSync(process.execPath).size;
      for (const p of parts) raw += (await this.dirStats(p)).bytes;
      return Math.round(raw * ZIP_RATIO);
    })().catch(() => 300 * 1e6));
  }

  /** Lignes par projet (tables portant un projet) : base de la répartition de la taille des données. */
  private async projectRows(): Promise<{ perProject: Map<string, number>; total: number }> {
    const cols = await this.prisma.$queryRawUnsafe<Array<{ t: string; c: string }>>(
      `SELECT table_name AS t, column_name AS c FROM information_schema.columns WHERE table_schema = 'public' AND column_name IN ('projectId', 'project_id')`,
    );
    const perProject = new Map<string, number>();
    let total = 0;
    for (const { t, c } of cols) {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ p: string | null; n: bigint }>>(`SELECT "${c}" AS p, count(*) AS n FROM "${t}" GROUP BY 1`);
      for (const r of rows) {
        total += Number(r.n);
        if (r.p) perProject.set(r.p, (perProject.get(r.p) ?? 0) + Number(r.n));
      }
    }
    return { perProject, total };
  }

  async context() {
    const last = await this.prisma.sharePackage.findFirst({ where: { status: 'READY' }, orderBy: { createdAt: 'desc' } });
    const { version, build } = this.version();
    const [dbSize] = await this.prisma.$queryRawUnsafe<Array<{ s: bigint }>>(`SELECT pg_database_size(current_database()) AS s`);
    const dataBytes = Math.round(Number(dbSize.s) * ZIP_RATIO);
    const { perProject, total } = await this.projectRows();
    const projects = await this.prisma.project.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, _count: { select: { workstreams: true } } },
    });
    const count = (rows: Array<{ projectId: string; _count: { _all: number } }>) => new Map(rows.map((r) => [r.projectId, r._count._all]));
    const tasks = count(await this.prisma.task.groupBy({ by: ['projectId'], _count: { _all: true } }) as any);
    const snaps = count(await this.prisma.snapshot.groupBy({ by: ['projectId'], _count: { _all: true } }) as any);
    const projectBytes = (id: string) => (total ? Math.round(dataBytes * (perProject.get(id) ?? 0) / total) : 0);
    const shared = Math.max(0, dataBytes - projects.reduce((a, p) => a + projectBytes(p.id), 0));
    const smtp = await this.prisma.smtpSettings.findFirst();
    const root = path.resolve(config.storageDir);
    const cat = async (id: string, label: string, dirs: string[], unit: (n: number) => string) => {
      let n = 0, bytes = 0;
      for (const d of dirs) { const s = await this.dirStats(path.join(root, d)); n += s.n; bytes += s.bytes; }
      return { id, label, count: n, countLabel: unit(n), bytes, always: id === 'formats' };
    };
    const files = [
      await cat('kb', 'Base de connaissance', ['base-connaissance'], (n) => `${n} document${n > 1 ? 's' : ''}`),
      await cat('guide', 'Guide utilisateur', ['guide'], (n) => `${n} fichier${n > 1 ? 's' : ''}`),
      await cat('formats', 'Formats de rapport', ['report-formats', 'report-templates'], (n) => `${n} fichier${n > 1 ? 's' : ''}`),
    ];
    const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? 's' : ''}`;
    return {
      version, build,
      lastVersion: last?.version ?? null,
      news: this.news(last?.createdAt ?? null),
      sizes: { app: await this.appSize(), shared, demo: DEMO_DATA_BYTES, empty: EMPTY_DATA_BYTES },
      projects: projects.map((p) => ({
        id: p.id, name: p.name, bytes: projectBytes(p.id),
        meta: [plural(p._count.workstreams, 'chantier'), plural(tasks.get(p.id) ?? 0, 'tâche'), snaps.get(p.id) ? plural(snaps.get(p.id)!, 'snapshot') : ''].filter(Boolean).join(' · '),
      })),
      keys: await this.keyRows(),
      smtp: smtp ? { host: smtp.host, from: smtp.fromAddress } : null,
      files,
      profiles: [...SHARE_PROFILES],
    };
  }

  /** Clés incluables : fournisseurs d'IA (plafond mensuel) puis cartes API du Registre (sans plafond connu). */
  private async keyRows(ids?: string[]) {
    const providers = await this.prisma.provider.findMany({ where: { keyCipher: { not: null }, ...(ids ? { id: { in: ids } } : {}) }, orderBy: { name: 'asc' } });
    const cardIds = ids?.filter((k) => k.startsWith(CARD_KEY)).map((k) => k.slice(CARD_KEY.length));
    const cards = await this.prisma.apiCard.findMany({ where: { keyEncrypted: { not: null }, ...(cardIds ? { id: { in: cardIds } } : {}) }, orderBy: { name: 'asc' } });
    return [
      ...providers.map((p) => ({ id: p.id, name: p.name, mask: keyMask(p.keyPrefix, p.keyLast4), cap: p.monthlyCapEur ?? null })),
      ...cards.map((c) => ({ id: CARD_KEY + c.id, name: `Carte API · ${c.name}`, mask: keyMask('', c.keyLast4), cap: null })),
    ];
  }

  // ───────────── Génération ─────────────

  async start(actor: Actor, r: ShareRequest): Promise<{ jobId: string }> {
    const errors = shareRequestErrors(r);
    if (Object.keys(errors).length) throw badRequest('Paquet incomplet', errors);
    if (await this.prisma.sharePackage.findFirst({ where: { status: 'RUNNING' } })) throw new ApiError(409, 'SHARE_RUNNING', 'Un paquet est déjà en cours de génération.');
    const projects = r.data === 'current' ? await this.prisma.project.findMany({ where: { id: { in: r.projects } }, select: { id: true, name: true } }) : [];
    if (r.data === 'current' && projects.length !== new Set(r.projects).size) throw badRequest('Projet inconnu', { projects: 'Projet inconnu.' });
    const keys = await this.keyRows([...new Set(r.keys)]);
    if (keys.length !== new Set(r.keys).size) throw badRequest('Clé inconnue', { keys: 'Clé d’IA inconnue ou sans clé.' });
    const smtp = r.smtp && !!(await this.prisma.smtpSettings.findFirst());
    const profiles = r.prefill.enabled ? r.prefill.profiles.filter((p) => (SHARE_PROFILES as readonly string[]).includes(p)) : [];
    const { version, build } = this.version();
    const id = 'shp_' + randomBytes(9).toString('hex');
    const fileName = packageFileName(version, r.recipient.name);
    const recipient = { name: r.recipient.name.trim(), email: r.recipient.email.trim().toLowerCase() };
    await this.prisma.sharePackage.create({
      data: {
        id, byAccountId: actor.accountId, byName: actor.fullName, recipientName: recipient.name, recipientEmail: recipient.email,
        dataMode: r.data, projects: projects.map((p) => p.id), dataLabel: dataLabel(r.data, projects.map((p) => p.name), r.files),
        keys, smtp, files: r.files, code: r.code, prefill: r.prefill.enabled ? { ...recipient, profiles } : undefined,
        updateMode: r.update, version, fileName,
      },
    });
    // Code seulement s'il protège quelque chose : un paquet sans secret n'en a pas besoin.
    const code = r.code && secretCount(keys.length, smtp) > 0 ? unlockCode() : null;
    const live: Live = { listeners: new Set(), code: null };
    this.live.set(id, live);
    const secrets = secretCount(keys.length, smtp);
    const opts: ShareBuildOptions = {
      id, version, build, data: r.data, projects: projects.map((p) => p.id), keys: keys.map((k) => k.id), smtp, files: r.files, code,
      recipient, prefill: r.prefill.enabled ? { ...recipient, profiles } : null, update: r.update, authorAccountId: actor.accountId, fileName,
    };
    void this.run(actor, id, opts, secrets, live, code);
    return { jobId: id };
  }

  private emit(live: Live | undefined, e: ShareEvent) {
    for (const l of live?.listeners ?? []) l(e);
  }

  private async run(actor: Actor, id: string, opts: ShareBuildOptions, secrets: number, live: Live, code: string | null) {
    const ctx = adminCtx(actor);
    let cur = -1;
    const step = async (n: number) => {
      if (cur >= 0) this.emit(live, { step: SHARE_STEPS[cur], status: cur === 2 && !secrets ? 'skipped' : 'done' });
      cur = n;
      await this.prisma.sharePackage.update({ where: { id }, data: { step: n } });
      this.emit(live, { step: SHARE_STEPS[n], status: n === 2 && !secrets ? 'skipped' : 'running' });
    };
    try {
      const out = await this.builder.build(opts, step);
      this.emit(live, { step: SHARE_STEPS[cur], status: 'done' });
      const fileKey = path.relative(path.resolve(config.storageDir), out.file).split(path.sep).join('/');
      const row = await this.prisma.$transaction(async (tx) => {
        const row = await tx.sharePackage.update({ where: { id }, data: { status: 'READY', step: SHARE_STEPS.length, sizeBytes: BigInt(out.size), sha256: out.sha256, fileKey, finishedAt: new Date() } });
        await this.audit.action(tx, ctx, {
          action: 'Génération d’un paquet Cockpit', target: `${row.recipientName} · ${row.recipientEmail}`, severity: 'SENSITIVE', entityType: 'SharePackage', entityId: id,
          details: { destinataire: row.recipientEmail, donnees: row.dataLabel, cles: (row.keys as Array<{ name: string; mask: string }>).map((k) => `${k.name} ${k.mask}`), smtp: row.smtp, fichiers: row.files, protegeParCode: row.code, version: row.version, empreinte: out.sha256, taille: out.size },
        });
        return row;
      });
      const final = { done: true as const, size: Number(row.sizeBytes), sha256: row.sha256!, fileName: row.fileName! };
      if (code && live.listeners.size) this.emit(live, { ...final, code });
      else {
        this.emit(live, final);
        if (code) {
          // Personne à l'écran : code gardé en mémoire jusqu'à la première reconnexion (au plus 1 h).
          live.code = code;
          live.timer = setTimeout(() => { live.code = null; this.live.delete(id); }, SHARE_CODE_TTL_MS);
          live.timer.unref?.();
        }
      }
      if (!live.code) this.live.delete(id);
    } catch (e) {
      const message = e instanceof Error ? e.message.split('\n')[0].slice(0, 400) : 'Erreur inconnue';
      await this.prisma.sharePackage.update({ where: { id }, data: { status: 'FAILED', error: message, finishedAt: new Date() } }).catch(() => {});
      await this.prisma.$transaction((tx) => this.audit.action(tx, ctx, { action: 'Échec de la génération d’un paquet Cockpit', target: opts.recipient.email, severity: 'SENSITIVE', entityType: 'SharePackage', entityId: id, details: { erreur: message } })).catch(() => {});
      this.emit(live, { failed: true, message });
      this.live.delete(id);
    }
  }

  /**
   * Flux d'une génération : étapes passées rejouées, étape en cours, puis événements en direct. Le code n'est remis
   * qu'une fois : au premier abonné présent à la fin, ou à la première reconnexion s'il n'y en avait aucun.
   * Renvoie la fonction de désabonnement (null si le flux est terminé).
   */
  async subscribe(id: string, send: (e: ShareEvent) => void): Promise<(() => void) | null> {
    const row = await this.prisma.sharePackage.findUnique({ where: { id } });
    if (!row) throw notFound('Paquet introuvable');
    const secrets = secretCount((row.keys as unknown[]).length, row.smtp);
    const upTo = row.status === 'READY' ? SHARE_STEPS.length : row.step;
    for (let i = 0; i < upTo; i++) send({ step: SHARE_STEPS[i], status: i === 2 && !secrets ? 'skipped' : 'done' });
    if (row.status === 'READY') {
      const live = this.live.get(id);
      const code = live?.code ?? undefined;
      if (live) { live.code = null; clearTimeout(live.timer); this.live.delete(id); }
      send({ done: true, size: Number(row.sizeBytes ?? 0), sha256: row.sha256 ?? '', fileName: row.fileName ?? '', ...(code ? { code } : {}) });
      return null;
    }
    if (row.status === 'FAILED') { send({ failed: true, message: row.error ?? 'Génération interrompue.' }); return null; }
    send({ step: SHARE_STEPS[row.step], status: row.step === 2 && !secrets ? 'skipped' : 'running' });
    const live = this.live.get(id);
    if (!live) { send({ failed: true, message: 'Génération interrompue.' }); return null; }
    live.listeners.add(send);
    return () => live.listeners.delete(send);
  }

  // ───────────── Historique, téléchargement, suppression ─────────────

  async history() {
    const rows = await this.prisma.sharePackage.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
    return rows.map((r) => ({
      id: r.id, status: r.status, step: r.step, error: r.error, createdAt: r.createdAt.toISOString(), finishedAt: r.finishedAt?.toISOString() ?? null,
      by: r.byName, to: r.recipientName, mail: r.recipientEmail, data: r.dataLabel, dataMode: r.dataMode, projects: r.projects,
      keys: (r.keys as Array<{ id: string; name: string; mask: string }>).map((k) => ({ id: k.id, name: k.name, mask: k.mask })), smtp: r.smtp, files: r.files, code: r.code, prefill: r.prefill ?? null,
      update: r.updateMode, version: r.version, size: r.sizeBytes === null ? null : Number(r.sizeBytes), sha256: r.sha256, fileName: r.fileName,
      kept: r.status === 'READY' && !r.fileDeletedAt, fileDeletedAt: r.fileDeletedAt?.toISOString() ?? null,
      expiresAt: r.status === 'READY' && !r.fileDeletedAt && r.finishedAt ? new Date(r.finishedAt.getTime() + SHARE_FILE_TTL_MS).toISOString() : null,
      spend: possibleSpend((r.keys as Array<{ cap: number | null }>).map((k) => k.cap ?? null)),
    }));
  }

  private sign(id: string, accountId: string, exp: number) {
    return createHmac('sha256', config.jwtSecret).update(`share:${id}:${accountId}:${exp}`).digest('base64url');
  }

  /** Lien signé (15 min) vers le fichier, lié au compte administrateur qui le demande. */
  async downloadUrl(actor: Actor, id: string) {
    const row = await this.file(id);
    const exp = Date.now() + SHARE_URL_TTL_MS;
    const q = new URLSearchParams({ a: actor.accountId, exp: String(exp), sig: this.sign(id, actor.accountId, exp) });
    return { url: `/api/admin/share/files/${encodeURIComponent(id)}?${q}`, expiresAt: new Date(exp).toISOString(), fileName: row.fileName };
  }

  /** Fichier d'un paquet : 404 inconnu, 410 supprimé (ou génération sans fichier). */
  async file(id: string) {
    const row = await this.prisma.sharePackage.findUnique({ where: { id } });
    if (!row) throw notFound('Paquet introuvable');
    if (row.fileDeletedAt || row.status !== 'READY' || !row.fileKey) throw new ApiError(410, 'GONE', row.fileDeletedAt ? 'Le fichier de ce paquet a été supprimé du serveur.' : 'Ce paquet n’a pas de fichier.');
    return row;
  }

  /** Vérifie un lien signé : signature, échéance et compte toujours administrateur. Renvoie le chemin du fichier. */
  async signedFile(id: string, accountId: string, exp: string, sig: string) {
    const e = Number(exp);
    const good = Buffer.from(this.sign(id, accountId ?? '', e));
    const given = Buffer.from(String(sig ?? ''));
    if (!e || good.length !== given.length || !timingSafeEqual(good, given)) throw new ApiError(403, 'FORBIDDEN', 'Lien de téléchargement invalide.');
    if (Date.now() > e) throw new ApiError(403, 'LINK_EXPIRED', 'Lien de téléchargement expiré : relancez le téléchargement depuis la Console.');
    if (!(await this.prisma.adminGrant.findUnique({ where: { accountId } }))) throw new ApiError(403, 'FORBIDDEN', 'Action non autorisée pour votre profil');
    const row = await this.file(id);
    const abs = path.resolve(config.storageDir, row.fileKey!);
    if (!existsSync(abs)) throw new ApiError(410, 'GONE', 'Le fichier de ce paquet n’est plus sur le serveur.');
    return { abs, fileName: row.fileName! };
  }

  /** Fichiers arrivés à échéance (`SHARE_FILE_TTL_MS` après la génération) : supprimés, la ligne reste, audit sensible. */
  async purgeExpired(now: Date): Promise<number> {
    const due = await this.prisma.sharePackage.findMany({ where: { status: 'READY', fileDeletedAt: null, finishedAt: { lte: new Date(now.getTime() - SHARE_FILE_TTL_MS) } } });
    for (const row of due) await this.removeFile(row, { actor: SYSTEM_ACTOR, projectId: null, profileUsed: null, origin: 'SYSTEM' }, 'Suppression automatique du fichier d’un paquet Cockpit', now);
    return due.length;
  }

  private async removeFile(row: { id: string; recipientName: string; fileName: string | null; sha256: string | null; fileKey: string | null }, ctx: WriteCtx, action: string, now: Date) {
    await this.prisma.$transaction(async (tx) => {
      await tx.sharePackage.update({ where: { id: row.id }, data: { fileDeletedAt: now } });
      await this.audit.action(tx, ctx, {
        action, target: `${row.recipientName} · ${row.fileName ?? row.id}`, severity: 'SENSITIVE', entityType: 'SharePackage', entityId: row.id,
        details: { fichier: row.fileName, empreinte: row.sha256 },
      });
    });
    if (row.fileKey) await fs.rm(path.dirname(path.resolve(config.storageDir, row.fileKey)), { recursive: true, force: true }).catch(() => {});
  }

  async deleteFile(actor: Actor, id: string) {
    const row = await this.prisma.sharePackage.findUnique({ where: { id } });
    if (!row) throw notFound('Paquet introuvable');
    if (row.status === 'RUNNING') throw new ApiError(409, 'SHARE_RUNNING', 'Paquet en cours de génération.');
    if (row.fileDeletedAt) return { fileDeletedAt: row.fileDeletedAt.toISOString() };
    const now = new Date();
    await this.removeFile(row, adminCtx(actor), 'Suppression du fichier d’un paquet Cockpit', now);
    return { fileDeletedAt: now.toISOString() };
  }
}
