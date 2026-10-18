import { Controller, Get, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AccessService } from './access.service';
import type { Actor } from './auth/auth';
import { CHANGES_ACCESS_REFRESH_MS, CHANGES_PING_MS, changeVisible, ChangesService } from './changes';

// Fichier séparé de `changes.ts` : `prisma.service` importe `changes`, et `AccessService` dépend de Prisma (cycle d'import).

@ApiTags('mises à jour en direct')
@ApiBearerAuth()
@Controller('api')
export class ChangesController {
  constructor(private readonly changes: ChangesService, private readonly access: AccessService) {}

  /** Projets dont l'abonné reçoit les annonces ; `null` pour un administrateur (il voit tous les projets). */
  private async allowed(actor: Actor): Promise<Set<string> | null> {
    if (actor.isAdmin) return null;
    const list = await this.access.accessibleProjects(actor);
    return new Set(list.flatMap(({ project }) => [project.id.toUpperCase(), project.code.toUpperCase()]));
  }

  /**
   * Flux SSE : `{ rev, project, client }` à chaque écriture d'un projet accessible ou de la plateforme (`changeVisible`) ;
   * révision courante à l'ouverture. Tout utilisateur connecté :
   * `/api/changes` pour le Cockpit, `/api/admin/changes` pour la Console (la session par cookie dépend du chemin).
   */
  @Get(['changes', 'admin/changes'])
  async stream(@Req() req: Request, @Res() res: Response) {
    const actor = (req as Request & { actor: Actor }).actor;
    let projects = await this.allowed(actor);
    res.status(200).set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    res.write(`data: ${JSON.stringify({ rev: this.changes.current, project: null, client: null, kind: 'data', hello: true })}\n\n`);
    const off = this.changes.subscribe((e) => { if (changeVisible(e, projects)) res.write(`data: ${JSON.stringify(e)}\n\n`); });
    const ping = setInterval(() => res.write(': ping\n\n'), CHANGES_PING_MS);
    const refresh = projects ? setInterval(() => { this.allowed(actor).then((p) => { projects = p; }, () => {}); }, CHANGES_ACCESS_REFRESH_MS) : null;
    req.on('close', () => { clearInterval(ping); if (refresh) clearInterval(refresh); off(); });
  }
}
