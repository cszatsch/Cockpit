import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Put, Query, Type } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AccessService } from '../../core/access.service';
import { Actor, CurrentActor } from '../../core/auth/auth';
import { parse } from '../../core/http';
import { ReferentialService } from './referential.service';
import { BODIES, EntityConfig, MILESTONES, PHASES, REFERENTIAL_ENTITIES, WORKSTREAMS } from './entities';
import { id as idSchema } from './schemas';

/**
 * Fabrique un contrôleur REST par entité du Référentiel :
 * GET /{entité} · GET /{entité}/{id} · POST · PATCH · DELETE (409 + usages) · GET /{entité}/{id}/usages
 */
function makeController(def: EntityConfig): Type<unknown> {
  @ApiTags(`cockpit · référentiel · ${def.route}`)
  @ApiBearerAuth()
  @Controller(`api/projects/:projectId/${def.route}`)
  class EntityController {
    constructor(readonly svc: ReferentialService, readonly access: AccessService) {}

    @Get()
    async list(@CurrentActor() actor: Actor, @Param('projectId') projectId: string, @Query() query: Record<string, string>) {
      return this.svc.list(def, await this.access.scope(actor, projectId), query);
    }

    @Get(':id')
    async get(@CurrentActor() actor: Actor, @Param('projectId') projectId: string, @Param('id') id: string) {
      return this.svc.get(def, await this.access.scope(actor, projectId), id);
    }

    @Get(':id/usages')
    async usages(@CurrentActor() actor: Actor, @Param('projectId') projectId: string, @Param('id') id: string) {
      return this.svc.usages(def, await this.access.scope(actor, projectId), id);
    }

    @Post()
    async create(@CurrentActor() actor: Actor, @Param('projectId') projectId: string, @Body() body: unknown) {
      return this.svc.create(def, actor, await this.access.scope(actor, projectId), body);
    }

    @Patch(':id')
    async patch(
      @CurrentActor() actor: Actor,
      @Param('projectId') projectId: string,
      @Param('id') id: string,
      @Body() body: unknown,
      @Headers('if-match') ifMatch?: string,
    ) {
      return this.svc.patch(def, actor, await this.access.scope(actor, projectId), id, body, ifMatch);
    }

    @Delete(':id')
    @HttpCode(204)
    async remove(@CurrentActor() actor: Actor, @Param('projectId') projectId: string, @Param('id') id: string, @Headers('if-match') ifMatch?: string) {
      await this.svc.remove(def, actor, await this.access.scope(actor, projectId), id, ifMatch);
    }
  }
  Object.defineProperty(EntityController, 'name', { value: `Ref${def.route.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase())}Controller` });
  return EntityController;
}

const ids = z.array(idSchema);

/** Relations N-N et opérations propres à certaines entités (brief § 9.4). */
@ApiTags('cockpit · référentiel · relations')
@ApiBearerAuth()
@Controller('api/projects/:projectId')
export class ReferentialRelationsController {
  constructor(private readonly svc: ReferentialService, private readonly access: AccessService) {}

  @Put('phases/:id/waves')
  async phaseWaves(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string, @Body() body: unknown) {
    const { waveIds } = parse(z.object({ waveIds: ids }).strict(), body);
    return this.svc.replaceRelation(PHASES, actor, await this.access.scope(actor, p), id, { waveIds });
  }

  @Put('governance-bodies/:id/members')
  async members(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string, @Body() body: unknown) {
    const { members } = parse(
      z.object({ members: z.array(z.object({ personId: idSchema, role: z.enum(['CHAIR', 'MEMBER', 'SECRETARY', 'GUEST']).default('MEMBER') })) }).strict(),
      body,
    );
    return this.svc.replaceRelation(BODIES, actor, await this.access.scope(actor, p), id, { members });
  }

  @Put('workstreams/:id/phases')
  async wsPhases(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string, @Body() body: unknown) {
    const { phaseIds } = parse(z.object({ phaseIds: ids }).strict(), body);
    return this.svc.replaceRelation(WORKSTREAMS, actor, await this.access.scope(actor, p), id, { phaseIds });
  }

