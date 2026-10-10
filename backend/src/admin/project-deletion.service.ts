import { Injectable, OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Actor } from '../core/auth/auth';
import { AuditService, WriteCtx } from '../core/audit.service';
import { PrismaService } from '../core/prisma.service';
import { StorageService } from '../core/storage.service';
import { config } from '../core/config';
import { JobsService } from '../core/jobs.service';
import { ApiError, conflict, notFound } from '../core/errors';
import { adminCtx, SUSPENSION_ACTION } from './profiles.service';
import { confirmsCode, deletionOrder, ForeignKey, KEPT_TABLES, PROJECT_COLUMNS, selectionPlan, trashExpiry } from '../domain/project-deletion';

/** Dossiers du stockage propres à un projet (`<dossier>/<projectId>/…`), mis de côté avec la sauvegarde de sécurité. */
export const PROJECT_STORAGE_DIRS = ['base-connaissance', 'report-formats', 'report-templates', 'snapshots', 'assistant', 'reports'];

const q = (id: string) => `"${id.replace(/"/g, '""')}"`;
const SYSTEM_CTX = { actor: { accountId: 'system', sessionId: 'system', email: '', fullName: 'Système', personId: null, isAdmin: true }, projectId: null, profileUsed: null, origin: 'SYSTEM' } as unknown as WriteCtx;

/** Compteurs montrés avant la suppression (tables Prisma → libellé). */
const COUNTED: Array<[string, string]> = [
  ['Workstream', 'chantiers'], ['Phase', 'phases'], ['Subphase', 'sousPhases'], ['Milestone', 'jalons'], ['Deliverable', 'livrables'],
  ['Risk', 'risques'], ['Issue', 'problemes'], ['Action', 'actions'], ['Decision', 'decisions'], ['Task', 'taches'],
  ['Document', 'documents'], ['Person', 'personnes'], ['ReportInstance', 'rapports'], ['ReportTemplate', 'templates'], ['Snapshot', 'snapshots'],
];

interface Plan { preds: Map<string, string>; order: string[] }
interface Archive { version: 1; projectId: string; order: string[]; tables: Record<string, unknown[]>; patches: { defaultProject: string[]; suspended: string[]; rules?: Array<{ id: string; projectIds: string[]; enabled: boolean }> } }

/**
 * Suppression d'un projet et sauvegarde de sécurité (Console › Projets, 10/10/2026). Toutes les données du projet sont
 * archivées (lignes et fichiers), puis effacées ; la restauration remet tout en place pendant 48 h. La consommation d'IA,
 * l'usage de la plateforme, le journal d'audit et l'historique des documents ne sont jamais touchés.
 */
