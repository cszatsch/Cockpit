import { Injectable } from '@nestjs/common';
import { ZodObject, z } from 'zod';
import { PrismaService, Tx } from '../../core/prisma.service';
import { AuditService, WriteCtx } from '../../core/audit.service';
import { TodayService } from '../../core/today.service';
import { ProjectScope } from '../../core/access.service';
import { Actor } from '../../core/auth/auth';
import { checkIfMatch, parse, withWarnings } from '../../core/http';
import { badRequest, businessRule, conflict, forbidden, inUse, notFound } from '../../core/errors';
import { nextCode, readableId } from '../../core/ids';
import { canReadWs, canWriteWs, profileUsedFor, visibleWorkstreams } from '../../domain/rights';
import { actionView, decisionView, issueView, riskView } from '../views';
import { UsagesService } from '../referential/usages.service';
import { id, isoDate, optIsoDate, optText, text } from '../referential/schemas';

export interface TxCtx {
  db: Tx;
  scope: ProjectScope;
  today: string;
}

/** Définition d'une entité transactionnelle rattachée à un chantier (brief § 8.6). */
export interface TxEntity {
  route: string;
  entityType: string;
  delegate: string;
  prefix: string;
  pad: number;
  create: ZodObject<any>;
  patch: ZodObject<any>;
  filters: string[];
  /** Convertit l'entrée API en données Prisma et applique les règles ; peut renvoyer des avertissements. */
  prepare(c: TxCtx, input: any, existing: any | null): Promise<{ data: any; warnings: string[] }>;
  view(row: any, today: string): any;
  label(row: any): string;
  /** Contrôle supplémentaire avant modification (ex. fiche arbitrée en lecture seule). */
  guardPatch?(existing: any, input: any): void;
}

async function ref(db: Tx, delegate: string, projectId: string, value: string | null | undefined, field: string) {
  if (!value) return null;
  const row = await (db as any)[delegate].findFirst({ where: { id: value, projectId } });
  if (!row) throw badRequest('Référence invalide', { [field]: 'introuvable' });
  return row;
}

function ownerToId(data: any, from = 'owner', to = 'ownerId') {
  if (from in data) {
    data[to] = data[from];
    delete data[from];
  }
}

const p15 = z.number().int().min(1, '1 minimum').max(5, '5 maximum');

// ───────────── Risques ─────────────
const RiskCreate = z
  .object({
    n: text(1000),
    p: p15,
    i: p15,
    plan: optText(4000),
    owner: id,
    wsId: id,
    dueIso: optIsoDate,
    status: z.enum(['OPEN', 'MITIGATING', 'CLOSED']).optional(),
  })
  .strict();

export const RISKS: TxEntity = {
  route: 'risks',
  entityType: 'RISK',
  delegate: 'risk',
  prefix: 'R',
  pad: 2,
  create: RiskCreate,
  patch: RiskCreate.partial().strict(),
  filters: ['status', 'wsId', 'owner'],
  async prepare(c, input) {
    await ref(c.db, 'person', c.scope.project.id, input.owner, 'owner');
    const data = { ...input };
    ownerToId(data);
    if (data.plan === '') data.plan = null;
    return { data, warnings: [] };
  },
  view: (r) => riskView(r),
  label: (r) => `${r.code} · ${r.n}`,
};

// ───────────── Problèmes ─────────────
const IssueCreate = z
  .object({
    n: text(1000),
    sev: p15,
    originRiskId: id.nullable().optional(),
    openedIso: optIsoDate,
    owner: id,
    wsId: id,
    targetIso: optIsoDate,
    targetSessionId: id.nullable().optional(),
    detail: z.string().max(4000).optional(),
    status: z.enum(['OPEN', 'RESOLVING', 'RESOLVED']).optional(),
  })
  .strict();

export const ISSUES: TxEntity = {
  route: 'issues',
  entityType: 'ISSUE',
  delegate: 'issue',
  prefix: 'P',
  pad: 2,
  create: IssueCreate,
  patch: IssueCreate.partial().strict(),
  filters: ['status', 'wsId', 'owner'],
  async prepare(c, input, existing) {
    await ref(c.db, 'person', c.scope.project.id, input.owner, 'owner');
    await ref(c.db, 'risk', c.scope.project.id, input.originRiskId, 'originRiskId');
    const session = await ref(c.db, 'session', c.scope.project.id, input.targetSessionId, 'targetSessionId');
    const data = { ...input };
    ownerToId(data);
    if (!existing && !data.openedIso) data.openedIso = c.today;
    // Échéance liée à une séance : la date cible est celle de la séance.
    if (session && !input.targetIso) data.targetIso = session.dateIso;
    return { data, warnings: [] };
  },
  view: (r) => issueView(r),
  label: (r) => `${r.code} · ${r.n}`,
};