  /** Sous-phases d'un chantier (06/10/2026) : chacune appartient à l'une de ses phases. */
  @Put('workstreams/:id/subphases')
  async wsSubphases(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string, @Body() body: unknown) {
    const { subphaseIds } = parse(z.object({ subphaseIds: ids }).strict(), body);
    return this.svc.replaceRelation(WORKSTREAMS, actor, await this.access.scope(actor, p), id, { subphaseIds });
  }

  @Put('workstreams/:id/waves')
  async wsWaves(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string, @Body() body: unknown) {
    const { waveIds } = parse(z.object({ waveIds: ids }).strict(), body);
    return this.svc.replaceRelation(WORKSTREAMS, actor, await this.access.scope(actor, p), id, { waveIds });
  }

  @Put('workstreams/:id/dependencies')
  async wsDeps(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string, @Body() body: unknown) {
    const { dependsOn } = parse(z.object({ dependsOn: z.union([z.literal('ALL'), ids]) }).strict(), body);
    return this.svc.replaceRelation(WORKSTREAMS, actor, await this.access.scope(actor, p), id, { dependsOn });
  }

  /** Q8 : dates d'une phase propres à un lot. */
  @Put('phases/:id/waves/:waveId/dates')
  async phaseWaveDates(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string, @Param('waveId') waveId: string, @Body() body: unknown) {
    const scope = await this.access.scope(actor, p);
    this.svc.assertWrite(scope);
    const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
    const input = parse(
      z.object({ startDate: iso.nullable(), endDate: iso.nullable(), startPrecision: z.enum(['D', 'M', 'Y']).optional(), endPrecision: z.enum(['D', 'M', 'Y']).optional() }).strict(),
      body,
    );
    const phase = await this.svc.findRow(PHASES, scope, id);
    if (!phase.waves.some((w: any) => w.waveId === waveId)) {
      await this.svc.replaceRelation(PHASES, actor, scope, id, { waveIds: [...phase.waves.map((w: any) => w.waveId), waveId] });
    }
    await this.svc.prisma.$transaction(async (tx) => {
      const before = await tx.phaseWave.findUniqueOrThrow({ where: { phaseId_waveId: { phaseId: id, waveId } } });
      const after = await tx.phaseWave.update({
        where: { phaseId_waveId: { phaseId: id, waveId } },
        data: { startDate: input.startDate, endDate: input.endDate, startPrec: input.startPrecision ?? 'D', endPrec: input.endPrecision ?? 'D' },
      });
      await this.svc.audit.record(tx, this.svc.writeCtx(actor, scope), { entityType: 'PHASE_WAVE', entityId: `${id}/${waveId}`, before, after, target: `${phase.code} · ${waveId}` });
    });
    return this.svc.get(PHASES, scope, id);
  }

  /** Confirmer un jalon : confirmedAt = maintenant (§ 9.4). */
  @Post('milestones/:id/confirm')
  @HttpCode(200)
  async confirm(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string) {
    const scope = await this.access.scope(actor, p);
    this.svc.assertWrite(scope);
    await this.svc.prisma.$transaction(async (tx) => {
      const before = await this.svc.findRow(MILESTONES, scope, id, tx);
      const after = await tx.milestone.update({ where: { id }, data: { confirmedAt: new Date(), version: { increment: 1 } } });
      await this.svc.audit.record(tx, this.svc.writeCtx(actor, scope), { entityType: 'MILESTONE', entityId: id, before: { confirmedAt: before.confirmedAt }, after: { confirmedAt: after.confirmedAt }, wsId: after.wsId, action: 'Confirmation', target: `${after.code} · ${after.n}` });
    });
    return this.svc.get(MILESTONES, scope, id);
  }
}

export const REFERENTIAL_CONTROLLERS = [ReferentialRelationsController, ...REFERENTIAL_ENTITIES.map(makeController)];
