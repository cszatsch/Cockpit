import { formatRefs } from '../../domain/report-format';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma.service';
import { ProjectScope } from '../../core/access.service';
import { Actor } from '../../core/auth/auth';
import { TodayService } from '../../core/today.service';
import { riskTrend } from '../../domain/risk-trend';
import { formatRefDate, frShort, isoInTimezone, Precision } from '../../domain/dates';
import {
  ACTION_STATUS_FR,
  CLIENT_STATUS_FR,
  CONF_FR,
  DELIVERABLE_RISK_FRONT,
  FREQUENCY_FR,
  MISSION_STATUS_FR,
  PLAN_STATUS_FR,
  PRIORITY_FR,
  REPORT_STATUS_FR,
  SRC_FR,
  TONE_FRONT,
  WAVE_STATUS_FR,
  WS_STATUS_FR,
} from '../../domain/labels';
import { actionLate, assignmentActive, confirmedDays, progressSignal } from '../../domain/rules';
import { canReadWs } from '../../domain/rights';
import { AnomaliesService } from '../pilotage/anomalies.service';
import { confirmedAtIso, initials } from '../views';

const MONTHS_LONG = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
/** Libellé de date avec année (« 26 sept. 2026 »). */
function frWithYear(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = +iso.slice(8, 10);
  return `${d === 1 ? '1er' : d} ${MONTHS_LONG[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}`;
}
const MONTHS_FULL = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
/** Format `toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })` (« 1 août 2026 »). */
function frLong(iso: string | null | undefined): string {
  if (!iso) return '';
  return `${+iso.slice(8, 10)} ${MONTHS_FULL[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}`;
}
const ddmmyyyy = (iso: string | null | undefined) => formatRefDate(iso ?? null, 'D');
const MIME_SHORT: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'application/vnd.ms-outlook': 'MSG',
  'message/rfc822': 'EML',
};

/**
 * `GET /bootstrap` (brief § 9.3) : un objet qui reproduit la forme des exports de `rise-data.js`
 * et `planning-data.js`, construit depuis la base. Les champs calculés (`confirmedDays`, `late`, `sig`,
 * compteurs, libellés de date) sont renseignés par le serveur ; les listes transactionnelles sont
 * filtrées par chantier (RG8). Permet de brancher le frontend sans le réécrire (§ 11).
 */
