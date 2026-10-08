import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import { riskLinks } from '../../domain/rights';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AccessService, ProjectScope } from '../../core/access.service';
import { Actor, CurrentActor } from '../../core/auth/auth';
import { AuditService } from '../../core/audit.service';
import { PrismaService } from '../../core/prisma.service';
import { TodayService } from '../../core/today.service';
import { badRequest, notFound } from '../../core/errors';
import { techId } from '../../core/ids';
import { parse } from '../../core/http';
import { addDays, daysBetween } from '../../domain/dates';
import { actionLate, confirmedDays, countdown, FRESHNESS_ALERT_DAYS, FRESHNESS_WATCH_DAYS, riskScore, RISK_CRITICAL_MIN } from '../../domain/rules';
import { canReadWs, visibleWorkstreams } from '../../domain/rights';
import { AnomaliesService } from '../pilotage/anomalies.service';
import { confirmedAtIso } from '../views';
import { optIsoDate } from '../referential/schemas';
import { ruleGreeting, WELCOME_BODY_SHORT_NAME } from '../../domain/today-greeting';
import { TodayGreetingService } from './today-greeting.service';

/** Nom court de l'instance dont la prochaine séance est annoncée dans le message d'accueil (règle partagée). */
export { WELCOME_BODY_SHORT_NAME };
/** Horizon des jalons dans « Mes tâches » (§ 7.12). */
export const MY_MILESTONES_HORIZON_DAYS = 45;
/** Fenêtre de l'échéancier de l'écran Aujourd'hui (frontend `todayTimeline`). */
export const TIMELINE_PAST_DAYS = 7;
export const TIMELINE_FUTURE_DAYS = 45;
export const TIMELINE_MAX = 10;

const TaskCreate = z
  .object({
    title: z.string().trim().min(1, 'obligatoire').max(300),
    dueIso: optIsoDate,
    detail: z.string().max(4000).nullable().optional(),
    status: z.enum(['TODO', 'DONE']).optional(),
    link: z.object({ entityType: z.enum(['RISK', 'ISSUE', 'ACTION', 'DECISION', 'MILESTONE', 'DELIVERABLE', 'SESSION', 'DOCUMENT']), entityId: z.string().min(1) }).nullable().optional(),
    cta: z.string().max(60).nullable().optional(),
  })
  .strict();

const OverridePut = z
  .object({ archived: z.boolean().optional(), title: z.string().max(300).nullable().optional(), detail: z.string().max(4000).nullable().optional(), dueIso: optIsoDate, cta: z.string().max(60).nullable().optional() })
  .strict();

type TaskItem = {
  key: string;
  kind: 'ACTION' | 'DECISION' | 'MILESTONE' | 'MANUAL';
  id: string;
  code?: string;
  title: string;
  detail?: string | null;
  dueIso: string | null;
  late: boolean;
  status: string;
  wsId?: string | null;
  cta?: string | null;
  archived?: boolean;
  link?: unknown;
};

