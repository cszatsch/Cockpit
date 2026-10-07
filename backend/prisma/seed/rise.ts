import { Prisma, PrismaClient } from '@prisma/client';
import { parseFrLabel, parseRefDate, isIsoDate } from '../../src/domain/dates';
import { codeFromLabel, normKey, PLAN_STATUS_FR, WAVE_STATUS_FR, WS_STATUS_FR } from '../../src/domain/labels';

/**
 * Amorçage du projet RISE à partir de `rise-data.js` et `planning-data.js`.
 * Conversions et corrections : brief Cockpit § 12 et `docs/DECISIONS.md` (Q2, Q5, Q6, Q8, Q9).
 * Les ids historiques du jeu (p01, C1, J01, R01, D-007…) sont conservés.
 */

import { loadDemo } from './source';
import { rollupPhaseProgress } from '../../src/cockpit/phase-progress';
export const RISE_ID = 'RISE';
/** Q2 : chantier transverse par défaut des actions sans source. */
export const DEFAULT_TRANSVERSAL_WS_CODE = 'C8';
/** Q5 : décideur renseigné pour les décisions ouvertes sans décideur (sponsor, décideur de D-007). */
export const OPEN_DECISIONS_DEFAULT_MAKER = 'p04';

type J = any;

const TEAM_KIND: Record<string, 'CLIENT' | 'AMOA' | 'INTEGRATOR' | 'OTHER'> = {
  t10: 'AMOA',
  t11: 'AMOA',
  t12: 'INTEGRATOR',
  t13: 'CLIENT',
  t14: 'OTHER',
};

/** Rôle de membre d'instance (absent du jeu) : le directeur de programme préside les instances de pilotage. */
function memberRole(bodyId: string, personId: string, idx: number): 'CHAIR' | 'MEMBER' {
  const chairs: Record<string, string> = { g1: 'p04', g2: 'p03', g5: 'p03', g6: 'p04' };
  return chairs[bodyId] === personId ? 'CHAIR' : idx === 0 && !chairs[bodyId] ? 'CHAIR' : 'MEMBER';
}

const BODY_LEVEL: Record<string, 'STRATEGIC' | 'STEERING' | 'OPERATIONAL' | 'OFF_CYCLE'> = {
  g1: 'STRATEGIC',
  g2: 'STEERING',
  g3: 'OPERATIONAL',
  g4: 'OPERATIONAL',
  g5: 'OFF_CYCLE',
  g6: 'STRATEGIC',
};

function splitName(full: string): { firstName: string; lastName: string } {
  const i = full.indexOf(' ');
  return i < 0 ? { firstName: full, lastName: '' } : { firstName: full.slice(0, i), lastName: full.slice(i + 1) };
}

function sourceTypeOf(src: string | null): 'RISK' | 'ISSUE' | 'MILESTONE' | 'DECISION' | null {
  if (!src) return null;
  if (/^R\d+/.test(src)) return 'RISK';
  if (/^P\d+/.test(src)) return 'ISSUE';
  if (/^J\d+/.test(src)) return 'MILESTONE';
  if (/^D-\d+/.test(src)) return 'DECISION';
  return null;
}