@Injectable()
export class BootstrapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly todaySvc: TodayService,
    private readonly anomalies: AnomaliesService,
  ) {}

  async build(actor: Actor, scope: ProjectScope) {
    const pid = scope.project.id;
    const P = { projectId: pid };
    const today = this.todaySvc.today(scope.project.timezone);
    const A = scope.access;
    const vis = (ws: string | null | undefined) => canReadWs(A, ws);

    const [project, client, baselines, blocks, waves, phases, subphases, workstreams, progress, milestones, deliverables, teams, roles, persons, assigns, bodies, risks, issues, actions, decisions, sessions, reports, budget, periods, documents, surveys, domains, habs, templates, grants, accounts] = await Promise.all([
      this.prisma.project.findUniqueOrThrow({ where: { id: pid } }),
      this.prisma.client.findUniqueOrThrow({ where: { id: scope.project.clientId } }),
      this.prisma.baselineVersion.findMany({ where: P, orderBy: { createdAt: 'asc' } }),
      this.prisma.contentBlock.findMany({ where: P }),
      this.prisma.wave.findMany({ where: P, orderBy: { seq: 'asc' } }),
      this.prisma.phase.findMany({ where: P, orderBy: { seq: 'asc' }, include: { waves: true } }),
      this.prisma.subphase.findMany({ where: P, orderBy: [{ phase: { seq: 'asc' } }, { code: 'asc' }] }),
      this.prisma.workstream.findMany({ where: P, orderBy: { seq: 'asc' }, include: { phases: true, waves: true, dependencies: true } }),
      this.prisma.workstreamProgress.findMany({ where: P, orderBy: { order: 'asc' } }),
      this.prisma.milestone.findMany({ where: P, orderBy: [{ code: 'asc' }] }),
      this.prisma.deliverable.findMany({ where: P, orderBy: { order: 'asc' } }),
      this.prisma.team.findMany({ where: P, orderBy: [{ createdAt: 'asc' }] }),
      this.prisma.projectRole.findMany({ where: P, orderBy: { order: 'asc' } }),
      this.prisma.person.findMany({ where: P, orderBy: { order: 'asc' } }),
      this.prisma.assignment.findMany({ where: P, orderBy: [{ personId: 'asc' }, { startDate: 'asc' }] }),
      this.prisma.governanceBody.findMany({ where: P, orderBy: { order: 'asc' }, include: { members: { orderBy: { order: 'asc' } } } }),
      this.prisma.risk.findMany({ where: P, orderBy: { code: 'asc' } }),
      this.prisma.issue.findMany({ where: P, orderBy: { code: 'asc' } }),
      this.prisma.action.findMany({ where: P, orderBy: { order: 'asc' } }),
      this.prisma.decision.findMany({ where: P, orderBy: { code: 'asc' } }),
      this.prisma.session.findMany({ where: P, orderBy: [{ bodyId: 'asc' }, { number: 'asc' }] }),
      this.prisma.reportInstance.findMany({ where: P, orderBy: { generatedAt: 'desc' } }),
      this.prisma.programBudget.findUnique({ where: { projectId: pid } }),
      this.prisma.missionPeriod.findMany({ where: P, orderBy: { order: 'asc' } }),
      this.prisma.document.findMany({ where: P, orderBy: { createdAt: 'asc' }, include: { links: true } }),
      this.prisma.barometerSurvey.findMany({ where: P, orderBy: { month: 'asc' } }),
      this.prisma.barometerDomain.findMany({ where: P, orderBy: { order: 'asc' } }),
      this.prisma.habilitation.findMany({ where: P, orderBy: { id: 'asc' } }),
      this.prisma.reportTemplate.findMany({ where: P, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] }),
      this.prisma.adminGrant.findMany(),
      this.prisma.account.findMany({ where: { personId: { not: null } }, select: { id: true, personId: true } }),
    ]);
    const tplVersions = await this.prisma.reportTemplateVersion.findMany({ where: P, orderBy: { seq: 'desc' }, select: { templateId: true, seq: true } });

    const block = (k: string) => blocks.find((b) => b.key === k)?.data as any;
    const personName = Object.fromEntries(persons.map((p) => [p.id, `${p.firstName} ${p.lastName}`.trim()]));
    const teamById = Object.fromEntries(teams.map((t) => [t.id, t]));
    const roleById = Object.fromEntries(roles.map((r) => [r.id, r]));
    const wsById = Object.fromEntries(workstreams.map((w) => [w.id, w]));
    const phaseById = Object.fromEntries(phases.map((p) => [p.id, p]));
    const spById = Object.fromEntries(subphases.map((s) => [s.id, s]));
    const wsName = (id: string | null | undefined) => (id ? wsById[id]?.name ?? '' : '');
    const activeRoles = (personId: string) => [...new Set(assigns.filter((a) => a.personId === personId && assignmentActive(a, today)).map((a) => roleById[a.roleId]?.label).filter(Boolean))];
    const meta = block('model.meta') ?? {};
    const tbl = (key: string, rows: any[]) => ({ ...(meta[key] ?? { label: key, scope: '', constraints: [], cols: [], widths: '' }), rows });
    const current = baselines.find((b) => b.current) ?? baselines.at(-1);
    const previous = current ? baselines.filter((b) => b !== current).at(-1) : undefined;
    const display = block('project.display') ?? {};
    const me = A.personId ? persons.find((p) => p.id === A.personId) : null;

    // ── people : vue des personnes utilisées en Pilotage (brief § 6.1) ──
    const used = new Set<string>();
    const use = (id: string | null | undefined) => id && used.add(id);
    [...risks, ...issues, ...actions, ...milestones].forEach((x: any) => use(x.ownerId));
    decisions.forEach((d) => use(d.makerId));
    sessions.forEach((s) => s.participants.forEach(use));
    bodies.forEach((b) => b.members.forEach((m) => use(m.personId)));
    workstreams.forEach((w) => use(w.ownerId));
    progress.forEach((w) => use(w.ownerId));
    reports.forEach((r) => (use(r.reviewerId), use(r.validatorId)));
    [project.programDirectorId, project.sponsorId, A.personId].forEach(use);
    const people = persons
      .filter((p) => used.has(p.id))
      .map((p) => {
        const team = p.teamId ? teamById[p.teamId] : null;
        return {
          id: p.id,
          name: personName[p.id],
          initials: initials(p.firstName, p.lastName),
          title: p.title ?? '',
          role: activeRoles(p.id).join(' · '),
          team: team?.name ?? '',
          org: team ? ({ CLIENT: 'CLIENT', AMOA: 'AMOA', INTEGRATOR: 'INTEG', OTHER: 'OTHER' } as any)[team.kind] : '',
          email: p.email,
        };
      });

    // ── transactionnel (RG8) ──
    const msOut = milestones
      .filter((m) => !m.wsId || vis(m.wsId))
      .map((m) => ({
        id: m.id,
        code: m.code,
        n: m.n,
        planned: frShort(m.iso),
        iso: m.iso,
        owner: m.ownerId,
        confirmedDays: confirmedDays(confirmedAtIso(m.confirmedAt), today),
        baselineIso: m.baselineIso,
        wsId: m.wsId,
        ws: wsName(m.wsId),
        waveId: m.waveId,
        phaseId: m.phaseId,
        subphaseId: m.subphaseId,
        version: m.version,
      }));
    const risksOut = risks.filter((r) => vis(r.wsId)).map((r) => ({ id: r.id, n: r.n, p: r.p, i: r.i, plan: r.plan, owner: r.ownerId, ws: wsName(r.wsId), due: frShort(r.dueIso), dueIso: r.dueIso, status: r.status, wsId: r.wsId, version: r.version }));
    const issuesOut = issues.filter((x) => vis(x.wsId)).map((x) => ({
      id: x.id,
      n: x.n,
      sev: x.sev,
      origin: x.originRiskId,
      opened: frShort(x.openedIso),
      openedIso: x.openedIso,
      owner: x.ownerId,
      target: x.targetSessionId ? `${bodies.find((b) => sessions.find((s) => s.id === x.targetSessionId)?.bodyId === b.id)?.shortName ?? 'COPIL'} ${frShort(x.targetIso)}` : frShort(x.targetIso),
      targetIso: x.targetIso,
      targetSessionId: x.targetSessionId,
      detail: x.detail,
      status: x.status,
      wsId: x.wsId,
      ws: wsName(x.wsId),
      version: x.version,
    }));
    const actionsOut = actions.filter((a) => vis(a.wsId)).map((a) => ({
      id: a.id,
      n: a.n,
      owner: a.ownerId,
      due: frShort(a.dueIso),
      dueIso: a.dueIso,
      status: a.status,
      late: actionLate(a.status, a.dueIso, today),
      source: a.sourceId,
      sourceType: a.sourceType,
      prio: PRIORITY_FR[a.prio],
      ...(a.closedAt ? { closed: frShort(a.closedAt) } : {}),
      detail: a.detail,
      wsId: a.wsId,
      version: a.version,
    }));
    const decisionsOut = decisions.filter((d) => vis(d.wsId)).map((d) => ({
      id: d.id,
      t: d.t,
      p: d.p,
      status: d.status,
      crIso: d.crIso,
      ddIso: d.ddIso ?? '',
      wsId: d.wsId,
      bodyId: d.bodyId,
      decL: d.decL ?? '',
      maker: d.makerId,
      impact: d.impact ?? '',
      supersedes: d.supersedesId,
      full: d.full,
      opt: d.opt,
      expectedSessionId: d.expectedSessionId,
      arbitration: d.arbitration ?? null,
      version: d.version,
    }));
    const sessionsOut = sessions.map((s) => ({ id: s.id, bodyId: s.bodyId, number: s.number, dateIso: s.dateIso, time: s.time, place: s.place, status: s.status, participants: s.participants, reportId: s.reportId, version: s.version }));
    const progressOut = progress.filter((w) => vis(w.wsId)).map((w) => ({ id: w.id, n: w.label, v: w.valuePct, ref: w.targetPct, sig: TONE_FRONT[progressSignal(w.valuePct, w.targetPct)], detail: w.detail, owner: w.ownerId, wsId: w.wsId, version: w.version }));

    // ── anomalies (forme du frontend) ──
    const anomalies = (await this.anomalies.compute(scope)).map((a) => ({ level: a.level === 'RISK' ? 'Blocage' : 'Avertissement', text: a.text, owner: a.owner, action: a.action, target: a.target, kind: a.kind, entityType: a.entityType, entityId: a.entityId }));

    // ── tendance des risques : registre + dates de clôture du journal d'audit ──
    const closures = await this.prisma.auditEntry.findMany({ where: { projectId: pid, entityType: 'RISK', field: 'status' }, orderBy: { at: 'asc' }, select: { entityId: true, newValue: true, at: true } });
    const closedAt = new Map<string, Date>();
    for (const c of closures) if (c.entityId && c.newValue === 'CLOSED') closedAt.set(c.entityId, c.at);
    const riskStats = riskTrend(risks, closedAt, today);

    // ── documents ──
    // Documents Restreints : PMO, administrateur et auteur du dépôt seulement (même règle que la liste, KbService.visible).
    const docsOut = documents.filter((d) => d.conf !== 'RESTRICTED' || scope.access.pmo || scope.access.admin || (!!d.uploadedById && d.uploadedById === actor.accountId)).map((d) => ({
      id: d.id,
      n: d.n,
      type: d.type,
      date: d.dateIso.startsWith(today.slice(0, 4)) ? frShort(d.dateIso) : frWithYear(d.dateIso),
      dateIso: d.dateIso,
      v: d.v,
      conf: CONF_FR[d.conf],
      src: SRC_FR[d.src],
      ext: d.ext,
      mime: MIME_SHORT[d.mime] ?? d.mime,
      pages: d.pages,
      linked: d.linkedLabel ?? linkedLabel(d.links),
      links: d.links.map((l) => ({ entityType: l.entityType, entityId: l.entityId })),
      hasFile: !!d.fileKey,
      version: d.version,
      // Base de connaissance (30/09/2026) : auteur et date du dépôt, traitement (avancement, motif d'échec, précision).
      format: d.format,
      by: d.uploadedBy,
      uploadedAt: d.uploadedAt,
      progress: d.progress,
      step: d.stepLabel,
      error: d.error,
      extNote: d.extNote,
      chunks: d.chunkCount,
      canDelete: scope.access.pmo || scope.access.admin || (!!d.uploadedById && d.uploadedById === actor.accountId && (scope.access.pmo || scope.access.responsable.length > 0)),
    }));

    // ── baromètre ──
    const bg = block('barometer.global') ?? { label: '', size: 0, questions: [], themes: [] };
    const q = (x: any) => ({ q: x.label, v: x.score, delta: x.delta });
    const th = (x: any) => [x.label, TONE_FRONT[x.tone as keyof typeof TONE_FRONT] ?? 'vig'];
    const barometre: any = {
      months: surveys.map((s) => [s.key, s.label]),
      ecf: { label: bg.label, size: bg.size, series: surveys.map((s) => s.overallScore) },
      respondents: surveys.map((s) => s.respondents),
      domains: domains.map((d) => ({ id: d.id, n: d.n, size: d.size, resp: d.resp, series: surveys.map((s) => (d.series as any)?.[s.month] ?? null), range: d.range })),
      sentiment: Object.fromEntries(surveys.map((s) => {
        const x = (s.sentiment as any) ?? { negative: 0, neutral: 0, positive: 0 };
        return [s.key, [x.negative, x.neutral, x.positive]];
      })),
      questions: (bg.questions ?? []).map(q),
      themes: (bg.themes ?? []).map(th),
      monthQs: Object.fromEntries(surveys.filter((s) => s.questions).map((s) => [s.key, (s.questions as any[]).map(q)])),
      monthTh: Object.fromEntries(surveys.filter((s) => s.themes).map((s) => [s.key, (s.themes as any[]).map(th)])),
    };

    // ── model.* (Référentiel, tableaux positionnels du frontend) ──
    const teamName = (id: string | null) => (id ? teamById[id]?.name ?? '' : '');
    const model = {
      CLIENT: tbl('CLIENT', [{ id: client.id, cells: [client.code, client.name, client.description ?? '', CLIENT_STATUS_FR[client.status]] }]),
      PROJECT: tbl('PROJECT', [
        { id: 'code', cells: ['Code', project.code], locked: true },
        { id: 'name', cells: ['Nom', project.name] },
        { id: 'objectives', cells: ['Objectifs', project.objective ?? ''] },
        { id: 'start', cells: ['Date de début', ddmmyyyy(project.startDate)] },
        { id: 'end', cells: ['Date de fin cible', ddmmyyyy(project.targetEndDate)] },
        { id: 'owner', cells: ['Responsable', project.programDirectorId ? personName[project.programDirectorId] ?? '' : ''], ownerId: project.programDirectorId },
        { id: 'currency', cells: ['Devise', project.currency] },
        { id: 'tz', cells: ['Fuseau horaire', project.timezone] },
        { id: 'city', cells: ['Ville du projet', project.city ?? ''] },
        { id: 'country', cells: ['Pays', project.country] },
      ]),
      WAVE: tbl('WAVE', waves.map((w) => ({
        id: w.id,
        cells: [String(w.seq), `Lot ${w.seq} · ${w.name}`, formatRefDate(w.startDate, w.startPrec as Precision), formatRefDate(w.endDate, w.endPrec as Precision), WAVE_STATUS_FR[w.status]],
        ...(w.startDate && w.endDate && w.startDate <= today && today <= w.endDate ? { cur: true } : {}),
        ownerId: w.ownerId,
        version: w.version,
      }))),
      PHASE: tbl('PHASE', phases.map((p) => ({
        id: p.id,
        desc: p.description ?? '',
        cells: [String(p.seq), p.name, p.waves.map((x) => `Lot ${waves.find((w) => w.id === x.waveId)?.seq}`).join(', '), formatRefDate(p.startDate, p.startPrec as Precision), formatRefDate(p.endDate, p.endPrec as Precision), PLAN_STATUS_FR[p.status]],
        ...(p.startDate <= today && today <= p.endDate ? { cur: true } : {}),
        waveIds: p.waves.map((x) => x.waveId),
        waveDates: Object.fromEntries(p.waves.filter((x) => x.startDate || x.endDate).map((x) => [x.waveId, { start: formatRefDate(x.startDate, (x.startPrec ?? 'D') as Precision), end: formatRefDate(x.endDate, (x.endPrec ?? 'D') as Precision) }])),
        version: p.version,
      }))),
      SUBPHASE: tbl('SUBPHASE', subphases.map((s) => ({
        id: s.id,
        desc: s.description ?? '',
        cells: [s.code, phaseById[s.phaseId]?.name ?? '', s.name, formatRefDate(s.startDate, s.startPrec as Precision), formatRefDate(s.endDate, s.endPrec as Precision), PLAN_STATUS_FR[s.status]],
        phaseId: s.phaseId,
        ...(s.startDate && s.endDate && s.startDate <= today && today <= s.endDate ? { cur: true } : {}),
        version: s.version,
      }))),
      WORKSTREAM: tbl('WORKSTREAM', workstreams.map((w) => {
        const deps = w.dependencies.map((d) => d.dependsOnId).sort();
        const phaseIds = w.phases.map((x) => x.phaseId).sort((a, b) => (phaseById[a]?.seq ?? 0) - (phaseById[b]?.seq ?? 0));
        return {
          id: w.id,
          cells: [String(w.seq), w.name, personName[w.ownerId] ?? '', WS_STATUS_FR[w.status], w.dependsOnAll ? 'Tous' : deps.length ? deps.join(' · ') : '—', phaseIds.join(' ')],
          waves: waves.map((wv) => (w.waves.some((x) => x.waveId === wv.id) ? 1 : 0)),
          ownerId: w.ownerId,
          phaseIds,
          dependsOn: w.dependsOnAll ? 'ALL' : deps,
          code: w.code,
          version: w.version,
        };
      })),
      TEAM: tbl('TEAM', teams.map((t) => ({ id: t.id, cells: [t.name, t.name, t.description ?? '', String(persons.filter((p) => p.teamId === t.id && p.active).length)], kind: t.kind, version: t.version }))),
      ROLE: tbl('ROLE', roles.map((r) => ({
        id: r.id,
        cells: [r.label, String(new Set(assigns.filter((a) => a.roleId === r.id && assignmentActive(a, today) && persons.find((p) => p.id === a.personId)?.active).map((a) => a.personId)).size)],
        tier: r.tier,
        version: r.version,
      }))),
      PERSON: tbl('PERSON', persons.map((p) => ({
        id: p.id,
        cells: [personName[p.id], teamName(p.teamId), teamName(p.teamId), p.title ?? '', activeRoles(p.id).join(' · '), p.wsIds.map((w) => wsName(w)).filter(Boolean).join(' · '), p.email, p.active ? 'oui' : 'non'],
        active: p.active,
        teamId: p.teamId,
        wsIds: p.wsIds,
        version: p.version,
      }))),
      GOVERNANCE_BODY: tbl('GOVERNANCE_BODY', bodies.map((b) => ({
        id: b.id,
        cells: [b.name, b.description ?? '', FREQUENCY_FR[b.frequency]],
        shortName: b.shortName,
        color: b.color.toLowerCase(),
        members: b.members.map((m) => m.personId),
        memberRoles: b.members.map((m) => ({ personId: m.personId, role: m.role })),
        frequency: b.frequency,
        level: b.level,
        version: b.version,
      }))),
      PROJECT_ASSIGNMENT: tbl('PROJECT_ASSIGNMENT', assigns.map((a) => {
        const person = persons.find((p) => p.id === a.personId);
        const team = person?.teamId ? teamById[person.teamId] : null;
        return {
          id: a.id,
          cells: [personName[a.personId] ?? '', team?.name ?? '', roleById[a.roleId]?.label ?? '', ddmmyyyy(a.startDate), ddmmyyyy(a.endDate), assignmentActive(a, today) ? 'oui' : 'non'],
          // Fin attendue pour toute affectation externe (contrainte du Référentiel).
          missing: !a.endDate && !!team && team.kind !== 'CLIENT',
          personId: a.personId,
          roleId: a.roleId,
          version: a.version,
        };
      })),
      DELIVERABLE: tbl('DELIVERABLE', deliverables.map((d) => {
        const sp = spById[d.subphaseId];
        return {
          id: d.id,
          cells: [d.name, personName[d.ownerId] ?? '', d.teamLabel ?? teamName(persons.find((p) => p.id === d.ownerId)?.teamId ?? null), phaseById[sp?.phaseId]?.name ?? '', sp ? `${sp.code} ${sp.name}` : '', wsName(d.workstreamId)],
          subphaseId: d.subphaseId,
          ownerId: d.ownerId,
          workstreamId: d.workstreamId,
          start: d.start,
          due: d.due,
          prog: d.prog,
          riskOverride: d.riskOverride ? DELIVERABLE_RISK_FRONT[d.riskOverride] : null,
          version: d.version,
        };
      })),
    };

    // ── habilitations (ADMIN synthétisé depuis AdminGrant) ──
    const adminPersons = new Set(accounts.filter((a) => grants.some((g) => g.accountId === a.id)).map((a) => a.personId));
    const habilitations = [
      ...[...adminPersons].filter((p) => persons.some((x) => x.id === p)).map((p) => ({ id: `admin-${p}`, personId: p, profile: 'ADMIN', wsId: null })),
      ...habs.filter((h) => h.personId).map((h) => ({ id: h.id, personId: h.personId, profile: h.profile, wsId: h.wsId })),
    ];

    const tplHistory = (block('templates.history') ?? []).map((h: any) => {
      const at = new Date(h.at);
      const iso = isoInTimezone(at, project.timezone);
      const body = bodies.find((b) => b.id === h.bodyId);
      return { id: h.id, name: h.name, version: h.version, committee: body?.name ?? '', bodyId: h.bodyId, date: frLong(iso), time: new Intl.DateTimeFormat('fr-FR', { timeZone: project.timezone, hour: '2-digit', minute: '2-digit' }).format(at), by: personName[h.byId] ?? '', saved: h.saved, reportId: h.reportId ?? null };
    });

    const plan = {
      projectEnd: phases.map((p) => p.endDate).sort().at(-1) ?? project.targetEndDate,
      phases: phases.map((p) => ({ id: p.id, code: p.code, n: p.name, start: p.startDate, end: p.endDate, reel: p.progressPct, owner: p.ownerId, ...(p.critical ? { crit: true } : {}), ...(p.plannedPctOverride !== null ? { prevuSet: p.plannedPctOverride } : {}), version: p.version })),
      subphases: subphases.map((s) => ({ id: s.id, code: s.code, ph: s.phaseId, n: s.name, start: s.startDate, end: s.endDate, reel: s.progressPct, crit: s.critical, owner: s.ownerId, ...(s.plannedPctOverride !== null ? { prevuSet: s.plannedPctOverride } : {}), version: s.version })),
      chantiers: workstreams.map((w) => ({ id: w.id, code: w.code, n: w.name, start: w.startDate, end: w.endDate, reel: w.progressPct, owner: w.ownerId, phases: w.phases.map((x) => x.phaseId).sort((a, b) => (phaseById[a]?.seq ?? 0) - (phaseById[b]?.seq ?? 0)), ...(w.critical ? { crit: true } : {}), ...(w.plannedPctOverride !== null ? { prevuSet: w.plannedPctOverride } : {}), version: w.version })),
    };

    return {
      today,
      me: me ? { personId: me.id, firstName: me.firstName, lastName: me.lastName } : { personId: null, firstName: actor.fullName.split(' ')[0], lastName: actor.fullName.split(' ').slice(1).join(' ') },
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
        client: display.client ?? client.name,
        integrator: project.integratorTeamId ? teamName(project.integratorTeamId) : '',
        programDirectorId: project.programDirectorId,
        owner: project.programDirectorId,
        sponsorId: project.sponsorId,
        editor: project.editorTeamId ? teamName(project.editorTeamId) : display.editor ?? '',
        phase: display.phase ?? '',
        status: display.status ?? project.status,
        objective: project.objective ?? '',
        baseline: current
          ? {
              version: current.version,
              date: frWithYear(current.date),
              dateIso: current.date,
              approvedAt: frWithYear(current.approvedAt),
              approvedBy: current.approvedById,
              reason: current.reason ?? '',
              previous: previous ? { version: previous.version, date: frWithYear(previous.date), approvedAt: frWithYear(previous.approvedAt) } : null,
            }
          : null,
        forecast: { golive: frWithYear(project.forecastGoliveIso), goliveIso: project.forecastGoliveIso },
        ...(project.healthOverride ? { healthOverride: project.healthOverride } : {}),
        version: project.version,
      },
      committee: block('committee') ?? null,
      people,
      workstreams: progressOut,
      volets: block('volets') ?? [],
      milestones: msOut,
      risks: risksOut,
      // Tendance des risques calculée depuis le registre et le journal d'audit (01/10/2026), plus le bloc de démonstration.
      riskStats,
      issues: issuesOut,
      actions: actionsOut,
      decisions: decisionsOut,
      sessions: sessionsOut,
      programBudget: { known: budget?.known ?? false, reason: budget?.reason ?? '' },
      mission: periods.map((m) => ({ id: m.id, period: m.period, amoa: m.amoa, sub: m.sub, total: m.amoa + m.sub, status: MISSION_STATUS_FR[m.status] })),
      missionNext: block('missionNext') ?? null,
      reports: reports.map((r) => ({ id: r.id, sessionId: r.sessionId, n: r.name, reporting: frShort(r.reportingDate), v: r.v, status: REPORT_STATUS_FR[r.status], validator: r.validatorId, reviewer: r.reviewerId, audience: r.audience ?? '—', published: r.status === 'PUBLISHED', templateId: r.templateId, version: r.version })),
      anomalies,
      documents: docsOut,
      weekWins: block('weekWins') ?? [],
      model,
      modelGaps: block('modelGaps') ?? [],
      referential: block('referential') ?? {},
      raci: block('raci') ?? { cols: [], rows: [] },
      barometre,
      habilitations,
      // planning-data.js
      ...plan,
      // État initial des écrans Comités (templates et journal de génération)
      templates: templates.map((t) => ({
        id: t.id,
        name: t.name,
        author: t.authorLabel ?? '',
        version: t.version,
        comps: (t.components as any[]).map((c) => ({ id: c.id, ...(c.period ? { period: c.period } : {}), ...(c.indicators ? { indicators: c.indicators } : {}), ...(c.newSection ? { newSection: true } : {}), ...(c.sectionTitle ? { sectionTitle: c.sectionTitle } : {}), kind: { PROJECT: 'Projet', WAVE: 'Vague', PHASE: 'Phase', WORKSTREAM: 'Chantier' }[c.scope as string], ...(c.targetId ? { target: c.scope === 'WAVE' ? `Lot ${waves.find((w) => w.id === c.targetId)?.seq ?? ''}` : c.scope === 'PHASE' ? phaseById[c.targetId]?.name : wsName(c.targetId), targetId: c.targetId } : {}) })),
        pages: t.pages,
        published: frLong(t.publishedAt),
        committee: bodies.find((b) => b.id === t.bodyId)?.name ?? '',
        bodyId: t.bodyId,
        active: t.active,
        desc: t.description,
        format: formatRefs(t.format),
        publishedVersion: tplVersions.find((v) => v.templateId === t.id)?.seq ?? null,
        rowVersion: t.rowVersion,
      })),
      tplHistory,
    };
  }
}

function linkedLabel(links: Array<{ entityType: string; entityId: string }>): string {
  const by: Record<string, string[]> = {};
  for (const l of links) (by[l.entityType] ??= []).push(l.entityId);
  return Object.entries(by)
    .map(([t, ids]) => `${t} ${ids.join(' · ')}`)
    .join(' · ');
}

