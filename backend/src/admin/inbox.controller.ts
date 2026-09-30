import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AdminOnly, Actor, CurrentActor } from '../core/auth/auth';
import { parse } from '../core/http';
import { InboxService } from './inbox.service';

/** Notifications de l'administrateur (spécification NOTIFICATIONS § 5). */
@ApiTags('console · notifications')
@ApiBearerAuth()
@AdminOnly()
@Controller('api/admin/notifications')
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  /** Liste (incidents, alertes, demandes) + `unreadCount`, `hasError`, `pendingInvitations`. */
  @Get()
  list() {
    return this.inbox.list();
  }

  @Post('read-all')
  @HttpCode(200)
  readAll() {
    return this.inbox.readAll();
  }

  /** Efface les incidents et alertes du tiroir (les demandes en attente restent). `{ cleared, keptRequests }`. */
  @Delete()
  @HttpCode(200)
  clearAll(@CurrentActor() actor: Actor) {
    return this.inbox.clearAll(actor);
  }

  @Post(':id/read')
  @HttpCode(204)
  async read(@Param('id') id: string) {
    await this.inbox.read(id);
  }

  /** `{ decision: 'accept' | 'refuse' }` : exécutée après 10 s, annulable d'ici là. */
  @Post(':id/decision')
  @HttpCode(200)
  decide(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() body: unknown) {
    const { decision } = parse(z.object({ decision: z.enum(['accept', 'refuse']) }).strict(), body);
    return this.inbox.decide(actor, id, decision);
  }

  @Post(':id/undo')
  @HttpCode(200)
  undo(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.inbox.undo(actor, id);
  }
}
