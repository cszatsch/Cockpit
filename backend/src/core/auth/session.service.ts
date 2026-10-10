import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Account, AuthSession } from '@prisma/client';
import { config } from '../config';
import { PrismaService } from '../prisma.service';
import { IDLE_MINUTES, SERVER_IDLE_GRACE_MINUTES, Surface } from './policy';

/** Cookie de session (HttpOnly), un par surface : une connexion à la Console n'ouvre pas le Cockpit, et inversement. */
export const SESSION_COOKIE: Record<Surface, string> = { APP: 'rise_session', ADMIN: 'rise_admin_session' };
/** Cookie anti-CSRF lisible par la page (double soumission) : sa valeur est renvoyée dans l'en-tête `X-CSRF-Token`. */
export const CSRF_COOKIE: Record<Surface, string> = { APP: 'rise_csrf', ADMIN: 'rise_admin_csrf' };
export const CSRF_HEADER = 'x-csrf-token';
/** En-tête par lequel une page désigne sa surface (`admin` pour la Console). */
export const SURFACE_HEADER = 'x-rise-surface';

export interface JwtPayload {
  sub: string;
  sid: string;
  /** Rang de rotation (jetons des cookies uniquement) : un jeton renouvelé invalide le précédent. */
  rot?: number;
}

export type SessionFailure = 'SESSION_EXPIRED' | 'SESSION_CLOSED' | 'INVALID_TOKEN' | 'ACCOUNT_INACTIVE';

export interface ResolvedSession {
  session: AuthSession;
  account: Account;
  isAdmin: boolean;
  /** Super Admin (10/10/2026). */
  isSuperAdmin: boolean;
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const k = part.slice(0, i).trim();
    if (!(k in out)) {
      try {
        out[k] = decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        out[k] = part.slice(i + 1).trim();
      }
    }
  }
  return out;
}

/** Surface d'une requête : en-tête `X-Rise-Surface`, sinon `/api/admin/…` → Console, sinon Cockpit. */
export function surfaceOf(req: { headers: Record<string, any>; path?: string; url?: string }): Surface {
  const h = String(req.headers[SURFACE_HEADER] ?? '').toLowerCase();
  if (h === 'admin') return 'ADMIN';
  if (h === 'app') return 'APP';
  return String(req.path ?? req.url ?? '').startsWith('/api/admin') ? 'ADMIN' : 'APP';
}

/** Jeton anti-CSRF lié à la session : HMAC de son identifiant (rien à stocker). */
export function csrfFor(sessionId: string): string {
  return createHmac('sha256', config.jwtSecret).update('csrf:' + sessionId).digest('base64url');
}

export function csrfMatches(sessionId: string, value: unknown): boolean {
  if (typeof value !== 'string' || !value) return false;
  const a = Buffer.from(csrfFor(sessionId));
  const b = Buffer.from(value);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Inactivité tolérée par le serveur pour une session (null : session de développement, sans limite). */
export function idleLimitMs(surface: string | null): number | null {
  if (surface !== 'APP' && surface !== 'ADMIN') return null;
  return (IDLE_MINUTES[surface] + SERVER_IDLE_GRACE_MINUTES) * 60_000;
}

/**
 * Sessions de connexion : émission, renouvellement (rotation du jeton), résolution et cookies.
 * Le jeton est un JWT `{ sub, sid, rot }` signé ; la session en base fait foi (révocation, inactivité).
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /** Ouvre une session et pose ses cookies. */
  async open(res: any, account: Account, surface: Surface, opts: { restricted: boolean; device: string; ip: string | null }): Promise<AuthSession> {
    const session = await this.prisma.authSession.create({
      data: { accountId: account.id, surface, restricted: opts.restricted, device: opts.device.slice(0, 120), location: opts.ip },
    });
    await this.setCookies(res, session);
    return session;
  }

  /** Renouvelle le jeton (rotation) et l'horodatage d'activité, puis repose les cookies. */
  async rotate(res: any, session: AuthSession, data: { restricted?: boolean } = {}): Promise<AuthSession> {
    const next = await this.prisma.authSession.update({
      where: { id: session.id },
      data: { ...data, rotation: { increment: 1 }, lastSeenAt: new Date() },
    });
    await this.setCookies(res, next);
    return next;
  }

  async setCookies(res: any, session: AuthSession): Promise<void> {
    const surface = session.surface as Surface;
    const token = await this.jwt.signAsync({ sub: session.accountId, sid: session.id, rot: session.rotation } satisfies JwtPayload);
    const base = { secure: config.cookieSecure, sameSite: 'strict' as const, path: '/' };
    res.cookie(SESSION_COOKIE[surface], token, { ...base, httpOnly: true });
    res.cookie(CSRF_COOKIE[surface], csrfFor(session.id), { ...base, httpOnly: false });
  }

  clearCookies(res: any, surface: Surface): void {
    const base = { secure: config.cookieSecure, sameSite: 'strict' as const, path: '/' };
    res.clearCookie(SESSION_COOKIE[surface], { ...base, httpOnly: true });
    res.clearCookie(CSRF_COOKIE[surface], base);
  }

  cookieToken(req: { headers: Record<string, any> }, surface: Surface): string | null {
    return parseCookies(req.headers.cookie)[SESSION_COOKIE[surface]] || null;
  }

  /**
   * Vérifie un jeton : signature, session ouverte, rotation courante (cookies), inactivité, statut du compte.
   * Une session inactive trop longtemps est fermée en base.
   */
  async resolve(token: string, fromCookie: boolean): Promise<ResolvedSession | SessionFailure> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      return 'INVALID_TOKEN';
    }
    const session = await this.prisma.authSession.findUnique({ where: { id: payload.sid } });
    if (!session || session.revokedAt || session.accountId !== payload.sub) return 'SESSION_CLOSED';
    if (fromCookie && payload.rot !== session.rotation) return 'SESSION_CLOSED';
    const limit = idleLimitMs(session.surface);
    if (limit !== null && Date.now() - session.lastSeenAt.getTime() > limit) {
      await this.prisma.authSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
      return 'SESSION_EXPIRED';
    }
    const account = await this.prisma.account.findUnique({ where: { id: payload.sub } });
    if (!account || account.status !== 'ACTIVE') return 'ACCOUNT_INACTIVE';
    const grant = await this.prisma.adminGrant.findUnique({ where: { accountId: account.id } });
    return { session, account, isAdmin: !!grant, isSuperAdmin: !!grant?.superAdmin };
  }

  /** Session d'une surface portée par les cookies d'une requête (pages servies par le serveur). */
  async fromCookies(req: { headers: Record<string, any> }, surface: Surface): Promise<ResolvedSession | null> {
    const token = this.cookieToken(req, surface);
    if (!token) return null;
    const r = await this.resolve(token, true);
    return typeof r === 'string' || r.session.surface !== surface ? null : r;
  }
}