export async function seedRise(db: PrismaClient, rise: J, plan: J): Promise<void> {
  const M = rise.model;
  const today: string = rise.today;

  // ── Client et projet ──
  const c = M.CLIENT.rows[0];
  await db.client.create({
    data: { id: c.id, code: c.cells[0], name: c.cells[1], description: c.cells[2], status: 'ACTIVE' },
  });
  const pv = Object.fromEntries(M.PROJECT.rows.map((r: J) => [r.id, r.cells[1]]));
  const start = parseRefDate(pv.start, 'start')!.iso;
  const end = parseRefDate(pv.end, 'end')!.iso;
  const teamByName = Object.fromEntries(M.TEAM.rows.map((r: J) => [normKey(r.cells[1]), r.id]));
  await db.project.create({
    data: {
      id: RISE_ID,
      clientId: c.id,
      code: rise.project.code,
      // La fiche projet (`project`) fait foi sur le nom ; model.PROJECT portait un libellé plus ancien.
      name: rise.project.name,
      objective: rise.project.objective,
      startDate: start,
      targetEndDate: end,
      timezone: pv.tz,
      city: pv.city,
      country: pv.country,
      status: 'ACTIVE',
      currency: pv.currency,
      editorTeamId: teamByName[normKey(rise.project.editor)] ?? null,
      integratorTeamId: teamByName[normKey(rise.project.integrator)] ?? null,
      programDirectorId: rise.project.programDirectorId,
      sponsorId: 'p04',
      forecastGoliveIso: rise.project.forecast.goliveIso,
      // Brief § 12 : le forçage « Go-Live 1er décembre maintenu » est contredit par D-007 → supprimé.
      healthOverride: Prisma.DbNull,
      createdAt: new Date('2024-03-01T08:00:00Z'),
    },
  });
  const b = rise.project.baseline;
  await db.baselineVersion.createMany({
    data: [
      {
        projectId: RISE_ID,
        version: b.previous.version,
        date: parseFrLabel(b.previous.date)!,
        approvedAt: parseFrLabel(b.previous.approvedAt),
        approvedById: 'p04',
        reason: '4e date de bascule (D-002)',
        current: false,
      },
      {
        projectId: RISE_ID,
        version: b.version,
        date: parseFrLabel(b.date)!,
        approvedAt: parseFrLabel(b.approvedAt),
        approvedById: b.approvedBy,
        reason: b.reason,
        current: true,
      },
    ],
  });

  // ── Équipes, rôles, personnes ──
  for (const [i, r] of M.TEAM.rows.entries()) {
    await db.team.create({
      data: { id: r.id, projectId: RISE_ID, name: r.cells[1], description: r.cells[2] || null, kind: TEAM_KIND[r.id] ?? 'OTHER', createdAt: new Date(Date.UTC(2024, 0, 1, 0, i)) },
    });
  }
  // Niveau d'organigramme (roTier) : 0 = direction, 1 = pilotage, 2 = équipes, 3 = intervenants.
  const ROLE_TIER: Record<string, number> = { ro01: 0, ro02: 0, ro03: 0, ro04: 0, ro05: 0, ro06: 1, ro07: 1, ro08: 2, ro09: 2, ro10: 2, ro11: 2, ro12: 3, ro13: 3 };
  for (const [i, r] of M.ROLE.rows.entries()) {
    await db.projectRole.create({ data: { id: r.id, projectId: RISE_ID, label: r.cells[0], order: i, tier: ROLE_TIER[r.id] ?? null } });
  }
  const wsByName = Object.fromEntries(M.WORKSTREAM.rows.map((r: J) => [normKey(r.cells[1]), r.id]));
  for (const [i, r] of M.PERSON.rows.entries()) {
    const { firstName, lastName } = splitName(r.cells[0]);
    const wsIds = String(r.cells[5] || '')
      .split(' · ')
      .map((s: string) => wsByName[normKey(s)])
      .filter(Boolean);
    await db.person.create({
      data: {
        id: r.id,
        projectId: RISE_ID,
        firstName,
        lastName,
        email: r.cells[6],
        teamId: r.teamId,
        title: r.cells[3] || null,
        active: r.active !== false,
        wsIds,
        order: i,
      },
    });
  }

  // ── Affectations (Q6) : une par rôle de la fiche personne ──
  const roleByLabel = Object.fromEntries(M.ROLE.rows.map((r: J) => [normKey(r.cells[0]), r.id]));
  const legacyEnds: Record<string, (string | null)[]> = {};
  for (const r of M.PROJECT_ASSIGNMENT.rows) {
    const e = parseRefDate(r.cells[4] === '—' ? '' : r.cells[4], 'end');
    (legacyEnds[r.personId] ??= []).push(e ? e.iso : null);
  }
  for (const r of M.PERSON.rows) {
    const roles = String(r.cells[4] || '').split(' · ').filter(Boolean);
    const ends = legacyEnds[r.id];
    // Fin = fin de l'affectation historique en cours ; sans fin connue → en cours.
    const endDate = ends && ends.length && ends.every((e) => e) ? ends.sort().at(-1)! : null;
    for (const lab of roles) {
      const roleId = roleByLabel[normKey(lab)];
      if (!roleId) continue;
      await db.assignment.create({
        data: { id: `as-${r.id}-${roleId}`, projectId: RISE_ID, personId: r.id, roleId, startDate: start, endDate },
      });
    }
  }

  // ── Lots ──
  for (const r of M.WAVE.rows) {
    const s = parseRefDate(r.cells[2], 'start');
    const e = parseRefDate(r.cells[3], 'end');
    await db.wave.create({
      data: {
        id: r.id,
        projectId: RISE_ID,
        seq: Number(r.cells[0]),
        name: String(r.cells[1]).replace(/^Lot \d+ · /, ''),
        startDate: s?.iso,
        startPrec: s?.prec ?? 'D',
        endDate: e?.iso,
        endPrec: e?.prec ?? 'D',
        status: (codeFromLabel(WAVE_STATUS_FR, r.cells[4]) as any) ?? 'PLANNED',
        ownerId: r.ownerId ?? null,
      },
    });
  }

  // ── Phases (Référentiel + planning : mêmes ids) ──
  const planPhase = Object.fromEntries(plan.phases.map((p: J) => [p.id, p]));
  for (const r of M.PHASE.rows) {
    const pp = planPhase[r.id];
    const s = parseRefDate(r.cells[3], 'start')!;
    const e = parseRefDate(r.cells[4], 'end')!;
    await db.phase.create({
      data: {
        id: r.id,
        projectId: RISE_ID,
        seq: Number(r.cells[0]),
        code: pp?.code ?? r.cells[0],
        name: r.cells[1],
        description: r.desc ?? null,
        // Le planning porte la date au jour ; la précision d'affichage du Référentiel est conservée.
        startDate: pp?.start ?? s.iso,
        startPrec: s.prec,
        endDate: pp?.end ?? e.iso,
        endPrec: e.prec,
        status: (codeFromLabel(PLAN_STATUS_FR, r.cells[5]) as any) ?? 'PLANNED',
        progressPct: pp?.reel ?? 0,
        critical: !!pp?.crit,
        ownerId: pp?.owner ?? rise.project.programDirectorId,
        waves: { create: (r.waveIds ?? []).map((w: string) => ({ waveId: w })) },
      },
    });
  }
  const planSub = Object.fromEntries(plan.subphases.map((p: J) => [p.id, p]));
  for (const r of M.SUBPHASE.rows) {
    const pp = planSub[r.id];
    const s = parseRefDate(r.cells[3], 'start');
    const e = parseRefDate(r.cells[4], 'end');
    await db.subphase.create({
      data: {
        id: r.id,
        projectId: RISE_ID,
        phaseId: r.phaseId,
        code: r.cells[0],
        name: r.cells[2],
        description: r.desc ?? null,
        startDate: pp?.start ?? s?.iso,
        startPrec: s?.prec ?? 'D',
        endDate: pp?.end ?? e?.iso,
        endPrec: e?.prec ?? 'D',
        status: (codeFromLabel(PLAN_STATUS_FR, r.cells[5]) as any) ?? 'PLANNED',
        progressPct: pp?.reel ?? 0,
        critical: !!pp?.crit,
        ownerId: pp?.owner ?? null,
      },
    });
  }

  // Avancement des phases avec sous-phases : moyenne pondérée par la durée (07/10/2026), comme dans l'application.
  await rollupPhaseProgress(db as any, M.PHASE.rows.map((r: J) => r.id));

  // ── Chantiers ──
  const planWs = Object.fromEntries(plan.chantiers.map((p: J) => [p.id, p]));
  const waveIds = M.WAVE.rows.map((w: J) => w.id);
  for (const r of M.WORKSTREAM.rows) {
    const pp = planWs[r.id];
    await db.workstream.create({
      data: {
        id: r.id,
        projectId: RISE_ID,
        code: r.id,
        seq: Number(r.cells[0]),
        name: r.cells[1],
        ownerId: r.ownerId,
        status: (codeFromLabel(WS_STATUS_FR, r.cells[3]) as any) ?? 'ACTIVE',
        startDate: pp?.start ?? null,
        endDate: pp?.end ?? null,
        progressPct: pp?.reel ?? 0,
        critical: !!pp?.crit,
        dependsOnAll: r.dependsOn === 'ALL',
        phases: { create: (r.phaseIds ?? []).map((p: string) => ({ phaseId: p })) },
        waves: { create: (r.waves ?? []).map((on: number, i: number) => (on ? { waveId: waveIds[i] } : null)).filter(Boolean) },
      },
    });
  }
  for (const r of M.WORKSTREAM.rows) {
    if (Array.isArray(r.dependsOn)) {
      await db.workstreamDependency.createMany({ data: r.dependsOn.map((d: string) => ({ wsId: r.id, dependsOnId: d })) });
    }
  }
  for (const [i, w] of rise.workstreams.entries()) {
    await db.workstreamProgress.create({
      data: {
        id: `wp${i + 1}`,
        projectId: RISE_ID,
        wsId: w.wsId,
        label: w.n,
        valuePct: w.v,
        targetPct: w.ref,
        detail: w.detail,
        ownerId: w.owner,
        order: i,
      },
    });
  }

  // ── Instances et membres ──
  for (const [i, r] of M.GOVERNANCE_BODY.rows.entries()) {
    await db.governanceBody.create({
      data: {
        id: r.id,
        projectId: RISE_ID,
        name: r.cells[0],
        description: r.cells[1],
        frequency: r.frequency,
        shortName: r.shortName,
        color: String(r.color).toUpperCase(),
        level: BODY_LEVEL[r.id] ?? null,
        order: i,
        members: { create: r.members.map((p: string, k: number) => ({ personId: p, role: memberRole(r.id, p, k), order: k })) },
      },
    });
  }

  // ── Jalons : confirmedAt = today − confirmedDays ──
  for (const m of rise.milestones) {
    const conf = new Date(`${today}T09:00:00Z`);
    conf.setUTCDate(conf.getUTCDate() - m.confirmedDays);
    await db.milestone.create({
      data: {
        id: m.id,
        projectId: RISE_ID,
        code: m.code,
        n: m.n,
        phaseId: m.phaseId,
        subphaseId: m.subphaseId ?? null,
        wsId: m.wsId ?? null,
        waveId: m.waveId ?? null,
        ownerId: m.owner ?? null,
        iso: m.iso,
        baselineIso: m.baselineIso || m.iso,
        confirmedAt: conf,
      },
    });
  }

  // ── Livrables ──
  for (const [i, r] of M.DELIVERABLE.rows.entries()) {
    await db.deliverable.create({
      data: {
        id: r.id,
        projectId: RISE_ID,
        name: r.cells[0],
        subphaseId: r.subphaseId,
        workstreamId: r.workstreamId ?? null,
        ownerId: r.ownerId,
        start: r.start ?? null,
        due: r.due,
        prog: r.prog ?? 0,
        riskOverride: r.riskOverride ? String(r.riskOverride).toUpperCase().replace('TENS', 'TENSION').replace('CRIT', 'CRITICAL') as any : null,
        teamLabel: r.cells[2] || null,
        order: i,
      },
    });
  }

  // ── Habilitations (ADMIN → AdminGrant, voir seed console) ──
  for (const h of rise.habilitations) {
    if (h.profile === 'ADMIN') continue;
    await db.habilitation.create({ data: { id: h.id, projectId: RISE_ID, personId: h.personId, profile: h.profile, wsId: h.wsId } });
  }

  // ── Séances ──
  const sessionByBodyDate: Record<string, string> = {};
  for (const s of rise.sessions) {
    sessionByBodyDate[`${s.bodyId}|${s.dateIso}`] = s.id;
    await db.session.create({
      data: {
        id: s.id,
        projectId: RISE_ID,
        bodyId: s.bodyId,
        number: s.number,
        dateIso: s.dateIso,
        time: s.time ?? null,
        place: s.place ?? null,
        status: s.status,
        participants: s.participants,
        // Rapports de démonstration retirés de l'amorçage le 03/10/2026 (`seedDemoReports`) : pas de rapport rattaché.
        reportId: null,
      },
    });
  }

  // ── Risques ──
  for (const r of rise.risks) {
    await db.risk.create({
      data: {
        id: r.id,
        projectId: RISE_ID,
        code: r.id,
        n: r.n,
        p: r.p,
        i: r.i,
        plan: r.plan ?? null,
        ownerId: r.owner,
        wsId: r.wsId,
        // « COPIL 26 sept. » : séance du COPIL à cette date (brief § 12).
        dueIso: parseFrLabel(r.due),
        status: r.status,
      },
    });
  }

  // ── Problèmes ──
  for (const x of rise.issues) {
    const targetIso = parseFrLabel(x.target);
    const isCopil = /^copil/i.test(String(x.target));
    await db.issue.create({
      data: {
        id: x.id,
        projectId: RISE_ID,
        code: x.id,
        n: x.n,
        sev: x.sev,
        originRiskId: x.origin ?? null,
        openedIso: parseFrLabel(x.opened)!,
        ownerId: x.owner,
        wsId: x.wsId,
        // « fin sept. » : pas de date exacte → dernier jour du mois (brief § 12, prudence documentée).
        targetIso: targetIso ?? (/fin sept/i.test(x.target) ? '2026-09-30' : null),
        targetSessionId: isCopil && targetIso ? sessionByBodyDate[`g1|${targetIso}`] ?? null : null,
        detail: x.detail ?? '',
        status: x.status,
      },
    });
  }

  // ── Actions (Q2 : chantier dérivé de la source, sinon C8) ──
  const wsOfSource: Record<string, string> = {};
  for (const r of rise.risks) wsOfSource[r.id] = r.wsId;
  for (const x of rise.issues) wsOfSource[x.id] = x.wsId;
  for (const m of rise.milestones) wsOfSource[m.id] = m.wsId;
  for (const d of rise.decisions) wsOfSource[d.id] = d.wsId;
  const PRIO: Record<string, 'HIGH' | 'MEDIUM' | 'LOW'> = { haute: 'HIGH', moyenne: 'MEDIUM', basse: 'LOW' };
  for (const [i, a] of rise.actions.entries()) {
    await db.action.create({
      data: {
        id: a.id,
        projectId: RISE_ID,
        code: a.id,
        n: a.n,
        detail: a.detail ?? null,
        ownerId: a.owner,
        wsId: (a.source && wsOfSource[a.source]) || DEFAULT_TRANSVERSAL_WS_CODE,
        dueIso: a.dueIso ?? parseFrLabel(a.due),
        status: a.status,
        prio: PRIO[normKey(a.prio)] ?? 'MEDIUM',
        sourceType: sourceTypeOf(a.source),
        sourceId: a.source ?? null,
        closedAt: a.closed ? parseFrLabel(a.closed) : null,
        order: i,
      },
    });
  }

  // ── Décisions (Q5 : décideur des décisions ouvertes ; D-002 remplacée par D-007) ──
  const replaced = new Set(rise.decisions.filter((d: J) => d.supersedes && d.status === 'ARBITRATED').map((d: J) => d.supersedes));
  for (const d of rise.decisions) {
    let status = d.status;
    if (replaced.has(d.id) && status === 'ARBITRATED') status = 'SUPERSEDED';
    const open = ['DRAFT', 'IN_REVIEW', 'TO_ARBITRATE'].includes(status);
    await db.decision.create({
      data: {
        id: d.id,
        projectId: RISE_ID,
        code: d.id,
        t: d.t,
        p: d.p,
        status,
        crIso: d.crIso,
        ddIso: isIsoDate(d.ddIso) ? d.ddIso : null,
        wsId: d.wsId,
        bodyId: d.bodyId,
        decL: d.decL || null,
        makerId: d.maker ?? (open && status !== 'DRAFT' ? OPEN_DECISIONS_DEFAULT_MAKER : null),
        // D-001 : « Remplacée par D-017 » (id inexistant) → D-002, qui la remplace réellement.
        impact: d.impact === 'Remplacée par D-017' ? 'Remplacée par D-002' : d.impact || null,
        supersedesId: d.supersedes ?? null,
        expectedSessionId: d.expectedSessionId ?? null,
        full: !!d.full,
        opt: d.opt ?? null,
        arbitration: d.full ? d007Arbitration() : undefined,
      },
    });
  }

  // Rapports, templates et journal de génération de démonstration : retirés de l'amorçage le 03/10/2026, chargés
  // seulement par les tests (`seedDemoReports`).

  // ── Budget ──
  await db.programBudget.create({ data: { projectId: RISE_ID, known: rise.programBudget.known, reason: rise.programBudget.reason } });
  const MS: Record<string, 'INVOICED' | 'IN_PROGRESS' | 'NEGOTIATION'> = { facture: 'INVOICED', 'en cours': 'IN_PROGRESS', 'en negociation': 'NEGOTIATION' };
  for (const [i, m] of rise.mission.entries()) {
    await db.missionPeriod.create({
      data: { id: `mp${i + 1}`, projectId: RISE_ID, period: m.period, amoa: m.amoa, sub: m.sub, status: MS[normKey(m.status)] ?? 'IN_PROGRESS', order: i },
    });
  }

  // Base de connaissance : vide. Les 8 documents factices (sans fichier) ne sont chargés que par les tests,
  // `seedDemoDocuments()` (décision du 30/09/2026).


  // ── Baromètre ──
  const bm = rise.barometre;
  const MONTHS: Record<string, string> = { nov: '2025-11', dec: '2025-12', fev: '2026-02', mar: '2026-03', avr: '2026-04', mai: '2026-05', jul: '2026-07' };
  for (const [i, [key, label]] of bm.months.entries()) {
    const s = bm.sentiment[key] ?? [0, 0, 0];
    await db.barometerSurvey.create({
      data: {
        projectId: RISE_ID,
        month: MONTHS[key],
        key,
        label,
        overallScore: bm.ecf.series[i],
        respondents: bm.respondents[i],
        sentiment: { negative: s[0], neutral: s[1], positive: s[2] },
      },
    });
  }
  for (const [i, d] of bm.domains.entries()) {
    const series = Object.fromEntries(bm.months.map(([k]: [string]) => MONTHS[k]).map((m: string, j: number) => [m, d.series[j] ?? null]));
    await db.barometerDomain.create({ data: { projectId: RISE_ID, n: d.n, size: d.size, resp: d.resp, series, range: d.range, order: i } });
  }


  // ── Contenus de présentation (brief § 12) ──
  const barometerGlobal = {
    label: bm.ecf.label,
    size: bm.ecf.size,
    questions: bm.questions.map((q: J) => ({ label: q.q, score: q.v, delta: q.delta })),
    themes: bm.themes.map(([label, tone]: [string, string]) => ({ label, tone: ({ ok: 'OK', vig: 'WATCH', risk: 'RISK' } as J)[tone] ?? 'WATCH' })),
  };
  const blocks: Record<string, unknown> = {
    'project.display': { phase: rise.project.phase, status: rise.project.status, editor: rise.project.editor, client: rise.project.client },
    committee: rise.committee,
    volets: rise.volets,
    riskStats: rise.riskStats,
    weekWins: rise.weekWins,
    missionNext: rise.missionNext,
    modelGaps: rise.modelGaps,
    referential: rise.referential,
    raci: rise.raci,
    'barometer.global': barometerGlobal,
    'model.meta': Object.fromEntries(
      Object.entries(M).map(([k, v]: [string, J]) => [k, { label: v.label, scope: v.scope, constraints: v.constraints, cols: v.cols, widths: v.widths, sortable: v.sortable }]),
    ),
  };
  for (const [key, data] of Object.entries(blocks)) {
    await db.contentBlock.create({ data: { projectId: RISE_ID, key, data: data as Prisma.InputJsonValue } });
  }
}

