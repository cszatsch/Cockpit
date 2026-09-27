import { Body, Controller, Get, Headers, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AccessService, ProjectScope } from '../../core/access.service';
import { Actor, CurrentActor } from '../../core/auth/auth';
import { AuditService } from '../../core/audit.service';
import { PrismaService, Tx } from '../../core/prisma.service';
import { TodayService } from '../../core/today.service';
import { badRequest, forbidden } from '../../core/errors';
import { checkIfMatch, parse } from '../../core/http';
import { canSeeReferentialTab, canWriteReferential } from '../../domain/rights';
import { assignmentActive } from '../../domain/rules';
import { isoDate, optIsoDate, optText, text } from '../referential/schemas';

const ProjectPatch = z
  .object({
    code: z.any().optional(),
    name: text(200),
    objective: optText(),
    startDate: isoDate,
    targetEndDate: isoDate,
    timezone: z.string().refine((tz) => {
      try {
        new Intl.DateTimeFormat('fr-FR', { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, 'fuseau IANA invalide'),
    city: optText(120),
    country: text(80),
    status: z.enum(['PREPARATION', 'ACTIVE', 'CLOSED']),
    editorTeamId: z.string().nullable(),
    integratorTeamId: z.string().nullable(),
    programDirectorId: z.string(),
    sponsorId: z.string().nullable(),
    currency: z.string().regex(/^[A-Z]{3}$/, 'code ISO 4217 attendu'),
    forecastGoliveIso: optIsoDate,
    healthOverride: z
      .object({ value: text(300), reason: text(1000) })
      .nullable(),
  })
  .partial()
  .strict();

/** Fiche projet (brief § 9.4) et vue d'ensemble du Référentiel. */
@ApiTags('cockpit · projet')
@ApiBearerAuth()
@Controller('api/projects/:projectId')
export class ProjectController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly todaySvc: TodayService,
  ) {}

  async view(scope: ProjectScope, db: Tx = this.prisma) {
    const p = await db.project.findUniqueOrThrow({ where: { id: scope.project.id }, include: { client: true, baselines: { orderBy: { createdAt: 'asc' } }, sections: { orderBy: { order: 'asc' } } } });
    const current = p.baselines.find((b) => b.current) ?? p.baselines.at(-1) ?? null;
    const previous = current ? p.baselines.filter((b) => b !== current && b.createdAt <= current.createdAt).at(-1) ?? null : null;
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      clientId: p.clientId,
      client: { id: p.client.id, code: p.client.code, name: p.client.name },
      objective: p.objective,
      startDate: p.startDate,
      targetEndDate: p.targetEndDate,
      timezone: p.timezone,
      city: p.city,
      country: p.country,
      status: p.status,
      editorTeamId: p.editorTeamId,
      integratorTeamId: p.integratorTeamId,
      programDirectorId: p.programDirectorId,
      sponsorId: p.sponsorId,
      currency: p.currency,
      baseline: current && {
        version: current.version,
        date: current.date,
        approvedAt: current.approvedAt,
        approvedBy: current.approvedById,
        reason: current.reason,
        previous: previous && { version: previous.version, date: previous.date, approvedAt: previous.approvedAt },
      },
      baselineHistory: p.baselines.map((b) => ({ version: b.version, date: b.date, approvedAt: b.approvedAt, approvedBy: b.approvedById, reason: b.reason, current: b.current })),
      forecast: { goliveIso: p.forecastGoliveIso },
      healthOverride: p.healthOverride,
      sections: p.sections.map((s) => ({ key: s.key, label: s.label, value: s.value, order: s.order })),
      today: this.todaySvc.today(p.timezone),
      version: p.version,
    };
  }

  @Get('project')
  async get(@CurrentActor() actor: Actor, @Param('projectId') projectId: string) {
    return this.view(await this.access.scope(actor, projectId));
  }

  @Patch('project')
  async patch(@CurrentActor() actor: Actor, @Param('projectId') projectId: string, @Body() body: unknown, @Headers('if-match') ifMatch?: string) {
    const scope = await this.access.scope(actor, projectId);
    if (!canWriteReferential(scope.access)) throw forbidden('La fiche projet est modifiable par le PMO uniquement');
    const input = parse(ProjectPatch, body) as any;
    if (input.code !== undefined) throw badRequest('Le code projet n’est pas modifiable après création', { code: 'non modifiable' });
    checkIfMatch(ifMatch, scope.project.version);
    const start = input.startDate ?? scope.project.startDate;
    const end = input.targetEndDate ?? scope.project.targetEndDate;
    if (end < start) throw badRequest('Période invalide', { targetEndDate: 'la fin doit être postérieure au début' });
    for (const f of ['editorTeamId', 'integratorTeamId'] as const) {
      if (input[f] && !(await this.prisma.team.findFirst({ where: { id: input[f], projectId: scope.project.id } }))) throw badRequest('Référence invalide', { [f]: 'introuvable' });
    }
    for (const f of ['programDirectorId', 'sponsorId'] as const) {
      if (input[f] && !(await this.prisma.person.findFirst({ where: { id: input[f], projectId: scope.project.id } }))) throw badRequest('Référence invalide', { [f]: 'introuvable' });
    }
    const data: any = { ...input };
    if (input.healthOverride !== undefined) {
      data.healthOverride = input.healthOverride
        ? { ...input.healthOverride, by: scope.access.personId ?? actor.accountId, at: new Date().toISOString() }
        : Prisma.DbNull;
    }
    const before = await this.view(scope);
    await this.prisma.$transaction(async (tx) => {
      await tx.project.update({ where: { id: scope.project.id }, data: { ...data, version: { increment: 1 } } });
      const after = await this.view(scope, tx);
      await this.audit.record(tx, { actor, projectId: scope.project.id, profileUsed: 'PMO' }, { entityType: 'PROJECT', entityId: scope.project.id, before, after: after, target: scope.project.code });
    });
    return this.view(scope);
  }

  /** Section libre de la fiche projet (brief § 6.1 `ProjectSection`). */
  @Patch('project/sections/:key')
  async patchSection(@CurrentActor() actor: Actor, @Param('projectId') projectId: string, @Param('key') key: string, @Body() body: unknown) {
    const scope = await this.access.scope(actor, projectId);
    if (!canWriteReferential(scope.access)) throw forbidden('La fiche projet est modifiable par le PMO uniquement');
    const input = parse(z.object({ value: z.unknown(), label: z.string().max(200).optional(), order: z.number().int().optional() }).strict(), body);
    if (key.length > 200) throw badRequest('Clé trop longue', { key: '200 caractères maximum' });
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.projectSection.findUnique({ where: { projectId_key: { projectId: scope.project.id, key } } });
      const value = (input.value ?? null) as Prisma.InputJsonValue;
      const after = await tx.projectSection.upsert({
        where: { projectId_key: { projectId: scope.project.id, key } },
        create: { projectId: scope.project.id, key, value, label: input.label ?? null, order: input.order ?? 0 },
        update: { value, ...(input.label !== undefined ? { label: input.label } : {}), ...(input.order !== undefined ? { order: input.order } : {}) },
      });
      await this.audit.record(tx, { actor, projectId: scope.project.id, profileUsed: 'PMO' }, { entityType: 'PROJECT_SECTION', entityId: key, before: before ? { value: before.value } : null, after: { value: after.value }, target: key });
      return { key: after.key, label: after.label, value: after.value, order: after.order };
    });
  }

  /**
   * Porteurs sans affectation active (§ 7.11) : personne sans affectation en cours et responsable
   * d'au moins un objet ouvert (jalon à venir, action non terminée, risque non clos, problème non résolu,
   * décision ouverte, livrable non terminé, chantier actif).
   */
  @Get('signals/owners-without-assignment')
  async ownersWithoutAssignment(@CurrentActor() actor: Actor, @Param('projectId') projectId: string) {
    const scope = await this.access.scope(actor, projectId);
    const P = { projectId: scope.project.id };
    const today = this.todaySvc.today(scope.project.timezone);
    const persons = await this.prisma.person.findMany({ where: P });
    const assigns = await this.prisma.assignment.findMany({ where: P });
    const activeP = new Set(assigns.filter((a) => assignmentActive(a, today)).map((a) => a.personId));
    const owned: Record<string, Array<{ entityType: string; id: string; label: string }>> = {};
    const add = (pid: string | null, entityType: string, id: string, label: string) => {
      if (pid && !activeP.has(pid)) (owned[pid] ??= []).push({ entityType, id, label });
    };
    for (const m of await this.prisma.milestone.findMany({ where: { ...P, iso: { gte: today } } })) add(m.ownerId, 'MILESTONE', m.id, `${m.code} · ${m.n}`);
    for (const a of await this.prisma.action.findMany({ where: { ...P, status: { not: 'DONE' } } })) add(a.ownerId, 'ACTION', a.id, `${a.code} · ${a.n}`);
    for (const r of await this.prisma.risk.findMany({ where: { ...P, status: { not: 'CLOSED' } } })) add(r.ownerId, 'RISK', r.id, `${r.code} · ${r.n}`);
    for (const x of await this.prisma.issue.findMany({ where: { ...P, status: { not: 'RESOLVED' } } })) add(x.ownerId, 'ISSUE', x.id, `${x.code} · ${x.n}`);
    for (const d of await this.prisma.decision.findMany({ where: { ...P, status: { in: ['DRAFT', 'IN_REVIEW', 'TO_ARBITRATE'] } } })) add(d.makerId, 'DECISION', d.id, `${d.code} · ${d.t}`);
    for (const l of await this.prisma.deliverable.findMany({ where: { ...P, prog: { lt: 100 } } })) add(l.ownerId, 'DELIVERABLE', l.id, l.name);
    for (const w of await this.prisma.workstream.findMany({ where: { ...P, status: 'ACTIVE' } })) add(w.ownerId, 'WORKSTREAM', w.id, w.name);
    return persons
      .filter((p) => owned[p.id])
      .map((p) => ({ personId: p.id, name: `${p.firstName} ${p.lastName}`.trim(), objects: owned[p.id] }));
  }

  /** Vue d'administration du Référentiel (onglet réservé à ADMIN et PMO, RG7). */
  @Get('referential')
  async referential(@CurrentActor() actor: Actor, @Param('projectId') projectId: string) {
    const scope = await this.access.scope(actor, projectId);
    if (!canSeeReferentialTab(scope.access)) throw forbidden('Onglet Référentiel réservé aux profils Admin et PMO');
    const P = { projectId: scope.project.id };
    const [waves, phases, subphases, workstreams, milestones, deliverables, teams, roles, persons, assignments, bodies] = await Promise.all([
      this.prisma.wave.count({ where: P }),
      this.prisma.phase.count({ where: P }),
      this.prisma.subphase.count({ where: P }),
      this.prisma.workstream.count({ where: P }),
      this.prisma.milestone.count({ where: P }),
      this.prisma.deliverable.count({ where: P }),
      this.prisma.team.count({ where: P }),
      this.prisma.projectRole.count({ where: P }),
      this.prisma.person.count({ where: P }),
      this.prisma.assignment.count({ where: P }),
      this.prisma.governanceBody.count({ where: P }),
    ]);
    return {
      project: await this.view(scope),
      counts: { waves, phases, subphases, workstreams, milestones, deliverables, teams, roles, persons, assignments, governanceBodies: bodies },
      editable: canWriteReferential(scope.access),
    };
  }
}
