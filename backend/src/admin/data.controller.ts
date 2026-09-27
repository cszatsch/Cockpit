import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AdminOnly, Actor, CurrentActor } from '../core/auth/auth';
import { AuditService } from '../core/audit.service';
import { PrismaService } from '../core/prisma.service';
import { StorageService } from '../core/storage.service';
import { JobsService } from '../core/jobs.service';
import { TodayService } from '../core/today.service';
import { badRequest, businessRule, conflict, notFound } from '../core/errors';
import { parse } from '../core/http';
import { ImportService } from '../import/import.service';
import { commitPlan, ImportPlan } from '../import/referential-import';
import type { UploadedBlob } from '../import/import.controller';
import { MAX_IMPORT_BYTES } from '../import/import.controller';
import { adminCtx } from './profiles.service';
import { SnapshotsService } from './snapshots.service';

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
  ) {}

  private async project(ref: string) {
    const p = (await this.prisma.project.findUnique({ where: { id: ref } })) ?? (await this.prisma.project.findUnique({ where: { code: ref.toUpperCase() } }));
    if (!p) throw notFound('Projet introuvable');
    return p;
  }

  // ───────────── Snapshots ─────────────

  private snapView(s: any) {
    return { id: s.id, projectId: s.projectId, takenAt: s.takenAt, kind: s.kind, label: s.label, takenBy: s.takenBy, status: s.status, stats: s.stats ? { counts: (s.stats as any).counts ?? null, demo: !!(s.stats as any).demo } : null, hasContent: !!s.storageKey };
  }

  @Get('projects/:id/snapshots')
  async listSnapshots(@Param('id') id: string) {
    const p = await this.project(id);
    return (await this.prisma.snapshot.findMany({ where: { projectId: p.id }, orderBy: { takenAt: 'asc' } })).map((s) => this.snapView(s));
  }

  /** Snapshot manuel : libellé obligatoire (400), capture asynchrone (statut consultable). */
  @Post('projects/:id/snapshots')
  async capture(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() body: unknown) {
    const p = await this.project(id);
    const { label } = parse(z.object({ label: z.string().trim().min(1, 'libellé obligatoire').max(120) }).strict(), body);
    const s = await this.prisma.$transaction(async (db) => {
      const s = await db.snapshot.create({ data: { projectId: p.id, kind: 'MANUAL', label, takenById: actor.accountId, takenBy: actor.fullName, status: 'RUNNING' } });
      await this.audit.action(db, adminCtx(actor), { action: 'Création d’un snapshot manuel', target: `${p.code} · ${label}`, severity: 'INFO', entityType: 'Snapshot', entityId: s.id });
      return s;
    });
    await this.jobs.enqueue('snapshot.capture', { snapshotId: s.id });
    return this.snapView(await this.prisma.snapshot.findUniqueOrThrow({ where: { id: s.id } }));
  }

  @Get('projects/:id/snapshot-schedule')
  async schedule(@Param('id') id: string) {
    const p = await this.project(id);
    return (await this.prisma.snapshotSchedule.findUnique({ where: { projectId: p.id } })) ?? { projectId: p.id, enabled: false, frequency: 'Hebdomadaire', day: 'vendredi', hour: '04:00', retention: '12 mois' };
  }

  @Put('projects/:id/snapshot-schedule')
  async putSchedule(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() body: unknown) {
    const p = await this.project(id);
    const input = parse(
      z.object({ enabled: z.boolean(), frequency: z.enum(['Quotidienne', 'Hebdomadaire']), day: z.string().min(3).max(12), hour: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), retention: z.string().regex(/^\d+\s*(mois|jours?|ans?|semaines?)$/i, 'ex. « 12 mois »') }).partial().strict(),
      body,
    );
    const before = await this.prisma.snapshotSchedule.findUnique({ where: { projectId: p.id } });
    const row = await this.prisma.$transaction(async (db) => {
      const row = await db.snapshotSchedule.upsert({ where: { projectId: p.id }, create: { projectId: p.id, ...input }, update: input });
      const toggled = input.enabled !== undefined && input.enabled !== before?.enabled;
      await this.audit.action(db, adminCtx(actor), { action: toggled ? (input.enabled ? 'Activation des snapshots planifiés' : 'Désactivation des snapshots planifiés') : 'Modification de la planification des snapshots', target: p.code, severity: toggled ? 'SENSITIVE' : 'INFO', entityType: 'SnapshotSchedule', entityId: p.id, details: input });
      return row;
    });
    return row;
  }

  @Get('snapshots/compare')
  async compare(@Query('a') a?: string, @Query('b') b?: string) {
    if (!a || !b) throw badRequest('Snapshots à comparer manquants', { a: 'obligatoire', b: 'obligatoire' });
    const r = await this.snapshots.compare(a, b);
    if (!r) throw notFound('Snapshots introuvables ou de projets différents');
    return r;
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

  /** Déclarée après `snapshots/compare` : l'ordre des routes est significatif. */
  @Get('snapshots/:id')
  async snapshot(@Param('id') id: string) {
    const s = await this.prisma.snapshot.findUnique({ where: { id } });
    if (!s) throw notFound('Snapshot introuvable');
    return this.snapView(s);
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

  // ───────────── Initialisation d'un projet (import Excel) ─────────────

  private importView(i: any) {
    return { importId: i.id, fileName: i.fileName, uploadedBy: i.uploadedBy, uploadedAt: i.uploadedAt, status: i.status, projectId: i.projectId, report: i.report };
  }

  /** Contrôle seul : rien n'est créé (§ 9.10). */
  @Post('project-imports')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_BYTES } }))
  async upload(@CurrentActor() actor: Actor, @UploadedFile() file: UploadedBlob | undefined) {
    if (!file) throw badRequest('Fichier manquant', { file: 'fichier .xlsx attendu (champ « file »)' });
    if (!/\.xlsx$/i.test(file.originalname)) throw badRequest('Format non accepté', { file: '.xlsx attendu' });
    const res = await this.imports.check(file.buffer);
    const issues = res.issues.map((i) => ({ level: i.level, sheet: i.sheet, row: i.row, column: i.column ?? null, message: i.message, source: i.source }));
    if (res.plan?.project.code && (await this.prisma.project.findUnique({ where: { code: res.plan.project.code } }))) {
      issues.unshift({ level: 'ERROR', sheet: '05 Projet', row: null, column: 'D', message: `Le code ${res.plan.project.code} existe déjà`, source: 'SERVER' });
    }
    const errors = issues.filter((i) => i.level === 'ERROR').length;
    const key = await this.storage.put('imports', file.buffer, '.xlsx');
    const report = {
      ok: errors === 0,
      errors,
      warnings: issues.length - errors,
      issues,
      checks: res.checks,
      counts: res.counts,
      project: res.plan ? { code: res.plan.project.code, name: res.plan.project.name, client: res.plan.client.name, startDate: res.plan.project.startDate, endDate: res.plan.project.targetEndDate, director: res.plan.project.programDirector } : null,
    };
    const row = await this.prisma.projectImport.create({ data: { fileName: file.originalname, fileKey: key, uploadedBy: actor.fullName, status: errors ? 'REJECTED' : 'CHECKED', report: report as Prisma.InputJsonValue, parsed: (res.plan ?? undefined) as Prisma.InputJsonValue | undefined } });
    return this.importView(row);
  }

  private async importRow(id: string) {
    const i = await this.prisma.projectImport.findUnique({ where: { id } });
    if (!i) throw notFound('Import introuvable');
    return i;
  }

  @Get('project-imports/:id/report')
  async report(@Param('id') id: string) {
    return this.importView(await this.importRow(id));
  }

  /** Prévisualisation onglet par onglet et planning (phases, sous-phases). */
  @Get('project-imports/:id/preview')
  async preview(@Param('id') id: string, @Query('tab') tab?: string) {
    const i = await this.importRow(id);
    const plan = i.parsed as unknown as ImportPlan | null;
    if (!plan) throw businessRule('Fichier illisible : aucune prévisualisation possible', { id: 'import rejeté' });
    const tabs: Record<string, unknown> = {
      project: { client: plan.client, ...plan.project },
      teams: plan.teams,
      roles: plan.roles,
      persons: plan.persons,
      assignments: plan.assignments,
      waves: plan.waves,
      phases: plan.phases,
      subphases: plan.subphases,
      workstreams: plan.workstreams,
      bodies: plan.bodies,
      members: plan.members,
      milestones: plan.milestones,
      deliverables: plan.deliverables,
      planning: { phases: plan.phases.map((p) => ({ key: p.key, code: p.code, name: p.name, startDate: p.startDate, endDate: p.endDate })), subphases: plan.subphases.map((s) => ({ key: s.key, phase: s.phase, code: s.code, name: s.name, startDate: s.startDate, endDate: s.endDate })) },
    };
    if (tab) {
      if (!(tab in tabs)) throw badRequest('Onglet inconnu', { tab: Object.keys(tabs).join(', ') });
      return { tab, data: tabs[tab] };
    }
    return tabs;
  }

  /** Création transactionnelle du projet et de tout son référentiel (statut PREPARATION). */
  @Post('project-imports/:id/commit')
  @HttpCode(200)
  async commit(@CurrentActor() actor: Actor, @Param('id') id: string) {
    const i = await this.importRow(id);
    if (i.status === 'IMPORTED') throw conflict('ALREADY_IMPORTED', 'Cet import a déjà été validé');
    if (i.status !== 'CHECKED' || !i.parsed) throw businessRule('Import bloqué : le fichier comporte des erreurs', { id: 'corrigez le fichier puis rechargez-le' });
    const plan = i.parsed as unknown as ImportPlan;
    if (await this.prisma.project.findUnique({ where: { code: plan.project.code } })) throw conflict('DUPLICATE', `Le code ${plan.project.code} existe déjà`);
    const projectId = plan.project.code;
    await this.prisma.$transaction(
      async (db) => {
        // Exception à la lecture seule de l'Admin : l'initialisation relève du paramétrage de la plateforme (§ 8).
        await commitPlan(db, plan, { projectId, createProject: true, idPrefix: plan.project.code }, this.audit, adminCtx(actor));
        await db.snapshotSchedule.create({ data: { projectId } });
        await db.projectImport.update({ where: { id }, data: { status: 'IMPORTED', projectId } });
        await db.accountProject.upsert({ where: { accountId_projectId: { accountId: actor.accountId, projectId } }, create: { accountId: actor.accountId, projectId }, update: {} });
        // Modules actifs pour tous : les nouveaux projets en bénéficient automatiquement (§ 7.7).
        await this.audit.action(db, adminCtx(actor), { action: 'Initialisation d’un projet', target: `${plan.project.code} · ${i.fileName}`, severity: 'SENSITIVE', entityType: 'Project', entityId: projectId });
      },
      { timeout: 60_000 },
    );
    return { projectId, code: plan.project.code };
  }
}
