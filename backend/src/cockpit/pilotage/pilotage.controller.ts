import { ArbOption, legacyCriteria } from '../../domain/arbitration';
import { Body, Controller, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AccessService, ProjectScope } from '../../core/access.service';
import { Tx } from '../../core/prisma.service';
import { Actor, CurrentActor } from '../../core/auth/auth';
import { checkIfMatch, parse, withWarnings } from '../../core/http';
import { badRequest, conflict, forbidden, notFound } from '../../core/errors';
import { canEditPlanning, canWriteReferential, canWriteWs } from '../../domain/rights';
import { plannedPct, progressSignal, to100 } from '../../domain/rules';
import { TransactionalService, DECISIONS } from './transactional';
import { AnomaliesService } from './anomalies.service';
import { decisionView, deliverableView } from '../views';
import { isoDate, pct } from '../referential/schemas';
import { assertPhaseProgressEditable, rollupPhaseProgress } from '../phase-progress';

/** Chantier porteur du baromètre (brief § 8.6 : C8 « Pilotage et transverse »). */
export const BAROMETER_WS_CODE = 'C8';
/** Module optionnel Budget (brief Console § 6.6). */
export const BUDGET_MODULE_ID = 'bud';

const Arbitration = z
  .object({
    question: z.string().trim().min(1).max(2000).nullable(),
    // Critères propres à chaque option (09/10/2026, encore acceptés) ; depuis le 10/10/2026 la fiche « barème commun » (maquette 11a)
    // envoie des options sans critères et des critères communs (`criteria`).
    options: z
      .array(
        z.object({
          code: z.string().trim().min(1).max(3),
          label: z.string().trim().min(1).max(300),
          body: z.string().max(4000).default(''),
          criteria: z.array(z.object({ name: z.string().max(200).default(''), weightPct: z.number().int().min(0).max(100), score: z.number().int().min(0).max(4), comment: z.string().max(1000).default('') })).max(20).optional(),
        }),
      )
      .max(6),
    criteria: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(200),
          weightPct: z.number().int().min(0).max(100),
          scoreA: z.number().int().min(0).max(4),
          commentA: z.string().max(1000).default(''),
          scoreB: z.number().int().min(0).max(4),
          commentB: z.string().max(1000).default(''),
        }),
      )
      .max(20),
    recommendation: z.string().max(4000).nullable(),
    texts: z.record(z.string().trim().min(1, 'texte vide refusé').max(4000)),
  })
  .partial()
  .strict();

const PlanningPatch = z
  .object({
    startDate: isoDate,
    endDate: isoDate,
    progressPct: pct,
    plannedPctOverride: pct.nullable(),
    ownerId: z.string().min(1),
    critical: z.boolean(),
  })
  .partial()
  .strict();

const ProgressPatch = z
  .object({ label: z.string().trim().min(1).max(300), valuePct: pct, targetPct: pct, detail: z.string().max(1000).nullable(), ownerId: z.string().nullable(), wsId: z.string() })
  .partial()
  .strict();

const Sentiment = z.object({ negative: z.number().int().min(0).max(100), neutral: z.number().int().min(0).max(100), positive: z.number().int().min(0).max(100) });
const Question = z.object({ label: z.string().trim().min(1).max(300), score: z.number().min(0).max(10).nullable(), delta: z.number().min(-9).max(9).nullable().default(null) });
const Theme = z.object({ label: z.string().trim().min(1).max(300), tone: z.enum(['OK', 'WATCH', 'RISK']) });
const Month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'mois AAAA-MM attendu');

const SurveyCreate = z
  .object({
    month: Month,
    label: z.string().max(40).optional(),
    overallScore: z.number().min(0).max(10),
    respondents: z.number().int().min(0).max(999),
    sentiment: Sentiment,
    questions: z.array(Question).nullable().optional(),
    themes: z.array(Theme).nullable().optional(),
    /** Notes par domaine pour ce mois : { domainId: note } */
    domainScores: z.record(z.number().min(0).max(10).nullable()).optional(),
  })
  .strict();
const SurveyPatch = SurveyCreate.omit({ month: true }).extend({ sentiment: Sentiment.partial() }).partial().strict();

