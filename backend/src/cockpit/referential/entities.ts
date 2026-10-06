import { Project } from '@prisma/client';
import { ZodObject } from 'zod';
import { Tx } from '../../core/prisma.service';
import { badRequest, businessRule, conflict } from '../../core/errors';
import { nextCode, readableId, techId } from '../../core/ids';
import { assignmentActive, confirmedDays, milestoneGap, outsidePeriod } from '../../domain/rules';
import { ProjectAccess } from '../../domain/rights';
import { normKey } from '../../domain/labels';
import { dependencyCycle, foreignSubphases, keepSubphasesOf } from '../../domain/workstream-links';
import * as S from './schemas';
import { deliverableView, milestoneViews, personViews } from '../views';

export interface EntityCtx {
  db: Tx;
  project: Project;
  today: string;
  access: ProjectAccess;
}

export interface Prepared {
  data: Record<string, any>;
  /** Relations N-N à (ré)écrire après l'enregistrement. */
  relations?: (db: Tx, id: string) => Promise<void>;
  warnings: string[];
}

export interface EntityConfig {
  route: string;
  /** Entité hors projet (Client). */
  global?: boolean;
  entityType: string;
  delegate: string;
  create: ZodObject<any>;
  patch: ZodObject<any>;
  include?: Record<string, any>;
  orderBy: any;
  /** Champs acceptés en filtre de liste (`?champ=valeur`). */
  filters?: string[];
  newId(ctx: EntityCtx, input: any): Promise<string>;
  prepare(ctx: EntityCtx, input: any, existing: any | null): Promise<Prepared>;
  serializeMany(ctx: EntityCtx, rows: any[]): Promise<any[]>;
  label(row: any): string;
  wsOf?(row: any): string | null;
}

// ───────────── Utilitaires ─────────────

async function mustExist(db: Tx, delegate: string, projectId: string, id: string | null | undefined, field: string, what = 'introuvable') {
  if (!id) return;
  const row = await (db as any)[delegate].findFirst({ where: { id, projectId } });
  if (!row) throw badRequest('Référence invalide', { [field]: what });
  return row;
}

function checkRange(start: string | null | undefined, end: string | null | undefined, fields = ['startDate', 'endDate']) {
  if (start && end && end < start) throw badRequest('Période invalide', { [fields[1]]: 'la fin doit être postérieure ou égale au début' });
}

function merged<T extends object>(existing: T | null, input: Partial<T>): T {
  return { ...(existing ?? {}), ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) } as T;
}

function precisions(input: any, data: any) {
  if (input.startPrecision !== undefined) data.startPrec = input.startPrecision;
  if (input.endPrecision !== undefined) data.endPrec = input.endPrecision;
  delete data.startPrecision;
  delete data.endPrecision;
}

/** Période courante d'un lot / d'une phase (`cur`). */
function isCurrent(start: string | null, end: string | null, today: string) {
  return !!start && !!end && start <= today && today <= end;
}

async function genReadable(ctx: EntityCtx, delegate: string, code: string) {
  return readableId(code, ctx.project.code, async (id) => !!(await (ctx.db as any)[delegate].findUnique({ where: { id } })));
}

// ───────────── Définitions ─────────────

export const CLIENTS: EntityConfig = {
  route: 'clients',
  global: true,
  entityType: 'CLIENT',
  delegate: 'client',
  create: S.ClientCreate,
  patch: S.patchOf(S.ClientCreate),
  orderBy: { code: 'asc' },
  newId: async () => techId('c'),
  async prepare(_ctx, input) {
    return { data: { ...input }, warnings: [] };
  },
  async serializeMany(_ctx, rows) {
    return rows.map((r) => ({ id: r.id, code: r.code, name: r.name, description: r.description, status: r.status, version: r.version }));
  },
  label: (r) => r.name,
};

