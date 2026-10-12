import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AccessService } from '../core/access.service';
import { Actor, CurrentActor } from '../core/auth/auth';
import { badRequest, conflict, notFound } from '../core/errors';
import { PrismaService } from '../core/prisma.service';
import { parse } from '../core/http';
import { AUDIENCE_PRIORITY, AudienceProfile, memberScope, PROFILE_LABELS, toUiRule } from '../domain/notification-rules';

const Subscription = z.object({ subscribed: z.boolean() }).strict();

/**
 * Mes notifications (12/10/2026, « Mon profil › Notifications » du Cockpit) : les règles de la Console qui me visent sur
 * un projet — actives, ciblant ce projet (ou tous les projets) et un profil que j'y détiens —, avec le profil et le
 * périmètre sous lesquels je les reçois, et mon abonnement. Se désabonner d'une règle m'exclut de ses envois ; une règle
 * obligatoire ne se désactive pas (409).
 */
@ApiTags('cockpit · mes notifications')
@ApiBearerAuth()
@Controller('api/me/notification-rules')
export class MyNotificationRulesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  /** `project` : code ou identifiant du projet ouvert. */
  @Get()
  async list(@CurrentActor() actor: Actor, @Query('project') project?: string) {
    if (!project) throw badRequest('Projet manquant', { project: 'code du projet attendu' });
    const { project: p, access } = await this.access.scope(actor, project);
    const held: Record<AudienceProfile, boolean> = { admin: access.admin, pmo: access.pmo, resp: access.responsable.length > 0, lec: access.lecteur.length > 0 };
    const rules = (await this.prisma.notificationRule.findMany({ where: { enabled: true }, orderBy: { createdAt: 'asc' } })).filter(
      (r) => (r.platform || r.projectIds.includes(p.code) || r.projectIds.includes(p.id)) && r.targetProfiles.some((x) => held[x as AudienceProfile]),
    );
    const out = new Set((await this.prisma.notificationOptOut.findMany({ where: { accountId: actor.accountId, ruleId: { in: rules.map((r) => r.id) } } })).map((o) => o.ruleId));
    const ws = new Map((await this.prisma.workstream.findMany({ where: { projectId: p.id }, select: { id: true, code: true, name: true } })).map((w) => [w.id, w]));
    return rules.map((r) => {
      // Profil de réception : le plus fort parmi ceux que vise la règle (comme le moteur d'envoi).
      const profile = AUDIENCE_PRIORITY.find((x) => r.targetProfiles.includes(x) && held[x])!;
      const scope = memberScope(profile, access);
      const ui = toUiRule(r, new Set([r.modelId]));
      return {
        id: r.id,
        name: r.name,
        freq: ui.freq,
        at: ui.at,
        channels: ui.canaux,
        profile: PROFILE_LABELS[profile],
        scope: scope === '*' ? '*' : scope.map((id) => ws.get(id)?.code ?? id),
        scopeNames: scope === '*' ? [] : scope.map((id) => ws.get(id)?.name ?? id),
        mandatory: r.mandatory,
        subscribed: r.mandatory || !out.has(r.id),
      };
    });
  }

  @Put(':id')
  async set(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() body: unknown) {
    const { subscribed } = parse(Subscription, body);
    const rule = await this.prisma.notificationRule.findUnique({ where: { id } });
    if (!rule) throw notFound('Notification introuvable');
    if (!subscribed && rule.mandatory) throw conflict('MANDATORY_RULE', 'Notification obligatoire : elle ne peut pas être désactivée');
    const key = { accountId_ruleId: { accountId: actor.accountId, ruleId: id } };
    if (subscribed) await this.prisma.notificationOptOut.deleteMany({ where: { accountId: actor.accountId, ruleId: id } });
    else await this.prisma.notificationOptOut.upsert({ where: key, create: { accountId: actor.accountId, ruleId: id }, update: {} });
    return { id, subscribed: rule.mandatory || subscribed };
  }
}
