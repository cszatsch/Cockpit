import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { ZodSchema, z } from 'zod';
import { badRequest, preconditionFailed, zodFields } from './errors';

/** Valide un corps de requête avec un schéma zod (400 + champs en erreur). */
export function parse<T extends ZodSchema>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input ?? {});
  if (!r.success) throw badRequest('Données invalides', zodFields(r.error));
  return r.data;
}

/**
 * Verrouillage optimiste : si l'en-tête `If-Match` est présent, il doit correspondre à la version
 * courante (`W/"<n>"`, `"<n>"` ou `<n>`), sinon 412.
 */
export function checkIfMatch(ifMatch: string | undefined, currentVersion: number): void {
  if (!ifMatch || ifMatch === '*') return;
  const n = Number(ifMatch.replace(/^W\//, '').replace(/"/g, ''));
  if (!Number.isFinite(n) || n !== currentVersion) throw preconditionFailed();
}

/** Ajoute l'en-tête ETag quand la réponse est un objet versionné. */
@Injectable()
export class EtagInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((body) => {
        const v = body && typeof body === 'object' && !Array.isArray(body) ? (body as any).version ?? (body as any).rowVersion : undefined;
        if (typeof v === 'number') ctx.switchToHttp().getResponse().setHeader('ETag', `W/"${v}"`);
        return body;
      }),
    );
  }
}

/** Attache des avertissements non bloquants à une réponse (`200` + `warnings[]`). */
export function withWarnings<T extends object>(obj: T, warnings: string[]): T & { warnings?: string[] } {
  return warnings.length ? { ...obj, warnings } : obj;
}