export const WAVES: EntityConfig = {
  route: 'waves',
  entityType: 'WAVE',
  delegate: 'wave',
  create: S.WaveCreate,
  patch: S.patchOf(S.WaveCreate),
  orderBy: { seq: 'asc' },
  newId: async (ctx, input) => genReadable(ctx, 'wave', `w${input.seq}`),
  async prepare(ctx, input, existing) {
    const m = merged(existing, input) as any;
    checkRange(m.startDate, m.endDate);
    await mustExist(ctx.db, 'person', ctx.project.id, input.ownerId, 'ownerId');
    const data: any = { ...input };
    precisions(input, data);
    return { data, warnings: [] };
  },
  async serializeMany(ctx, rows) {
    return rows.map((r) => ({
      id: r.id,
      seq: r.seq,
      name: r.name,
      startDate: r.startDate,
      endDate: r.endDate,
      startPrecision: r.startPrec,
      endPrecision: r.endPrec,
      status: r.status,
      ownerId: r.ownerId,
      cur: isCurrent(r.startDate, r.endDate, ctx.today),
      version: r.version,
    }));
  },
  label: (r) => `Lot ${r.seq} · ${r.name}`,
};

export const PHASES: EntityConfig = {
  route: 'phases',
  entityType: 'PHASE',
  delegate: 'phase',
  create: S.PhaseCreate,
  patch: S.patchOf(S.PhaseCreate).omit({ waveIds: true }),
  include: { waves: true },
  orderBy: { seq: 'asc' },
  newId: async (ctx, input) => genReadable(ctx, 'phase', `P${input.seq}`),
  async prepare(ctx, input, existing) {
    const m = merged(existing, input) as any;
    checkRange(m.startDate, m.endDate);
    await mustExist(ctx.db, 'person', ctx.project.id, input.ownerId, 'ownerId');
    const data: any = { ...input };
    if (!existing && !data.code) data.code = String(input.seq);
    delete data.waveIds;
    precisions(input, data);
    const waveIds: string[] | undefined = input.waveIds;
    if (waveIds) for (const w of waveIds) await mustExist(ctx.db, 'wave', ctx.project.id, w, 'waveIds');
    return {
      data,
      warnings: [],
      relations: waveIds
        ? async (db, id) => {
            await db.phaseWave.deleteMany({ where: { phaseId: id, waveId: { notIn: waveIds } } });
            for (const w of waveIds) await db.phaseWave.upsert({ where: { phaseId_waveId: { phaseId: id, waveId: w } }, create: { phaseId: id, waveId: w }, update: {} });
          }
        : undefined,
    };
  },
  async serializeMany(ctx, rows) {
    return rows.map((r) => ({
      id: r.id,
      seq: r.seq,
      code: r.code,
      name: r.name,
      description: r.description,
      startDate: r.startDate,
      endDate: r.endDate,
      startPrecision: r.startPrec,
      endPrecision: r.endPrec,
      status: r.status,
      progressPct: r.progressPct,
      plannedPctOverride: r.plannedPctOverride,
      critical: r.critical,
      ownerId: r.ownerId,
      waveIds: (r.waves ?? []).map((w: any) => w.waveId),
      waveDates: Object.fromEntries(
        (r.waves ?? []).filter((w: any) => w.startDate || w.endDate).map((w: any) => [w.waveId, { startDate: w.startDate, endDate: w.endDate, startPrecision: w.startPrec, endPrecision: w.endPrec }]),
      ),
      cur: isCurrent(r.startDate, r.endDate, ctx.today),
      version: r.version,
    }));
  },
  label: (r) => `${r.code} · ${r.name}`,
};

