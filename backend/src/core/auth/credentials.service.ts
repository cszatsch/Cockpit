import { createHash, randomBytes } from 'crypto';
import { Injectable } from '@nestjs/common';
import { Account, Prisma } from '@prisma/client';
import { AuditService, WriteCtx } from '../audit.service';
import { config } from '../config';
import { MailerService } from '../mailer.service';
import { PrismaService, Tx } from '../prisma.service';
import { Actor } from './auth';
import { dummyHash, hashPassword, verifyPassword } from './password';
import {
  FAILURE_WINDOW_MINUTES,
  IP_MAX_FAILURES,
  LOCK_MINUTES,
  MAX_FAILURES,
  RESET_MAX_PER_HOUR,
  RESET_RESEND_SECONDS,
  RESET_TOKEN_MINUTES,
  Surface,
  TOKEN_BYTES,
} from './policy';

export type LoginOutcome =
  | { kind: 'ok'; account: Account; isAdmin: boolean }
  | { kind: 'invalid'; remaining: number }
  | { kind: 'locked'; retryAfter: number };

export type TokenPurpose = 'RESET' | 'INVITE';

const MIN = 60_000;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const emailKey = (email: string) => 'email:' + email;
const ipKey = (ip: string) => 'ip:' + ip;

/** Acteur d'une écriture faite au nom du compte lui-même (connexion, mot de passe). */
export function selfCtx(a: Account, sessionId = ''): WriteCtx {
  const actor: Actor = {
    accountId: a.id, sessionId, email: a.email, fullName: a.fullName, personId: a.personId,
    isAdmin: false, surface: null, restricted: false, viaCookie: false,
  };
  return { actor, projectId: null, profileUsed: null, origin: 'MANUAL' };
}

/**
 * Identifiants : vérification du mot de passe avec blocage temporaire, liens de réinitialisation
 * et d'invitation à usage unique, changement de mot de passe.
 */
