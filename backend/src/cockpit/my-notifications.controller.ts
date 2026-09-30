import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Actor, CurrentActor } from '../core/auth/auth';
import { notFound } from '../core/errors';
import { PrismaService } from '../core/prisma.service';

/** Notifications affichées dans le tiroir : les plus récentes. */
export const MY_NOTIFICATIONS_LIMIT = 50;

/**
 * Notifications de l'utilisateur connecté dans le Cockpit (cloche de la barre latérale et tiroir) : alertes et
 * notifications des règles envoyées par le canal « Dans l'application ». Chacun ne lit que les siennes.
 */
@ApiTags('cockpit · mes notifications')
@ApiBearerAuth()
@Controller('api/me/notifications')
export class MyNotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  /** `{ unread, items }` ; `unreadOnly=true` : non lues seulement. */
  @Get()
  async list(@CurrentActor() actor: Actor, @Query('unreadOnly') unreadOnly?: string) {
    const where = { accountId: actor.accountId, ...(unreadOnly === 'true' ? { readAt: null } : {}) };
    const [rows, unread] = await Promise.all([
      this.prisma.userNotification.findMany({ where, orderBy: { createdAt: 'desc' }, take: MY_NOTIFICATIONS_LIMIT }),
      this.prisma.userNotification.count({ where: { accountId: actor.accountId, readAt: null } }),
    ]);
    const codes = new Map((await this.prisma.project.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.projectId).filter((x): x is string => !!x))] } }, select: { id: true, code: true } })).map((p) => [p.id, p.code]));
    return {
      unread,
      items: rows.map((r) => ({ id: r.id, title: r.title, body: r.body, project: r.projectId ? codes.get(r.projectId) ?? null : null, at: r.createdAt.toISOString(), read: !!r.readAt })),
    };
  }

  @Post(':id/read')
  @HttpCode(204)
  async read(@CurrentActor() actor: Actor, @Param('id') id: string) {
    const r = await this.prisma.userNotification.updateMany({ where: { id, accountId: actor.accountId, readAt: null }, data: { readAt: new Date() } });
    if (!r.count && !(await this.prisma.userNotification.findFirst({ where: { id, accountId: actor.accountId } }))) throw notFound('Notification introuvable');
  }

  @Post('read-all')
  @HttpCode(204)
  async readAll(@CurrentActor() actor: Actor) {
    await this.prisma.userNotification.updateMany({ where: { accountId: actor.accountId, readAt: null }, data: { readAt: new Date() } });
  }
}