// ───────────── Actions ─────────────
const ActionCreate = z
  .object({
    n: text(1000),
    detail: optText(4000),
    owner: id,
    wsId: id,
    dueIso: optIsoDate,
    status: z.enum(['OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE']).optional(),
    prio: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
    sourceType: z.enum(['RISK', 'ISSUE', 'MILESTONE', 'DECISION']).nullable().optional(),
    sourceId: id.nullable().optional(),
  })
  .strict();

const SOURCE_DELEGATE = { RISK: 'risk', ISSUE: 'issue', MILESTONE: 'milestone', DECISION: 'decision' } as const;

export const ACTIONS: TxEntity = {
  route: 'actions',
  entityType: 'ACTION',
  delegate: 'action',
  prefix: 'A-',
  pad: 2,
  create: ActionCreate,
  patch: ActionCreate.partial().strict(),
  filters: ['status', 'wsId', 'owner', 'prio'],
  async prepare(c, input, existing) {
    await ref(c.db, 'person', c.scope.project.id, input.owner, 'owner');
    const st = input.sourceType ?? existing?.sourceType;
    const sid = input.sourceId ?? existing?.sourceId;
    if ((st && !sid) || (!st && sid)) throw badRequest('Source incomplète', { sourceId: 'sourceType et sourceId vont ensemble' });
    if (st && sid && (input.sourceType !== undefined || input.sourceId !== undefined)) {
      await ref(c.db, SOURCE_DELEGATE[st as keyof typeof SOURCE_DELEGATE], c.scope.project.id, sid, 'sourceId');
    }
    const data = { ...input };
    ownerToId(data);
    if (input.status !== undefined) {
      // Date de clôture : posée au passage à DONE, retirée à la réouverture.
      if (input.status === 'DONE' && existing?.status !== 'DONE') data.closedAt = c.today;
      if (input.status !== 'DONE') data.closedAt = null;
    }
    if (!existing) data.order = await c.db.action.count({ where: { projectId: c.scope.project.id } });
    return { data, warnings: [] };
  },
  view: (r, today) => actionView(r, today),
  label: (r) => `${r.code} · ${r.n}`,
};

// ───────────── Décisions ─────────────
const DecisionCreate = z
  .object({
    t: text(1000),
    p: z.number().int().min(1).max(4),
    status: z.enum(['DRAFT', 'IN_REVIEW', 'TO_ARBITRATE', 'ARBITRATED', 'CANCELLED', 'SUPERSEDED']).optional(),
    crIso: optIsoDate,
    ddIso: optIsoDate,
    wsId: id,
    bodyId: id,
    decL: optText(4000),
    maker: id.nullable().optional(),
    impact: optText(4000),
    supersedes: id.nullable().optional(),
    expectedSessionId: id.nullable().optional(),
    full: z.boolean().optional(),
    opt: z.string().max(3).nullable().optional(),
  })
  .strict();

const CLOSED_DECISION = ['ARBITRATED', 'CANCELLED', 'SUPERSEDED'];

export const DECISIONS: TxEntity = {
  route: 'decisions',
  entityType: 'DECISION',
  delegate: 'decision',
  prefix: 'D-',
  pad: 3,
  create: DecisionCreate,
  patch: DecisionCreate.partial().strict(),
  filters: ['status', 'wsId', 'bodyId', 'maker'],
  guardPatch(existing) {
    // Fiche arbitrée : lecture seule (brief § 6.2, Arbitrages finaux).
    if (existing.status === 'ARBITRATED') throw conflict('READ_ONLY', 'Fiche arbitrée : lecture seule');
  },
  async prepare(c, input, existing) {
    const P = c.scope.project.id;
    await ref(c.db, 'governanceBody', P, input.bodyId, 'bodyId');
    await ref(c.db, 'person', P, input.maker, 'maker');
    await ref(c.db, 'session', P, input.expectedSessionId, 'expectedSessionId');
    if (input.supersedes) {
      await ref(c.db, 'decision', P, input.supersedes, 'supersedes');
      if (existing && input.supersedes === existing.id) throw badRequest('Référence invalide', { supersedes: 'une décision ne peut se remplacer elle-même' });
    }
    const data: any = { ...input };
    ownerToId(data, 'maker', 'makerId');
    ownerToId(data, 'supersedes', 'supersedesId');
    if (!existing && !data.crIso) data.crIso = c.today;
    const status = input.status ?? existing?.status ?? 'DRAFT';
    const ddIso = input.ddIso !== undefined ? input.ddIso : existing?.ddIso;
    // Règle du frontend : clôture sans date → date du jour ; réouverture → date effacée.
    if (input.status !== undefined) {
      if (CLOSED_DECISION.includes(status) && !ddIso) data.ddIso = c.today;
      if (!CLOSED_DECISION.includes(status) && existing && CLOSED_DECISION.includes(existing.status)) data.ddIso = null;
    }
    if (status === 'ARBITRATED' && !(input.decL ?? existing?.decL)) {
      throw businessRule('Une décision arbitrée doit porter le texte de la décision', { decL: 'obligatoire pour une décision arbitrée' });
    }
    return { data, warnings: [] };
  },
  view: (r) => decisionView(r),
  label: (r) => `${r.code} · ${r.t}`,
};