/** Écran Aujourd'hui (§ 7.13), Mes tâches (§ 7.12) et tâches manuelles privées. */
@ApiTags('cockpit · aujourd’hui et tâches')
@ApiBearerAuth()
@Controller('api/projects/:projectId')
export class TodayController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly todaySvc: TodayService,
    private readonly anomalies: AnomaliesService,
    private readonly audit: AuditService,
    private readonly greetings: TodayGreetingService,
  ) {}

  private personOrAccount(actor: Actor, scope: ProjectScope) {
    return scope.access.personId ?? actor.accountId;
  }

  /** Tâches calculées + manuelles de l'utilisateur, surcharges personnelles appliquées (Q8). */
  async myTasks(actor: Actor, scope: ProjectScope, includeArchived = false): Promise<TaskItem[]> {
    const P = { projectId: scope.project.id };
    const today = this.todaySvc.today(scope.project.timezone);
    const me = scope.access.personId;
    const out: TaskItem[] = [];
    if (me) {
      for (const a of await this.prisma.action.findMany({ where: { ...P, ownerId: me, status: { not: 'DONE' } }, orderBy: { order: 'asc' } })) {
        if (!canReadWs(scope.access, a.wsId)) continue;
        out.push({ key: `ACTION/${a.id}`, kind: 'ACTION', id: a.id, code: a.code, title: a.n, detail: a.detail, dueIso: a.dueIso, late: actionLate(a.status, a.dueIso, today), status: a.status, wsId: a.wsId });
      }
      for (const d of await this.prisma.decision.findMany({ where: { ...P, makerId: me, status: { in: ['IN_REVIEW', 'TO_ARBITRATE'] } }, orderBy: { code: 'asc' } })) {
        if (!canReadWs(scope.access, d.wsId)) continue;
        out.push({ key: `DECISION/${d.id}`, kind: 'DECISION', id: d.id, code: d.code, title: d.t, dueIso: d.ddIso, late: false, status: d.status, wsId: d.wsId });
      }
      const hi = addDays(today, MY_MILESTONES_HORIZON_DAYS);
      for (const m of await this.prisma.milestone.findMany({ where: { ...P, ownerId: me, iso: { gte: today, lt: hi } }, orderBy: [{ iso: 'asc' }, { code: 'asc' }] })) {
        out.push({ key: `MILESTONE/${m.id}`, kind: 'MILESTONE', id: m.id, code: m.code, title: m.n, dueIso: m.iso, late: false, status: 'PLANNED', wsId: m.wsId });
      }
    }
    const author = this.personOrAccount(actor, scope);
    for (const t of await this.prisma.task.findMany({ where: { ...P, authorId: author }, orderBy: { createdAt: 'asc' } })) {
      out.push({ key: `TASK/${t.id}`, kind: 'MANUAL', id: t.id, title: t.title, detail: t.detail, dueIso: t.dueIso, late: t.status !== 'DONE' && !!t.dueIso && t.dueIso < today, status: t.status, cta: t.cta, link: t.link });
    }
    const overrides = await this.prisma.taskOverride.findMany({ where: { ...P, personId: author } });
    const ov = Object.fromEntries(overrides.map((o) => [`${o.entityType}/${o.entityId}`, o]));
    return out
      .map((t) => {
        const o = ov[t.key];
        if (!o) return t;
        const dueIso = o.dueIso ?? t.dueIso;
        return { ...t, title: o.title ?? t.title, detail: o.detail ?? t.detail, dueIso, cta: o.cta ?? t.cta, archived: o.archived, late: t.kind === 'ACTION' || t.kind === 'MANUAL' ? t.status !== 'DONE' && !!dueIso && dueIso < today : t.late };
      })
      .filter((t) => includeArchived || !t.archived);
  }

  @Get('me/tasks')
  async getMyTasks(@CurrentActor() actor: Actor, @Param('projectId') p: string) {
    const scope = await this.access.scope(actor, p);
    return this.myTasks(actor, scope, true);
  }

  @Put('me/tasks/:entityType/:entityId/override')
  async override(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('entityType') entityType: string, @Param('entityId') entityId: string, @Body() body: unknown) {
    const scope = await this.access.scope(actor, p);
    const input = parse(OverridePut, body);
    const type = entityType.toUpperCase();
    if (!['ACTION', 'DECISION', 'MILESTONE', 'TASK'].includes(type)) throw badRequest('Type invalide', { entityType: 'ACTION, DECISION, MILESTONE ou TASK' });
    const personId = this.personOrAccount(actor, scope);
    const where = { personId_entityType_entityId: { personId, entityType: type, entityId } };
    return this.prisma.taskOverride.upsert({ where, create: { projectId: scope.project.id, personId, entityType: type, entityId, ...input }, update: input });
  }

  @Get('tasks')
  async tasks(@CurrentActor() actor: Actor, @Param('projectId') p: string) {
    const scope = await this.access.scope(actor, p);
    return this.prisma.task.findMany({ where: { projectId: scope.project.id, authorId: this.personOrAccount(actor, scope) }, orderBy: { createdAt: 'asc' } });
  }

  @Post('tasks')
  async createTask(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Body() body: unknown) {
    const scope = await this.access.scope(actor, p);
    const input = parse(TaskCreate, body);
    return this.prisma.$transaction(async (db) => {
      const row = await db.task.create({ data: { id: techId('tk'), projectId: scope.project.id, authorId: this.personOrAccount(actor, scope), title: input.title, dueIso: input.dueIso ?? null, detail: input.detail ?? null, status: input.status ?? 'TODO', link: (input.link ?? undefined) as Prisma.InputJsonValue | undefined, cta: input.cta ?? null } });
      await this.audit.record(db, { actor, projectId: scope.project.id, profileUsed: null }, { entityType: 'TASK', entityId: row.id, before: null, after: row as any, target: row.title });
      return row;
    });
  }

  private async ownTask(actor: Actor, scope: ProjectScope, id: string) {
    const t = await this.prisma.task.findFirst({ where: { id, projectId: scope.project.id } });
    // Visible par son auteur uniquement : 404 pour les autres.
    if (!t || t.authorId !== this.personOrAccount(actor, scope)) throw notFound();
    return t;
  }

  @Patch('tasks/:id')
  async patchTask(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string, @Body() body: unknown) {
    const scope = await this.access.scope(actor, p);
    const t = await this.ownTask(actor, scope, id);
    const input = parse(TaskCreate.partial().strict(), body);
    return this.prisma.$transaction(async (db) => {
      const row = await db.task.update({ where: { id }, data: { ...input, link: input.link === undefined ? undefined : input.link === null ? Prisma.DbNull : (input.link as any), version: { increment: 1 } } });
      await this.audit.record(db, { actor, projectId: scope.project.id, profileUsed: null }, { entityType: 'TASK', entityId: id, before: t as any, after: row as any, target: row.title });
      return row;
    });
  }

  @Delete('tasks/:id')
  @HttpCode(204)
  async deleteTask(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string) {
    const scope = await this.access.scope(actor, p);
    const t = await this.ownTask(actor, scope, id);
    await this.prisma.$transaction(async (db) => {
      await db.task.delete({ where: { id } });
      await this.audit.record(db, { actor, projectId: scope.project.id, profileUsed: null }, { entityType: 'TASK', entityId: id, before: t as any, after: null, target: t.title });
    });
  }

  /**
   * Message d'accueil de l'écran Aujourd'hui (02/10/2026) : celui de Jev, généré une fois par jour et contrôlé, ou le
   * message par règles (`source: 'regles'` et motif : module désactivé, hors ligne, réponse refusée, modèle indisponible).
   */
  @Get('today/greeting')
  async greeting(@CurrentActor() actor: Actor, @Param('projectId') p: string) {
    return this.greetings.greeting(actor, await this.access.scope(actor, p));
  }

  /** Écran Aujourd'hui (§ 7.13 ; règles de `todayMsg`, `todayTimeline`, `todayStale`). */
  @Get('today')
  async today(@CurrentActor() actor: Actor, @Param('projectId') p: string) {
    const scope = await this.access.scope(actor, p);
    const P = { projectId: scope.project.id };
    const today = this.todaySvc.today(scope.project.timezone);
    const me = scope.access.personId;
    const vis = visibleWorkstreams(scope.access);
    const inWs = (ws: string | null) => !vis || (!!ws && vis.includes(ws));

    const body = (await this.prisma.governanceBody.findFirst({ where: { ...P, shortName: WELCOME_BODY_SHORT_NAME } })) ?? (await this.prisma.governanceBody.findFirst({ where: { ...P, level: 'STRATEGIC' }, orderBy: { order: 'asc' } }));
    const next = body
      ? await this.prisma.session.findFirst({ where: { ...P, bodyId: body.id, status: 'PLANNED', dateIso: { gte: today } }, orderBy: [{ dateIso: 'asc' }, { time: 'asc' }] })
      : null;
    const validations = me ? await this.prisma.decision.count({ where: { ...P, makerId: me, status: 'TO_ARBITRATE' } }) : 0;
    const tasks = await this.myTasks(actor, scope);
    const tasksCount = tasks.filter((t) => t.status !== 'DONE').length;
    const firstName = (await this.prisma.userPreferences.findUnique({ where: { accountId: actor.accountId } }))?.firstName ?? (me ? (await this.prisma.person.findUnique({ where: { id: me } }))?.firstName : actor.fullName.split(' ')[0]);
    const nextCommittee = next && body ? { sessionId: next.id, bodyId: body.id, shortName: body.shortName, number: next.number, dateIso: next.dateIso, time: next.time, place: next.place, inDays: daysBetween(today, next.dateIso) } : null;
    // Message calculé par règles (repli du message de Jev, 02/10/2026) : une seule priorité, sans compteur à zéro.
    const message = ruleGreeting(await this.greetings.facts(actor, scope));

    // Échéancier : de J-7 à J+45, 10 éléments au plus.
    const lo = addDays(today, -TIMELINE_PAST_DAYS);
    const hi = addDays(today, TIMELINE_FUTURE_DAYS);
    const timeline: any[] = [];
    for (const m of await this.prisma.milestone.findMany({ where: { ...P, iso: { gte: lo, lte: hi } } })) {
      if (m.wsId && !inWs(m.wsId)) continue;
      const cd = confirmedDays(confirmedAtIso(m.confirmedAt), today);
      const gap = daysBetween(m.baselineIso, m.iso);
      timeline.push({ iso: m.iso, kind: 'MILESTONE', id: m.id, code: m.code, title: m.n, owner: m.ownerId, tag: cd > FRESHNESS_ALERT_DAYS ? 'TO_REVIEW' : gap > 0 ? 'LATE' : 'ON_TRACK', gapDays: gap, confirmedDays: cd });
    }
    for (const a of await this.prisma.action.findMany({ where: { ...P, status: { not: 'DONE' }, dueIso: { gte: lo, lte: hi } } })) {
      if (!inWs(a.wsId)) continue;
      timeline.push({ iso: a.dueIso, kind: 'ACTION', id: a.id, code: a.code, title: a.n, owner: a.ownerId, tag: a.status });
    }
    if (body) {
      for (const s of await this.prisma.session.findMany({ where: { ...P, bodyId: body.id, status: 'PLANNED', dateIso: { gte: today, lte: hi } } })) {
        const d = daysBetween(today, s.dateIso);
        timeline.push({ iso: s.dateIso, kind: 'SESSION', id: s.id, title: `${body.shortName} n°${s.number}`, owner: me, tag: d === 0 ? 'TODAY' : `J-${d}` });
      }
    }
    timeline.sort((a, b) => a.iso.localeCompare(b.iso));

    // Données à revoir (fraîcheur § 7.6, champs vides).
    const stale: any[] = [];
    const budget = await this.prisma.programBudget.findUnique({ where: { projectId: scope.project.id } });
    if (budget && !budget.known) stale.push({ kind: 'EMPTY_FIELD', entityType: 'PROGRAM_BUDGET', entityId: scope.project.id, title: 'Budget programme non renseigné', owner: scope.project.programDirectorId, level: 'RISK', cta: 'Renseigner' });
    for (const r of await this.prisma.risk.findMany({ where: { ...P, plan: null, status: { not: 'CLOSED' } }, orderBy: { code: 'asc' } })) {
      const l = riskLinks(r);
      if (vis && !(l.all ? vis.length > 0 : l.ids.some((w) => vis.includes(w)))) continue;
      stale.push({ kind: 'EMPTY_FIELD', entityType: 'RISK', entityId: r.id, code: r.code, title: `Risque ${r.code} · plan de mitigation`, score: riskScore(r.p, r.i), owner: r.ownerId, level: riskScore(r.p, r.i) >= RISK_CRITICAL_MIN ? 'RISK' : 'WATCH', cta: 'Qualifier' });
    }
    const ms = (await this.prisma.milestone.findMany({ where: { ...P, iso: { gte: today } } }))
      .map((m) => ({ m, d: confirmedDays(confirmedAtIso(m.confirmedAt), today) }))
      .filter(({ m, d }) => d > FRESHNESS_WATCH_DAYS && (!m.wsId || inWs(m.wsId)))
      .sort((a, b) => b.d - a.d);
    for (const { m, d } of ms) stale.push({ kind: 'UNCONFIRMED', entityType: 'MILESTONE', entityId: m.id, code: m.code, title: `Jalon « ${m.n} »`, confirmedDays: d, owner: m.ownerId, level: d > FRESHNESS_ALERT_DAYS ? 'RISK' : 'WATCH', cta: 'Relancer' });
    for (const a of await this.prisma.action.findMany({ where: { ...P, status: { not: 'DONE' } }, orderBy: { order: 'asc' } })) {
      if (inWs(a.wsId) && actionLate(a.status, a.dueIso, today)) stale.push({ kind: 'LATE', entityType: 'ACTION', entityId: a.id, code: a.code, title: `Action ${a.code} · statut après échéance`, dueIso: a.dueIso, owner: a.ownerId, level: 'RISK', cta: 'Mettre à jour' });
    }

    return {
      today,
      message,
      firstName,
      nextCommittee,
      countdown: scope.project.forecastGoliveIso ? { target: 'GOLIVE', dateIso: scope.project.forecastGoliveIso, label: countdown(scope.project.forecastGoliveIso, today), days: daysBetween(today, scope.project.forecastGoliveIso) } : null,
      validations,
      tasksCount,
      timeline: timeline.slice(0, TIMELINE_MAX),
      stale,
      anomalies: await this.anomalies.compute(scope),
    };
  }
}
