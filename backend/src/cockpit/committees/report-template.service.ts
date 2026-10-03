import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { ProjectScope } from '../../core/access.service';
import { PrismaService, Tx } from '../../core/prisma.service';
import { StorageService } from '../../core/storage.service';
import { TodayService } from '../../core/today.service';
import { ApiErrorWithBody, notFound } from '../../core/errors';
import { techId } from '../../core/ids';
import { OoxmlPackage } from '../../core/ooxml';
import { analyzePptx, mediaDataUri } from '../../core/report-format-read';
import { PageSource } from '../../core/report-format-write';
import { BarometerData, MILESTONES_MAX, MilestonesData, RisksData, foldPlan, GANTT_MAX_ROWS, GanttData, GanttRow, PLAN_TABLE_HEAD_IN, PLAN_TABLE_MIN_ROW_IN } from '../../core/report-draw';
import { composeTemplate, FillData, fillTemplate, TemplateFieldMissing, TemplateManifest, visualCheck } from '../../core/report-template';
import { LlmService } from '../../core/llm.service';
import { parseWriting, retryPrompt, WritingFacts, WRITING_SKILLS, WRITING_TIMEOUT_MS, writingPrompt, writingSystem } from '../../domain/report-writing';
import { FormatAnalysis, PAGE_KINDS, PageKind, previewSvg } from '../../domain/report-format';
import { COMPONENTS, ComponentConfig, ComponentData, ComponentValues, DASHBOARD_SERIES, frDay, indicatorsOf, inPeriod, Issue, KPI_MAX, pagesOf, periodOf, periodRange, sectionsOf, COMPONENT_MODULE, ComponentId, moduleOffMessage } from '../../domain/report-components';

const STATUS: Record<string, string> = { OPEN: 'Ouvert', IN_PROGRESS: 'En cours', BLOCKED: 'Bloquée', DONE: 'Terminé', CLOSED: 'Clos', PLANNED: 'Prévu', PREPARATION: 'En préparation', ACTIVE: 'Actif', MITIGATING: 'En traitement', DRAFT: 'Brouillon', IN_REVIEW: 'En revue', TO_ARBITRATE: 'À arbitrer', ARBITRATED: 'Arbitrée', CANCELLED: 'Annulée', SUPERSEDED: 'Remplacée' };
const PRIO: Record<string, string> = { HIGH: 'Haute', MEDIUM: 'Moyenne', LOW: 'Basse' };
const st = (s: string | null | undefined) => (s ? STATUS[s] ?? s : '—');
const day = (s: string | null | undefined) => (s ? frDay(s) : '—');
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const list = (codes: string[], max = 5) => codes.slice(0, max).join(', ') + (codes.length > max ? `… (+${codes.length - max})` : '');
/** Durée de vie d'un aperçu en mémoire (étape Prévisualisation). */
export const PREVIEW_TTL_MS = 15 * 60 * 1000;
const PREVIEW_MAX = 20;

/** Template tel que stocké (colonnes utiles). */
export interface TemplateRow { id: string; projectId: string; name: string; version: string; bodyId: string | null; components: any; format: any }
/** Structure d'un rapport (brouillon ou template) : titre, comité, composants, format. */
export interface Draft { name: string; version: string; bodyId: string | null; components: ComponentConfig[]; format: any }

/**
 * Templates de rapport (étapes 4 à 6 de « Créer un template », 03/10/2026) : données de chaque composant sur son
 * périmètre et sa période, anomalies signalées avant la génération, versions publiées (PowerPoint de référence),
 * publications (valeurs remplacées dans le template), aperçu du rapport complet.
 */
