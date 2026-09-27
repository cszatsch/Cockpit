import { Body, Controller, Get, HttpCode, Post, Query, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { Account } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit.service';
import { Actor, AllowRestricted, CurrentActor, Public } from './auth';
import { config } from '../config';
import { ApiError, ApiErrorWithBody, badRequest, notFound, unauthorized } from '../errors';
import { parse } from '../http';
import { CredentialsService, selfCtx } from './credentials.service';
import { passwordProblem, verifyPassword } from './password';
import {
  EMAIL_RE,
  FORGOT_NEUTRAL,
  IDLE_MINUTES,
  IDLE_WARNING_SECONDS,
  INVALID_CREDENTIALS,
  LOGIN_MIN_MS,
  PASSWORD_MAX_LENGTH,
  Surface,
} from './policy';
import { SessionService } from './session.service';

const DevLogin = z
  .object({
    personId: z.string().optional(),
    accountId: z.string().optional(),
    email: z.string().optional(),
  })
  .refine((v) => v.personId || v.accountId || v.email, { message: 'personId, accountId ou email requis' });

const SURFACE = z
  .enum(['app', 'admin', 'APP', 'ADMIN'])
  .default('app')
  .transform((s) => s.toUpperCase() as Surface);
const EMAIL = z
  .string({ required_error: 'Saisissez votre adresse e-mail.' })
  .trim()
  .toLowerCase()
  .max(254)
  .regex(EMAIL_RE, 'Format attendu : prenom.nom@entreprise.com');

const Login = z.object({ email: EMAIL, password: z.string().min(1, 'Saisissez votre mot de passe.').max(PASSWORD_MAX_LENGTH * 4), surface: SURFACE });
const Forgot = z.object({ email: EMAIL, surface: SURFACE });
const Reset = z.object({ token: z.string().min(1).max(200), password: z.string().min(1) });
const ChangePassword = z.object({ currentPassword: z.string().optional(), password: z.string().min(1) });

/** Page d'arrivée et écran de connexion de chaque surface. */
export const HOME: Record<Surface, string> = { APP: '/', ADMIN: '/console' };
export const LOGIN_PAGE: Record<Surface, string> = { APP: '/connexion', ADMIN: '/console/connexion' };

const PROFILE_LABEL: Record<string, string> = { PMO: 'PMO', RESPONSABLE: 'Responsable', LECTEUR: 'Lecteur' };

/**
 * Authentification par adresse e-mail et mot de passe (spécification AUTH).
 * Aucune route d'inscription : les comptes sont créés depuis la Console (Utilisateurs).
 * `dev-login` délivre un jeton sans mot de passe, uniquement si `AUTH_DEV=true` (tests, développement).
 */
@ApiTags('auth')
@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly sessions: SessionService,
    private readonly creds: CredentialsService,
    private readonly audit: AuditService,
  ) {}

  /** Identité affichée par les écrans de connexion : prénom et rôles. */
  private async userView(a: Account, isAdmin: boolean) {
    const habs = await this.prisma.habilitation.findMany({
      where: { OR: [{ accountId: a.id }, ...(a.personId ? [{ personId: a.personId }] : [])], profile: { not: 'ADMIN' } },
      select: { profile: true },
    });
    const best = ['PMO', 'RESPONSABLE', 'LECTEUR'].find((p) => habs.some((h) => h.profile === p));
    const roles = [...(isAdmin ? ['Administrateur'] : []), ...(best ? [PROFILE_LABEL[best]] : [])];
    return {
      email: a.email, fullName: a.fullName, firstName: a.fullName.split(/\s+/)[0], roleLabel: roles.join(' · '), isAdmin,
      passwordChangedAt: a.passwordChangedAt?.toISOString() ?? null,
    };
  }

  @Public()
  @Post('dev-login')
  @HttpCode(200)
  async devLogin(@Body() body: unknown, @Req() req: any) {
    if (!config.authDev) throw notFound();
    const input = parse(DevLogin, body);
    const account = input.accountId
      ? await this.prisma.account.findUnique({ where: { id: input.accountId } })
      : input.personId
        ? await this.prisma.account.findFirst({ where: { personId: input.personId } })
        : await this.prisma.account.findUnique({ where: { email: input.email!.toLowerCase() } });
    if (!account) throw unauthorized('Compte inconnu');
    if (account.status !== 'ACTIVE') throw unauthorized('Compte inactif ou suspendu');
    const session = await this.prisma.authSession.create({
      data: {
        accountId: account.id,
        device: String(req.headers['user-agent'] ?? 'inconnu').slice(0, 120),
        location: req.ip ?? null,
      },
    });
    await this.prisma.account.update({ where: { id: account.id }, data: { lastLoginAt: new Date() } });
    const token = await this.jwt.signAsync({ sub: account.id, sid: session.id });
    return { token, accountId: account.id, personId: account.personId, sessionId: session.id };
  }

  /**
   * Connexion. Échec : 401 générique avec le nombre de tentatives restantes ; blocage : 423 `retryAfter`
   * (même réponse pour une adresse inconnue). Console demandée par un compte sans droit d'administration :
   * 403 après authentification, tentative journalisée. Mot de passe provisoire : session limitée.
   */
  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Req() req: any, @Res({ passthrough: true }) res: any) {
    const input = parse(Login, body);
    const started = Date.now();
    try {
      const out = await this.creds.checkLogin(input.email, input.password, req.ip ?? 'inconnue');
      if (out.kind === 'locked') {
        throw new ApiErrorWithBody(423, {
          code: 'ACCOUNT_LOCKED',
          message: 'Trop de tentatives infructueuses : connexion suspendue temporairement',
          retryAfter: out.retryAfter,
        });
      }
      if (out.kind === 'invalid') {
        throw new ApiErrorWithBody(401, { code: 'INVALID_CREDENTIALS', message: INVALID_CREDENTIALS, remaining: out.remaining });
      }
      const { account, isAdmin } = out;
      if (input.surface === 'ADMIN' && !isAdmin) {
        await this.audit.action(this.prisma, selfCtx(account), {
          action: 'Tentative d’accès à la console refusée', target: account.fullName, severity: 'SENSITIVE',
          entityType: 'Account', entityId: account.id, details: { ip: req.ip ?? null },
        });
        throw new ApiError(403, 'ADMIN_REQUIRED', 'Ce compte ne dispose pas des droits d’administration');
      }
      const session = await this.sessions.open(res, account, input.surface, {
        restricted: account.mustChangePassword,
        device: String(req.headers['user-agent'] ?? 'inconnu'),
        ip: req.ip ?? null,
      });
      await this.prisma.account.update({ where: { id: account.id }, data: { lastLoginAt: new Date() } });
      return {
        mustChangePassword: session.restricted,
        user: await this.userView(account, isAdmin),
        idleMinutes: IDLE_MINUTES[input.surface],
        redirect: HOME[input.surface],
      };
    } finally {
      // Temps de réponse constant : ni l'existence du compte ni la cause de l'échec ne se mesurent.
      const wait = LOGIN_MIN_MS - (Date.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
  }

  /** Session de la surface portée par les cookies (écrans de connexion, pages protégées). */
  @Public()
  @Get('session')
  async session(@Query('surface') surfaceParam: string | undefined, @Req() req: any) {
    const surface = parse(SURFACE, surfaceParam ?? 'app');
    const r = await this.sessions.fromCookies(req, surface);
    if (!r || (surface === 'ADMIN' && !r.isAdmin)) return { authenticated: false, surface: surface.toLowerCase() };
    return {
      authenticated: true,
      surface: surface.toLowerCase(),
      mustChangePassword: r.session.restricted,
      user: await this.userView(r.account, r.isAdmin),
      idleMinutes: IDLE_MINUTES[surface],
      warningSeconds: IDLE_WARNING_SECONDS,
      redirect: HOME[surface],
    };
  }

  /** « Rester connecté » : renouvelle la session (rotation du jeton) et repousse l'expiration. */
  @Post('keepalive')
  @HttpCode(200)
  async keepalive(@CurrentActor() actor: Actor, @Res({ passthrough: true }) res: any) {
    const session = await this.prisma.authSession.findUniqueOrThrow({ where: { id: actor.sessionId } });
    if (actor.viaCookie) await this.sessions.rotate(res, session);
    else await this.prisma.authSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
    const surface = (actor.surface ?? 'APP') as Surface;
    return { idleMinutes: IDLE_MINUTES[surface], warningSeconds: IDLE_WARNING_SECONDS };
  }

  @AllowRestricted()
  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentActor() actor: Actor, @Res({ passthrough: true }) res: any) {
    await this.prisma.authSession.update({ where: { id: actor.sessionId }, data: { revokedAt: new Date() } });
    if (actor.viaCookie && actor.surface) this.sessions.clearCookies(res, actor.surface);
  }

  /**
   * Nouveau mot de passe d'un compte connecté. Première connexion (session limitée) : le mot de passe
   * provisoire vient d'être vérifié ; sinon le mot de passe actuel est exigé. Les autres sessions sont fermées.
   */
  @AllowRestricted()
  @Post('password')
  @HttpCode(200)
  async changePassword(@CurrentActor() actor: Actor, @Body() body: unknown, @Res({ passthrough: true }) res: any) {
    const input = parse(ChangePassword, body);
    const account = await this.prisma.account.findUniqueOrThrow({ where: { id: actor.accountId } });
    if (!actor.restricted) {
      if (!input.currentPassword || !account.passwordHash || !(await verifyPassword(account.passwordHash, input.currentPassword))) {
        throw badRequest('Mot de passe actuel incorrect', { currentPassword: 'Mot de passe actuel incorrect' });
      }
    }
    const problem = await passwordProblem(input.password, account.passwordHash);
    if (problem) throw badRequest(problem, { password: problem });
    const updated = await this.prisma.$transaction(async (db) => {
      const a = await this.creds.setPassword(db, account, input.password);
      await this.creds.revokeSessions(db, account.id, actor.sessionId);
      await this.audit.action(db, selfCtx(account, actor.sessionId), {
        action: actor.restricted ? 'Remplacement du mot de passe provisoire' : 'Changement du mot de passe',
        target: account.fullName, severity: 'SENSITIVE', entityType: 'Account', entityId: account.id,
      });
      return a;
    });
    const session = await this.prisma.authSession.findUniqueOrThrow({ where: { id: actor.sessionId } });
    if (actor.viaCookie) await this.sessions.rotate(res, session, { restricted: false });
    else await this.prisma.authSession.update({ where: { id: session.id }, data: { restricted: false } });
    const surface = (actor.surface ?? 'APP') as Surface;
    return { user: await this.userView(updated, actor.isAdmin), redirect: HOME[surface] };
  }

  /** Mot de passe oublié : toujours 202 et le même message, que l'adresse ait un compte ou non. */
  @Public()
  @Post('forgot')
  @HttpCode(202)
  async forgot(@Body() body: unknown) {
    const input = parse(Forgot, body);
    // Traitement détaché : la durée de la réponse ne dépend pas de l'existence du compte.
    setImmediate(() => this.creds.forgot(input.email, input.surface).catch((e) => console.error('mot de passe oublié', e)));
    return { message: FORGOT_NEUTRAL };
  }

  /** État d'un lien de réinitialisation ou d'invitation. */
  @Public()
  @Get('reset/verify')
  async verifyReset(@Query('token') token: string | undefined) {
    const t = await this.creds.findToken(String(token ?? ''));
    if (!t) return { valid: false, surface: (await this.creds.tokenSurface(String(token ?? ''))).toLowerCase() };
    return {
      valid: true,
      purpose: t.purpose,
      surface: t.surface.toLowerCase(),
      email: t.account.email,
      firstName: t.account.fullName.split(/\s+/)[0],
      expiresAt: t.expiresAt.toISOString(),
    };
  }

  /** Nouveau mot de passe par lien : le lien est consommé et toutes les sessions du compte sont fermées. */
  @Public()
  @Post('reset')
  @HttpCode(200)
  async reset(@Body() body: unknown) {
    const input = parse(Reset, body);
    const gone = () => new ApiError(410, 'TOKEN_INVALID', 'Ce lien n’est plus valide');
    const t = await this.creds.findToken(input.token);
    if (!t) throw gone();
    const problem = await passwordProblem(input.password, t.account.passwordHash);
    if (problem) throw badRequest(problem, { password: problem });
    await this.prisma.$transaction(async (db) => {
      const used = await db.passwordToken.updateMany({ where: { id: t.id, usedAt: null }, data: { usedAt: new Date() } });
      if (used.count !== 1) throw gone();
      await db.passwordToken.updateMany({ where: { accountId: t.accountId, usedAt: null }, data: { usedAt: new Date() } });
      await this.creds.setPassword(db, t.account, input.password);
      await this.creds.revokeSessions(db, t.accountId);
      await this.audit.action(db, selfCtx(t.account), {
        action: t.purpose === 'INVITE' ? 'Activation du compte (mot de passe défini)' : 'Réinitialisation du mot de passe',
        target: t.account.fullName, severity: 'SENSITIVE', entityType: 'Account', entityId: t.accountId,
      });
    });
    const surface = t.surface === 'ADMIN' ? 'ADMIN' : 'APP';
    return { surface: surface.toLowerCase(), loginUrl: LOGIN_PAGE[surface] };
  }
}

