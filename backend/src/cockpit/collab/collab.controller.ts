import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AccessService, ProjectScope } from '../../core/access.service';
import { Actor, CurrentActor } from '../../core/auth/auth';
import { PrismaService } from '../../core/prisma.service';
import { badRequest, forbidden, notFound } from '../../core/errors';
import { parse } from '../../core/http';
import { canReadWs, canWriteReferential, canWriteTools, hasAnyAccess } from '../../domain/rights';

/** Entités commentables et leur rattachement (commentaires : toute personne qui peut lire l'objet, § 8.6). */
const WS_BOUND: Record<string, { delegate: string; ws: string }> = {
  RISK: { delegate: 'risk', ws: 'wsId' },
  ISSUE: { delegate: 'issue', ws: 'wsId' },
  ACTION: { delegate: 'action', ws: 'wsId' },
  DECISION: { delegate: 'decision', ws: 'wsId' },
  WORKSTREAM_PROGRESS: { delegate: 'workstreamProgress', ws: 'wsId' },
};
const OPEN_TO_ALL: Record<string, string> = {
  MILESTONE: 'milestone',
  DELIVERABLE: 'deliverable',
  PHASE: 'phase',
  SUBPHASE: 'subphase',
  WORKSTREAM: 'workstream',
  SESSION: 'session',
  BAROMETER_SURVEY: 'barometerSurvey',
  BAROMETER_DOMAIN: 'barometerDomain',
  MISSION_PERIOD: 'missionPeriod',
  PROJECT: 'project',
  DOCUMENT: 'document',
  REPORT: 'reportInstance',
};

const CommentCreate = z
  .object({ entityType: z.string().min(1).max(40), entityId: z.string().min(1).max(120), field: z.string().min(1).max(80), text: z.string().trim().min(1, 'obligatoire').max(4000) })
  .strict();

/** Commentaires de cellule et historique d'un objet (brief § 9.9). */
@ApiTags('cockpit · commentaires et historique')
@ApiBearerAuth()
@Controller('api/projects/:projectId')
export class CollabController {
  constructor(private readonly prisma: PrismaService, private readonly access: AccessService) {}

  /** L'utilisateur peut-il lire cet objet ? (404 sinon, RG16) */
  private async assertReadable(scope: ProjectScope, entityType: string, entityId: string) {
    const bound = WS_BOUND[entityType];
    if (bound) {
      const row = await (this.prisma as any)[bound.delegate].findFirst({ where: { id: entityId, projectId: scope.project.id } });
      if (!row || !canReadWs(scope.access, row[bound.ws])) throw notFound();
      return;
    }
    const delegate = OPEN_TO_ALL[entityType];
    if (!delegate) throw badRequest('Type d’objet non commentable', { entityType: `valeurs : ${[...Object.keys(WS_BOUND), ...Object.keys(OPEN_TO_ALL)].join(', ')}` });
    const where = entityType === 'PROJECT' ? { id: entityId } : entityType === 'BAROMETER_SURVEY' ? { projectId: scope.project.id, OR: [{ id: entityId }, { month: entityId }, { key: entityId }] } : { id: entityId, projectId: scope.project.id };
    const row = await (this.prisma as any)[delegate].findFirst({ where });
    if (!row || (entityType === 'PROJECT' && row.id !== scope.project.id)) throw notFound();
    if (!hasAnyAccess(scope.access)) throw notFound();
  }

  private view(c: any) {
    return { id: c.id, entityType: c.entityType, entityId: c.entityId, field: c.field, text: c.text, authorId: c.authorId, authorName: c.authorName, createdAt: c.createdAt, resolved: c.resolved };
  }

  @Get('comments')
  async list(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Query('entityType') entityType?: string, @Query('entityId') entityId?: string) {
    const scope = await this.access.scope(actor, p);
    if (entityType && entityId) await this.assertReadable(scope, entityType, entityId);
    const rows = await this.prisma.cellComment.findMany({ where: { projectId: scope.project.id, ...(entityType ? { entityType } : {}), ...(entityId ? { entityId } : {}) }, orderBy: { createdAt: 'asc' } });
    // Sans filtre : uniquement les commentaires d'objets lisibles.
    const out = [];
    for (const c of rows) {
      try {
        if (!entityId) await this.assertReadable(scope, c.entityType, c.entityId);
        out.push(this.view(c));
      } catch {
        /* objet hors périmètre ou supprimé */
      }
    }
    return out;
  }

  @Post('comments')
  async create(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Body() body: unknown) {
    const scope = await this.access.scope(actor, p);
    const input = parse(CommentCreate, body);
    await this.assertReadable(scope, input.entityType, input.entityId);
    const person = scope.access.personId ? await this.prisma.person.findUnique({ where: { id: scope.access.personId } }) : null;
    const c = await this.prisma.cellComment.create({
      data: { projectId: scope.project.id, ...input, authorId: scope.access.personId ?? actor.accountId, authorName: person ? `${person.firstName} ${person.lastName}` : actor.fullName },
    });
    return this.view(c);
  }

  @Patch('comments/:id')
  async patch(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string, @Body() body: unknown) {
    const scope = await this.access.scope(actor, p);
    const input = parse(z.object({ resolved: z.boolean() }).strict(), body);
    const c = await this.prisma.cellComment.findFirst({ where: { id, projectId: scope.project.id } });
    if (!c) throw notFound();
    await this.assertReadable(scope, c.entityType, c.entityId);
    return this.view(await this.prisma.cellComment.update({ where: { id }, data: input }));
  }