export const SUBPHASES: EntityConfig = {
  route: 'subphases',
  entityType: 'SUBPHASE',
  delegate: 'subphase',
  create: S.SubphaseCreate,
  patch: S.patchOf(S.SubphaseCreate),
  orderBy: [{ phase: { seq: 'asc' } }, { code: 'asc' }],
  filters: ['phaseId'],
  newId: async (ctx, input) => genReadable(ctx, 'subphase', `SP${input.code}`),
  async prepare(ctx, input, existing) {
    const m = merged(existing, input) as any;
    const phase = await mustExist(ctx.db, 'phase', ctx.project.id, m.phaseId, 'phaseId');
    // Le code doit commencer par le code de la phase suivi d'un point (brief § 6.1).
    if (!new RegExp(`^${phase.code.replace('.', '\\.')}\\.\\d+$`).test(m.code)) {
      throw badRequest('Code de sous-phase invalide', { code: `doit être de la forme ${phase.code}.n` });
    }
    checkRange(m.startDate, m.endDate);
    await mustExist(ctx.db, 'person', ctx.project.id, input.ownerId, 'ownerId');
    const warnings: string[] = [];
    if ((m.startDate && outsidePeriod(m.startDate, phase.startDate, phase.endDate)) || (m.endDate && outsidePeriod(m.endDate, phase.startDate, phase.endDate))) {
      warnings.push(`La sous-phase sort de la période de la phase ${phase.code} (${phase.startDate} → ${phase.endDate})`);
    }
    if (existing && input.phaseId !== undefined && input.phaseId !== existing.phaseId) {
      const linked = await ctx.db.workstream.findMany({ where: { projectId: ctx.project.id, subphases: { some: { subphaseId: existing.id } }, phases: { none: { phaseId: input.phaseId } } }, select: { code: true } });
      if (linked.length) throw badRequest('Changement de phase impossible', { phaseId: `la sous-phase est rattachée aux chantiers ${linked.map((w) => w.code).join(', ')}, qui n’ont pas la phase ${phase.code}` });
    }
    const data: any = { ...input };
    precisions(input, data);
    return { data, warnings };
  },
  async serializeMany(ctx, rows) {
    return rows.map((r) => ({
      id: r.id,
      phaseId: r.phaseId,
      code: r.code,
      name: r.name,
      description: r.description,
      startDate: r.startDate,
      endDate: r.endDate,
      startPrecision: r.startPrec,
      endPrecision: r.endPrec,
      status: r.status,
      progressPct: r.progressPct,
      plannedPctOverride: r.plannedPctOverride,
      critical: r.critical,
      ownerId: r.ownerId,
      cur: isCurrent(r.startDate, r.endDate, ctx.today),
      version: r.version,
    }));
  },
  label: (r) => `${r.code} · ${r.name}`,
};