export const TX_ENTITIES = [RISKS, ISSUES, ACTIONS, DECISIONS];

/** Statut d'une écriture sur un objet existant hors périmètre de lecture (§ 13.7 prime sur RG16). */
export const WRITE_OUT_OF_SCOPE_STATUS: 403 | 404 = 403;

/**
 * Moteur du transactionnel : droits par chantier (RG8 lecture filtrée, RG9 écriture, RG16 404),
 * identifiants attribués par le serveur, historique champ par champ.
 */
@Injectable()
export class TransactionalService {
  constructor(
    readonly prisma: PrismaService,
    readonly audit: AuditService,
    readonly todaySvc: TodayService,
    private readonly usagesSvc: UsagesService,
  ) {}

  today(scope: ProjectScope) {
    return this.todaySvc.today(scope.project.timezone);
  }

  wctx(actor: Actor, scope: ProjectScope, wsId: string | null, origin: WriteCtx['origin'] = 'MANUAL'): WriteCtx {
    return { actor, projectId: scope.project.id, profileUsed: profileUsedFor(scope.access, wsId), origin };
  }

  /** RG9 : écriture sur un chantier ; un Responsable hors de ses chantiers reçoit 422 à la création. */
  assertWriteWs(scope: ProjectScope, wsId: string | null | undefined, creating: boolean) {
    if (canWriteWs(scope.access, wsId)) return;
    if (creating && scope.access.responsable.length) {
      throw businessRule('Donnée à rattacher à l’un de vos chantiers', { wsId: `chantiers autorisés : ${scope.access.responsable.join(', ')}` });
    }
    throw forbidden();
  }

  async list(def: TxEntity, scope: ProjectScope, query: Record<string, string> = {}) {
    const where: any = { projectId: scope.project.id };
    for (const f of def.filters) {
      if (query[f] !== undefined) where[f === 'owner' ? 'ownerId' : f === 'maker' ? 'makerId' : f] = query[f];
    }
    const vis = visibleWorkstreams(scope.access);
    if (vis) where.wsId = where.wsId ? (vis.includes(where.wsId) ? where.wsId : '__none__') : { in: vis };
    const rows = await (this.prisma as any)[def.delegate].findMany({ where, orderBy: def.delegate === 'action' ? [{ order: 'asc' }] : [{ code: 'asc' }] });
    const today = this.today(scope);
    return rows.map((r: any) => def.view(r, today));
  }

  /**
   * Lecture d'un objet par id ou code. RG16 : en lecture, un objet hors périmètre répond 404
   * (existence non révélée) ; en écriture, 403 comme l'exige le critère d'acceptation § 13.7
   * (« le Responsable de C5 […] ne modifie pas un risque de C3 (403) ») — WRITE_OUT_OF_SCOPE_STATUS.
   */
  async row(def: TxEntity, scope: ProjectScope, idOrCode: string, db: Tx = this.prisma, forWrite = false) {
    const r =
      (await (db as any)[def.delegate].findFirst({ where: { id: idOrCode, projectId: scope.project.id } })) ??
      (await (db as any)[def.delegate].findFirst({ where: { code: idOrCode, projectId: scope.project.id } }));
    if (!r) throw notFound();
    if (!canReadWs(scope.access, r.wsId)) {
      if (forWrite && WRITE_OUT_OF_SCOPE_STATUS === 403) throw forbidden();
      throw notFound();
    }
    return r;
  }

  async get(def: TxEntity, scope: ProjectScope, idOrCode: string) {
    return def.view(await this.row(def, scope, idOrCode), this.today(scope));
  }

