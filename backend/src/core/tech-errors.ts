import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';

/**
 * Erreurs techniques (5xx hors erreurs métier) remontées aux notifications de l'administrateur
 * (spécification NOTIFICATIONS § 1 : « toute erreur technique »). Le filtre d'erreurs signale l'échec d'une
 * route ; l'intercepteur signale sa réussite suivante, qui ferme l'incident. Les écouteurs sont branchés
 * par le service des notifications (aucun couplage du socle vers la console).
 */
export const techErrors = {
  /** Routes en échec connues (clé « MÉTHODE /route ») : évite une requête en base à chaque succès. */
  open: new Set<string>(),
  onError: null as null | ((key: string, message: string) => void),
  onRecovered: null as null | ((key: string) => void),
};

/** Clé d'une route : méthode et chemin déclaré (paramètres non remplacés). */
export function routeKey(req: { method?: string; route?: { path?: string }; originalUrl?: string; url?: string }): string {
  return `${req.method ?? 'GET'} ${req.route?.path ?? (req.originalUrl ?? req.url ?? '').split('?')[0]}`;
}

@Injectable()
export class TechRecoveryInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    return next.handle().pipe(
      tap(() => {
        if (!techErrors.open.size) return;
        const key = routeKey(req);
        if (techErrors.open.has(key)) {
          techErrors.open.delete(key);
          techErrors.onRecovered?.(key);
        }
      }),
    );
  }
}