export const WORKSTREAMS: EntityConfig = {
  route: 'workstreams',
  entityType: 'WORKSTREAM',
  delegate: 'workstream',
  create: S.WorkstreamCreate,
  patch: S.patchOf(S.WorkstreamCreate),
  include: { phases: true, subphases: true, waves: true, dependencies: true },
  orderBy: { seq: 'asc' },
  newId: async (ctx) => {
    const all = await ctx.db.workstream.findMany({ where: { projectId: ctx.project.id }, select: { code: true } });
    return genReadable(ctx, 'workstream', nextCode(all.map((w) => w.code), 'C', 1));
  },
  async prepare(ctx, input, existing) {
    const m = merged(existing, input) as any;
    checkRange(m.startDate, m.endDate);
    await mustExist(ctx.db, 'person', ctx.project.id, input.ownerId, 'ownerId');
    const data: any = { ...input };
    delete data.phaseIds;
    delete data.subphaseIds;
    delete data.waveIds;
    delete data.dependsOn;
    if (!existing) {
      // Code attribué par le serveur (C1…), numéro d'ordre = max + 1.
      const all = await ctx.db.workstream.findMany({ where: { projectId: ctx.project.id }, select: { code: true, seq: true } });
      data.code = nextCode(all.map((w) => w.code), 'C', 1);
      data.seq = input.seq ?? Math.max(0, ...all.map((w) => w.seq)) + 1;
    }
    if (input.dependsOn !== undefined) data.dependsOnAll = input.dependsOn === 'ALL';
    for (const p of input.phaseIds ?? []) await mustExist(ctx.db, 'phase', ctx.project.id, p, 'phaseIds');
    for (const w of input.waveIds ?? []) await mustExist(ctx.db, 'wave', ctx.project.id, w, 'waveIds');
    const deps: string[] | undefined = Array.isArray(input.dependsOn) ? input.dependsOn : input.dependsOn === 'ALL' ? [] : undefined;
    for (const d of deps ?? []) await mustExist(ctx.db, 'workstream', ctx.project.id, d, 'dependsOn');
    // Sous-phases (06/10/2026) : chacune appartient à l'une des phases du chantier ; une phase retirée emporte ses
    // sous-phases (décision D3), avec un avertissement.
    const warnings: string[] = [];
    const phasesNow: string[] = input.phaseIds ?? (existing?.phases ?? []).map((p: any) => p.phaseId);
    const subsBefore: string[] = (existing?.subphases ?? []).map((s: any) => s.subphaseId);
    let subs: string[] | undefined;
    if (input.subphaseIds !== undefined || (input.phaseIds !== undefined && subsBefore.length)) {
      const wanted: string[] = input.subphaseIds ?? subsBefore;
      const rows = wanted.length ? await ctx.db.subphase.findMany({ where: { projectId: ctx.project.id, id: { in: wanted } }, select: { id: true, code: true, phaseId: true } }) : [];
      const unknown = wanted.filter((w) => !rows.some((r) => r.id === w));
      if (unknown.length) throw badRequest('Référence invalide', { subphaseIds: `sous-phase introuvable : ${unknown.join(', ')}` });
      const phaseOf = new Map(rows.map((r) => [r.id, r.phaseId]));
      if (input.subphaseIds !== undefined) {
        const foreign = foreignSubphases(wanted, phasesNow, phaseOf);
        if (foreign.length) throw badRequest('Sous-phase hors des phases du chantier', { subphaseIds: `${foreign.map((f) => rows.find((r) => r.id === f)?.code ?? f).join(', ')} : la phase n’est pas rattachée au chantier` });
        subs = wanted;
      } else {
        const { kept, dropped } = keepSubphasesOf(wanted, phasesNow, phaseOf);
        if (dropped.length) {
          subs = kept;
          warnings.push(`Sous-phases retirées avec leur phase : ${dropped.map((d) => rows.find((r) => r.id === d)?.code ?? d).join(', ')}`);
        }
      }
    }
    return {
      data,
      warnings,
      relations: async (db, id) => {
        if (deps?.includes(id)) throw badRequest('Dépendance invalide', { dependsOn: 'un chantier ne peut dépendre de lui-même' });
        if (deps) {
          // Dépendance circulaire (06/10/2026) : refusée, quel que soit le nombre de chantiers dans la boucle.
          const all = await db.workstream.findMany({ where: { projectId: ctx.project.id }, select: { id: true, code: true, dependencies: { select: { dependsOnId: true } } } });
          const graph = new Map(all.map((w) => [w.id, w.id === id ? deps : w.dependencies.map((d) => d.dependsOnId)]));
          if (!graph.has(id)) graph.set(id, deps);
          const cycle = dependencyCycle(graph);
          if (cycle) {
            const code = (x: string) => all.find((w) => w.id === x)?.code ?? data.code ?? x;
            throw badRequest('Dépendance circulaire', { dependsOn: `dépendance circulaire : ${cycle.map(code).join(' → ')}` });
          }
        }
        if (input.phaseIds) {
          await db.workstreamPhase.deleteMany({ where: { wsId: id } });
          await db.workstreamPhase.createMany({ data: input.phaseIds.map((phaseId: string) => ({ wsId: id, phaseId })) });
        }
        if (subs) {
          await db.workstreamSubphase.deleteMany({ where: { wsId: id } });
          await db.workstreamSubphase.createMany({ data: subs.map((subphaseId) => ({ wsId: id, subphaseId })) });
        }
        if (input.waveIds) {
          await db.workstreamWave.deleteMany({ where: { wsId: id } });
          await db.workstreamWave.createMany({ data: input.waveIds.map((waveId: string) => ({ wsId: id, waveId })) });
        }
        if (deps) {
          await db.workstreamDependency.deleteMany({ where: { wsId: id } });
          await db.workstreamDependency.createMany({ data: deps.map((dependsOnId) => ({ wsId: id, dependsOnId })) });
        }
      },
    };
  },
  async serializeMany(_ctx, rows) {
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      seq: r.seq,
      name: r.name,
      ownerId: r.ownerId,
      status: r.status,
      startDate: r.startDate,
      endDate: r.endDate,
      progressPct: r.progressPct,
      plannedPctOverride: r.plannedPctOverride,
      critical: r.critical,
      description: r.description,
      phaseIds: (r.phases ?? []).map((p: any) => p.phaseId).sort(),
      subphaseIds: (r.subphases ?? []).map((s: any) => s.subphaseId).sort(),
      waveIds: (r.waves ?? []).map((w: any) => w.waveId).sort(),
      dependsOn: r.dependsOnAll ? 'ALL' : (r.dependencies ?? []).map((d: any) => d.dependsOnId).sort(),
      version: r.version,
    }));
  },
  label: (r) => `${r.code} · ${r.name}`,
  wsOf: (r) => r.id,
};