  async create(def: TxEntity, actor: Actor, scope: ProjectScope, body: unknown, origin: WriteCtx['origin'] = 'MANUAL') {
    const input = parse(def.create, body);
    this.assertWriteWs(scope, input.wsId, true);
    const out = await this.prisma.$transaction(async (tx) => {
      const c: TxCtx = { db: tx, scope, today: this.today(scope) };
      await ref(tx, 'workstream', scope.project.id, input.wsId, 'wsId');
      const { data, warnings } = await def.prepare(c, input, null);
      const all = await (tx as any)[def.delegate].findMany({ where: { projectId: scope.project.id }, select: { code: true } });
      const code = nextCode(all.map((x: any) => x.code), def.prefix, def.pad);
      const newId = await readableId(code, scope.project.code, async (i) => !!(await (tx as any)[def.delegate].findUnique({ where: { id: i } })));
      const row = await (tx as any)[def.delegate].create({ data: { ...data, id: newId, code, projectId: scope.project.id } });
      const view = def.view(row, c.today);
      await this.audit.record(tx, this.wctx(actor, scope, row.wsId, origin), { entityType: def.entityType, entityId: row.id, before: null, after: view, wsId: row.wsId, target: def.label(row) });
      return { row, result: withWarnings(view, warnings) };
    });
    return out.result;
  }

  async patch(def: TxEntity, actor: Actor, scope: ProjectScope, idOrCode: string, body: unknown, ifMatch?: string, origin: WriteCtx['origin'] = 'MANUAL') {
    const input = parse(def.patch, body);
    const out = await this.prisma.$transaction(async (tx) => {
      const existing = await this.row(def, scope, idOrCode, tx, true);
      this.assertWriteWs(scope, existing.wsId, false);
      if (input.wsId && input.wsId !== existing.wsId) {
        await ref(tx, 'workstream', scope.project.id, input.wsId, 'wsId');
        this.assertWriteWs(scope, input.wsId, true);
      }
      def.guardPatch?.(existing, input);
      checkIfMatch(ifMatch, existing.version);
      const c: TxCtx = { db: tx, scope, today: this.today(scope) };
      const { data, warnings } = await def.prepare(c, input, existing);
      const row = await (tx as any)[def.delegate].update({ where: { id: existing.id }, data: { ...data, version: { increment: 1 } } });
      const view = def.view(row, c.today);
      await this.audit.record(tx, this.wctx(actor, scope, row.wsId, origin), { entityType: def.entityType, entityId: row.id, before: def.view(existing, c.today), after: view, wsId: row.wsId, target: def.label(row) });
      if (def.entityType === 'DECISION' && row.status === 'ARBITRATED' && existing.status !== 'ARBITRATED' && row.supersedesId) {
        await this.supersede(tx, actor, scope, row.supersedesId);
      }
      return { existing, row, result: withWarnings(view, warnings) };
    });
    return out.result;
  }

  /** Une décision arbitrée qui en remplace une autre fait passer celle-ci à SUPERSEDED. */
  private async supersede(tx: Tx, actor: Actor, scope: ProjectScope, decisionId: string) {
    const old = await tx.decision.findUnique({ where: { id: decisionId } });
    if (!old || old.status === 'SUPERSEDED') return;
    const row = await tx.decision.update({ where: { id: decisionId }, data: { status: 'SUPERSEDED', version: { increment: 1 } } });
    await this.audit.record(tx, this.wctx(actor, scope, row.wsId), { entityType: 'DECISION', entityId: row.id, before: { status: old.status }, after: { status: row.status }, wsId: row.wsId, target: `${row.code} · ${row.t}` });
  }

  async remove(def: TxEntity, actor: Actor, scope: ProjectScope, idOrCode: string, ifMatch?: string) {
    await this.prisma.$transaction(async (tx) => {
      const existing = await this.row(def, scope, idOrCode, tx, true);
      this.assertWriteWs(scope, existing.wsId, false);
      def.guardPatch?.(existing, {});
      checkIfMatch(ifMatch, existing.version);
      const usages = await this.usagesSvc.usages(tx, scope.project.id, def.entityType, existing.id);
      if (usages.length) throw inUse(usages);
      await (tx as any)[def.delegate].delete({ where: { id: existing.id } });
      const today = this.today(scope);
      await this.audit.record(tx, this.wctx(actor, scope, existing.wsId), { entityType: def.entityType, entityId: existing.id, before: def.view(existing, today), after: null, wsId: existing.wsId, target: def.label(existing) });
    });
  }
}

export { isoDate };
