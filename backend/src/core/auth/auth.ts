import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiError, forbidden, unauthorized } from '../errors';
import { PrismaService } from '../prisma.service';
import { Surface } from './policy';
import { CSRF_HEADER, csrfMatches, SessionFailure, SessionService, surfaceOf } from './session.service';

/** Utilisateur authentifié (compte d'accès). */
export interface Actor {
  accountId: string;
  sessionId: string;
  email: string;
  fullName: string;
  personId: string | null;
  isAdmin: boolean;
  /** Surface de la session (null : jeton de développement). */
  surface: Surface | null;
  /** Session limitée au changement de mot de passe obligatoire. */
  restricted: boolean;
  /** Jeton porté par un cookie (et non par l'en-tête `Authorization`). */
  viaCookie: boolean;
}

const PUBLIC_KEY = 'rise:public';
/** Route accessible sans jeton. */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

const ADMIN_KEY = 'rise:admin';
/** Route réservée au profil ADMIN (console, RG1/RG7). */
export const AdminOnly = () => SetMetadata(ADMIN_KEY, true);

const RESTRICTED_KEY = 'rise:restricted';
/** Route ouverte à une session limitée (première connexion : changement de mot de passe, déconnexion). */
export const AllowRestricted = () => SetMetadata(RESTRICTED_KEY, true);

export const CurrentActor = createParamDecorator((_: unknown, ctx: ExecutionContext): Actor => {
  return ctx.switchToHttp().getRequest().actor;
});

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const FAILURE_MESSAGES: Record<SessionFailure, string> = {
  SESSION_EXPIRED: 'Session expirée après une période d’inactivité',
  SESSION_CLOSED: 'Session fermée',
  INVALID_TOKEN: 'Jeton invalide ou expiré',
  ACCOUNT_INACTIVE: 'Compte inactif ou suspendu',
};

/**
 * Garde globale. Le jeton vient de l'en-tête `Authorization: Bearer` (API, tests, connexion de
 * développement) ou du cookie de session de la surface (écrans). Sont vérifiés : la session (ouverte,
 * rotation courante, inactivité), le statut du compte, le jeton anti-CSRF des écritures par cookie,
 * la limitation « première connexion » et, pour la Console, le droit d'administration.
 * Un compte suspendu perd immédiatement l'accès (brief Console § 7.1).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    const bearer = header?.startsWith('Bearer ') ? header.slice(7) : (req.query?.access_token as string | undefined);
    const surface = surfaceOf(req);
    const token = bearer || this.sessions.cookieToken(req, surface);
    if (!token) throw unauthorized();
    const viaCookie = !bearer;
    const r = await this.sessions.resolve(token, viaCookie);
    if (typeof r === 'string') throw new ApiError(401, r === 'SESSION_EXPIRED' ? 'SESSION_EXPIRED' : 'UNAUTHENTICATED', FAILURE_MESSAGES[r]);
    const { session, account, isAdmin } = r;
    if (viaCookie && session.surface !== surface) throw unauthorized('Session fermée');
    if (viaCookie && !SAFE_METHODS.has(req.method) && !csrfMatches(session.id, req.headers[CSRF_HEADER])) {
      throw new ApiError(403, 'CSRF', 'Jeton anti-CSRF absent ou invalide ; rechargez la page');
    }
    if (session.restricted && !this.reflector.getAllAndOverride<boolean>(RESTRICTED_KEY, targets)) {
      throw new ApiError(403, 'PASSWORD_CHANGE_REQUIRED', 'Changement du mot de passe provisoire requis');
    }
    const actor: Actor = {
      accountId: account.id,
      sessionId: session.id,
      email: account.email,
      fullName: account.fullName,
      personId: account.personId,
      isAdmin,
      surface: (session.surface as Surface | null) ?? null,
      restricted: session.restricted,
      viaCookie,
    };
    req.actor = actor;
    // Mise à jour de l'activité, au plus une fois par minute.
    if (Date.now() - session.lastSeenAt.getTime() > 60_000) {
      await this.prisma.authSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
    }
    if (this.reflector.getAllAndOverride<boolean>(ADMIN_KEY, targets) && !actor.isAdmin) {
      throw forbidden('Console réservée aux administrateurs');
    }
    return true;
  }
}