@Injectable()
export class ReportTemplateService {
  private previews = new Map<string, { at: number; projectId: string; buf: Buffer; analysis: Promise<FormatAnalysis> }>();
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService, private readonly todaySvc: TodayService, private readonly llm: LlmService) {}

  // ───────────── Données ─────────────

  private async scopeLabel(c: ComponentConfig): Promise<string | null> {
    if (c.scope === 'PROJECT') return 'Projet entier';
    if (!c.targetId) return null;
    if (c.scope === 'WAVE') { const w = await this.prisma.wave.findUnique({ where: { id: c.targetId } }); return w ? `Lot ${w.seq}` : null; }
    if (c.scope === 'PHASE') { const p = await this.prisma.phase.findUnique({ where: { id: c.targetId } }); return p ? `Phase · ${p.name}` : null; }
    const w = await this.prisma.workstream.findUnique({ where: { id: c.targetId } });
    return w ? `Chantier · ${w.name}` : null;
  }

  /** Valeurs d'un composant et anomalies (données manquantes ou incohérentes). */
  async componentValues(scope: ProjectScope, c: ComponentConfig & { key: string }, today: string): Promise<ComponentValues> {
    const def = COMPONENTS[c.id];
    const issues: Issue[] = [];
    const warn = (message: string) => issues.push({ severity: 'warning', component: c.key, message: `${def.label} : ${message}` });
    const P = { projectId: scope.project.id };
    const label = await this.scopeLabel(c);
    const period = periodRange(periodOf(c), today);
    const caption = [label ?? '—', def.periodic && period.start ? period.label : null].filter(Boolean).join(' · ');
    if (!label) {
      issues.push({ severity: 'error', component: c.key, message: `${def.label} : le périmètre ciblé (${c.scope === 'WAVE' ? 'lot' : c.scope === 'PHASE' ? 'phase' : 'chantier'}) n'existe plus. Modifiez le template et publiez une nouvelle version.` });
      return { key: c.key, caption, parts: [], issues };
    }
    const t = c.scope !== 'PROJECT' ? c.targetId! : null;
    const ws = c.scope === 'WORKSTREAM' ? { wsId: t! } : {};
    const inds = indicatorsOf(c);
    const people = new Map((await this.prisma.person.findMany({ where: P, select: { id: true, firstName: true, lastName: true } })).map((p) => [p.id, `${p.firstName} ${p.lastName}`]));
    const name = (id: string | null | undefined) => (id ? people.get(id) ?? '—' : '—');
    const table = (cols: string[], rows: Array<Record<string, string>>): ComponentData => ({ part: 'table', columns: cols, rows: rows.map((r) => cols.map((k) => r[k] ?? '—')) });
    const kpi = (items: Array<{ id: string; value: string }>): ComponentData => ({ part: 'kpi', items: items.map((x) => ({ ...x, label: def.indicators.find((i) => i.id === x.id)!.label })) });
    const parts: ComponentData[] = [];

    const milestoneWhere = { ...P, ...(c.scope === 'PHASE' ? { phaseId: t! } : c.scope === 'WAVE' ? { waveId: t! } : c.scope === 'WORKSTREAM' ? { wsId: t! } : {}) };
    const openRisks = () => this.prisma.risk.findMany({ where: { ...P, ...ws, status: { not: 'CLOSED' } } });
    const openActions = () => this.prisma.action.findMany({ where: { ...P, ...ws, status: { not: 'DONE' } }, orderBy: { order: 'asc' } });
    const pendingDecisions = () => this.prisma.decision.findMany({ where: { ...P, ...ws, status: { in: ['DRAFT', 'IN_REVIEW', 'TO_ARBITRATE'] } }, orderBy: { code: 'asc' } });
    const phases = () => this.prisma.phase.findMany({ where: { ...P, ...(c.scope === 'PHASE' ? { id: t! } : c.scope === 'WAVE' ? { waves: { some: { waveId: t! } } } : {}) }, orderBy: { seq: 'asc' } });

    switch (c.id) {
      case 'synthese': {
        const [risks, actions, decisions, ms] = await Promise.all([openRisks(), openActions(), pendingDecisions(), this.prisma.milestone.findMany({ where: milestoneWhere, orderBy: { iso: 'asc' } })]);
        const msP = ms.filter((m) => inPeriod(m.iso, period));
        const critical = risks.filter((r) => r.p * r.i >= 20).sort((a, b) => b.p * b.i - a.p * a.i);
        const late = actions.filter((a) => a.dueIso && a.dueIso < today);
        if (inds.includes('golive') && !scope.project.forecastGoliveIso) warn('date de go-live prévue non renseignée (projet).');
        const values: Record<string, string> = { status: st(scope.project.status), golive: day(scope.project.forecastGoliveIso), risks_open: String(risks.length), risks_critical: String(critical.length), actions_late: String(late.length), decisions_pending: String(decisions.length), milestones_period: String(msP.length) };
        parts.push(kpi(inds.slice(0, KPI_MAX).map((id) => ({ id, value: values[id] }))));
        const lines = [
          ...msP.slice(0, 3).map((m) => `Jalon ${m.code} · ${m.n} · ${day(m.iso)}`),
          ...critical.slice(0, 2).map((r) => `Risque ${r.code} (criticité ${r.p * r.i}) · ${r.n}`),
          ...decisions.filter((d) => d.status === 'TO_ARBITRATE').slice(0, 2).map((d) => `Décision ${d.code} à arbitrer · ${d.t}`),
          ...late.slice(0, 2).map((a) => `Action ${a.code} en retard (${day(a.dueIso)}) · ${a.n}`),
        ];
        parts.push({ part: 'text', lines: lines.length ? lines.map((l) => `• ${l}`) : ['Aucun fait marquant sur la période.'] });
        if (!lines.length) warn('aucun fait marquant sur la période.');
        break;
      }
      case 'planning': {
        const ph = await phases();
        const bad = ph.filter((p) => p.endDate < p.startDate).map((p) => p.code);
        if (bad.length) warn(`fin avant le début pour ${list(bad)} (données incohérentes).`);
        const over = ph.filter((p) => p.progressPct < 0 || p.progressPct > 100).map((p) => p.code);
        if (over.length) warn(`avancement hors de 0 à 100 % pour ${list(over)}.`);
        if (!ph.length) warn('aucune phase sur le périmètre.');
        // Gantt (03/10/2026) : phases, sous-phases si demandées, phase en cours, jalons ; tableau au-delà de 25 lignes.
        const current = ph.find((p) => p.status === 'IN_PROGRESS') ?? ph.find((p) => p.startDate <= today && today <= p.endDate && p.status !== 'DONE');
        const subs = inds.includes('subphases') ? await this.prisma.subphase.findMany({ where: { ...P, phaseId: { in: ph.map((p) => p.id) } }, orderBy: [{ startDate: 'asc' }, { code: 'asc' }] }) : [];
        const rows: GanttRow[] = [], rowOf = new Map<string, number>();
        for (const p of ph) {
          rowOf.set(p.id, rows.length);
          rows.push({ level: 0, code: p.code, name: p.name, start: p.startDate, end: p.endDate, status: p.status, progress: p.progressPct, current: p.id === current?.id });
          for (const sp of subs.filter((x) => x.phaseId === p.id && x.startDate && x.endDate)) {
            rowOf.set(sp.id, rows.length);
            rows.push({ level: 1, code: sp.code, name: sp.name, start: sp.startDate!, end: sp.endDate!, status: sp.status, progress: sp.progressPct, current: false });
          }
        }
        const ms = inds.includes('milestones') ? await this.prisma.milestone.findMany({ where: { ...P, phaseId: { in: ph.map((p) => p.id) } }, orderBy: { iso: 'asc' } }) : [];
        const milestones = ms.map((m) => ({ code: m.code, label: m.n, iso: m.iso, row: rowOf.get(m.subphaseId ?? '') ?? rowOf.get(m.phaseId) ?? -1 }));
        parts.push({ part: 'board', board: 'planning', data: { today, rows, milestones, mode: rows.length > GANTT_MAX_ROWS ? 'table' : 'gantt' } as GanttData & { mode: string } });
        if (rows.length > GANTT_MAX_ROWS) warn(`${rows.length} lignes : le planning est présenté en tableau (Gantt jusqu'à ${GANTT_MAX_ROWS} lignes).`);
        break;
      }
      case 'jalons': {
        const ms = (await this.prisma.milestone.findMany({ where: milestoneWhere, orderBy: { iso: 'asc' } })).filter((m) => inPeriod(m.iso, period));
        const phaseNames = new Map((await this.prisma.phase.findMany({ where: P, select: { id: true, name: true } })).map((p) => [p.id, p.name]));
        if (!ms.length) warn('aucun jalon sur la période.');
        const noBase = ms.filter((m) => !m.baselineIso).map((m) => m.code);
        if (noBase.length) warn(`date de référence manquante pour ${list(noBase)}.`);
        // Frise (03/10/2026) : état de chaque jalon (atteint = confirmé), écart à la référence, indicateurs clés.
        const shownMs: MilestonesData = { today, rows: ms.map((m) => ({ code: m.code, name: m.n, iso: m.iso, baseline: m.baselineIso || null, phase: phaseNames.get(m.phaseId) ?? null })), show: Object.fromEntries(def.indicators.map((x) => [x.id, inds.includes(x.id)])) };
        if (ms.length > MILESTONES_MAX) warn(`${ms.length} jalons : la frise en montre ${MILESTONES_MAX}, autour du prochain.`);
        parts.push({ part: 'board', board: 'milestones', data: shownMs });
        break;
      }
      case 'risques': {
        const rs = (await openRisks()).sort((a, b) => b.p * b.i - a.p * a.i || a.code.localeCompare(b.code));
        const bad = rs.filter((r) => r.p < 1 || r.p > 5 || r.i < 1 || r.i > 5).map((r) => r.code);
        if (bad.length) warn(`probabilité ou impact hors de l'échelle 1 à 5 pour ${list(bad)}.`);
        if (!rs.length) warn('aucun risque ouvert sur le périmètre.');
        // Matrice P × I et tableau (03/10/2026).
        const wsNames = new Map((await this.prisma.workstream.findMany({ where: P, select: { id: true, name: true } })).map((w) => [w.id, w.name]));
        const noPlan = rs.filter((r) => r.p * r.i >= 20 && !r.plan?.trim()).map((r) => r.code);
        if (noPlan.length && inds.includes('plan')) warn(`aucun plan de mitigation pour ${list(noPlan)} (criticité ≥ 20).`);
        parts.push({ part: 'board', board: 'risks', data: { today, rows: rs.map((r) => ({ code: r.code, name: r.n, p: r.p, i: r.i, plan: r.plan, owner: name(r.ownerId), ws: wsNames.get(r.wsId) ?? null, due: r.dueIso, status: st(r.status) })), show: Object.fromEntries(def.indicators.map((x) => [x.id, inds.includes(x.id)])) } as RisksData });
        break;
      }
      case 'actions': {
        const as = (await openActions()).filter((a) => !period.start || inPeriod(a.dueIso, period) || (!!a.dueIso && a.dueIso < period.start));
        const noDue = as.filter((a) => !a.dueIso).map((a) => a.code);
        if (noDue.length) warn(`échéance manquante pour ${list(noDue)}.`);
        if (!as.length) warn('aucune action ouverte sur la période.');
        parts.push(table(inds, as.map((a) => ({ code: a.code, name: a.n, owner: name(a.ownerId), due: day(a.dueIso), status: st(a.status), prio: PRIO[a.prio] ?? a.prio }))));
        break;
      }
      case 'decisions': {
        const bodies = new Map((await this.prisma.governanceBody.findMany({ where: P, select: { id: true, shortName: true } })).map((b) => [b.id, b.shortName]));
        const ds = (await this.prisma.decision.findMany({ where: { ...P, ...ws }, orderBy: { code: 'asc' } })).filter((d) => inPeriod(d.crIso, period));
        if (!ds.length) warn('aucune décision sur la période.');
        parts.push(table(inds, ds.map((d) => ({ code: d.code, name: d.t, status: st(d.status), date: day(d.crIso), body: bodies.get(d.bodyId) ?? '—' }))));
        break;
      }
      case 'barometre': {
        const sv = (await this.prisma.barometerSurvey.findMany({ where: P, orderBy: { month: 'asc' } })).filter((s) => !period.start || (s.month >= period.start.slice(0, 7) && s.month <= period.end!.slice(0, 7)));
        if (!sv.length) warn('aucune enquête sur la période.');
        const noScore = sv.filter((s) => s.overallScore === null).map((s) => s.label);
        if (noScore.length && inds.includes('score')) warn(`score manquant pour ${list(noScore)}.`);
        // Tableau de bord (03/10/2026) : score et évolution, avis des répondants, scores par domaine, points clés.
        const scored = sv.filter((s) => s.overallScore !== null);
        const last = scored[scored.length - 1] ?? sv[sv.length - 1] ?? null, prev = scored.length > 1 ? scored[scored.length - 2] : null;
        const global = ((await this.prisma.contentBlock.findUnique({ where: { projectId_key: { projectId: scope.project.id, key: 'barometer.global' } } }))?.data ?? {}) as { size?: number; themes?: Array<{ label: string; tone: string }>; questions?: Array<{ label: string; score: number; delta: number | null }> };
        const doms = await this.prisma.barometerDomain.findMany({ where: P, orderBy: { order: 'asc' } });
        const sent = (x: unknown) => (x && typeof x === 'object' ? (x as { positive: number; neutral: number; negative: number }) : null);
        const valueAt = (series: unknown, month: string | undefined) => (month && series && typeof series === 'object' ? ((series as Record<string, number | null>)[month] ?? null) : null);
        const board: BarometerData = {
          month: last?.label ?? '—', score: last?.overallScore ?? null, prevScore: prev?.overallScore ?? null, prevMonth: prev?.label ?? null,
          respondents: last?.respondents ?? null, population: global.size ?? null,
          sentiment: sent(last?.sentiment), prevPositive: sent(prev?.sentiment)?.positive ?? null,
          domains: doms.map((dm) => ({ name: dm.n, score: valueAt(dm.series, last?.month), prev: valueAt(dm.series, prev?.month), resp: dm.resp })),
          themes: (((last?.themes as unknown) ?? global.themes ?? []) as Array<{ label: string; tone: string }>).filter((x) => x?.label).map((x) => ({ label: x.label, tone: (['OK', 'WATCH', 'RISK'].includes(x.tone) ? x.tone : 'WATCH') as 'OK' | 'WATCH' | 'RISK' })),
          questions: (((last?.questions as unknown) ?? global.questions ?? []) as Array<{ label: string; score: number; delta: number | null }>).filter((x) => x?.label && typeof x.score === 'number'),
          show: { score: inds.includes('score'), sentiment: inds.includes('sentiment'), domains: inds.includes('domains'), themes: inds.includes('themes') },
        };
        if (board.show.sentiment && !board.sentiment) warn('répartition des avis absente pour le dernier mois.');
        if (board.show.domains && !board.domains.some((x) => x.score !== null)) warn('aucun score par domaine pour le dernier mois.');
        parts.push({ part: 'board', board: 'barometer', data: board });
        if (inds.includes('score')) parts.push({ part: 'chart', categories: sv.map((s) => s.label), series: [{ name: 'Score global', values: sv.map((s) => s.overallScore) }] });
        break;
      }
      case 'dashboard': {
        const [ph, risks, actions, ms] = await Promise.all([phases(), openRisks(), openActions(), this.prisma.milestone.findMany({ where: milestoneWhere })]);
        const values: Record<string, string> = { risks_open: String(risks.length), actions_open: String(actions.length), milestones_late: String(ms.filter((m) => m.baselineIso && m.iso > m.baselineIso).length) };
        const k = inds.filter((x) => !DASHBOARD_SERIES.includes(x)).slice(0, KPI_MAX);
        if (k.length) parts.push(kpi(k.map((id) => ({ id, value: values[id] }))));
        const planned = (p: (typeof ph)[number]) => p.plannedPctOverride ?? (today <= p.startDate ? 0 : today >= p.endDate ? 100 : Math.round((daysBetween(p.startDate, today) / Math.max(1, daysBetween(p.startDate, p.endDate))) * 100));
        const series = inds.filter((x) => DASHBOARD_SERIES.includes(x));
        if (series.length) {
          if (!ph.length) warn('aucune phase pour le graphique d’avancement.');
          parts.push({ part: 'chart', categories: ph.map((p) => p.name), series: series.map((id) => ({ name: def.indicators.find((i) => i.id === id)!.label, values: ph.map((p) => (id === 'progress' ? p.progressPct : planned(p))) })) });
        }
        break;
      }
      case 'budget': {
        // Module Budget inactif dans la Console : composant indisponible (publication refusée).
        if (!(await this.moduleActive(scope.project.id, COMPONENT_MODULE.budget!))) { issues.push({ severity: 'error', component: c.key, message: moduleOffMessage(def.label) }); break; }
        const [periods, prog] = await Promise.all([this.prisma.missionPeriod.findMany({ where: P }), this.prisma.programBudget.findUnique({ where: { projectId: scope.project.id } })]);
        // Montants des périodes de mission en milliers (k€), comme l'écran Budget.
        const eur = (n: number) => `${Math.round(n).toLocaleString('fr-FR').replace(/ /g, ' ')} k${scope.project.currency === 'EUR' ? '€' : scope.project.currency}`;
        if (!periods.length) warn('aucune donnée budgétaire (périodes de mission) pour le projet ; les indicateurs afficheront « — ».');
        if (prog && !prog.known) warn(`budget du programme non connu${prog.reason ? ` (${prog.reason})` : ''}.`);
        const committed = periods.reduce((a, p) => a + p.amoa + p.sub, 0), consumed = periods.filter((p) => p.status === 'INVOICED').reduce((a, p) => a + p.amoa + p.sub, 0);
        const values: Record<string, string> = periods.length ? { committed: eur(committed), consumed: eur(consumed), remaining: eur(committed - consumed) } : { committed: '—', consumed: '—', remaining: '—' };
        parts.push(kpi(inds.slice(0, KPI_MAX).map((id) => ({ id, value: values[id] }))));
        break;
      }
    }
    return { key: c.key, caption, parts, issues };
  }

  /** Valeurs de tout le rapport, zones du template remplies, anomalies (dont lignes au-delà de la capacité d'un tableau). */
  async reportData(scope: ProjectScope, d: Draft, manifest: TemplateManifest | null): Promise<{ data: FillData; issues: Issue[] }> {
    const today = this.todaySvc.today(scope.project.timezone);
    const body = d.bodyId ? await this.prisma.governanceBody.findUnique({ where: { id: d.bodyId } }) : null;
    const project = scope.project.name.startsWith(scope.project.code) ? scope.project.name : `${scope.project.code} — ${scope.project.name}`;
    const data: FillData = { text: { 'report.subtitle': [[body?.name, project, `v${d.version}`].filter(Boolean).join(' · ')], 'report.date': [frDay(today)], 'report.period': [`Données au ${frDay(today)}`] }, tables: {}, charts: {} };
    const issues: Issue[] = [];
    const comps = sectionsOf(d.components).flatMap((s) => s.components);
    const values: ComponentValues[] = [];
    for (const c of comps) values.push(await this.componentValues(scope, c, today));
    // Titres-messages et synthèse rédigés par l'IA (fonction « Génération de rapports ») ; repli par règles.
    const titreMax = Object.fromEntries((manifest?.fields ?? []).filter((f) => f.id.endsWith('.title') && f.maxChars).map((f) => [f.id.split('.')[0], f.maxChars!]));
    const w = await this.write(scope, { title: d.name, committee: body?.name ?? '', project, date: frDay(today) }, comps, values, titreMax);
    issues.push(...w.issues);
    for (const [i, c] of comps.entries()) {
      {
        const v = values[i];
        issues.push(...v.issues);
        data.text[`${c.key}.caption`] = [v.caption];
        data.text[`${c.key}.title`] = [w.titles[c.key] ?? COMPONENTS[c.id].label];
        if (w.synthesis && w.synthesisKey === c.key) data.text[`${c.key}.text`] = w.synthesis;
        for (const p of v.parts) {
          if (p.part === 'text' && !(w.synthesis && w.synthesisKey === c.key)) data.text[`${c.key}.text`] = p.lines;
          if (p.part === 'kpi') for (const it of p.items) data.text[`${c.key}.kpi.${it.id}`] = [it.value];
          if (p.part === 'chart') data.charts[`${c.key}.chart`] = { categories: p.categories, series: p.series };
          if (p.part === 'board') {
            const f = manifest?.fields.find((x) => x.id === `${c.key}.board`);
            let b = p.data as GanttData & { mode?: string };
            // Planning en tableau : lignes au-delà de la hauteur disponible regroupées (« … et N autres »).
            if (p.board === 'planning' && f?.area && b.rows.length > GANTT_MAX_ROWS) {
              b = foldPlan(b);
              const cap = Math.max(5, Math.floor((f.area.h - PLAN_TABLE_HEAD_IN * 914400 - 0.26 * 914400) / (PLAN_TABLE_MIN_ROW_IN * 914400)));
              if (b.rows.length > cap) { issues.push({ severity: 'warning', component: c.key, message: `${COMPONENTS[c.id].label} : ${b.rows.length} lignes, la page en affiche ${cap}.` }); b = { ...b, rows: b.rows.slice(0, cap), hidden: b.rows.length - cap }; }
            }
            (data.boards ??= {})[`${c.key}.board`] = b;
          }
          if (p.part === 'table') {
            const cap = manifest?.fields.find((f) => f.id === `${c.key}.table`)?.capacity ?? p.rows.length;
            let rows = p.rows;
            if (rows.length > cap) {
              issues.push({ severity: 'warning', component: c.key, message: `${COMPONENTS[c.id].label} : ${rows.length} lignes, le tableau en affiche ${cap} ; les ${rows.length - cap + 1} dernières sont résumées sur la dernière ligne.` });
              rows = [...rows.slice(0, cap - 1), [`… et ${rows.length - cap + 1} autres`, ...p.columns.slice(1).map(() => '')]];
            }
            if (!rows.length) rows = [['Aucune donnée', ...p.columns.slice(1).map(() => '')]];
            data.tables[`${c.key}.table`] = rows;
          }
        }
      }
    }
    return { data, issues };
  }

  /**
   * Rédaction des titres-messages et de la synthèse par l'IA (fonction « Génération de rapports », consignes des skills
   * « Rapports » et « Rédiger les slides PowerPoint ») : un seul appel par publication ; chaque texte est contrôlé
   * (longueur, nombres présents dans les données) et remplacé par le texte par règles s'il est refusé.
   */
  async write(scope: ProjectScope, report: WritingFacts['report'], comps: Array<ComponentConfig & { key: string }>, values: ComponentValues[], titreMax: Record<string, number> = {}) {
    const out = { titles: {} as Record<string, string>, synthesis: null as string[] | null, synthesisKey: null as string | null, issues: [] as Issue[], modelId: null as string | null };
    if (!comps.length || !this.llm.isLive('rapports')) return out;
    const synthesisKey = comps.find((c) => c.id === 'synthese')?.key ?? null;
    const facts: WritingFacts = {
      report, synthesis: synthesisKey,
      components: comps.map((c, i) => {
        const v = values[i];
        const x: WritingFacts['components'][number] = { key: c.key, label: COMPONENTS[c.id].label, caption: v.caption, ...(titreMax[c.key] ? { titreMax: titreMax[c.key] } : {}) };
        for (const p of v.parts) {
          if (p.part === 'kpi') x.kpis = p.items.map((it) => ({ label: it.label, value: it.value }));
          if (p.part === 'table') x.table = { columns: p.columns.map((id) => COMPONENTS[c.id].indicators.find((ind) => ind.id === id)?.label ?? id), rows: p.rows.slice(0, 15), total: p.rows.length };
          if (p.part === 'chart') x.chart = { categories: p.categories, series: p.series };
          if (p.part === 'text') x.facts = p.lines;
          if (p.part === 'board' && p.board === 'planning') { const g = p.data as GanttData; x.facts = g.rows.filter((r) => r.level === 0).map((r) => `${r.code} ${r.name} : ${frDay(r.start)} → ${frDay(r.end)}, ${r.progress} %, ${r.status === 'DONE' ? 'terminée' : r.current ? 'en cours' : r.status === 'IN_PROGRESS' ? 'en cours' : 'à venir'}`).concat(g.milestones.filter((m) => m.iso >= g.today).slice(0, 3).map((m) => `Jalon ${m.code} ${m.label} : ${frDay(m.iso)}`)); }
          if (p.part === 'board' && p.board === 'milestones') { const m = p.data as MilestonesData; x.facts = m.rows.map((r) => `Jalon ${r.code} ${r.name} : ${frDay(r.iso)}${r.baseline ? ` (référence ${frDay(r.baseline)}, écart ${daysBetween(r.baseline, r.iso)} j)` : ''}${r.iso < m.today ? ', date passée' : ''}`); }
          if (p.part === 'board' && p.board === 'risks') { const k = p.data as RisksData; x.facts = k.rows.map((r) => `Risque ${r.code} (criticité ${r.p * r.i}, P${r.p} × I${r.i}) : ${r.name}${r.plan ? ` — plan : ${r.plan}` : ' — aucun plan'}${r.due ? `, échéance ${frDay(r.due)}` : ''}`); }
          if (p.part === 'board' && p.board === 'barometer') { const b = p.data as BarometerData; x.facts = [`Score ${b.month} : ${b.score ?? '—'} /10${b.prevScore !== null ? ` (${b.prevMonth} : ${b.prevScore})` : ''}, ${b.respondents ?? '—'} répondants`, ...(b.sentiment ? [`Avis : ${b.sentiment.positive} % positifs, ${b.sentiment.neutral} % neutres, ${b.sentiment.negative} % négatifs`] : []), ...b.domains.filter((d) => d.score !== null).map((d) => `Domaine ${d.name} : ${d.score}${d.prev !== null ? ` (avant : ${d.prev})` : ''}`), ...b.themes.map((t) => `Point clé (${t.tone}) : ${t.label}`)]; }
        }
        return x;
      }),
    };
    const skills = (await this.prisma.skill.findMany({ where: { n: { in: WRITING_SKILLS }, on: true }, orderBy: { position: 'asc' } })).map((s) => ({ n: s.n, t: s.t }));
    try {
      const r = await this.llm.complete({ functionId: 'rapports', system: writingSystem(skills), prompt: writingPrompt(facts), projectId: scope.project.id, source: 'COCKPIT', timeoutMs: WRITING_TIMEOUT_MS, maxTokens: 2500 });
      let p = parseWriting(r.text, facts);
      // Textes refusés : une seconde demande, ciblée, avec le motif du refus.
      if (p.rejected.length) {
        const again = await this.llm.complete({ functionId: 'rapports', system: writingSystem(skills), prompt: retryPrompt(facts, p.rejected), projectId: scope.project.id, source: 'COCKPIT', timeoutMs: WRITING_TIMEOUT_MS, maxTokens: 1500 }).then((x) => parseWriting(x.text, facts)).catch(() => null);
        if (again) p = { titles: { ...again.titles, ...p.titles }, synthesis: p.synthesis ?? again.synthesis, rejected: [...facts.components.filter((c) => !p.titles[c.key] && !again.titles[c.key]).map((c) => `${c.key} : titre refusé`), ...(facts.synthesis && !p.synthesis && !again.synthesis ? ['synthèse refusée'] : [])] };
      }
      out.titles = p.titles;
      out.synthesis = p.synthesis;
      out.synthesisKey = synthesisKey;
      out.modelId = r.modelId;
      if (p.rejected.length) out.issues.push({ severity: 'warning', message: `Rédaction par l'IA : ${p.rejected.length} texte(s) refusé(s) au contrôle (${p.rejected.slice(0, 3).join(' ; ')}), remplacé(s) par le texte par défaut.` });
    } catch (e) {
      out.issues.push({ severity: 'warning', message: `Rédaction par l'IA indisponible (${String((e as { message?: string }).message ?? e).slice(0, 120)}) : titres et synthèse par défaut.` });
    }
    return out;
  }

  /** Module de la Console actif pour le projet (portée « tous » ou projet rattaché). */
  async moduleActive(projectId: string, moduleId: string) {
    const m = await this.prisma.module.findUnique({ where: { id: moduleId }, include: { projects: true } });
    return !!m && (m.scope === 'ALL' || (m.scope === 'PROJECTS' && m.projects.some((x) => x.projectId === projectId)));
  }

  /** Composants dont le module est inactif pour le projet : erreurs par composant (création, modification, aperçu). */
  async moduleErrors(projectId: string, comps: Array<{ id: string }>): Promise<Record<string, string>> {
    const err: Record<string, string> = {};
    for (const [i, c] of comps.entries()) {
      const mod = COMPONENT_MODULE[c.id as ComponentId];
      if (mod && !(await this.moduleActive(projectId, mod))) err[`components.${i}`] = moduleOffMessage(COMPONENTS[c.id as ComponentId].label);
    }
    return err;
  }

  // ───────────── Format et composition ─────────────

  /** Pages modèles du format (fichiers chargés) ; null : présentation par défaut. */
  async pageSources(format: any): Promise<Record<PageKind, PageSource> | null> {
    if (!format?.pages) return null;
    const out = {} as Record<PageKind, PageSource>;
    const bufs = new Map<string, Buffer | null>();
    for (const k of PAGE_KINDS) {
      const p = format.pages[k];
      const f = await this.prisma.reportFormatFile.findUnique({ where: { id: p.fileId } });
      if (!f) throw notFound(`Format du rapport : fichier de la page « ${k} » introuvable`);
      if (!bufs.has(f.id)) bufs.set(f.id, await this.storage.get(f.fileKey));
      const analysis = { ...(f.analysis as unknown as FormatAnalysis) };
      analysis.slides = analysis.slides.map((s, i) => (i === p.slide - 1 && p.analysis ? p.analysis : s));
      out[k] = { fileId: f.id, kind: f.kind as any, buf: bufs.get(f.id) ?? null, analysis, slide: p.slide, ...(p.roles ? { roles: p.roles } : {}) };
    }
    return out;
  }

  /** Compose le template puis le remplit avec les valeurs du jour. */
  async build(scope: ProjectScope, d: Draft) {
    const body = d.bodyId ? await this.prisma.governanceBody.findUnique({ where: { id: d.bodyId } }) : null;
    const today = this.todaySvc.today(scope.project.timezone);
    const { buf, manifest } = await composeTemplate(await this.pageSources(d.format), {
      title: d.name, sections: sectionsOf(d.components),
      tokens: { titre: d.name, date: frDay(today), projet: scope.project.name, client: (await this.prisma.client.findUnique({ where: { id: scope.project.clientId } }))?.name ?? '', comite: body?.name ?? '', 'comité': body?.name ?? '' },
    });
    const { data, issues } = await this.reportData(scope, d, manifest);
    const out = await fillTemplate(buf, manifest, data);
    // Contrôle visuel automatique : chevauchements, débordements, éléments hors de la page.
    issues.push(...(await visualCheck(out, manifest)));
    return { buf: out, manifest, issues };
  }

  // ───────────── Versions ─────────────

  private draftOf(t: TemplateRow): Draft {
    return { name: t.name, version: t.version, bodyId: t.bodyId, components: t.components as ComponentConfig[], format: t.format };
  }

  /** Nouvelle version publiée : PowerPoint de référence enregistré avec son manifeste et sa structure. */
  async publish(scope: ProjectScope, t: TemplateRow, by: string | null, db: Tx | PrismaService = this.prisma) {
    const d = this.draftOf(t);
    const { buf, manifest } = await this.build(scope, d);
    const last = await db.reportTemplateVersion.findFirst({ where: { templateId: t.id }, orderBy: { seq: 'desc' } });
    const key = await this.storage.put(`report-templates/${scope.project.id}`, buf, '.pptx');
    return db.reportTemplateVersion.create({
      data: { id: techId('TV'), templateId: t.id, projectId: scope.project.id, seq: (last?.seq ?? 0) + 1, label: t.version, fileKey: key, manifest: manifest as any, structure: { components: d.components, format: d.format, name: d.name, bodyId: d.bodyId } as any, pages: manifest.pages.length, createdBy: by },
    });
  }

  /** Version en vigueur ; un template antérieur aux versions est publié à sa première utilisation. */
  async current(scope: ProjectScope, t: TemplateRow, by: string | null) {
    return (await this.prisma.reportTemplateVersion.findFirst({ where: { templateId: t.id }, orderBy: { seq: 'desc' } })) ?? this.publish(scope, t, by);
  }

  versionView(v: any) {
    return { seq: v.seq, label: v.label, pages: v.pages, fields: (v.manifest as TemplateManifest).fields.length, createdAt: v.createdAt, createdBy: v.createdBy };
  }

  /** Anomalies avant publication : données (version en vigueur) et intégrité du template. */
  async check(scope: ProjectScope, t: TemplateRow, by: string | null) {
    const v = await this.current(scope, t, by);
    const s = v.structure as any;
    const { issues } = await this.reportData(scope, { ...this.draftOf(t), components: s.components, bodyId: s.bodyId ?? t.bodyId }, v.manifest as unknown as TemplateManifest);
    if (!(await this.storage.get(v.fileKey))) issues.unshift({ severity: 'error', message: `Le fichier du template v${v.label} est introuvable : publiez une nouvelle version.` });
    return { version: this.versionView(v), issues, errors: issues.filter((i) => i.severity === 'error').length, warnings: issues.filter((i) => i.severity === 'warning').length };
  }

  /**
   * Publication d'un rapport : le template de la version en vigueur est rouvert et seules les valeurs changent.
   * Anomalie bloquante (périmètre disparu, template endommagé) : 422 avec la liste des anomalies.
   */
  async generate(scope: ProjectScope, t: TemplateRow, by: string | null): Promise<{ buf: Buffer; version: any; issues: Issue[] }> {
    const v = await this.current(scope, t, by);
    const s = v.structure as any;
    const manifest = v.manifest as unknown as TemplateManifest;
    const { data, issues } = await this.reportData(scope, { ...this.draftOf(t), components: s.components, bodyId: s.bodyId ?? t.bodyId }, manifest);
    const file = await this.storage.get(v.fileKey);
    if (!file) issues.unshift({ severity: 'error', message: `Le fichier du template v${v.label} est introuvable : publiez une nouvelle version.` });
    const errors = issues.filter((i) => i.severity === 'error');
    if (errors.length) throw new ApiErrorWithBody(422, { code: 'REPORT_DATA_INVALID', message: errors[0].message, issues });
    try {
      return { buf: await fillTemplate(file!, manifest, data), version: this.versionView(v), issues };
    } catch (e) {
      if (e instanceof TemplateFieldMissing) throw new ApiErrorWithBody(422, { code: 'TEMPLATE_DAMAGED', message: `${e.message} : publiez une nouvelle version du template.`, issues: [{ severity: 'error', message: e.message }] });
      throw e;
    }
  }

  // ───────────── Aperçu (étape Prévisualisation) ─────────────

  /** Rapport complet construit en mémoire avec le format et les données du jour ; diapositives servies une à une. */
  async preview(scope: ProjectScope, d: Draft) {
    const now = Date.now();
    for (const [k, p] of this.previews) if (now - p.at > PREVIEW_TTL_MS || this.previews.size > PREVIEW_MAX) this.previews.delete(k);
    const { buf, manifest, issues } = await this.build(scope, d);
    const id = randomBytes(10).toString('hex');
    this.previews.set(id, { at: now, projectId: scope.project.id, buf, analysis: analyzePptx(buf) });
    const comps = new Map(sectionsOf(d.components).flatMap((s) => s.components).map((c) => [c.key, COMPONENTS[c.id].label]));
    const sections = sectionsOf(d.components);
    return {
      id, pages: manifest.pages.length, expectedPages: pagesOf(d.components), issues,
      slides: manifest.pages.map((p, i) => ({ n: i + 1, kind: p.kind, label: p.kind === 'cover' ? 'Couverture' : p.kind === 'closing' ? 'Clôture' : p.kind === 'divider' ? `Intercalaire · ${sections[p.section!].title}` : comps.get(p.component!) ?? 'Page' })),
    };
  }

  async previewSlide(scope: ProjectScope, id: string, n: number): Promise<string> {
    const p = this.previews.get(id);
    if (!p || p.projectId !== scope.project.id) throw notFound('Aperçu expiré : relancez la prévisualisation');
    const a = await p.analysis;
    const s = a.slides[n - 1];
    if (!s) throw notFound(`Diapositive ${n} introuvable`);
    const pkg = await OoxmlPackage.load(p.buf);
    const uris = new Map<string, string | null>();
    for (const m of [s.background.image, ...s.elements.map((e) => e.image ?? e.fill?.image)]) if (m && !uris.has(m)) uris.set(m, await mediaDataUri(pkg, m));
    return previewSvg(a, s, (m) => uris.get(m) ?? null, { final: true });
  }
}
