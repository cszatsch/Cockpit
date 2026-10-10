import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AdminOnly, Actor, CurrentActor, SuperAdminOnly } from '../core/auth/auth';
import { AuditService } from '../core/audit.service';
import { PrismaService } from '../core/prisma.service';
import { StorageService } from '../core/storage.service';
import { JobsService } from '../core/jobs.service';
import { TodayService } from '../core/today.service';
import { badRequest, businessRule, conflict, notFound } from '../core/errors';
import { parse } from '../core/http';
import { ImportService } from '../import/import.service';
import { commitPlan } from '../import/referential-import';
import { creationPercent } from '../import/import-screen';
import { adminCtx } from './profiles.service';
import { SnapshotsService } from './snapshots.service';
import { ProjectDeletionService } from './project-deletion.service';
import { counters, nextSnapshotRun } from '../domain/snapshots';

/** Nombre de jours pendant lesquels un projet importé porte le badge « Nouveau ». */
export const NEW_PROJECT_DAYS = 7;

/** Snapshots, modules, bibliothèque des projets et initialisation (brief Console § 9.7, 9.9, 9.10). */
@ApiTags('console · données et diffusion')
@ApiBearerAuth()
@AdminOnly()
@Controller('api/admin')
export class DataController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly snapshots: SnapshotsService,
    private readonly jobs: JobsService,
    private readonly storage: StorageService,
    private readonly imports: ImportService,
    private readonly today: TodayService,
    private readonly deletion: ProjectDeletionService,
  ) {}

  // ───────────── Suppression d'un projet (Bibliothèque des projets, 10/10/2026) ─────────────

  /** Ce que la suppression effacera : compteurs, comptes qui n'auront plus d'accès, lignes par table. Super Admin. */
  @SuperAdminOnly()
  @Get('projects/:ref/deletion-preview')
  deletionPreview(@Param('ref') ref: string) {
    return this.deletion.preview(ref);
  }

  /**
   * Supprime un projet et toutes ses données, après une sauvegarde de sécurité restaurable 48 h. Confirmation par le code du
   * projet ; option : suspendre les comptes qui n'avaient accès qu'à lui. Consommation d'IA, usage et audit conservés.
   */
  @SuperAdminOnly()
  @Delete('projects/:ref')
  deleteProject(@CurrentActor() actor: Actor, @Param('ref') ref: string, @Body() body: unknown) {
    const input = parse(z.object({ confirmCode: z.string().default(''), suspendAccounts: z.boolean().default(false) }).strict(), body ?? {});
    return this.deletion.remove(ref, actor, input);
  }

  /** Projets supprimés encore restaurables (sauvegardes de sécurité de moins de 48 h). */
  @Get('project-trash')
  projectTrash() {
    return this.deletion.trash();
  }

  /** Restaure un projet supprimé. Super Admin. */
  @SuperAdminOnly()
  @Post('project-trash/:id/restore')
  restoreProject(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.deletion.restore(id, actor);
  }

  private async project(ref: string) {
    const p = (await this.prisma.project.findUnique({ where: { id: ref } })) ?? (await this.prisma.project.findUnique({ where: { code: ref.toUpperCase() } }));
    if (!p) throw notFound('Projet introuvable');
    return p;
  }

  // ───────────── Snapshots (vue Snapshots.dc.html) ─────────────

  /** Snapshot → élément de la vue : `{ id, date, type: auto|man, libelle, auteur, compteurs }`. */
  private snapItem(s: any) {
    return { id: s.id, date: s.takenAt.toISOString(), type: s.kind === 'MANUAL' ? 'man' : 'auto', libelle: s.label ?? '', auteur: s.takenBy ?? '', compteurs: counters((s.stats as any)?.counts) };
  }

  /** Snapshots terminés du projet, du plus ancien au plus récent. */
  @Get('projects/:id/snapshots')
  async listSnapshots(@Param('id') id: string) {
    const p = await this.project(id);
    return (await this.prisma.snapshot.findMany({ where: { projectId: p.id, status: 'DONE' }, orderBy: { takenAt: 'asc' } })).map((s) => this.snapItem(s));
  }

  /** Snapshot manuel `{ libelle }` : 202 et un job ; la capture se suit par `GET /snapshot-jobs/{jobId}`. */
  @Post('projects/:id/snapshots')
  @HttpCode(202)
  async capture(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() body: unknown) {
    const p = await this.project(id);
    const { libelle } = parse(z.object({ libelle: z.string().trim().min(1, 'libellé obligatoire').max(120) }).strict(), body);
    const s = await this.prisma.$transaction(async (db) => {
      const s = await db.snapshot.create({ data: { projectId: p.id, kind: 'MANUAL', label: libelle, takenById: actor.accountId, takenBy: actor.fullName, status: 'RUNNING' } });
      await this.audit.action(db, { ...adminCtx(actor), projectId: p.id }, { action: 'Création d’un snapshot manuel', target: `${p.code} · ${libelle}`, severity: 'INFO', entityType: 'Snapshot', entityId: s.id, details: { projet: p.code, libelle } });
      return s;
    });
    this.snapshots.startCapture(s.id);
    return { jobId: s.id, statut: 'en_cours', progression: 0 };
  }

  /** Avancement réel d'une capture : `{ statut: en_cours|termine|echec, progression, snapshot?, erreur? }`. */
  @Get('snapshot-jobs/:jobId')
  async captureJob(@Param('jobId') jobId: string) {
    const j = await this.snapshots.job(jobId);
    if (!j) throw notFound('Capture introuvable');
    return { jobId, statut: j.statut, progression: j.progression, ...(j.statut === 'termine' ? { snapshot: this.snapItem(j.snapshot) } : {}), ...(j.statut === 'echec' ? { erreur: j.erreur } : {}) };
  }

  /** Planification et prochaine capture, calculée par le serveur (heure de Paris), ou `null` si suspendue. */
  private schedView(row: { projectId: string; enabled: boolean; frequency: string; day: string; hour: string; retention: string }) {
    const now = this.today.now();
    const next = nextSnapshotRun(row, now);
    return { projectId: row.projectId, enabled: row.enabled, frequency: row.frequency, day: row.day.toLowerCase(), hour: row.hour, retention: row.retention, prochaineCapture: next ? next.toISOString() : null, maintenant: now.toISOString() };
  }

  @Get('projects/:id/snapshot-schedule')
  async schedule(@Param('id') id: string) {
    const p = await this.project(id);
    return this.schedView((await this.prisma.snapshotSchedule.findUnique({ where: { projectId: p.id } })) ?? { projectId: p.id, enabled: false, frequency: 'Hebdomadaire', day: 'vendredi', hour: '04:00', retention: '12 mois' });
  }

  /** Chaque modification est tracée : administrateur, date, projet, valeurs avant et après. */
  @Put('projects/:id/snapshot-schedule')
  async putSchedule(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() body: unknown) {
    const p = await this.project(id);
    const input = parse(
      z
        .object({
          enabled: z.boolean(),
          frequency: z.enum(['Quotidienne', 'Hebdomadaire', 'Mensuelle']),
          day: z.enum(['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']),
          hour: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
          retention: z.string().regex(/^\d+\s*(mois|jours?|ans?|semaines?)$/i, 'ex. « 12 mois »'),
        })
        .partial()
        .strict(),
      typeof body === 'object' && body && typeof (body as any).day === 'string' ? { ...(body as object), day: (body as any).day.toLowerCase() } : body,
    );
    const before = await this.prisma.snapshotSchedule.findUnique({ where: { projectId: p.id } });
    const row = await this.prisma.$transaction(async (db) => {
      const row = await db.snapshotSchedule.upsert({ where: { projectId: p.id }, create: { projectId: p.id, ...input }, update: input });
      const toggled = input.enabled !== undefined && input.enabled !== before?.enabled;
      const pick = (r: any) => (r ? { enabled: r.enabled, frequency: r.frequency, day: r.day, hour: r.hour, retention: r.retention } : null);
      await this.audit.action(db, { ...adminCtx(actor), projectId: p.id }, {
        action: toggled ? (input.enabled ? 'Activation des snapshots planifiés' : 'Désactivation des snapshots planifiés') : 'Modification de la planification des snapshots',
        target: p.code,
        severity: toggled ? 'SENSITIVE' : 'INFO',
        entityType: 'SnapshotSchedule',
        entityId: p.id,
        details: { projet: p.code, avant: pick(before), apres: pick(row) },
      });
      return row;
    });
    return this.schedView(row);
  }

  /** Écarts de A (le plus ancien des deux) à B, consolidés : `[{ type, entite, nom, champ?, avant?, apres? }]`. */
  @Get('snapshots/:a/diff/:b')
  async diff(@Param('a') a: string, @Param('b') b: string) {
    const r = await this.snapshots.diff(a, b);
    if (!r) throw notFound('Snapshots introuvables ou de projets différents');
    return r;
  }

  /**
   * Restauration (critique) : le serveur crée d'abord « Sécurité avant restauration », puis restaure, tout ou rien.
   * 409 pour un snapshot de démonstration (sans données).
   */
  @Post('snapshots/:id/restore')
  @HttpCode(200)
  async restore(@CurrentActor() actor: Actor, @Param('id') id: string) {
    const r = await this.snapshots.restore(id, adminCtx(actor));
    return { restaure: this.snapItem(r.restored), securite: this.snapItem(r.safety) };
  }

  /** Export d'un snapshot (JSON). Action critique tracée. */
  @Get('snapshots/:id/export')
  async export(@CurrentActor() actor: Actor, @Param('id') id: string, @Res() res: any) {
    const s = await this.prisma.snapshot.findUnique({ where: { id } });
    if (!s) throw notFound('Snapshot introuvable');
    const content = (await this.snapshots.load(id)) ?? { demo: true, stats: s.stats };
    const p = await this.prisma.project.findUnique({ where: { id: s.projectId } });
    await this.audit.action(this.prisma, adminCtx(actor), { action: 'Export de snapshot', target: `${p?.code} · état du ${s.takenAt.toISOString().slice(0, 10)}`, severity: 'CRITICAL', entityType: 'Snapshot', entityId: id });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="snapshot-${p?.code}-${s.takenAt.toISOString().slice(0, 10)}.json"`);
    res.end(JSON.stringify({ snapshot: { id: s.id, projectId: s.projectId, takenAt: s.takenAt, kind: s.kind, label: s.label }, ...content }, null, 2));
  }

  @Get('snapshots/:id')
  async snapshot(@Param('id') id: string) {
    const s = await this.prisma.snapshot.findUnique({ where: { id } });
    if (!s) throw notFound('Snapshot introuvable');
    return { ...this.snapItem(s), statut: s.status };
  }

  // ───────────── Modules ─────────────

  private async moduleViews() {
    const [mods, projects] = await Promise.all([this.prisma.module.findMany({ include: { projects: true }, orderBy: { id: 'asc' } }), this.prisma.project.findMany({ select: { id: true, code: true } })]);
    const code = (id: string) => projects.find((p) => p.id === id)?.code ?? id;
    return mods.map((m) => ({ id: m.id, name: m.name, description: m.description, scope: m.scope, projectIds: m.projects.map((p) => code(p.projectId)), since: Object.fromEntries(m.projects.map((p) => [code(p.projectId), p.since])), globalSince: m.globalSince, version: m.version }));
  }

  @Get('modules')
  modules() {
    return this.moduleViews();
  }

  @Patch('modules/:id')
  async setModule(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() body: unknown) {
    const input = parse(z.object({ scope: z.enum(['OFF', 'ALL', 'PROJECTS']), projectIds: z.array(z.string()).optional() }).strict(), body);
    const m = await this.prisma.module.findUnique({ where: { id }, include: { projects: true } });
    if (!m) throw notFound('Module introuvable');
    const projects = input.projectIds ? await this.prisma.project.findMany({ where: { OR: [{ code: { in: input.projectIds.map((c) => c.toUpperCase()) } }, { id: { in: input.projectIds } }] } }) : null;
    if (input.projectIds && projects!.length !== new Set(input.projectIds).size) throw badRequest('Projet inconnu', { projectIds: 'un ou plusieurs projets sont introuvables' });
    if (input.scope === 'PROJECTS' && !(projects ?? []).length && !input.projectIds) throw badRequest('Projets manquants', { projectIds: 'obligatoire pour la portée PROJECTS' });
    await this.prisma.$transaction(async (db) => {
      await db.module.update({ where: { id }, data: { scope: input.scope, globalSince: input.scope === 'ALL' ? m.globalSince ?? new Date() : null, version: { increment: 1 } } });
      if (projects) {
        const keep = projects.map((p) => p.id);
        await db.moduleProject.deleteMany({ where: { moduleId: id, projectId: { notIn: keep } } });
        for (const pid of keep) await db.moduleProject.upsert({ where: { moduleId_projectId: { moduleId: id, projectId: pid } }, create: { moduleId: id, projectId: pid }, update: {} });
      }
      await this.audit.action(db, adminCtx(actor), { action: 'Modification de l’activation d’un module', target: `${m.name} · ${input.scope}${projects ? ' · ' + projects.map((p) => p.code).join(', ') : ''}`, severity: 'SENSITIVE', entityType: 'Module', entityId: id });
    });
    return (await this.moduleViews()).find((x) => x.id === id);
  }

  @Get('module-requests')
  async requests(@Query('status') status?: string) {
    const rows = await this.prisma.moduleRequest.findMany({ where: status ? { status: status.toUpperCase() as any } : {}, orderBy: { at: 'desc' } });
    const projects = await this.prisma.project.findMany({ select: { id: true, code: true } });
    return rows.map((r) => ({ ...r, projectCode: projects.find((p) => p.id === r.projectId)?.code ?? r.projectId }));
  }

  /** Approuver : active le module sur le seul projet de la demande ; refuser : clôt la demande. Tracés. */
  @Post('module-requests/:id/approve')
  @HttpCode(200)
  async approve(@CurrentActor() actor: Actor, @Param('id') id: string) {
    const r = await this.prisma.moduleRequest.findUnique({ where: { id } });
    if (!r || r.status !== 'PENDING') throw notFound('Demande introuvable ou déjà traitée');
    await this.prisma.$transaction(async (db) => {
      const m = await db.module.findUniqueOrThrow({ where: { id: r.moduleId } });
      if (m.scope !== 'ALL') {
        await db.module.update({ where: { id: m.id }, data: { scope: 'PROJECTS', version: { increment: 1 } } });
        await db.moduleProject.upsert({ where: { moduleId_projectId: { moduleId: m.id, projectId: r.projectId } }, create: { moduleId: m.id, projectId: r.projectId }, update: {} });
      }
      await db.moduleRequest.update({ where: { id }, data: { status: 'APPROVED', decidedAt: new Date() } });
      await this.audit.action(db, adminCtx(actor), { action: 'Approbation d’une demande de module', target: `${m.name} · ${r.projectId}`, severity: 'SENSITIVE', entityType: 'ModuleRequest', entityId: id });
    });
    return this.moduleViews();
  }

  @Post('module-requests/:id/reject')
  @HttpCode(200)
  async reject(@CurrentActor() actor: Actor, @Param('id') id: string) {
    const r = await this.prisma.moduleRequest.findUnique({ where: { id } });
    if (!r || r.status !== 'PENDING') throw notFound('Demande introuvable ou déjà traitée');
    await this.prisma.$transaction(async (db) => {
      await db.moduleRequest.update({ where: { id }, data: { status: 'REJECTED', decidedAt: new Date() } });
      await this.audit.action(db, adminCtx(actor), { action: 'Refus d’une demande de module', target: `${r.moduleId} · ${r.projectId}`, severity: 'INFO', entityType: 'ModuleRequest', entityId: id });
    });
    return { id, status: 'REJECTED' };
  }

  // ───────────── Bibliothèque des projets ─────────────

  @Get('projects')
  async projects(@Query('status') status?: string, @Query('q') q?: string) {
    const rows = await this.prisma.project.findMany({ include: { client: true, contentBlocks: { where: { key: { in: ['project.display', 'library.display'] } } } }, orderBy: { createdAt: 'desc' } });
    const today = this.today.today();
    const now = this.today.now().getTime();
    const out = [];
    for (const p of rows) {
      const [waves, phases, workstreams, persons] = await Promise.all([this.prisma.wave.count({ where: { projectId: p.id } }), this.prisma.phase.count({ where: { projectId: p.id } }), this.prisma.workstream.count({ where: { projectId: p.id } }), this.prisma.person.count({ where: { projectId: p.id } })]);
      const display = Object.assign({}, ...p.contentBlocks.map((b) => b.data as any));
      const hasRef = waves + phases + workstreams + persons > 0;
      const cur = hasRef ? await this.prisma.phase.findFirst({ where: { projectId: p.id, startDate: { lte: today }, endDate: { gte: today } }, orderBy: { seq: 'desc' } }) : null;
      const last = await this.prisma.snapshot.findFirst({ where: { projectId: p.id, status: 'DONE' }, orderBy: { takenAt: 'desc' } });
      const imported = await this.prisma.projectImport.findFirst({ where: { projectId: p.id } });
      out.push({
        id: p.id,
        code: p.code,
        name: p.name,
        client: display.client ?? p.client.name,
        status: p.status,
        phase: display.phase ?? (cur ? `${cur.name}` : p.status === 'PREPARATION' ? 'Préparation' : ''),
        startDate: phases ? (await this.prisma.phase.findFirst({ where: { projectId: p.id }, orderBy: { startDate: 'asc' } }))!.startDate : p.startDate,
        endDate: phases ? (await this.prisma.phase.findFirst({ where: { projectId: p.id }, orderBy: { endDate: 'desc' } }))!.endDate : p.targetEndDate,
        counts: hasRef || !display.demoCounts ? { waves, phases, workstreams, persons } : display.demoCounts,
        demoCounts: !hasRef && !!display.demoCounts,
        lastSnapshot: last ? { id: last.id, takenAt: last.takenAt, kind: last.kind } : null,
        health: display.health ?? 'neu',
        isNew: !!imported && p.status === 'PREPARATION' && now - p.createdAt.getTime() < NEW_PROJECT_DAYS * 86_400_000,
        importedFrom: imported?.fileName ?? null,
      });
    }
    const st = status && status !== 'tous' ? ({ actif: 'ACTIVE', prep: 'PREPARATION', clos: 'CLOSED' } as Record<string, string>)[status] ?? status.toUpperCase() : null;
    const text = (q ?? '').toLowerCase();
    const list = out.filter((p) => (!st || p.status === st) && (!text || `${p.code} ${p.name} ${p.client}`.toLowerCase().includes(text)));
    // Projets importés en tête (badge « Nouveau »).
    return list.sort((a, b) => Number(b.isNew) - Number(a.isNew));
  }

  // ───────────── Initialisation d'un projet (import Excel, spécification Initialisation projet § 5) ─────────────

  /** Avancement des créations en cours ou récentes (processus unique : l'état vit en mémoire). */
  private importJobs = new Map<string, { status: 'running' | 'done' | 'failed'; phase: number; percent: number; result?: { projectId: string; code: string }; error?: string }>();

  /** Contrôle complet d'un fichier (serveur, fait foi) : vue de l'écran, 5 contrôles, code déjà pris. */
  private control(buffer: Buffer) {
    return this.imports.control(buffer);
  }

  private async importRow(id: string) {
    const i = await this.prisma.projectImport.findUnique({ where: { id } });
    if (!i) throw notFound('Import introuvable');
    return i;
  }

  /**
   * Étape 4 « Valider » : nouveau contrôle complet du fichier gardé (409 si le code existe déjà, 422 s'il n'est plus
   * conforme), puis création tout ou rien dans une transaction, projet au statut PREPARATION, trace d'audit
   * « Initialisation d'un projet » (sensible). La création se suit par `GET projects/import/{jobId}`.
   */
  @Post('projects/import/commit')
  @HttpCode(202)
  async importCommit(@CurrentActor() actor: Actor, @Body() body: unknown) {
    const { jobId } = parse(z.object({ jobId: z.string().min(1) }).strict(), body);
    const i = await this.importRow(jobId);
    if (this.importJobs.get(jobId)?.status === 'running') throw conflict('IN_PROGRESS', 'Création déjà en cours');
    if (i.status === 'IMPORTED') throw conflict('ALREADY_IMPORTED', 'Cet import a déjà été validé');
    const buffer = await this.storage.get(i.fileKey);
    if (!buffer) throw businessRule('Fichier temporaire introuvable : importez de nouveau le fichier', { jobId: 'session expirée' });
    const c = await this.control(buffer);
    if (c.duplicate) throw conflict('DUPLICATE', `Le code ${c.code} existe déjà`);
    if (!c.ok || !c.res.plan) throw businessRule('Le fichier n’est plus conforme : aucune création', { file: c.checks.filter((k) => k.status === 'err').map((k) => `${k.label} : ${k.detail}`).join(' ; ') });
    const plan = c.res.plan;
    const projectId = plan.project.code;
    const job: { status: 'running' | 'done' | 'failed'; phase: number; percent: number; result?: { projectId: string; code: string }; error?: string } = { status: 'running', phase: 1, percent: 0 };
    this.importJobs.set(jobId, job);
    const run = this.prisma.$transaction(
      async (db) => {
        // Exception à la lecture seule de l'Admin : l'initialisation relève du paramétrage de la plateforme (§ 8).
        await commitPlan(db, plan, { projectId, createProject: true, idPrefix: plan.project.code, progress: (phase, fraction) => { job.phase = phase; job.percent = creationPercent(phase, fraction); } }, this.audit, adminCtx(actor));
        await db.snapshotSchedule.create({ data: { projectId } });
        await db.projectImport.update({ where: { id: jobId }, data: { status: 'IMPORTED', projectId } });
        await db.accountProject.upsert({ where: { accountId_projectId: { accountId: actor.accountId, projectId } }, create: { accountId: actor.accountId, projectId }, update: {} });
        await this.audit.action(db, adminCtx(actor), { action: 'Initialisation d’un projet', target: `${plan.project.code} · ${i.fileName}`, severity: 'SENSITIVE', entityType: 'Project', entityId: projectId });
      },
      { timeout: 60_000 },
    );
    run.then(
      async () => {
        Object.assign(job, { status: 'done', phase: 5, percent: 100, result: { projectId, code: plan.project.code } });
        await this.storage.remove(i.fileKey).catch(() => undefined);
      },
      (e: any) => Object.assign(job, { status: 'failed', error: e?.message ?? 'Création impossible' }),
    );
    return { jobId, status: job.status, phase: job.phase, percent: job.percent };
  }

  /** Avancement de la création : `{ jobId, status, phase: 1..5, percent, result?, error? }`. */
  @Get('projects/import/:jobId')
  async importJob(@Param('jobId') jobId: string) {
    const job = this.importJobs.get(jobId);
    if (job) return { jobId, ...job };
    const i = await this.importRow(jobId);
    if (i.status === 'IMPORTED') return { jobId, status: 'done', phase: 5, percent: 100, result: { projectId: i.projectId, code: i.projectId } };
    return { jobId, status: i.status === 'CHECKED' ? 'checked' : 'rejected', phase: 0, percent: 0 };
  }

  /** « Réinitialiser la session » : oubli du fichier côté serveur (fichier temporaire supprimé). */
  @Delete('projects/import/:jobId')
  @HttpCode(204)
  async importForget(@Param('jobId') jobId: string) {
    const i = await this.prisma.projectImport.findUnique({ where: { id: jobId } });
    if (!i) return;
    if (this.importJobs.get(jobId)?.status === 'running') throw conflict('IN_PROGRESS', 'Création en cours : la session ne peut pas être réinitialisée');
    await this.storage.remove(i.fileKey).catch(() => undefined);
    // Un import déjà validé reste tracé ; sinon la session est oubliée.
    if (i.status !== 'IMPORTED') await this.prisma.projectImport.delete({ where: { id: jobId } });
    this.importJobs.delete(jobId);
  }

}