const DomainCreate = z
  .object({ n: z.string().trim().min(1).max(120), size: z.number().int().min(0).max(100000).default(0), resp: z.number().int().min(0).max(999).default(0), range: z.string().max(40).default(''), series: z.record(z.number().min(0).max(10).nullable()).default({}) })
  .strict();

const GlobalPatch = z.object({ label: z.string().max(120), size: z.number().int().min(0), questions: z.array(Question), themes: z.array(Theme) }).partial().strict();

const PeriodPatch = z.object({ period: z.string().trim().min(1).max(80), amoa: z.number().min(0), sub: z.number().min(0), status: z.enum(['INVOICED', 'IN_PROGRESS', 'NEGOTIATION']) }).partial().strict();
const ProgramPatch = z.object({ known: z.boolean(), reason: z.string().max(1000).nullable() }).partial().strict();

/** Pilotage hors CRUD générique (brief § 9.5). */
@ApiTags('cockpit · pilotage')
@ApiBearerAuth()
@Controller('api/projects/:projectId')
export class PilotageController {
  constructor(
    private readonly tx: TransactionalService,
    private readonly access: AccessService,
    private readonly anomalies: AnomaliesService,
  ) {}

  private get prisma() {
    return this.tx.prisma;
  }

  // ───────────── Fiche d'arbitrage ─────────────

  @Patch('decisions/:id/arbitration')
  async arbitration(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string, @Body() body: unknown) {
    const scope = await this.access.scope(actor, p);
    const input = parse(Arbitration, body);
    return this.prisma.$transaction(async (db) => {
      const d = await this.tx.row(DECISIONS, scope, id, db, true);
      this.tx.assertWriteWs(scope, d.wsId, false);
      if (d.status === 'ARBITRATED') throw conflict('READ_ONLY', 'Fiche arbitrée : lecture seule');
      const prev = (d.arbitration ?? { question: null, options: [], criteria: [], recommendation: null, texts: {} }) as any;
      const next = { ...prev, ...input, texts: { ...(prev.texts ?? {}), ...(input.texts ?? {}) } };
      // Critères par option : l'ancien format (critères communs A / B) en est déduit s'il n'est pas fourni (`legacyCriteria`).
      if (input.options && !input.criteria) { const lc = legacyCriteria(input.options as ArbOption[]); if (lc) next.criteria = lc; }
      const row = await db.decision.update({ where: { id: d.id }, data: { arbitration: next as Prisma.InputJsonValue, full: true, version: { increment: 1 } } });
      await this.tx.audit.record(db, this.tx.wctx(actor, scope, d.wsId), { entityType: 'DECISION', entityId: d.id, before: { arbitration: prev }, after: { arbitration: next }, wsId: d.wsId, target: `${d.code} · fiche d'arbitrage` });
      const warnings: string[] = [];
      const perOption = (next.options ?? []).filter((o: any) => Array.isArray(o.criteria) && o.criteria.length);
      if (perOption.length) {
        for (const o of perOption) { const w = o.criteria.reduce((a: number, c: any) => a + c.weightPct, 0); if (w !== 100) warnings.push(`Option ${o.code} : la somme des poids vaut ${w} % (100 % attendus)`); }
      } else {
        const w = (next.criteria ?? []).reduce((a: number, c: any) => a + c.weightPct, 0);
        if ((next.criteria ?? []).length && w !== 100) warnings.push(`La somme des poids des critères vaut ${w} % (100 % attendus)`);
      }
      return withWarnings(decisionView(row, { withArbitration: true }), warnings);
    });
  }

  @Get('decisions/:id/arbitration')
  async getArbitration(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string) {
    const scope = await this.access.scope(actor, p);
    return decisionView(await this.tx.row(DECISIONS, scope, id), { withArbitration: true });
  }

  // ───────────── Planning ─────────────

