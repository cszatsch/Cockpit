import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import { forbidden, unauthorized } from '../errors';

/** Utilisateur authentifié (compte d'accès). */
export interface Actor {
  accountId: string;
  sessionId: string;
  email: string;
  fullName: string;
  personId: string | null;
  isAdmin: boolean;
}

export interface JwtPayload {
  sub: string;
  sid: string;
}

const PUBLIC_KEY = 'rise:public';
/** Route accessible sans jeton. */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

const ADMIN_KEY = 'rise:admin';
/** Route réservée au profil ADMIN (console, RG1/RG7). */
export const AdminOnly = () => SetMetadata(ADMIN_KEY, true);

export const CurrentActor = createParamDecorator((_: unknown, ctx: ExecutionContext): Actor => {
  return ctx.switchToHttp().getRequest().actor;
});

/**
 * Garde globale : vérifie le jeton porteur, la session (non révoquée) et le statut du compte.
 * Un compte suspendu perd immédiatement l'accès (brief Console § 7.1).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    const token = header?.startsWith('Bearer ') ? header.slice(7) : (req.query?.access_token as string | undefined);
    if (!token) throw unauthorized();
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw unauthorized('Jeton invalide ou expiré');
    }
    const session = await this.prisma.authSession.findUnique({ where: { id: payload.sid } });
    if (!session || session.revokedAt || session.accountId !== payload.sub) throw unauthorized('Session fermée');
    const account = await this.prisma.account.findUnique({ where: { id: payload.sub } });
    if (!account || account.status !== 'ACTIVE') throw unauthorized('Compte inactif ou suspendu');
    const grant = await this.prisma.adminGrant.findUnique({ where: { accountId: account.id } });
    const actor: Actor = {
      accountId: account.id,
      sessionId: session.id,
      email: account.email,
      fullName: account.fullName,
      personId: account.personId,
      isAdmin: !!grant,
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
