import { Tx } from '../core/prisma.service';
import {
  actionLate,
  assignmentActive,
  confirmedDays,
  deliverableDates,
  deliverableRisk,
  deliverableStatus,
  milestoneGap,
  milestoneStates,
  riskCriticality,
  riskScore,
  sessionToConfirm,
} from '../domain/rules';
import { isoInTimezone } from '../domain/dates';

/**
 * Représentations API des entités (champs du brief + champs calculés, jamais stockés).
 */

export function initials(firstName: string, lastName: string): string {
  const parts = `${firstName} ${lastName}`.trim().split(/\s+/);
  return parts.map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

export const ORG_OF_KIND: Record<string, string> = { CLIENT: 'CLIENT', AMOA: 'AMOA', INTEGRATOR: 'INTEG', OTHER: 'OTHER' };

export function confirmedAtIso(d: Date | null): string | null {
  return d ? isoInTimezone(d, 'Europe/Paris') : null;
}

export function milestoneViews(rows: any[], today: string) {
  const states = milestoneStates(rows, today);
  return rows.map((m) => {
    const conf = confirmedAtIso(m.confirmedAt);
    return {
      id: m.id,
      code: m.code,
      n: m.n,
      phaseId: m.phaseId,
      subphaseId: m.subphaseId,
      wsId: m.wsId,
      waveId: m.waveId,
      owner: m.ownerId,
      iso: m.iso,
      baselineIso: m.baselineIso,
      confirmedAt: m.confirmedAt,
      confirmedDays: confirmedDays(conf, today),
      gap: milestoneGap(m.iso, m.baselineIso),
      state: states.get(m),
      version: m.version,
    };
  });
}

export function deliverableView(r: any, sp: any, teamId: string | null, today: string) {
  const { start, due } = deliverableDates(r.start, r.due, sp ?? { startDate: null, endDate: null });
  return {
    id: r.id,
    name: r.name,
    subphaseId: r.subphaseId,
    phaseId: sp?.phaseId ?? null,
    workstreamId: r.workstreamId,
    ownerId: r.ownerId,
    teamId,
    teamLabel: r.teamLabel,
    start: r.start,
    due: r.due,
    prog: r.prog,
    riskOverride: r.riskOverride,
    status: deliverableStatus(r.prog, start, due!, today),
    risk: deliverableRisk(r.prog, start, due!, today, r.riskOverride),
    version: r.version,
  };
}

export async function personViews(db: Tx, projectId: string, rows: any[], today: string) {
  const teams = await db.team.findMany({ where: { projectId } });
  const teamById = Object.fromEntries(teams.map((t) => [t.id, t]));
  const roles = await db.projectRole.findMany({ where: { projectId } });
  const roleById = Object.fromEntries(roles.map((r) => [r.id, r]));
  const assigns = await db.assignment.findMany({ where: { projectId }, orderBy: { startDate: 'asc' } });
  return rows.map((p) => {
    const mine = assigns.filter((a) => a.personId === p.id);
    const active = mine.filter((a) => assignmentActive(a, today));
    const team = p.teamId ? teamById[p.teamId] : null;
    return {
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      name: `${p.firstName} ${p.lastName}`.trim(),
      initials: initials(p.firstName, p.lastName),
      email: p.email,
      teamId: p.teamId,
      team: team?.name ?? null,
      org: team ? ORG_OF_KIND[team.kind] : null,
      title: p.title,
      active: p.active,
      photoUrl: p.photoUrl,
      wsIds: p.wsIds,
      roleIds: [...new Set(active.map((a) => a.roleId))],
      roles: [...new Set(active.map((a) => roleById[a.roleId]?.label).filter(Boolean))],
      hasActiveAssignment: active.length > 0,
      version: p.version,
    };
  });
}

export function riskView(r: any) {
  return {
    id: r.id,
    code: r.code,
    n: r.n,
    p: r.p,
    i: r.i,
    score: riskScore(r.p, r.i),
    criticality: riskCriticality(r.p, r.i),
    plan: r.plan,
    owner: r.ownerId,
    // Chantiers (08/10/2026) : principal (`wsId`, null si transverse), liste (`wsIds`), transverse (`allWs`).
    wsId: r.wsId ?? null,
    wsIds: r.allWs ? [] : r.wsIds?.length ? r.wsIds : r.wsId ? [r.wsId] : [],
    allWs: !!r.allWs,
    dueIso: r.dueIso,
    status: r.status,
    version: r.version,
  };
}

export function issueView(x: any) {
  return {
    id: x.id,
    code: x.code,
    n: x.n,
    sev: x.sev,
    originRiskId: x.originRiskId,
    openedIso: x.openedIso,
    owner: x.ownerId,
    wsId: x.wsId,
    targetIso: x.targetIso,
    targetSessionId: x.targetSessionId,
    detail: x.detail,
    status: x.status,
    version: x.version,
  };
}

export function actionView(a: any, today: string) {
  return {
    id: a.id,
    code: a.code,
    n: a.n,
    detail: a.detail,
    owner: a.ownerId,
    // Chantiers (09/10/2026, comme les risques) : principal (`wsId`, null si transverse), liste (`wsIds`), transverse (`allWs`).
    wsId: a.wsId,
    wsIds: a.allWs ? [] : a.wsIds?.length ? a.wsIds : a.wsId ? [a.wsId] : [],
    allWs: !!a.allWs,
    dueIso: a.dueIso,
    status: a.status,
    prio: a.prio,
    sourceType: a.sourceType,
    sourceId: a.sourceId,
    closedAt: a.closedAt,
    late: actionLate(a.status, a.dueIso, today),
    version: a.version,
  };
}

export function decisionView(d: any, opts: { withArbitration?: boolean } = {}) {
  return {
    id: d.id,
    code: d.code,
    t: d.t,
    p: d.p,
    status: d.status,
    crIso: d.crIso,
    ddIso: d.ddIso,
    wsId: d.wsId,
    bodyId: d.bodyId,
    decL: d.decL,
    maker: d.makerId,
    impact: d.impact,
    supersedes: d.supersedesId,
    expectedSessionId: d.expectedSessionId,
    full: d.full,
    opt: d.opt,
    ...(opts.withArbitration ? { arbitration: d.arbitration ?? null } : {}),
    readOnly: d.status === 'ARBITRATED',
    version: d.version,
  };
}

export function sessionView(s: any, today: string) {
  return {
    id: s.id,
    bodyId: s.bodyId,
    number: s.number,
    dateIso: s.dateIso,
    time: s.time,
    place: s.place,
    status: s.status,
    participants: s.participants,
    reportId: s.reportId,
    toConfirm: sessionToConfirm(s.status, s.dateIso, today),
    version: s.version,
  };
}