export const DELIVERABLES: EntityConfig = {
  route: 'deliverables',
  entityType: 'DELIVERABLE',
  delegate: 'deliverable',
  create: S.DeliverableCreate,
  patch: S.patchOf(S.DeliverableCreate),
  include: { subphase: true },
  orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  filters: ['subphaseId', 'workstreamId', 'ownerId'],
  newId: async () => techId('l'),
  async prepare(ctx, input, existing) {
    const m = merged(existing, input) as any;
    await mustExist(ctx.db, 'subphase', ctx.project.id, input.subphaseId, 'subphaseId');
    await mustExist(ctx.db, 'workstream', ctx.project.id, input.workstreamId, 'workstreamId');
    await mustExist(ctx.db, 'person', ctx.project.id, input.ownerId, 'ownerId');
    checkRange(m.start, m.due, ['start', 'due']);
    const data: any = { ...input };
    if (!existing) data.order = await ctx.db.deliverable.count({ where: { projectId: ctx.project.id } });
    return { data, warnings: [] };
  },
  async serializeMany(ctx, rows) {
    const persons = await ctx.db.person.findMany({ where: { projectId: ctx.project.id }, select: { id: true, teamId: true } });
    const teamOf = Object.fromEntries(persons.map((p) => [p.id, p.teamId]));
    return rows.map((r) => deliverableView(r, r.subphase, teamOf[r.ownerId] ?? null, ctx.today));
  },
  label: (r) => r.name,
  wsOf: (r) => r.workstreamId,
};

export const TEAMS: EntityConfig = {
  route: 'teams',
  entityType: 'TEAM',
  delegate: 'team',
  create: S.TeamCreate,
  patch: S.patchOf(S.TeamCreate),
  orderBy: [{ createdAt: 'asc' }, { name: 'asc' }],
  newId: async () => techId('t'),
  async prepare(ctx, input, existing) {
    if (input.name) {
      const dup = await ctx.db.team.findFirst({ where: { projectId: ctx.project.id, name: { equals: input.name, mode: 'insensitive' }, NOT: existing ? { id: existing.id } : undefined } });
      if (dup) throw conflict('DUPLICATE', `L'équipe « ${input.name} » existe déjà`);
    }
    return { data: { ...input }, warnings: [] };
  },
  async serializeMany(ctx, rows) {
    const counts = await ctx.db.person.groupBy({ by: ['teamId'], where: { projectId: ctx.project.id, active: true }, _count: true });
    const c = Object.fromEntries(counts.map((x) => [x.teamId, x._count]));
    return rows.map((r) => ({ id: r.id, name: r.name, description: r.description, kind: r.kind, personCount: c[r.id] ?? 0, version: r.version }));
  },
  label: (r) => r.name,
};

export const ROLES: EntityConfig = {
  route: 'roles',
  entityType: 'ROLE',
  delegate: 'projectRole',
  create: S.RoleCreate,
  patch: S.patchOf(S.RoleCreate),
  orderBy: [{ order: 'asc' }],
  newId: async () => techId('ro'),
  async prepare(ctx, input, existing) {
    if (input.label) {
      const dup = await ctx.db.projectRole.findFirst({ where: { projectId: ctx.project.id, label: { equals: input.label, mode: 'insensitive' }, NOT: existing ? { id: existing.id } : undefined } });
      if (dup) throw conflict('DUPLICATE', `Le rôle « ${input.label} » existe déjà`);
    }
    const data: any = { ...input };
    if (!existing && data.order === undefined) data.order = await ctx.db.projectRole.count({ where: { projectId: ctx.project.id } });
    return { data, warnings: [] };
  },
  async serializeMany(ctx, rows) {
    const as = await ctx.db.assignment.findMany({ where: { projectId: ctx.project.id } });
    const persons = await ctx.db.person.findMany({ where: { projectId: ctx.project.id, active: true }, select: { id: true } });
    const activeP = new Set(persons.map((p) => p.id));
    const count: Record<string, Set<string>> = {};
    for (const a of as) if (assignmentActive(a, ctx.today) && activeP.has(a.personId)) (count[a.roleId] ??= new Set()).add(a.personId);
    return rows.map((r) => ({ id: r.id, label: r.label, description: r.description, order: r.order, tier: r.tier, personCount: count[r.id]?.size ?? 0, version: r.version }));
  },
  label: (r) => r.label,
};