function dedupe<T extends { entityType: string; entityId: string }>(arr: T[]): T[] {
  const seen = new Set<string>();
  return arr.filter((x) => {
    const k = `${x.entityType}|${x.entityId}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Comités et rapports de démonstration (6 templates, journal de génération, rapports rattachés aux séances) : retirés
 * de l'amorçage le 03/10/2026 (demande du commanditaire), chargés seulement par les tests (`test/helpers.ts`).
 */
export async function seedDemoReports(db: PrismaClient): Promise<void> {
  const { rise } = await loadDemo();
  const wsByName: Record<string, string> = {};
  for (const w of await db.workstream.findMany({ where: { projectId: RISE_ID } })) wsByName[normKey(w.name)] = w.id;
  // Templates (état initial du composant)
  for (const [i, t] of TEMPLATES.entries()) {
    await db.reportTemplate.create({
      data: {
        id: t.id,
        projectId: RISE_ID,
        name: t.name,
        bodyId: t.bodyId,
        authorId: 'p01',
        authorLabel: t.author,
        version: t.version,
        description: t.desc,
        components: t.comps.map((c: J) => ({
          id: c.id,
          scope: { Projet: 'PROJECT', Vague: 'WAVE', Phase: 'PHASE', Chantier: 'WORKSTREAM' }[c.kind as string],
          targetId: c.target ? (c.kind === 'Vague' ? 'w1' : wsByName[normKey(c.target)]) ?? null : null,
        })),
        pages: t.pages,
        publishedAt: t.published,
        active: t.active,
        order: i,
      },
    });
  }
  // Rapports et séances qui les portent
  const tplBySessionBody: Record<string, string> = { g1: 'T1' };
  for (const r of rise.reports) {
    const session = rise.sessions.find((s: J) => s.id === r.sessionId);
    await db.reportInstance.create({
      data: {
        id: r.id,
        projectId: RISE_ID,
        templateId: tplBySessionBody[session?.bodyId] ?? null,
        sessionId: r.sessionId,
        name: r.n,
        v: r.v,
        status: r.published ? 'PUBLISHED' : 'IN_REVIEW',
        reportingDate: parseFrLabel(r.reporting),
        reviewerId: r.id === rise.committee.sessionId.replace('S-g1-', 'RP-') ? rise.committee.reviewer : null,
        validatorId: r.validator,
        audience: r.audience === '—' ? null : r.audience,
        generatedAt: r.id === 'RP-20' ? new Date('2026-09-14T07:05:00Z') : new Date(`${parseFrLabel(r.reporting)}T08:00:00Z`),
        captureAt: r.id === 'RP-20' ? new Date('2026-09-13T16:00:00Z') : null,
      },
    });
  }
  for (const s of rise.sessions) if (s.reportId && (await db.reportInstance.findUnique({ where: { id: s.reportId } }))) await db.session.update({ where: { id: s.id }, data: { reportId: s.reportId } });
  await db.contentBlock.upsert({ where: { projectId_key: { projectId: RISE_ID, key: 'templates.history' } }, create: { projectId: RISE_ID, key: 'templates.history', data: TEMPLATE_HISTORY as Prisma.InputJsonValue }, update: { data: TEMPLATE_HISTORY as Prisma.InputJsonValue } });
}

/** Templates de l'état initial du Cockpit (`state.templates`). */
export const TEMPLATES = [
  { id: 'T1', name: 'Support COPIL standard', author: 'Robin Lefèvre', version: '2.1', comps: [{ id: 'synthese', kind: 'Projet' }, { id: 'planning', kind: 'Vague', target: 'Lot 1' }, { id: 'jalons', kind: 'Projet' }, { id: 'risques', kind: 'Projet' }, { id: 'decisions', kind: 'Projet' }], pages: 18, published: '2026-07-12', bodyId: 'g1', active: true, desc: 'Support complet du comité de pilotage mensuel' },
  { id: 'T2', name: 'Flash COPIL — synthèse 1 page', author: 'Robin Lefèvre', version: '1.0', comps: [{ id: 'synthese', kind: 'Projet' }, { id: 'risques', kind: 'Projet' }], pages: 2, published: '2026-08-03', bodyId: 'g1', active: true, desc: 'Note de synthèse envoyée en amont du COPIL' },
  { id: 'T3', name: 'Point COPROJ hebdomadaire', author: 'Robin Lefèvre', version: '3.0', comps: [{ id: 'planning', kind: 'Vague', target: 'Lot 1' }, { id: 'actions', kind: 'Projet' }, { id: 'risques', kind: 'Projet' }, { id: 'barometre', kind: 'Projet' }], pages: 9, published: '2026-06-20', bodyId: 'g2', active: true, desc: 'Suivi opérationnel hebdomadaire des chantiers' },
  { id: 'T4', name: 'Revue chantier Migration', author: 'Robin Lefèvre', version: '1.2', comps: [{ id: 'jalons', kind: 'Chantier', target: 'Migration des données' }, { id: 'planning', kind: 'Chantier', target: 'Migration des données' }, { id: 'actions', kind: 'Chantier', target: 'Migration des données' }], pages: 6, published: '2026-05-08', bodyId: 'g2', active: false, desc: 'Point dédié au chantier Migration — remplacé par le COPROJ hebdo' },
  { id: 'T5', name: 'Rapport sponsor mensuel', author: 'Robin Lefèvre', version: '1.0', comps: [{ id: 'dashboard', kind: 'Projet' }, { id: 'barometre', kind: 'Projet' }, { id: 'decisions', kind: 'Projet' }], pages: 4, published: '2026-04-15', bodyId: 'g6', active: true, desc: 'Vue direction : santé, baromètre, décisions à prendre' },
  { id: 'T6', name: 'Support COPIL v1 (archivé)', author: 'Robin Lefèvre', version: '1.4', comps: [{ id: 'synthese', kind: 'Projet' }, { id: 'planning', kind: 'Projet' }, { id: 'risques', kind: 'Projet' }], pages: 16, published: '2026-03-10', bodyId: 'g1', active: false, desc: 'Ancienne version du support COPIL, conservée pour historique' },
];

/** Journal de génération des templates (état initial `tplHistory`). */
export const TEMPLATE_HISTORY = [
  { id: 'H1', templateId: 'T1', name: 'Support COPIL standard', version: '2.1', bodyId: 'g1', at: '2026-08-23T15:42:00Z', byId: 'p01', saved: true },
  { id: 'H2', templateId: 'T3', name: 'Point COPROJ hebdomadaire', version: '3.0', bodyId: 'g2', at: '2026-08-18T07:15:00Z', byId: 'p01', saved: false },
  { id: 'H3', templateId: 'T5', name: 'Rapport sponsor mensuel', version: '1.0', bodyId: 'g6', at: '2026-08-01T06:30:00Z', byId: 'p01', saved: true },
  { id: 'H4', templateId: 'T2', name: 'Flash COPIL — synthèse 1 page', version: '1.0', bodyId: 'g1', at: '2026-07-24T16:05:00Z', byId: 'p01', saved: false },
];

/**
 * Fiche d'arbitrage de D-007 : textes d'instruction affichés par le frontend
 * (le jeu de données n'en contient pas ; ils sont reconstitués par le frontend depuis ses textes par défaut).
 * La fiche est arbitrée : lecture seule.
 */
function d007Arbitration() {
  return { question: null, options: [], criteria: [], recommendation: null, texts: {} };
}

/**
 * Documents factices de la Base de connaissance (8 fiches sans fichier, liens typés quand ils se résolvent) : retirés
 * de l'amorçage le 30/09/2026, chargés seulement par les tests (`test/helpers.ts`).
 */
export async function seedDemoDocuments(db: PrismaClient): Promise<void> {
  const { rise } = await loadDemo();
  for (const [i, d] of rise.documents.entries()) {
    const dateIso = parseFrLabel(d.date) ?? parseFrLabel(d.date, 2026)!;
    const links: Array<{ entityType: string; entityId: string }> = [];
    const txt = String(d.linked || '');
    const typeMap: Record<string, string> = { RISK: 'RISK', ISSUE: 'ISSUE', MILESTONE: 'MILESTONE', DECISION: 'DECISION' };
    for (const part of txt.split(' · ')) {
      const m = /^(RISK|ISSUE|MILESTONE|DECISION)\s+(.+)$/.exec(part.trim());
      if (m) {
        const ids = m[2].split(/\s*(?:→|·)\s*/);
        if (ids.length === 2 && txt.includes('→')) {
          // « R01 → R07 » : plage des risques existants
          for (const r of rise.risks) if (r.id >= ids[0] && r.id <= ids[1]) links.push({ entityType: 'RISK', entityId: r.id });
        } else for (const id of ids) links.push({ entityType: typeMap[m[1]], entityId: id.trim() });
      } else if (/^[JRPD]/.test(part.trim())) {
        const id = part.trim();
        const t = sourceTypeOf(id);
        if (t) links.push({ entityType: t, entityId: id });
      }
    }
    const mime = { PPTX: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', PDF: 'application/pdf', DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }[d.mime as string] ?? d.mime;
    await db.document.create({
      data: {
        id: `doc${i + 1}`,
        projectId: RISE_ID,
        n: d.n,
        type: d.type,
        dateIso,
        v: d.v,
        conf: normKey(d.conf) === 'restreint' ? 'RESTRICTED' : 'INTERNAL',
        src: normKey(d.src) === 'genere' ? 'GENERATED' : 'UPLOADED',
        ext: d.ext,
        mime,
        pages: d.pages ?? null,
        linkedLabel: links.length ? null : txt || null,
        links: { create: dedupe(links) },
      },
    });
  }
}
