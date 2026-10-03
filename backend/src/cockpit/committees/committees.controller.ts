import { serviceView } from '../../domain/template-service';
import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AccessService, ProjectScope } from '../../core/access.service';
import { Actor, CurrentActor } from '../../core/auth/auth';
import { AuditService } from '../../core/audit.service';
import { PrismaService, Tx } from '../../core/prisma.service';
import { TodayService } from '../../core/today.service';
import { StorageService } from '../../core/storage.service';
import { badRequest, businessRule, conflict, forbidden, inUse, notFound } from '../../core/errors';
import { techId, nextCode } from '../../core/ids';
import { checkIfMatch, parse } from '../../core/http';
import { renderPdf } from '../../core/pdf';
import { canWriteSessions, canWriteTools } from '../../domain/rights';
import { sessionDateChangeError, sessionTransitionError } from '../../domain/rules';
import { frShort } from '../../domain/dates';
import { sessionView } from '../views';
import { UsagesService } from '../referential/usages.service';
import { isoDate } from '../referential/schemas';
import { FormatSelectionSchema } from './report-format.controller';
import { ReportFormatService } from './report-format.service';
import { formatRefs } from '../../domain/report-format';
import { COMPONENTS as COMPONENT_DEFS, configErrors, pagesOf } from '../../domain/report-components';
import { ReportTemplateService } from './report-template.service';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'heure HH:MM attendue');

const SessionCreate = z
  .object({ bodyId: z.string().min(1), dateIso: isoDate, time: time.nullable().optional(), place: z.string().max(300).nullable().optional() })
  .strict();
const SessionPatch = z
  .object({ dateIso: isoDate, time: time.nullable(), place: z.string().max(300).nullable(), status: z.enum(['PLANNED', 'HELD', 'CANCELLED']), participants: z.array(z.string().min(1)) })
  .partial()
  .strict();

const COMPONENTS = ['synthese', 'planning', 'jalons', 'risques', 'decisions', 'actions', 'barometre', 'dashboard', 'budget'] as const;
/** Composant (étape 4) : périmètre, période, indicateurs, ouverture d'une section (page intercalaire). */
const Component = z
  .object({
    id: z.enum(COMPONENTS),
    scope: z.enum(['PROJECT', 'WAVE', 'PHASE', 'WORKSTREAM']),
    targetId: z.string().nullable().optional(),
    period: z.enum(['all', 'month', 'quarter', 'last3', 'last6', 'next30', 'next90']).optional(),
    indicators: z.array(z.string().min(1)).max(10).optional(),
    newSection: z.boolean().optional(),
    sectionTitle: z.string().max(120).nullable().optional(),
  })
  .strict();
const TemplateCreate = z
  .object({
    name: z.string().trim().min(1, 'obligatoire').max(200),
    bodyId: z.string().nullable().optional(),
    authorLabel: z.string().max(120).nullable().optional(),
    version: z.string().trim().min(1).max(20).default('1.0'),
    description: z.string().max(2000).default(''),
    components: z.array(Component).min(1, 'au moins un composant'),
    /** Format du rapport : les 4 pages modèles (fichier chargé, diapositive) ; null = présentation par défaut. */
    format: FormatSelectionSchema.nullable().optional(),
    active: z.boolean().optional(),
  })
  .strict();

/** Étiquette de la version suivante : 1.0 → 1.1, 2.9 → 2.10 ; autre forme : « .1 » ajouté. */
export const nextLabel = (v: string) => { const m = /^(.*?)(\d+)$/.exec(v.trim()); return m && v.includes('.') ? `${m[1]}${Number(m[2]) + 1}` : `${v.trim()}.1`; };
/** Champs dont la modification change la structure ou le design : nouvelle version publiée. */
const STRUCTURAL = ['name', 'bodyId', 'components', 'format'] as const;