@Injectable()
export class ProjectDeletionService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly jobs: JobsService,
  ) {}

  onModuleInit() {
    this.jobs.register('projects.trash.purge', async () => { await this.purge(); });
    this.jobs.schedule('projects.trash.purge', '17 * * * *');
    // Projets supprimés avant le 10/10/2026 (soir) : encore présents dans des règles de notification.
    // Hors tests (tâches de fond coupées) : jamais pendant l'amorçage d'une base de test.
    if (config.jobsEnabled) void this.reconcileRules().catch(() => undefined);
  }

  /**
   * Retire des règles de notification les projets supprimés encore restaurables qui y figurent (suppressions faites avant que
   * la suppression ne s'en charge) ; l'état d'origine est ajouté à l'archive pour la restauration. Idempotent.
   */
  async reconcileRules() {
    let n = 0;
    for (const t of await this.prisma.projectTrash.findMany({ where: { expiresAt: { gt: new Date() } } })) {
      if (await this.prisma.project.findFirst({ where: { OR: [{ id: t.projectId }, { code: t.code }] } })) continue;
      const rules = await this.prisma.notificationRule.findMany({ where: { projectIds: { hasSome: [t.code, t.projectId] } }, select: { id: true, projectIds: true, enabled: true } });
      if (!rules.length) continue;
      const raw = await this.storage.get(t.archiveKey);
      if (!raw) continue;
      const a = JSON.parse(raw.toString('utf8')) as Archive;
      a.patches.rules = [...(a.patches.rules ?? []).filter((x) => !rules.some((r) => r.id === x.id)), ...rules];
      await this.storage.putAt(t.archiveKey, Buffer.from(JSON.stringify(a)));
      for (const ru of rules) {
        const left = ru.projectIds.filter((x) => x !== t.code && x !== t.projectId);
        await this.prisma.notificationRule.update({ where: { id: ru.id }, data: { projectIds: left, ...(left.length ? {} : { enabled: false }), version: { increment: 1 } } });
        n++;
      }
    }
    return n;
  }

  /** Tables touchées et ordre de suppression, lus dans le catalogue de PostgreSQL (toute nouvelle table est prise en compte). */
  async plan(): Promise<Plan> {
    const direct = await this.prisma.$queryRawUnsafe<Array<{ table: string; column: string }>>(
      `SELECT c.relname AS "table", a.attname AS "column" FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT a.attisdropped AND a.attnum > 0 AND a.attname = ANY($1::text[])`,
      PROJECT_COLUMNS,
    );
    const fks = await this.prisma.$queryRawUnsafe<ForeignKey[]>(
      `SELECT cl.relname AS child, ca.attname AS "childCol", pl.relname AS parent, pa.attname AS "parentCol", con.confdeltype::text AS "deleteRule"
       FROM pg_constraint con
       JOIN pg_class cl ON cl.oid = con.conrelid JOIN pg_class pl ON pl.oid = con.confrelid JOIN pg_namespace n ON n.oid = cl.relnamespace
       JOIN pg_attribute ca ON ca.attrelid = con.conrelid AND ca.attnum = con.conkey[1]
       JOIN pg_attribute pa ON pa.attrelid = con.confrelid AND pa.attnum = con.confkey[1]
       WHERE con.contype = 'f' AND n.nspname = 'public' AND array_length(con.conkey, 1) = 1`,
    );
    const preds = selectionPlan(direct, fks, KEPT_TABLES);
    return { preds, order: deletionOrder([...preds.keys()], fks) };
  }

  private async projectOf(ref: string) {
    const p = (await this.prisma.project.findUnique({ where: { id: ref } })) ?? (await this.prisma.project.findUnique({ where: { code: ref.toUpperCase() } }));
    if (!p) throw notFound('Projet introuvable');
    return p;
  }

  /** Comptes qui n'ont accès qu'à ce projet (ni autre projet, ni rôle d'administrateur) : proposés à la suspension. */
  private async onlyHere(projectId: string) {
    const links = await this.prisma.accountProject.findMany({ where: { projectId }, select: { accountId: true } });
    const ids = links.map((l) => l.accountId);
    if (!ids.length) return [];
    const [others, admins, habs] = await Promise.all([
      this.prisma.accountProject.findMany({ where: { accountId: { in: ids }, projectId: { not: projectId } }, select: { accountId: true } }),
      this.prisma.adminGrant.findMany({ where: { accountId: { in: ids } }, select: { accountId: true } }),
      this.prisma.habilitation.findMany({ where: { accountId: { in: ids }, projectId: { not: projectId } }, select: { accountId: true } }),
    ]);
    const keep = new Set([...others, ...admins, ...habs].map((x) => x.accountId));
    return this.prisma.account.findMany({ where: { id: { in: ids.filter((x) => !keep.has(x)) }, status: { not: 'SUSPENDED' } }, select: { id: true, fullName: true, email: true, status: true }, orderBy: { fullName: 'asc' } });
  }

  /** Ce qui sera supprimé : compteurs, comptes qui n'auront plus d'accès, lignes par table. */
  async preview(ref: string) {
    const p = await this.projectOf(ref);
    const { preds } = await this.plan();
    const rows: Record<string, number> = {};
    for (const [t, pred] of preds) rows[t] = Number((await this.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT count(*) AS n FROM ${q(t)} WHERE ${pred}`, p.id))[0].n);
    const counts = Object.fromEntries(COUNTED.map(([t, k]) => [k, rows[t] ?? 0]));
    const accounts = await this.onlyHere(p.id);
    return { project: { id: p.id, code: p.code, name: p.name }, counts, accounts, rows, totalRows: Object.values(rows).reduce((a, b) => a + b, 0), retentionHours: 48 };
  }

  /** Supprime le projet après en avoir fait la sauvegarde de sécurité. */
  async remove(ref: string, actor: Actor, input: { confirmCode: string; suspendAccounts?: boolean }) {
    const p = await this.projectOf(ref);
    if (!confirmsCode(input.confirmCode, p.code)) throw new ApiError(422, 'CONFIRMATION', `Saisissez le code du projet (${p.code}) pour confirmer la suppression`);
    const { preds, order } = await this.plan();
    const id = 'trash_' + randomBytes(8).toString('hex'), archiveKey = `corbeille/${id}/archive.json`;
    const toSuspend = input.suspendAccounts ? await this.onlyHere(p.id) : [], suspended = toSuspend.map((a) => a.id);
    const defaultProject = (await this.prisma.userPreferences.findMany({ where: { defaultProject: { in: [p.id, p.code] } }, select: { accountId: true } })).map((x) => x.accountId);
    // 1. Archive complète, écrite avant toute suppression.
    const tables: Record<string, unknown[]> = {};
    for (const t of order) {
      const [r] = await this.prisma.$queryRawUnsafe<Array<{ rows: unknown[] }>>(`SELECT coalesce(json_agg(x), '[]'::json) AS rows FROM ${q(t)} x WHERE ${preds.get(t)}`, p.id);
      if (r.rows.length) tables[t] = r.rows;
    }
    // Règles de notification qui ciblent le projet (par code ou identifiant, 10/10/2026) : le projet en est retiré ; une règle qui
    // n'en cible plus aucun est désactivée. État d'origine gardé pour la restauration.
    const rules = (await this.prisma.notificationRule.findMany({ where: { projectIds: { hasSome: [p.code, p.id] } }, select: { id: true, projectIds: true, enabled: true } }));
    const archive: Archive = { version: 1, projectId: p.id, order, tables, patches: { defaultProject, suspended, rules } };
    await this.storage.putAt(archiveKey, Buffer.from(JSON.stringify(archive)));
    const stats = { counts: Object.fromEntries(COUNTED.map(([t, k]) => [k, (tables[t] ?? []).length])), rows: Object.fromEntries(Object.entries(tables).map(([t, l]) => [t, l.length])), suspended: suspended.length };
    // 2. Suppression, des enfants vers les parents, en une transaction.
    try {
      await this.prisma.$transaction(async (db) => {
        for (const t of order) if (tables[t]) await db.$executeRawUnsafe(`DELETE FROM ${q(t)} WHERE ${preds.get(t)}`, p.id);
        if (defaultProject.length) await db.userPreferences.updateMany({ where: { accountId: { in: defaultProject } }, data: { defaultProject: null } });
        for (const ru of rules) {
          const left = ru.projectIds.filter((x) => x !== p.code && x !== p.id);
          await db.notificationRule.update({ where: { id: ru.id }, data: { projectIds: left, ...(left.length ? {} : { enabled: false }), version: { increment: 1 } } });
        }
        if (suspended.length) {
          await db.account.updateMany({ where: { id: { in: suspended } }, data: { status: 'SUSPENDED' } });
          await db.authSession.updateMany({ where: { accountId: { in: suspended }, revokedAt: null }, data: { revokedAt: new Date() } });
          for (const a of toSuspend) await this.audit.action(db, adminCtx(actor), { action: SUSPENSION_ACTION, target: a.fullName, severity: 'SENSITIVE', entityType: 'Account', entityId: a.id, details: { motif: `Suppression du projet ${p.code}` } });
        }
        const now = new Date();
        await db.projectTrash.create({ data: { id, projectId: p.id, code: p.code, name: p.name, deletedAt: now, deletedById: actor.accountId, deletedBy: actor.fullName, expiresAt: trashExpiry(now), archiveKey, stats } });
        await this.audit.action(db, adminCtx(actor), { action: 'Suppression d’un projet', target: `${p.code} · ${p.name}`, severity: 'CRITICAL', entityType: 'Project', entityId: p.id, details: { sauvegarde: id, restaurableJusquau: trashExpiry(now).toISOString(), ...stats } });
      }, { timeout: 180_000, maxWait: 30_000 });
    } catch (e) {
      await this.storage.removeDir(`corbeille/${id}`).catch(() => {});
      throw e;
    }
    // 3. Fichiers déposés du projet mis de côté avec la sauvegarde.
    for (const d of PROJECT_STORAGE_DIRS) await this.storage.moveDir(`${d}/${p.id}`, `corbeille/${id}/files/${d}`).catch(() => false);
    return this.trashView(await this.prisma.projectTrash.findUniqueOrThrow({ where: { id } }));
  }

  private trashView(t: { id: string; projectId: string; code: string; name: string; deletedAt: Date; deletedBy: string; expiresAt: Date; stats: unknown }) {
    return { id: t.id, projectId: t.projectId, code: t.code, name: t.name, deletedAt: t.deletedAt, deletedBy: t.deletedBy, expiresAt: t.expiresAt, stats: t.stats };
  }

  /** Comptes suspendus par la suppression d'un projet encore restaurable (id → code du projet) : la restauration les réactive. */
  async restorableSuspensions() {
    const out = new Map<string, string>();
    for (const t of await this.prisma.projectTrash.findMany({ where: { expiresAt: { gt: new Date() } } })) {
      const raw = await this.storage.get(t.archiveKey).catch(() => null);
      if (!raw) continue;
      for (const id of (JSON.parse(raw.toString('utf8')) as Archive).patches.suspended) out.set(id, t.code);
    }
    return out;
  }

  /** Projets supprimés encore restaurables. */
  async trash() {
    return (await this.prisma.projectTrash.findMany({ where: { expiresAt: { gt: new Date() } }, orderBy: { deletedAt: 'desc' } })).map((t) => this.trashView(t));
  }

  /** Restaure un projet supprimé depuis sa sauvegarde de sécurité (refusé si un projet de même identifiant ou code existe). */
  async restore(trashId: string, actor: Actor) {
    const t = await this.prisma.projectTrash.findUnique({ where: { id: trashId } });
    if (!t || t.expiresAt <= new Date()) throw notFound('Sauvegarde introuvable ou expirée');
    if (await this.prisma.project.findFirst({ where: { OR: [{ id: t.projectId }, { code: t.code }] } })) throw conflict('PROJECT_EXISTS', `Un projet ${t.code} existe déjà : supprimez-le ou renommez-le avant de restaurer`);
    const raw = await this.storage.get(t.archiveKey);
    if (!raw) throw new ApiError(410, 'ARCHIVE_MISSING', 'Archive de la sauvegarde introuvable');
    const a = JSON.parse(raw.toString('utf8')) as Archive;
    await this.prisma.$transaction(async (db) => {
      // Parents d'abord : ordre inverse de la suppression.
      for (const tbl of [...a.order].reverse()) {
        const rows = a.tables[tbl];
        if (!rows || !rows.length) continue;
        for (let i = 0; i < rows.length; i += 500) {
          await db.$executeRawUnsafe(`INSERT INTO ${q(tbl)} SELECT * FROM json_populate_recordset(NULL::${q(tbl)}, $1::json)`, JSON.stringify(rows.slice(i, i + 500)));
        }
      }
      if (a.patches.defaultProject.length) await db.userPreferences.updateMany({ where: { accountId: { in: a.patches.defaultProject } }, data: { defaultProject: t.code } });
      if (a.patches.suspended.length) await db.account.updateMany({ where: { id: { in: a.patches.suspended }, status: 'SUSPENDED' }, data: { status: 'ACTIVE' } });
      // Règles de notification : le projet y revient ; une règle désactivée par la suppression retrouve son état.
      for (const ru of a.patches.rules ?? []) {
        const cur = await db.notificationRule.findUnique({ where: { id: ru.id }, select: { projectIds: true, enabled: true } });
        if (!cur) continue;
        await db.notificationRule.update({ where: { id: ru.id }, data: { projectIds: [...new Set([...cur.projectIds, t.code])], ...(!cur.projectIds.length && ru.enabled ? { enabled: true } : {}), version: { increment: 1 } } });
      }
      await db.projectTrash.delete({ where: { id: t.id } });
      await this.audit.action(db, adminCtx(actor), { action: 'Restauration d’un projet supprimé', target: `${t.code} · ${t.name}`, severity: 'CRITICAL', entityType: 'Project', entityId: t.projectId, details: { sauvegarde: t.id, comptesReactives: a.patches.suspended.length } });
    }, { timeout: 180_000, maxWait: 30_000 });
    for (const d of PROJECT_STORAGE_DIRS) await this.storage.moveDir(`corbeille/${t.id}/files/${d}`, `${d}/${t.projectId}`).catch(() => false);
    await this.storage.removeDir(`corbeille/${t.id}`).catch(() => {});
    return { projectId: t.projectId, code: t.code, name: t.name };
  }

  /** Sauvegardes expirées : archive et fichiers effacés définitivement (tâche horaire). */
  async purge(now = new Date()) {
    const old = await this.prisma.projectTrash.findMany({ where: { expiresAt: { lte: now } } });
    for (const t of old) {
      await this.storage.removeDir(`corbeille/${t.id}`).catch(() => {});
      await this.prisma.projectTrash.delete({ where: { id: t.id } });
      await this.audit.action(this.prisma, SYSTEM_CTX, { action: 'Purge de la sauvegarde d’un projet supprimé', target: `${t.code} · ${t.name}`, severity: 'INFO', entityType: 'Project', entityId: t.projectId });
    }
    return old.length;
  }
}