export const PERSONS: EntityConfig = {
  route: 'persons',
  entityType: 'PERSON',
  delegate: 'person',
  create: S.PersonCreate,
  patch: S.patchOf(S.PersonCreate),
  orderBy: [{ order: 'asc' }, { lastName: 'asc' }],
  filters: ['teamId', 'active'],
  newId: async () => techId('p'),
  async prepare(ctx, input, existing) {
    await mustExist(ctx.db, 'team', ctx.project.id, input.teamId, 'teamId');
    if (input.email) {
      const dup = await ctx.db.person.findFirst({ where: { projectId: ctx.project.id, email: { equals: input.email, mode: 'insensitive' }, NOT: existing ? { id: existing.id } : undefined } });
      if (dup) throw conflict('DUPLICATE', `L'e-mail ${input.email} est déjà utilisé`);
    }
    for (const w of input.wsIds ?? []) await mustExist(ctx.db, 'workstream', ctx.project.id, w, 'wsIds');
    const data: any = { ...input };
    if (!existing) data.order = await ctx.db.person.count({ where: { projectId: ctx.project.id } });
    return { data, warnings: [] };
  },
  async serializeMany(ctx, rows) {
    return personViews(ctx.db, ctx.project.id, rows, ctx.today);
  },
  label: (r) => `${r.firstName} ${r.lastName}`.trim(),
};

export const ASSIGNMENTS: EntityConfig = {
  route: 'assignments',
  entityType: 'ASSIGNMENT',
  delegate: 'assignment',
  create: S.AssignmentCreate,
  patch: S.patchOf(S.AssignmentCreate),
  orderBy: [{ personId: 'asc' }, { startDate: 'asc' }],
  filters: ['personId', 'roleId'],
  newId: async () => techId('as'),
  async prepare(ctx, input, existing) {
    const m = merged(existing, input) as any;
    await mustExist(ctx.db, 'person', ctx.project.id, input.personId, 'personId');
    await mustExist(ctx.db, 'projectRole', ctx.project.id, input.roleId, 'roleId');
    checkRange(m.startDate, m.endDate);
    const dup = await ctx.db.assignment.findFirst({ where: { personId: m.personId, roleId: m.roleId, startDate: m.startDate, NOT: existing ? { id: existing.id } : undefined } });
    if (dup) throw conflict('DUPLICATE', 'Affectation déjà existante (même personne, même rôle, même début)');
    return { data: { ...input }, warnings: [] };
  },
  async serializeMany(ctx, rows) {
    return rows.map((r) => ({ id: r.id, personId: r.personId, roleId: r.roleId, startDate: r.startDate, endDate: r.endDate, active: assignmentActive(r, ctx.today), version: r.version }));
  },
  label: (r) => `${r.personId} · ${r.roleId}`,
};

export const BODIES: EntityConfig = {
  route: 'governance-bodies',
  entityType: 'GOVERNANCE_BODY',
  delegate: 'governanceBody',
  create: S.BodyCreate,
  patch: S.patchOf(S.BodyCreate).omit({ members: true }),
  include: { members: { orderBy: { order: 'asc' } } },
  orderBy: [{ order: 'asc' }],
  newId: async () => techId('g'),
  async prepare(ctx, input, existing) {
    if (input.shortName) {
      const dup = await ctx.db.governanceBody.findFirst({ where: { projectId: ctx.project.id, shortName: { equals: input.shortName, mode: 'insensitive' }, NOT: existing ? { id: existing.id } : undefined } });
      if (dup) throw conflict('DUPLICATE', `Le nom court « ${input.shortName} » est déjà utilisé`);
    }
    const data: any = { ...input };
    if (data.color) data.color = data.color.toUpperCase();
    const members = input.members as Array<{ personId: string; role: string }> | undefined;
    delete data.members;
    if (!existing) data.order = await ctx.db.governanceBody.count({ where: { projectId: ctx.project.id } });
    for (const mb of members ?? []) await mustExist(ctx.db, 'person', ctx.project.id, mb.personId, 'members');
    return {
      data,
      warnings: [],
      relations: members ? async (db, id) => replaceMembers(db, id, members) : undefined,
    };
  },
  async serializeMany(_ctx, rows) {
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      shortName: r.shortName,
      color: r.color,
      frequency: r.frequency,
      level: r.level,
      description: r.description,
      members: (r.members ?? []).map((m: any) => ({ personId: m.personId, role: m.role })),
      version: r.version,
    }));
  },
  label: (r) => `${r.shortName} · ${r.name}`,
};

