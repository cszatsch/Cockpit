import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AccessService } from '../core/access.service';
import { Actor, AdminOnly, CurrentActor } from '../core/auth/auth';
import { badRequest, conflict, notFound } from '../core/errors';
import { PrismaService } from '../core/prisma.service';
import { parse } from '../core/http';
import { AUDIENCE_PRIORITY, AudienceProfile, memberScope, PROFILE_LABELS, toUiRule } from '../domain/notification-rules';

const Subscription = z.object({ subscribed: z.boolean() }).strict();

/** S'abonner à une règle ou s'en désabonner (Cockpit et Console) ; règle obligatoire : 409 `MANDATORY_RULE`. */
async function setSubscription(prisma: PrismaService, accountId: string, id: string, body: unknown) {
  const { subscribed } = parse(Subscription, body);
  const rule = await prisma.notificationRule.findUnique({ where: { id } });
  if (!rule) throw notFound('Notification introuvable');
  if (!subscribed && rule.mandatory) throw conflict('MANDATORY_RULE', 'Notification obligatoire : elle ne peut pas être désactivée');
  if (subscribed) await prisma.notificationOptOut.deleteMany({ where: { accountId, ruleId: id } });
  else await prisma.notificationOptOut.upsert({ where: { accountId_ruleId: { accountId, ruleId: id } }, create: { accountId, ruleId: id }, update: {} });
  return { id, subscribed: rule.mandatory || subscribed };
}

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
  set(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() body: unknown) {
    return setSubscription(this.prisma, actor.accountId, id, body);
  }
}

/**
 * Mes notifications dans la Console (12/10/2026, « Mon profil › Notifications ») : les règles actives qui visent le profil
 * Admin, avec leurs projets (tous ou la liste) ; même désabonnement que dans le Cockpit (une règle obligatoire ne se
 * désactive pas). Remplace les anciens interrupteurs génériques, qu'aucun envoi ne lisait.
 */
@ApiTags('console · mes notifications')
@ApiBearerAuth()
@AdminOnly()
@Controller('api/admin/me/notification-rules')
export class AdminMyNotificationRulesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@CurrentActor() actor: Actor) {
    const rules = (await this.prisma.notificationRule.findMany({ where: { enabled: true }, orderBy: { createdAt: 'asc' } })).filter((r) => r.targetProfiles.includes('admin'));
    const out = new Set((await this.prisma.notificationOptOut.findMany({ where: { accountId: actor.accountId, ruleId: { in: rules.map((r) => r.id) } } })).map((o) => o.ruleId));
    return rules.map((r) => {
      const ui = toUiRule(r, new Set([r.modelId]));
      return { id: r.id, name: r.name, freq: ui.freq, at: ui.at, channels: ui.canaux, profile: PROFILE_LABELS.admin, projects: r.platform ? '*' : r.projectIds, mandatory: r.mandatory, subscribed: r.mandatory || !out.has(r.id) };
    });
  }

  @Put(':id')
  set(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() body: unknown) {
    return setSubscription(this.prisma, actor.accountId, id, body);
  }
}