@Injectable()
export class CredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mailer: MailerService,
  ) {}

  // ───────────── Connexion et blocage ─────────────

  /** Secondes de blocage restantes pour une adresse ou une IP (0 : libre). */
  private async lockedFor(keys: string[]): Promise<number> {
    const rows = await this.prisma.loginThrottle.findMany({ where: { key: { in: keys } } });
    const now = Date.now();
    const until = Math.max(0, ...rows.map((r) => r.lockedUntil?.getTime() ?? 0));
    return until > now ? Math.ceil((until - now) / 1000) : 0;
  }

  /** Compte un échec ; bloque la clé au seuil. Renvoie le nombre d'échecs courant (0 si la clé vient d'être bloquée). */
  private async fail(key: string, max: number): Promise<{ failures: number; locked: boolean }> {
    const now = new Date();
    const row = await this.prisma.loginThrottle.findUnique({ where: { key } });
    const fresh = row && (!row.lockedUntil || row.lockedUntil < now) && now.getTime() - row.updatedAt.getTime() < FAILURE_WINDOW_MINUTES * MIN;
    const expiredLock = row?.lockedUntil && row.lockedUntil < now;
    const failures = (fresh && !expiredLock ? row!.failures : 0) + 1;
    const locked = failures >= max;
    const data = { failures: locked ? 0 : failures, lockedUntil: locked ? new Date(now.getTime() + LOCK_MINUTES * MIN) : null };
    await this.prisma.loginThrottle.upsert({ where: { key }, create: { key, ...data }, update: data });
    return { failures, locked };
  }

  /**
   * Vérifie un couple adresse / mot de passe. Une adresse inconnue suit exactement le même chemin
   * (hachage factice, compteur d'échecs, blocage) qu'une adresse connue.
   */
  async checkLogin(email: string, password: string, ip: string): Promise<LoginOutcome> {
    const retryAfter = await this.lockedFor([emailKey(email), ipKey(ip)]);
    if (retryAfter) return { kind: 'locked', retryAfter };
    const account = await this.prisma.account.findUnique({ where: { email } });
    const matches = await verifyPassword(account?.passwordHash ?? (await dummyHash()), password);
    if (account && account.passwordHash && matches && account.status === 'ACTIVE') {
      await this.prisma.loginThrottle.deleteMany({ where: { key: emailKey(email) } });
      const isAdmin = !!(await this.prisma.adminGrant.findUnique({ where: { accountId: account.id } }));
      return { kind: 'ok', account, isAdmin };
    }
    const byIp = await this.fail(ipKey(ip), IP_MAX_FAILURES);
    const byEmail = await this.fail(emailKey(email), MAX_FAILURES);
    if (byEmail.locked && account) {
      await this.audit.action(this.prisma, { ...selfCtx(account), origin: 'SYSTEM' }, {
        action: 'Blocage temporaire après échecs de connexion', target: account.fullName, severity: 'SENSITIVE',
        entityType: 'Account', entityId: account.id, details: { minutes: LOCK_MINUTES, ip },
      });
    }
    if (byEmail.locked || byIp.locked) return { kind: 'locked', retryAfter: LOCK_MINUTES * 60 };
    return { kind: 'invalid', remaining: MAX_FAILURES - byEmail.failures };
  }

  // ───────────── Liens à usage unique ─────────────

  /** Crée un lien (jeton aléatoire stocké haché) ; les liens encore valides du même usage sont annulés. */
  async issueToken(db: Tx, account: Account, purpose: TokenPurpose, surface: Surface, validityMs: number): Promise<string> {
    const raw = randomBytes(TOKEN_BYTES).toString('base64url');
    const now = new Date();
    await db.passwordToken.updateMany({ where: { accountId: account.id, purpose, usedAt: null }, data: { usedAt: now } });
    await db.passwordToken.create({
      data: { accountId: account.id, tokenHash: sha256(raw), purpose, surface, expiresAt: new Date(now.getTime() + validityMs) },
    });
    return raw;
  }

  resetLink(raw: string): string {
    return `${config.appUrl}/mot-de-passe/reinitialiser?token=${raw}`;
  }

  /** Lien valide (ni utilisé, ni expiré, compte non suspendu), avec son compte. */
  async findToken(raw: string) {
    if (!raw || raw.length > 200) return null;
    const t = await this.prisma.passwordToken.findUnique({ where: { tokenHash: sha256(raw) }, include: { account: true } });
    if (!t || t.usedAt || t.expiresAt.getTime() <= Date.now() || t.account.status === 'SUSPENDED') return null;
    return t;
  }

  /** Surface d'un lien, même utilisé ou expiré (pour afficher le bon écran). */
  async tokenSurface(raw: string): Promise<Surface> {
    if (!raw || raw.length > 200) return 'APP';
    const t = await this.prisma.passwordToken.findUnique({ where: { tokenHash: sha256(raw) }, select: { surface: true } });
    return t?.surface === 'ADMIN' ? 'ADMIN' : 'APP';
  }

  /**
   * Mot de passe oublié : envoie un lien si le compte existe et n'est pas suspendu, dans la limite
   * d'un envoi par minute et de cinq par heure. Rien n'est jamais signalé à l'appelant.
   */
  async forgot(email: string, surface: Surface): Promise<void> {
    const account = await this.prisma.account.findUnique({ where: { email } });
    if (!account || account.status === 'SUSPENDED') return;
    const now = Date.now();
    const recent = await this.prisma.passwordToken.findMany({
      where: { accountId: account.id, purpose: 'RESET', createdAt: { gte: new Date(now - 60 * MIN) } },
      orderBy: { createdAt: 'desc' },
    });
    if (recent.length >= RESET_MAX_PER_HOUR) return;
    if (recent[0] && now - recent[0].createdAt.getTime() < RESET_RESEND_SECONDS * 1000) return;
    const raw = await this.issueToken(this.prisma, account, 'RESET', surface, RESET_TOKEN_MINUTES * MIN);
    const link = this.resetLink(raw);
    await this.mailer.send({
      to: [account.email],
      subject: 'RISE · Réinitialisation de votre mot de passe',
      text:
        `Bonjour ${account.fullName},\n\nPour choisir un nouveau mot de passe, ouvrez ce lien :\n${link}\n\n` +
        `Il est à usage unique et expire dans ${RESET_TOKEN_MINUTES} minutes. ` +
        `Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe actuel reste valable.`,
    });
    if (!config.smtpUrl && config.authDev && process.env.NODE_ENV !== 'test') {
      console.log(`[e-mail · développement] lien de réinitialisation pour ${account.email} : ${link}`);
    }
  }

  // ───────────── Changement de mot de passe ─────────────

  /**
   * Enregistre un nouveau mot de passe (déjà contrôlé) : empreinte Argon2id, fin du mot de passe
   * provisoire, activation d'un compte invité, remise à zéro du blocage.
   */
  async setPassword(db: Tx, account: Account, password: string): Promise<Account> {
    const updated = await db.account.update({
      where: { id: account.id },
      data: {
        passwordHash: await hashPassword(password),
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        status: account.status === 'INVITED' ? 'ACTIVE' : account.status,
        version: { increment: 1 },
      },
    });
    await db.loginThrottle.deleteMany({ where: { key: emailKey(account.email) } });
    return updated;
  }

  /** Ferme toutes les sessions du compte, sauf éventuellement la session courante. */
  async revokeSessions(db: Tx, accountId: string, keepSessionId?: string): Promise<number> {
    const where: Prisma.AuthSessionWhereInput = { accountId, revokedAt: null, ...(keepSessionId ? { id: { not: keepSessionId } } : {}) };
    return (await db.authSession.updateMany({ where, data: { revokedAt: new Date() } })).count;
  }
}