  /**
   * Historique d'un objet (champ par champ). Le journal complet reste réservé à l'Admin dans la console (RG15) ;
   * ici, seul l'historique d'un objet lisible par l'utilisateur est renvoyé.
   */
  @Get('audit')
  async audit(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Query('entityType') entityType?: string, @Query('entityId') entityId?: string, @Query('field') field?: string) {
    const scope = await this.access.scope(actor, p);
    if (!entityType || !entityId) throw badRequest('Filtre obligatoire', { entityId: 'entityType et entityId sont obligatoires' });
    await this.assertReadable(scope, entityType, entityId);
    const rows = await this.prisma.auditEntry.findMany({ where: { projectId: scope.project.id, entityType, entityId, ...(field ? { field } : {}) }, orderBy: { at: 'desc' }, take: 500 });
    return rows.map((a) => ({ id: a.id, at: a.at, entityType: a.entityType, entityId: a.entityId, field: a.field, oldValue: a.oldValue, newValue: a.newValue, authorId: a.personId ?? a.accountId, authorName: a.actorName, profileUsed: a.profileUsed, origin: a.origin, action: a.action }));
  }

  // ───── Demandes d'activation de module (Console § 9.9, côté Cockpit) ─────

  @Get('modules')
  async modules(@CurrentActor() actor: Actor, @Param('projectId') p: string) {
    const scope = await this.access.scope(actor, p);
    const mods = await this.prisma.module.findMany({ include: { projects: true }, orderBy: { id: 'asc' } });
    const reqs = await this.prisma.moduleRequest.findMany({ where: { projectId: scope.project.id, status: 'PENDING' } });
    return mods.map((m) => ({ id: m.id, name: m.name, description: m.description, active: m.scope === 'ALL' || (m.scope === 'PROJECTS' && m.projects.some((x) => x.projectId === scope.project.id)), pendingRequest: reqs.some((r) => r.moduleId === m.id) }));
  }

  @Post('module-requests')
  async requestModule(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Body() body: unknown) {
    const scope = await this.access.scope(actor, p);
    if (!canWriteTools(scope.access)) throw forbidden('Demande d’activation : PMO ou Responsable');
    const { moduleId } = parse(z.object({ moduleId: z.string().min(1) }).strict(), body);
    const mod = await this.prisma.module.findUnique({ where: { id: moduleId } });
    if (!mod) throw badRequest('Module inconnu', { moduleId: 'introuvable' });
    const existing = await this.prisma.moduleRequest.findFirst({ where: { moduleId, projectId: scope.project.id, status: 'PENDING' } });
    if (existing) return existing;
    return this.prisma.$transaction(async (db) => {
      const r = await db.moduleRequest.create({ data: { moduleId, projectId: scope.project.id, requestedById: actor.accountId, requestedBy: actor.fullName } });
      await db.auditEntry.create({ data: { accountId: actor.accountId, actorName: actor.fullName, personId: actor.personId, profileUsed: scope.access.pmo ? 'PMO' : 'RESPONSABLE', action: 'Demande d’activation de module', target: `${mod.name} · ${scope.project.code}`, entityType: 'ModuleRequest', entityId: r.id, projectId: scope.project.id } });
      return r;
    });
  }

  // ───── Q8 bis : demande d'invitation depuis le Référentiel ─────

  @Post('invitation-requests')
  async requestInvitation(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Body() body: unknown) {
    const scope = await this.access.scope(actor, p);
    if (!canWriteReferential(scope.access)) throw forbidden('Demande d’invitation : PMO uniquement');
    const { personId } = parse(z.object({ personId: z.string().min(1) }).strict(), body);
    const person = await this.prisma.person.findFirst({ where: { id: personId, projectId: scope.project.id } });
    if (!person) throw badRequest('Référence invalide', { personId: 'introuvable' });
    const account = await this.prisma.account.findFirst({ where: { OR: [{ personId }, { email: { equals: person.email, mode: 'insensitive' } }] } });
    if (account) return { status: 'ALREADY_HAS_ACCOUNT', accountId: account.id, accountStatus: account.status };
    const pending = await this.prisma.invitationRequest.findFirst({ where: { personId, status: 'PENDING' } });
    if (pending) return pending;
    return this.prisma.$transaction(async (db) => {
      const r = await db.invitationRequest.create({ data: { projectId: scope.project.id, personId, requestedById: actor.accountId } });
      await db.auditEntry.create({ data: { accountId: actor.accountId, actorName: actor.fullName, personId: actor.personId, profileUsed: 'PMO', action: 'Demande d’invitation', target: `${person.firstName} ${person.lastName} · ${scope.project.code}`, entityType: 'InvitationRequest', entityId: r.id, projectId: scope.project.id } });
      return r;
    });
  }

  @Get('invitation-requests')
  async invitationRequests(@CurrentActor() actor: Actor, @Param('projectId') p: string) {
    const scope = await this.access.scope(actor, p);
    if (!canWriteReferential(scope.access) && !scope.access.admin) throw forbidden();
    return this.prisma.invitationRequest.findMany({ where: { projectId: scope.project.id }, orderBy: { createdAt: 'desc' } });
  }
}
