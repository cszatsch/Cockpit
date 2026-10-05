import { CallHandler, Controller, ExecutionContext, Get, Injectable, NestInterceptor, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

/**
 * Mises à jour en direct (05/10/2026) : chaque écriture réussie de l'API (POST, PUT, PATCH, DELETE) incrémente une
 * révision annoncée sur `GET /api/changes` (SSE) ; les écrans ouverts (Console et Cockpit, autres onglets, autres
 * utilisateurs) relisent alors leurs données sans rechargement manuel. L'écran auteur de l'écriture se reconnaît à son
 * en-tête `X-Client-Id` et ignore sa propre annonce (il a déjà relu).
 */

/** Écritures qui ne changent pas les données affichées (connexion, préférences, lectures de notification, échanges avec Jev, aperçus). */
export const CHANGES_IGNORED = [
  /^\/api\/auth\//,
  /^\/api\/me\//,
  /\/assistant\//,
  /^\/api\/widgets\//,
  /\/(preview|preview-jobs|check)(\/|$)/,
  /\/report-previews\//,
  /\/report-template-draft/,
  /^\/api\/ai\/latency/,
];
/** Intervalle du signal de vie du flux (proxys et navigateurs ferment les connexions muettes). */
export const CHANGES_PING_MS = 25_000;
export const CLIENT_ID_HEADER = 'x-client-id';

export interface ChangeEvent {
  rev: number;
  /** Projet concerné (`/api/projects/:id/…`), null pour une écriture de la plateforme (Console). */
  project: string | null;
  /** Écran à l'origine de l'écriture. */
  client: string | null;
}

@Injectable()
export class ChangesService {
  private rev = 0;
  private readonly listeners = new Set<(e: ChangeEvent) => void>();

  get current() {
    return this.rev;
  }

  publish(project: string | null, client: string | null) {
    const e: ChangeEvent = { rev: ++this.rev, project, client };
    for (const l of this.listeners) l(e);
  }

  subscribe(l: (e: ChangeEvent) => void) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}

/** Annonce les écritures réussies (après la réponse du contrôleur, jamais en cas d'erreur). */
@Injectable()
export class ChangesInterceptor implements NestInterceptor {
  constructor(private readonly changes: ChangesService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest<Request>();
    const path = (req.originalUrl || req.url || '').split('?')[0];
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS' || !path.startsWith('/api/') || CHANGES_IGNORED.some((r) => r.test(path))) return next.handle();
    const project = /^\/api\/projects\/([^/]+)/.exec(path)?.[1] ?? null;
    const client = String(req.headers[CLIENT_ID_HEADER] ?? '').slice(0, 64) || null;
    return next.handle().pipe(tap({ complete: () => this.changes.publish(project ? decodeURIComponent(project) : null, client) }));
  }
}

@ApiTags('mises à jour en direct')
@ApiBearerAuth()
@Controller('api')
export class ChangesController {
  constructor(private readonly changes: ChangesService) {}

  /**
   * Flux SSE : `{ rev, project, client }` à chaque écriture ; révision courante à l'ouverture. Tout utilisateur connecté :
   * `/api/changes` pour le Cockpit, `/api/admin/changes` pour la Console (la session par cookie dépend du chemin).
   */
  @Get(['changes', 'admin/changes'])
  stream(@Req() req: Request, @Res() res: Response) {
    res.status(200).set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    res.write(`data: ${JSON.stringify({ rev: this.changes.current, project: null, client: null, hello: true })}\n\n`);
    const off = this.changes.subscribe((e) => res.write(`data: ${JSON.stringify(e)}\n\n`));
    const ping = setInterval(() => res.write(': ping\n\n'), CHANGES_PING_MS);
    req.on('close', () => { clearInterval(ping); off(); });
  }
}