/** Comités : séances, templates et rapports (brief § 9.6). */
@ApiTags('cockpit · comités')
@ApiBearerAuth()
@Controller('api/projects/:projectId')
export class CommitteesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly todaySvc: TodayService,
    private readonly storage: StorageService,
    private readonly usages: UsagesService,
    private readonly formats: ReportFormatService,
    private readonly tplReports: ReportTemplateService,
  ) {}

  private profile(scope: ProjectScope) {
    return scope.access.pmo ? 'PMO' : scope.access.programDirector ? 'DIRECTEUR_PROGRAMME' : null;
  }

  private assertSessions(scope: ProjectScope) {
    if (!canWriteSessions(scope.access)) throw forbidden('Séances : PMO et directeur de programme');
  }

  private async assertParticipants(db: Tx, projectId: string, ids: string[]) {
    const found = await db.person.count({ where: { projectId, id: { in: ids } } });
    if (found !== new Set(ids).size) throw badRequest('Référence invalide', { participants: 'personne introuvable' });
  }

  // ───────────── Séances ─────────────

  @Get('sessions')
  async sessions(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Query('bodyId') bodyId?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const scope = await this.access.scope(actor, p);
    const today = this.todaySvc.today(scope.project.timezone);
    const rows = await this.prisma.session.findMany({
      where: { projectId: scope.project.id, ...(bodyId ? { bodyId } : {}), ...(from || to ? { dateIso: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) },
      orderBy: [{ dateIso: 'asc' }, { time: 'asc' }],
    });
    return rows.map((s) => sessionView(s, today));
  }

  @Post('sessions')
  async createSession(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Body() body: unknown) {
    const scope = await this.access.scope(actor, p);
    this.assertSessions(scope);
    const input = parse(SessionCreate, body);
    return this.prisma.$transaction(async (db) => {
      const gb = await db.governanceBody.findFirst({ where: { id: input.bodyId, projectId: scope.project.id }, include: { members: { orderBy: { order: 'asc' } } } });
      if (!gb) throw badRequest('Référence invalide', { bodyId: 'instance introuvable' });
      // § 7.8 : numéro = max(numéro de l'instance) + 1 ; participants = copie des membres.
      const max = await db.session.aggregate({ where: { bodyId: gb.id }, _max: { number: true } });
      const number = (max._max.number ?? 0) + 1;
      const row = await db.session.create({
        data: { id: (await db.session.findUnique({ where: { id: `S-${gb.id}-${number}` } })) ? techId(`S-${gb.id}-${number}`) : `S-${gb.id}-${number}`, projectId: scope.project.id, bodyId: gb.id, number, dateIso: input.dateIso, time: input.time ?? null, place: input.place ?? null, status: 'PLANNED', participants: gb.members.map((m) => m.personId) },
      });
      const today = this.todaySvc.today(scope.project.timezone);
      await this.audit.record(db, { actor, projectId: scope.project.id, profileUsed: this.profile(scope) }, { entityType: 'SESSION', entityId: row.id, before: null, after: sessionView(row, today), target: `${gb.shortName} n°${number}` });
      return sessionView(row, today);
    });
  }

  @Patch('sessions/:id')
  async patchSession(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string, @Body() body: unknown, @Headers('if-match') ifMatch?: string) {
    const scope = await this.access.scope(actor, p);
    this.assertSessions(scope);
    const input = parse(SessionPatch, body);
    const today = this.todaySvc.today(scope.project.timezone);
    return this.prisma.$transaction(async (db) => {
      const s = await db.session.findFirst({ where: { id, projectId: scope.project.id } });
      if (!s) throw notFound();
      checkIfMatch(ifMatch, s.version);
      if (input.dateIso !== undefined && input.dateIso !== s.dateIso) {
        const err = sessionDateChangeError(s.status);
        if (err) throw businessRule(err, { dateIso: err });
      }
      if (input.status !== undefined) {
        const err = sessionTransitionError(s.status, input.status, input.dateIso ?? s.dateIso, today);
        if (err) throw businessRule(err, { status: err });
      }
      if (input.participants) await this.assertParticipants(db, scope.project.id, input.participants);
      const row = await db.session.update({ where: { id }, data: { ...input, version: { increment: 1 } } });
      const gb = await db.governanceBody.findUnique({ where: { id: s.bodyId } });
      // § 7.10 : tous les champs sont tracés, heure et lieu compris.
      await this.audit.record(db, { actor, projectId: scope.project.id, profileUsed: this.profile(scope) }, { entityType: 'SESSION', entityId: id, before: sessionView(s, today), after: sessionView(row, today), target: `${gb?.shortName} n°${s.number}` });
      return sessionView(row, today);
    });
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  async deleteSession(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string) {
    const scope = await this.access.scope(actor, p);
    this.assertSessions(scope);
    await this.prisma.$transaction(async (db) => {
      const s = await db.session.findFirst({ where: { id, projectId: scope.project.id } });
      if (!s) throw notFound();
      const u = await this.usages.usages(db, scope.project.id, 'SESSION', id);
      if (u.length) throw inUse(u);
      await db.session.delete({ where: { id } });
      await this.audit.record(db, { actor, projectId: scope.project.id, profileUsed: this.profile(scope) }, { entityType: 'SESSION', entityId: id, before: s as any, after: null });
    });
  }

  /** Générer un rapport depuis une séance (ReportInstance rattachée). */
  @Post('sessions/:id/reports')
  async generate(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string, @Body() body: unknown) {
    const scope = await this.access.scope(actor, p);
    if (!canWriteTools(scope.access)) throw forbidden('Génération de rapport : profil non Lecteur (PMO, Responsable)');
    const input = parse(z.object({ templateId: z.string().min(1), reviewerId: z.string().optional(), validatorId: z.string().optional(), audience: z.string().max(300).optional() }).strict(), body);
    return this.prisma.$transaction(async (db) => {
      const s = await db.session.findFirst({ where: { id, projectId: scope.project.id } });
      if (!s) throw notFound('Séance introuvable');
      const tpl = await db.reportTemplate.findFirst({ where: { id: input.templateId, projectId: scope.project.id } });
      if (!tpl) throw badRequest('Référence invalide', { templateId: 'template introuvable' });
      if (!tpl.active) throw businessRule('Template inactif', { templateId: 'template inactif' });
      this.tplReports.assertReady(tpl);
      await db.reportTemplate.updateMany({ where: { id: tpl.id, firstReportAt: null }, data: { firstReportAt: new Date() } });
      const gb = await db.governanceBody.findUnique({ where: { id: s.bodyId } });
      const prev = await db.reportInstance.findMany({ where: { sessionId: s.id }, select: { v: true } });
      const all = await db.reportInstance.findMany({ where: { projectId: scope.project.id }, select: { id: true } });
      const rid = nextCode(all.map((r) => r.id), 'RP-', 2);
      const v = `v${prev.length + 1}`;
      const now = new Date();
      const report = await db.reportInstance.create({
        data: {
          id: (await db.reportInstance.findUnique({ where: { id: rid } })) ? techId('RP') : rid,
          projectId: scope.project.id,
          templateId: tpl.id,
          sessionId: s.id,
          name: `${gb?.shortName} n°${s.number} · ${frShort(s.dateIso, 0)}`,
          v,
          status: 'DRAFT',
          generatedAt: now,
          captureAt: now,
          reportingDate: this.todaySvc.today(scope.project.timezone),
          reviewerId: input.reviewerId ?? scope.access.personId,
          validatorId: input.validatorId ?? scope.project.programDirectorId,
          audience: input.audience ?? null,
        },
      });
      await db.session.update({ where: { id: s.id }, data: { reportId: report.id, version: { increment: 1 } } });
      await this.appendHistory(db, scope, { templateId: tpl.id, name: tpl.name, version: tpl.version, bodyId: tpl.bodyId, byId: scope.access.personId ?? actor.accountId, saved: true, reportId: report.id });
      await this.audit.record(db, { actor, projectId: scope.project.id, profileUsed: scope.access.pmo ? 'PMO' : 'RESPONSABLE' }, { entityType: 'REPORT', entityId: report.id, before: null, after: report as any, target: report.name });
      return this.reportView(report);
    });
  }

  private async appendHistory(db: Tx, scope: ProjectScope, entry: Record<string, unknown>) {
    const key = { projectId_key: { projectId: scope.project.id, key: 'templates.history' } };
    const cur = await db.contentBlock.findUnique({ where: key });
    const list = Array.isArray(cur?.data) ? (cur!.data as any[]) : [];
    const e = { id: techId('H'), at: new Date().toISOString(), ...entry };
    await db.contentBlock.upsert({ where: key, create: { projectId: scope.project.id, key: 'templates.history', data: [e] as any }, update: { data: [e, ...list] as any } });
  }

  // ───────────── Templates ─────────────

  private templateView(t: any, v?: any) {
    return { id: t.id, name: t.name, bodyId: t.bodyId, authorId: t.authorId, authorLabel: t.authorLabel, version: t.version, description: t.description, components: t.components, pages: t.pages, publishedAt: t.publishedAt, active: t.active, format: formatRefs(t.format), service: serviceView(t), ...(v ? { publishedVersion: this.tplReports.versionView(v) } : {}), rowVersion: t.rowVersion };
  }

  /** Avancement de la mise en service (étape 6 et carte « Mise en service ») : relu par l'écran. */
  @Get('report-templates/:id/service')
  async service(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string) {
    const scope = await this.access.scope(actor, p);
    const t = await this.prisma.reportTemplate.findFirst({ where: { id, projectId: scope.project.id } });
    if (!t) throw notFound('Template introuvable');
    return serviceView(t);
  }

  /** Relance d'une mise en service interrompue. */
  @Post('report-templates/:id/commission')
  @HttpCode(202)
  async recommission(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string) {
    const scope = await this.access.scope(actor, p);
    if (!canWriteTools(scope.access)) throw forbidden('Templates : profil non Lecteur (PMO, Responsable)');
    const t = await this.prisma.reportTemplate.findFirst({ where: { id, projectId: scope.project.id } });
    if (!t) throw notFound('Template introuvable');
    if (t.serviceStatus !== 'FAILED') throw conflict('NOT_FAILED', 'Seule une mise en service interrompue peut être relancée');
    const row = await this.prisma.reportTemplate.update({ where: { id }, data: { serviceStatus: 'PENDING', servicePhase: 0, serviceError: null } });
    void this.tplReports.commission(scope, id, scope.access.personId ?? actor.accountId);
    return serviceView(row);
  }

  @Get('report-templates')
  async templates(@CurrentActor() actor: Actor, @Param('projectId') p: string) {
    const scope = await this.access.scope(actor, p);
    const rows = await this.prisma.reportTemplate.findMany({ where: { projectId: scope.project.id }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] });
    const versions = await this.prisma.reportTemplateVersion.findMany({ where: { projectId: scope.project.id }, orderBy: { seq: 'desc' } });
    const history = await this.prisma.contentBlock.findUnique({ where: { projectId_key: { projectId: scope.project.id, key: 'templates.history' } } });
    return { templates: rows.map((t) => this.templateView(t, versions.find((v) => v.templateId === t.id))), history: history?.data ?? [] };
  }

  /**
   * Templates publiés pour « Générer un rapport » (04/10/2026) : recherche sans accents ni casse sur le nom, l'auteur,
   * les composants et le comité, filtre par comité, pagination ; utilisée par l'écran au-delà de TEMPLATE_LIST_LOCAL_MAX.
   */
  @Get('report-templates/search')
  async searchTemplates(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Query() query: Record<string, string>) {
    const scope = await this.access.scope(actor, p);
    const { q = '', bodyId = '', offset = '0', limit = '50', includeInactive = '' } = query;
    const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const qq = norm(q.trim());
    const bodies = new Map((await this.prisma.governanceBody.findMany({ where: { projectId: scope.project.id }, select: { id: true, name: true } })).map((b) => [b.id, b.name]));
    const rows = await this.prisma.reportTemplate.findMany({ where: { projectId: scope.project.id, ...(includeInactive === 'true' ? {} : { active: true }), ...(bodyId ? { bodyId } : {}) }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] });
    const label = (c: any) => COMPONENT_DEFS[c.id as keyof typeof COMPONENT_DEFS]?.label ?? c.id;
    const hay = (t: any) => norm([t.name, t.authorLabel ?? '', ...(t.components as any[]).map(label), bodies.get(t.bodyId ?? '') ?? ''].join(' '));
    const hits = rows.filter((t) => !qq || hay(t).includes(qq));
    const from = Math.max(0, Number(offset) || 0), n = Math.min(200, Math.max(1, Number(limit) || 50));
    return { total: rows.length, count: hits.length, offset: from, items: hits.slice(from, from + n).map((t) => ({ ...this.templateView(t), committee: bodies.get(t.bodyId ?? '') ?? '', componentLabels: (t.components as any[]).map(label) })) };
  }

  private async validateComponents(db: Tx, projectId: string, comps: Array<{ scope: string; targetId?: string | null }>) {
    const delegate: Record<string, string> = { WAVE: 'wave', PHASE: 'phase', WORKSTREAM: 'workstream' };
    for (const c of comps) {
      if (c.scope === 'PROJECT') continue;
      if (!c.targetId) throw badRequest('Composant incomplet', { components: `cible obligatoire pour la portée ${c.scope}` });
      if (!(await (db as any)[delegate[c.scope]].findFirst({ where: { id: c.targetId, projectId } }))) throw badRequest('Référence invalide', { components: `cible ${c.targetId} introuvable` });
    }
  }

  @Post('report-templates')
  async createTemplate(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Body() body: unknown) {
    const scope = await this.access.scope(actor, p);
    if (!canWriteTools(scope.access)) throw forbidden('Templates : profil non Lecteur (PMO, Responsable)');
    const input = parse(TemplateCreate, body);
    const cfg = { ...configErrors(input.components as any), ...(await this.tplReports.moduleErrors(scope.project.id, input.components as any)) };
    if (Object.keys(cfg).length) throw badRequest('Composants invalides', cfg);
    return this.prisma.$transaction(async (db) => {
      if (input.bodyId && !(await db.governanceBody.findFirst({ where: { id: input.bodyId, projectId: scope.project.id } }))) throw badRequest('Référence invalide', { bodyId: 'instance introuvable' });
      await this.validateComponents(db, scope.project.id, input.components);
      const author = scope.access.personId ? await db.person.findUnique({ where: { id: scope.access.personId } }) : null;
      const row = await db.reportTemplate.create({
        data: {
          id: techId('T'),
          projectId: scope.project.id,
          name: input.name,
          bodyId: input.bodyId ?? null,
          authorId: scope.access.personId,
          authorLabel: input.authorLabel ?? (author ? `${author.firstName} ${author.lastName}` : actor.fullName),
          version: input.version,
          description: input.description,
          components: input.components as any,
          format: input.format ? ((await this.formats.formatForTemplate(scope, input.format, db)) as any) : undefined,
          pages: pagesOf(input.components as any),
          publishedAt: this.todaySvc.today(scope.project.timezone),
          active: input.active ?? true,
          order: -1,
          // Mise en service (04/10/2026) : le template n'est utilisable qu'une fois prêt.
          serviceStatus: 'PENDING',
          servicePhase: 0,
        },
      });
      await this.audit.record(db, { actor, projectId: scope.project.id, profileUsed: scope.access.pmo ? 'PMO' : 'RESPONSABLE' }, { entityType: 'REPORT_TEMPLATE', entityId: row.id, before: null, after: this.templateView(row), target: row.name });
      return row;
    }, { timeout: 120000 }).then((row) => {
      // Publication en tâche de fond : PowerPoint de référence, gel, activation, Bibliothèque, zones de données.
      void this.tplReports.commission(scope, row.id, scope.access.personId ?? actor.accountId);
      return this.templateView(row);
    });
  }

  @Patch('report-templates/:id')
  async patchTemplate(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string, @Body() body: unknown) {
    const scope = await this.access.scope(actor, p);
    if (!canWriteTools(scope.access)) throw forbidden();
    const input = parse(TemplateCreate.partial().strict(), body);
    if (input.components) { const cfg = { ...configErrors(input.components as any), ...(await this.tplReports.moduleErrors(scope.project.id, input.components as any)) }; if (Object.keys(cfg).length) throw badRequest('Composants invalides', cfg); }
    return this.prisma.$transaction(async (db) => {
      const t = await db.reportTemplate.findFirst({ where: { id, projectId: scope.project.id } });
      if (!t) throw notFound();
      if (input.components) await this.validateComponents(db, scope.project.id, input.components);
      const data: any = { ...input, rowVersion: { increment: 1 } };
      if (input.format !== undefined) data.format = input.format ? await this.formats.formatForTemplate(scope, input.format, db) : Prisma.DbNull;
      if (input.components) data.pages = pagesOf(input.components as any);
      // Toute modification de structure ou de design passe par une nouvelle version publiée.
      const refs = (f: any) => JSON.stringify(formatRefs(f));
      const changed = STRUCTURAL.some((k) => input[k] !== undefined && (k === 'format' ? refs(data.format === Prisma.DbNull ? null : data.format) !== refs(t.format) : JSON.stringify(input[k]) !== JSON.stringify((t as any)[k])));
      if (changed && input.version === undefined) data.version = nextLabel(t.version);
      let row = await db.reportTemplate.update({ where: { id }, data });
      const v = changed ? await this.tplReports.publish(scope, row as any, scope.access.personId ?? actor.accountId, db) : await db.reportTemplateVersion.findFirst({ where: { templateId: id }, orderBy: { seq: 'desc' } });
      if (changed) row = await db.reportTemplate.update({ where: { id }, data: { publishedAt: this.todaySvc.today(scope.project.timezone) } });
      await this.audit.record(db, { actor, projectId: scope.project.id, profileUsed: scope.access.pmo ? 'PMO' : 'RESPONSABLE' }, { entityType: 'REPORT_TEMPLATE', entityId: id, before: this.templateView(t), after: this.templateView(row, v), target: row.name });
      return this.templateView(row, v);
    }, { timeout: 120000 });
  }

  @Patch('report-templates/:id/active')
  async toggleTemplate(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string, @Body() body: unknown) {
    const { active } = parse(z.object({ active: z.boolean() }).strict(), body);
    return this.patchTemplate(actor, p, id, { active });
  }

  /** Q8 : suppression de template (refusée s'il a servi à générer un rapport). */
  @Delete('report-templates/:id')
  @HttpCode(204)
  async deleteTemplate(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string) {
    const scope = await this.access.scope(actor, p);
    if (!canWriteTools(scope.access)) throw forbidden();
    await this.prisma.$transaction(async (db) => {
      const t = await db.reportTemplate.findFirst({ where: { id, projectId: scope.project.id } });
      if (!t) throw notFound();
      const u = await this.usages.usages(db, scope.project.id, 'REPORT_TEMPLATE', id);
      if (u.length) throw inUse(u);
      await db.reportTemplateVersion.deleteMany({ where: { templateId: id } });
      await db.reportTemplate.delete({ where: { id } });
      await this.audit.record(db, { actor, projectId: scope.project.id, profileUsed: scope.access.pmo ? 'PMO' : 'RESPONSABLE' }, { entityType: 'REPORT_TEMPLATE', entityId: id, before: this.templateView(t), after: null, target: t.name });
    });
  }

  // ───────────── Rapports ─────────────

  reportView(r: any) {
    return { id: r.id, templateId: r.templateId, sessionId: r.sessionId, name: r.name, v: r.v, status: r.status, generatedAt: r.generatedAt, reportingDate: r.reportingDate, captureAt: r.captureAt, reviewer: r.reviewerId, validator: r.validatorId, audience: r.audience, fileId: r.fileId, version: r.version };
  }

  @Get('reports')
  async reports(@CurrentActor() actor: Actor, @Param('projectId') p: string) {
    const scope = await this.access.scope(actor, p);
    const rows = await this.prisma.reportInstance.findMany({ where: { projectId: scope.project.id }, orderBy: { generatedAt: 'desc' } });
    return rows.map((r) => this.reportView(r));
  }

  @Patch('reports/:id')
  async patchReport(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string, @Body() body: unknown) {
    const scope = await this.access.scope(actor, p);
    if (!canWriteTools(scope.access)) throw forbidden();
    const input = parse(z.object({ status: z.enum(['DRAFT', 'IN_REVIEW', 'PUBLISHED']), audience: z.string().max(300).nullable() }).partial().strict(), body);
    return this.prisma.$transaction(async (db) => {
      const r = await db.reportInstance.findFirst({ where: { id, projectId: scope.project.id } });
      if (!r) throw notFound();
      if (r.status === 'PUBLISHED' && input.status && input.status !== 'PUBLISHED') throw businessRule('Un rapport publié ne revient pas en arrière', { status: 'rapport publié' });
      const row = await db.reportInstance.update({ where: { id }, data: { ...input, version: { increment: 1 } } });
      await this.audit.record(db, { actor, projectId: scope.project.id, profileUsed: scope.access.pmo ? 'PMO' : 'RESPONSABLE' }, { entityType: 'REPORT', entityId: id, before: this.reportView(r), after: this.reportView(row), target: row.name });
      return this.reportView(row);
    });
  }

  @Get('reports/:id/file')
  async reportFile(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string, @Res() res: any) {
    const scope = await this.access.scope(actor, p);
    const r = await this.prisma.reportInstance.findFirst({ where: { id, projectId: scope.project.id } });
    if (!r) throw notFound();
    let buf = r.fileId ? await this.storage.get(r.fileId) : null;
    if (!buf) {
      buf = await this.renderReport(scope, r);
      const key = await this.storage.put(`reports/${scope.project.id}`, buf, '.pdf');
      await this.prisma.reportInstance.update({ where: { id }, data: { fileId: key } });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${r.id}-${r.v}.pdf"`);
    res.end(buf);
  }

  private async renderReport(scope: ProjectScope, r: any): Promise<Buffer> {
    const P = { projectId: scope.project.id };
    const tpl = r.templateId ? await this.prisma.reportTemplate.findUnique({ where: { id: r.templateId } }) : null;
    const comps: string[] = tpl ? (tpl.components as any[]).map((c) => c.id) : ['synthese', 'jalons', 'risques', 'decisions', 'actions'];
    const lines: string[] = [`Projet ${scope.project.code} — ${scope.project.name}`, `Version ${r.v} · statut ${r.status} · généré le ${r.generatedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`, ''];
    if (comps.includes('jalons')) {
      lines.push('JALONS');
      for (const m of await this.prisma.milestone.findMany({ where: P, orderBy: { iso: 'asc' } })) lines.push(`  ${m.code}  ${m.iso}  ${m.n}`);
      lines.push('');
    }
    if (comps.includes('risques')) {
      lines.push('RISQUES');
      for (const x of await this.prisma.risk.findMany({ where: { ...P, status: { not: 'CLOSED' } }, orderBy: { code: 'asc' } })) lines.push(`  ${x.code}  criticité ${x.p * x.i}  ${x.n}`);
      lines.push('');
    }
    if (comps.includes('decisions')) {
      lines.push('DÉCISIONS');
      for (const d of await this.prisma.decision.findMany({ where: P, orderBy: { code: 'asc' } })) lines.push(`  ${d.code}  ${d.status}  ${d.t}`);
      lines.push('');
    }
    if (comps.includes('actions')) {
      lines.push('ACTIONS');
      for (const a of await this.prisma.action.findMany({ where: { ...P, status: { not: 'DONE' } }, orderBy: { order: 'asc' } })) lines.push(`  ${a.code}  ${a.dueIso ?? '—'}  ${a.n}`);
    }
    return renderPdf(r.name, lines);
  }

}