export async function replaceMembers(db: Tx, bodyId: string, members: Array<{ personId: string; role: string }>) {
  const seen = new Set<string>();
  for (const m of members) {
    if (seen.has(m.personId)) throw conflict('DUPLICATE', `Membre en double : ${m.personId}`);
    seen.add(m.personId);
  }
  await db.bodyMember.deleteMany({ where: { bodyId } });
  await db.bodyMember.createMany({ data: members.map((m, i) => ({ bodyId, personId: m.personId, role: m.role as any, order: i })) });
}

export const MILESTONES: EntityConfig = {
  route: 'milestones',
  entityType: 'MILESTONE',
  delegate: 'milestone',
  create: S.MilestoneCreate,
  patch: S.patchOf(S.MilestoneCreate),
  orderBy: [{ iso: 'asc' }, { code: 'asc' }],
  filters: ['phaseId', 'subphaseId', 'wsId', 'waveId'],
  newId: async (ctx) => {
    const all = await ctx.db.milestone.findMany({ where: { projectId: ctx.project.id }, select: { code: true } });
    return genReadable(ctx, 'milestone', nextCode(all.map((m) => m.code), 'J', 2));
  },
  async prepare(ctx, input, existing) {
    const m = merged(existing ? { ...existing, owner: existing.ownerId } : null, input) as any;
    const phase = await mustExist(ctx.db, 'phase', ctx.project.id, m.phaseId, 'phaseId');
    if (m.subphaseId) {
      const sp = await mustExist(ctx.db, 'subphase', ctx.project.id, m.subphaseId, 'subphaseId');
      // § 7.2 : la sous-phase doit appartenir à la phase du jalon (422).
      if (sp.phaseId !== m.phaseId) throw businessRule("La sous-phase n'appartient pas à la phase du jalon", { subphaseId: `${sp.code} n'est pas une sous-phase de ${phase.code}` });
    }
    await mustExist(ctx.db, 'workstream', ctx.project.id, input.wsId, 'wsId');
    await mustExist(ctx.db, 'wave', ctx.project.id, input.waveId, 'waveId');
    await mustExist(ctx.db, 'person', ctx.project.id, input.owner, 'owner');
    const data: any = { ...input };
    if ('owner' in data) {
      data.ownerId = data.owner;
      delete data.owner;
    }
    if (!existing) {
      const all = await ctx.db.milestone.findMany({ where: { projectId: ctx.project.id }, select: { code: true } });
      data.code = nextCode(all.map((x) => x.code), 'J', 2);
      data.baselineIso = input.baselineIso || input.iso;
      data.confirmedAt = new Date();
    } else if (input.iso && input.iso !== existing.iso) {
      // Modifier la date prévue vaut confirmation (§ 7.2).
      data.confirmedAt = new Date();
    }
    if (existing && input.baselineIso === null) data.baselineIso = m.iso;
    const warnings = outsidePeriod(m.iso, phase.startDate, phase.endDate)
      ? [`La date prévue (${m.iso}) sort de la période de la phase ${phase.code} · ${phase.name} (${phase.startDate} → ${phase.endDate})`]
      : [];
    return { data, warnings };
  },
  async serializeMany(ctx, rows) {
    return milestoneViews(rows, ctx.today);
  },
  label: (r) => `${r.code} · ${r.n}`,
  wsOf: (r) => r.wsId,
};

export const REFERENTIAL_ENTITIES: EntityConfig[] = [CLIENTS, WAVES, PHASES, SUBPHASES, WORKSTREAMS, DELIVERABLES, TEAMS, ROLES, PERSONS, ASSIGNMENTS, BODIES, MILESTONES];

export function entityByRoute(route: string): EntityConfig | undefined {
  return REFERENTIAL_ENTITIES.find((e) => e.route === route);
}

export { confirmedDays, milestoneGap, normKey };
