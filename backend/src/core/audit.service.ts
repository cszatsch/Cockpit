import { Injectable } from '@nestjs/common';
import { AuditOrigin, Prisma, Severity } from '@prisma/client';
import { PrismaService, Tx } from './prisma.service';
import { Actor } from './auth/auth';

/** Contexte d'une écriture : qui, sous quel profil, avec quelle origine (brief § 7.10, RG13). */
export interface WriteCtx {
  actor: Actor;
  projectId?: string | null;
  profileUsed: string | null;
  origin?: AuditOrigin;
}

export interface AuditChange {
  entityType: string;
  entityId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  wsId?: string | null;
  /** Libellé d'action (console) ; par défaut Création / Modification / Suppression. */
  action?: string;
  target?: string | null;
  severity?: Severity;
}

/** Champs techniques jamais tracés. */
const IGNORED = new Set(['createdAt', 'updatedAt', 'version', 'rowVersion', 'projectId', 'keyCipher']);

function norm(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (v === undefined) return null;
  return v;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

/**
 * Journal d'audit en ajout seul. Une entrée par champ modifié pour les données métier ;
 * une entrée par action pour la console. Toujours écrit dans la transaction de l'écriture.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  private base(ctx: WriteCtx) {
    return {
      accountId: ctx.origin === 'SYSTEM' ? null : ctx.actor.accountId,
      actorName: ctx.actor.fullName,
      personId: ctx.origin === 'SYSTEM' ? null : ctx.actor.personId,
      profileUsed: ctx.profileUsed,
      origin: ctx.origin ?? 'MANUAL',
      projectId: ctx.projectId ?? null,
    } as const;
  }

  async record(db: Tx, ctx: WriteCtx, change: AuditChange): Promise<void> {
    const rows: Prisma.AuditEntryCreateManyInput[] = [];
    const common = {
      ...this.base(ctx),
      entityType: change.entityType,
      entityId: change.entityId,
      wsId: change.wsId ?? null,
      severity: change.severity ?? 'INFO',
      target: change.target ?? null,
    };
    if (!change.before && change.after) {
      rows.push({ ...common, action: change.action ?? 'Création', newValue: toJson(change.after) });
    } else if (change.before && !change.after) {
      rows.push({ ...common, action: change.action ?? 'Suppression', oldValue: toJson(change.before) });
    } else if (change.before && change.after) {
      for (const key of Object.keys(change.after)) {
        if (IGNORED.has(key)) continue;
        if (same(change.before[key], change.after[key])) continue;
        rows.push({
          ...common,
          action: change.action ?? 'Modification',
          field: key,
          oldValue: toJson(change.before[key]),
          newValue: toJson(change.after[key]),
        });
      }
    }
    if (rows.length) await db.auditEntry.createMany({ data: rows });
  }

  /** Action de console ou action sans diff de champs (ex. « Rotation de clé API »). */
  async action(
    db: Tx,
    ctx: WriteCtx,
    a: { action: string; target?: string | null; severity?: Severity; entityType: string; entityId?: string | null; details?: unknown },
  ): Promise<void> {
    await db.auditEntry.create({
      data: {
        ...this.base(ctx),
        action: a.action,
        target: a.target ?? null,
        severity: a.severity ?? 'INFO',
        entityType: a.entityType,
        entityId: a.entityId ?? null,
        newValue: a.details === undefined ? undefined : toJson(a.details),
      },
    });
  }
}

function toJson(v: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  const n = norm(v);
  if (n === null) return Prisma.JsonNull;
  return JSON.parse(JSON.stringify(n));
}