  @Get('planning')
  async planning(@CurrentActor() actor: Actor, @Param('projectId') p: string) {
    const scope = await this.access.scope(actor, p);
    const today = this.tx.today(scope);
    const P = { projectId: scope.project.id };
    const [phases, subphases, workstreams] = await Promise.all([
      this.prisma.phase.findMany({ where: P, orderBy: { seq: 'asc' } }),
      this.prisma.subphase.findMany({ where: P, orderBy: [{ phase: { seq: 'asc' } }, { code: 'asc' }] }),
      this.prisma.workstream.findMany({ where: P, orderBy: { seq: 'asc' }, include: { phases: true, subphases: true } }),
    ]);
    const item = (r: any) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      startDate: r.startDate,
      endDate: r.endDate,
      progressPct: r.progressPct,
      plannedPct: plannedPct(r.startDate, r.endDate, today, r.plannedPctOverride),
      plannedPctOverride: r.plannedPctOverride,
      critical: r.critical,
      ownerId: r.ownerId,
      version: r.version,
    });
    return {
      today,
      projectEnd: [...phases.map((x) => x.endDate)].sort().at(-1) ?? scope.project.targetEndDate,
      phases: phases.map(item),
      subphases: subphases.map((s) => ({ ...item(s), phaseId: s.phaseId })),
      workstreams: workstreams.map((w) => ({ ...item(w), phaseIds: w.phases.map((x) => x.phaseId), subphaseIds: w.subphases.map((x) => x.subphaseId) })),
    };
  }

  @Patch('planning/:type/:id')
  async patchPlanning(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('type') type: string, @Param('id') id: string, @Body() body: unknown, @Headers('if-match') ifMatch?: string) {
    const scope = await this.access.scope(actor, p);
    const kinds: Record<string, 'phase' | 'subphase' | 'workstream'> = { phase: 'phase', phases: 'phase', subphase: 'subphase', subphases: 'subphase', workstream: 'workstream', workstreams: 'workstream', chantier: 'workstream' };
    const kind = kinds[type];
    if (!kind) throw notFound('Type de planning inconnu');
    const input = parse(PlanningPatch, body);
    const delegate = (this.prisma as any)[kind];
    const existing = await delegate.findFirst({ where: { id, projectId: scope.project.id } });
    if (!existing) throw notFound();
    // § 8.7 : PMO sur tout ; Responsable sur les dates et l'avancement de son chantier uniquement.
    if (!canEditPlanning(scope.access, kind, id)) throw forbidden('Dates du planning : PMO, ou Responsable du chantier');
    if (!scope.access.pmo && (input.ownerId !== undefined || input.critical !== undefined)) throw forbidden('Seul le PMO modifie le porteur et la criticité');
    checkIfMatch(ifMatch, existing.version);
    const start = input.startDate ?? existing.startDate;
    const end = input.endDate ?? existing.endDate;
    if (!start || !end) throw badRequest('Dates obligatoires', { startDate: 'début et fin obligatoires' });
    if (end < start) throw badRequest('Période invalide', { endDate: 'la fin doit être postérieure ou égale au début' });
    if (input.ownerId && !(await this.prisma.person.findFirst({ where: { id: input.ownerId, projectId: scope.project.id } }))) throw badRequest('Référence invalide', { ownerId: 'introuvable' });
    // Phase avec sous-phases : avancement calculé (moyenne pondérée par la durée, 07/10/2026), pas de saisie directe.
    if (kind === 'phase') await assertPhaseProgressEditable(this.prisma, id, input.progressPct);
    return this.prisma.$transaction(async (db) => {
      const row = await (db as any)[kind].update({ where: { id }, data: { ...input, version: { increment: 1 } } });
      if (kind === 'subphase') await rollupPhaseProgress(db, [row.phaseId]);
      const ctx = { actor, projectId: scope.project.id, profileUsed: scope.access.pmo ? 'PMO' : 'RESPONSABLE' };
      await this.tx.audit.record(db, ctx, { entityType: kind.toUpperCase(), entityId: id, before: existing, after: row, wsId: kind === 'workstream' ? id : null, target: `${row.code} · ${row.name}` });
      const today = this.tx.today(scope);
      return { id: row.id, code: row.code, name: row.name, startDate: row.startDate, endDate: row.endDate, progressPct: row.progressPct, plannedPct: plannedPct(row.startDate, row.endDate, today, row.plannedPctOverride), plannedPctOverride: row.plannedPctOverride, critical: row.critical, ownerId: row.ownerId, version: row.version };
    });
  }

  // ───────────── Livrables (suivi) ─────────────

  @Get('deliverables/tracking')
  async tracking(@CurrentActor() actor: Actor, @Param('projectId') p: string) {
    const scope = await this.access.scope(actor, p);
    const today = this.tx.today(scope);
    const rows = await this.prisma.deliverable.findMany({ where: { projectId: scope.project.id }, include: { subphase: true }, orderBy: { order: 'asc' } });
    const persons = await this.prisma.person.findMany({ where: { projectId: scope.project.id }, select: { id: true, teamId: true } });
    const teamOf = Object.fromEntries(persons.map((x) => [x.id, x.teamId]));
    const items = rows.map((r) => deliverableView(r, r.subphase, teamOf[r.ownerId] ?? null, today));
    const in30 = new Date(`${today}T00:00:00Z`);
    in30.setUTCDate(in30.getUTCDate() + 30);
    const lim = in30.toISOString().slice(0, 10);
    return {
      today,
      items,
      counters: {
        total: items.length,
        done: items.filter((x) => x.status === 'DONE').length,
        late: items.filter((x) => x.status === 'LATE').length,
        active: items.filter((x) => x.status === 'ACTIVE').length,
        future: items.filter((x) => x.status === 'FUTURE').length,
        dueIn30Days: items.filter((x) => x.status !== 'DONE' && x.due >= today && x.due <= lim).length,
        donePct: items.length ? Math.round((items.filter((x) => x.status === 'DONE').length / items.length) * 100) : 0,
      },
    };
  }

  // ───────────── Avancement des chantiers ─────────────

  @Get('workstream-progress')
  async progress(@CurrentActor() actor: Actor, @Param('projectId') p: string) {
    const scope = await this.access.scope(actor, p);
    const rows = await this.prisma.workstreamProgress.findMany({ where: { projectId: scope.project.id }, orderBy: { order: 'asc' } });
    return rows.map(progressView);
  }

  @Patch('workstream-progress/:id')
  async patchProgress(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string, @Body() body: unknown, @Headers('if-match') ifMatch?: string) {
    const scope = await this.access.scope(actor, p);
    const input = parse(ProgressPatch, body);
    const existing = await this.prisma.workstreamProgress.findFirst({ where: { id, projectId: scope.project.id } });
    if (!existing) throw notFound();
    this.tx.assertWriteWs(scope, existing.wsId, false);
    if (input.wsId && input.wsId !== existing.wsId) this.tx.assertWriteWs(scope, input.wsId, true);
    checkIfMatch(ifMatch, existing.version);
    return this.prisma.$transaction(async (db) => {
      const row = await db.workstreamProgress.update({ where: { id }, data: { ...input, confirmedAt: new Date(), version: { increment: 1 } } });
      await this.tx.audit.record(db, this.tx.wctx(actor, scope, row.wsId), { entityType: 'WORKSTREAM_PROGRESS', entityId: id, before: progressView(existing), after: progressView(row), wsId: row.wsId, target: row.label });
      return progressView(row);
    });
  }

  // ───────────── Baromètre ─────────────

  private async assertBarometer(scope: ProjectScope) {
    const ws = await this.prisma.workstream.findFirst({ where: { projectId: scope.project.id, code: BAROMETER_WS_CODE } });
    if (!canWriteWs(scope.access, ws?.id)) throw forbidden('Baromètre : PMO ou Responsable du chantier transverse');
    return ws?.id ?? null;
  }

  @Get('barometer')
  async barometer(@CurrentActor() actor: Actor, @Param('projectId') p: string) {
    const scope = await this.access.scope(actor, p);
    return this.barometerView(scope.project.id);
  }

  async barometerView(projectId: string, db: Tx = this.prisma) {
    const surveys = await db.barometerSurvey.findMany({ where: { projectId }, orderBy: { month: 'asc' } });
    const domains = await db.barometerDomain.findMany({ where: { projectId }, orderBy: { order: 'asc' } });
    const global = await db.contentBlock.findUnique({ where: { projectId_key: { projectId, key: 'barometer.global' } } });
    return {
      global: global?.data ?? { label: '', size: 0, questions: [], themes: [] },
      surveys: surveys.map((s) => ({ month: s.month, key: s.key, label: s.label, overallScore: s.overallScore, respondents: s.respondents, sentiment: s.sentiment, questions: s.questions, themes: s.themes, version: s.version })),
      domains: domains.map((d) => ({ id: d.id, n: d.n, size: d.size, resp: d.resp, range: d.range, series: d.series, version: d.version })),
    };
  }

  @Post('barometer/surveys')
  async createSurvey(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Body() body: unknown) {
    const scope = await this.access.scope(actor, p);
    const wsId = await this.assertBarometer(scope);
    const input = parse(SurveyCreate, body);
    const s = input.sentiment;
    if (s.negative + s.neutral + s.positive !== 100) throw badRequest('Sentiment invalide', { sentiment: 'la somme doit valoir 100' });
    const last = await this.prisma.barometerSurvey.findFirst({ where: { projectId: scope.project.id }, orderBy: { month: 'desc' } });
    if (last && input.month <= last.month) throw badRequest('Mois invalide', { month: `postérieur au dernier relevé (${last.month}) attendu` });
    return this.prisma.$transaction(async (db) => {
      const MO = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
      const row = await db.barometerSurvey.create({
        data: {
          projectId: scope.project.id,
          month: input.month,
          key: `m${input.month}`,
          label: input.label ?? `${MO[+input.month.slice(5) - 1]} ${input.month.slice(2, 4)}`,
          overallScore: Math.round(input.overallScore * 10) / 10,
          respondents: input.respondents,
          sentiment: input.sentiment,
          questions: (input.questions ?? undefined) as any,
          themes: (input.themes ?? undefined) as any,
        },
      });
      for (const [domainId, score] of Object.entries(input.domainScores ?? {})) {
        const d = await db.barometerDomain.findFirst({ where: { id: domainId, projectId: scope.project.id } });
        if (!d) throw badRequest('Référence invalide', { domainScores: `domaine ${domainId} introuvable` });
        await db.barometerDomain.update({ where: { id: d.id }, data: { series: { ...(d.series as any), [input.month]: score }, version: { increment: 1 } } });
      }
      await this.tx.audit.record(db, this.tx.wctx(actor, scope, wsId), { entityType: 'BAROMETER_SURVEY', entityId: row.month, before: null, after: row as any, wsId, target: row.label });
      return this.barometerView(scope.project.id, db);
    });
  }

  @Patch('barometer/surveys/:month')
  async patchSurvey(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('month') month: string, @Body() body: unknown) {
    const scope = await this.access.scope(actor, p);
    const wsId = await this.assertBarometer(scope);
    const input = parse(SurveyPatch, body);
    const existing = await this.prisma.barometerSurvey.findFirst({ where: { projectId: scope.project.id, OR: [{ month }, { key: month }] } });
    if (!existing) throw notFound();
    const data: any = { ...input };
    delete data.domainScores;
    if (input.sentiment) {
      // Comme le frontend : la valeur modifiée est conservée, les deux autres sont réajustées pour totaliser 100.
      const cur = existing.sentiment as any;
      const keys = ['negative', 'neutral', 'positive'] as const;
      const changed = keys.filter((k) => input.sentiment![k] !== undefined);
      const merged = { ...cur, ...input.sentiment };
      if (changed.length === 1) {
        const fixed = merged[changed[0]];
        const others = keys.filter((k) => k !== changed[0]);
        const rest = to100(others.map((k) => Math.max(0, cur[k]) || 1)).map((x) => Math.round((x * (100 - fixed)) / 100));
        rest[1] = 100 - fixed - rest[0];
        others.forEach((k, i) => (merged[k] = rest[i]));
      } else if (keys.reduce((a, k) => a + merged[k], 0) !== 100) throw badRequest('Sentiment invalide', { sentiment: 'la somme doit valoir 100' });
      data.sentiment = merged;
    }
    if (input.overallScore !== undefined) data.overallScore = Math.round(input.overallScore * 10) / 10;
    return this.prisma.$transaction(async (db) => {
      const row = await db.barometerSurvey.update({ where: { id: existing.id }, data: { ...data, version: { increment: 1 } } });
      for (const [domainId, score] of Object.entries(input.domainScores ?? {})) {
        const d = await db.barometerDomain.findFirst({ where: { id: domainId, projectId: scope.project.id } });
        if (!d) throw badRequest('Référence invalide', { domainScores: `domaine ${domainId} introuvable` });
        const before = { series: d.series };
        const after = await db.barometerDomain.update({ where: { id: d.id }, data: { series: { ...(d.series as any), [existing.month]: score }, version: { increment: 1 } } });
        await this.tx.audit.record(db, this.tx.wctx(actor, scope, wsId), { entityType: 'BAROMETER_DOMAIN', entityId: d.id, before, after: { series: after.series }, wsId, target: d.n });
      }
      await this.tx.audit.record(db, this.tx.wctx(actor, scope, wsId), { entityType: 'BAROMETER_SURVEY', entityId: existing.month, before: existing as any, after: row as any, wsId, target: row.label });
      return this.barometerView(scope.project.id, db);
    });
  }

  @Post('barometer/domains')
  async createDomain(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Body() body: unknown) {
    const scope = await this.access.scope(actor, p);
    const wsId = await this.assertBarometer(scope);
    const input = parse(DomainCreate, body);
    return this.prisma.$transaction(async (db) => {
      const order = await db.barometerDomain.count({ where: { projectId: scope.project.id } });
      const row = await db.barometerDomain.create({ data: { projectId: scope.project.id, ...input, order } });
      await this.tx.audit.record(db, this.tx.wctx(actor, scope, wsId), { entityType: 'BAROMETER_DOMAIN', entityId: row.id, before: null, after: row as any, wsId, target: row.n });
      return { id: row.id, n: row.n, size: row.size, resp: row.resp, range: row.range, series: row.series, version: row.version };
    });
  }

  @Patch('barometer/domains/:id')
  async patchDomain(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string, @Body() body: unknown) {
    const scope = await this.access.scope(actor, p);
    const wsId = await this.assertBarometer(scope);
    const input = parse(DomainCreate.partial().strict(), body);
    const existing = await this.prisma.barometerDomain.findFirst({ where: { id, projectId: scope.project.id } });
    if (!existing) throw notFound();
    return this.prisma.$transaction(async (db) => {
      const data: any = { ...input };
      if (input.series) data.series = { ...(existing.series as any), ...input.series };
      const row = await db.barometerDomain.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
      await this.tx.audit.record(db, this.tx.wctx(actor, scope, wsId), { entityType: 'BAROMETER_DOMAIN', entityId: id, before: existing as any, after: row as any, wsId, target: row.n });
      return { id: row.id, n: row.n, size: row.size, resp: row.resp, range: row.range, series: row.series, version: row.version };
    });
  }

  /** Questions et thèmes communs aux relevés historiques, libellé et effectif de l'ensemble. */
  @Patch('barometer/global')
  async patchGlobal(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Body() body: unknown) {
    const scope = await this.access.scope(actor, p);
    const wsId = await this.assertBarometer(scope);
    const input = parse(GlobalPatch, body);
    return this.prisma.$transaction(async (db) => {
      const key = { projectId_key: { projectId: scope.project.id, key: 'barometer.global' } };
      const before = await db.contentBlock.findUnique({ where: key });
      const data = { ...((before?.data as any) ?? {}), ...input };
      await db.contentBlock.upsert({ where: key, create: { projectId: scope.project.id, key: 'barometer.global', data }, update: { data, version: { increment: 1 } } });
      await this.tx.audit.record(db, this.tx.wctx(actor, scope, wsId), { entityType: 'BAROMETER', entityId: 'global', before: (before?.data as any) ?? null, after: data, wsId, target: 'Baromètre' });
      return this.barometerView(scope.project.id, db);
    });
  }

  // ───────────── Budget (module optionnel) ─────────────

  private async budgetActive(projectId: string) {
    const m = await this.prisma.module.findUnique({ where: { id: BUDGET_MODULE_ID }, include: { projects: true } });
    return !!m && (m.scope === 'ALL' || (m.scope === 'PROJECTS' && m.projects.some((x) => x.projectId === projectId)));
  }

  @Get('budget')
  async budget(@CurrentActor() actor: Actor, @Param('projectId') p: string) {
    const scope = await this.access.scope(actor, p);
    const [periods, program, next] = await Promise.all([
      this.prisma.missionPeriod.findMany({ where: { projectId: scope.project.id }, orderBy: { order: 'asc' } }),
      this.prisma.programBudget.findUnique({ where: { projectId: scope.project.id } }),
      this.prisma.contentBlock.findUnique({ where: { projectId_key: { projectId: scope.project.id, key: 'missionNext' } } }),
    ]);
    return {
      moduleActive: await this.budgetActive(scope.project.id),
      currency: scope.project.currency,
      periods: periods.map((x) => ({ id: x.id, period: x.period, amoa: x.amoa, sub: x.sub, total: x.amoa + x.sub, status: x.status, version: x.version })),
      program: { known: program?.known ?? false, reason: program?.reason ?? null },
      next: next?.data ?? null,
    };
  }

  private async assertBudgetWrite(scope: ProjectScope) {
    if (!canWriteReferential(scope.access)) throw forbidden('Budget : PMO uniquement');
    if (!(await this.budgetActive(scope.project.id))) throw conflict('MODULE_INACTIVE', 'Module Budget inactif sur ce projet : demandez son activation');
  }

  @Patch('budget/periods/:id')
  async patchPeriod(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string, @Body() body: unknown) {
    const scope = await this.access.scope(actor, p);
    await this.assertBudgetWrite(scope);
    const input = parse(PeriodPatch, body);
    const existing = await this.prisma.missionPeriod.findFirst({ where: { id, projectId: scope.project.id } });
    if (!existing) throw notFound();
    return this.prisma.$transaction(async (db) => {
      const row = await db.missionPeriod.update({ where: { id }, data: { ...input, version: { increment: 1 } } });
      await this.tx.audit.record(db, { actor, projectId: scope.project.id, profileUsed: 'PMO' }, { entityType: 'MISSION_PERIOD', entityId: id, before: existing as any, after: row as any, target: row.period });
      return { id: row.id, period: row.period, amoa: row.amoa, sub: row.sub, total: row.amoa + row.sub, status: row.status, version: row.version };
    });
  }

  @Patch('budget/program')
  async patchProgram(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Body() body: unknown) {
    const scope = await this.access.scope(actor, p);
    await this.assertBudgetWrite(scope);
    const input = parse(ProgramPatch, body);
    return this.prisma.$transaction(async (db) => {
      const before = await db.programBudget.findUnique({ where: { projectId: scope.project.id } });
      const row = await db.programBudget.upsert({ where: { projectId: scope.project.id }, create: { projectId: scope.project.id, known: input.known ?? false, reason: input.reason ?? null }, update: { ...input, version: { increment: 1 } } });
      await this.tx.audit.record(db, { actor, projectId: scope.project.id, profileUsed: 'PMO' }, { entityType: 'PROGRAM_BUDGET', entityId: scope.project.id, before: before as any, after: row as any, target: 'Budget programme' });
      return { known: row.known, reason: row.reason };
    });
  }

  // ───────────── Écarts ─────────────

  @Get('anomalies')
  async getAnomalies(@CurrentActor() actor: Actor, @Param('projectId') p: string) {
    const scope = await this.access.scope(actor, p);
    return this.anomalies.compute(scope);
  }
}

export function progressView(r: any) {
  return {
    id: r.id,
    wsId: r.wsId,
    label: r.label,
    valuePct: r.valuePct,
    targetPct: r.targetPct,
    detail: r.detail,
    ownerId: r.ownerId,
    sig: progressSignal(r.valuePct, r.targetPct),
    confirmedAt: r.confirmedAt,
    version: r.version,
  };
}

