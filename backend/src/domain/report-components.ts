/**
 * Composants des rapports de comité (étapes 3 et 4 de « Créer un template », 03/10/2026) : nature de chaque
 * composant (tableau, graphique, indicateurs, texte), indicateurs proposés, périodes, structure en sections et
 * identifiants stables des zones variables du template PowerPoint.
 */

export type ComponentId = 'synthese' | 'planning' | 'jalons' | 'risques' | 'actions' | 'decisions' | 'barometre' | 'dashboard' | 'budget';
/** Éléments posés sur la page standard d'un composant. */
export type ComponentPart = 'table' | 'chart' | 'kpi' | 'text' | 'board';
export interface Indicator { id: string; label: string }
export interface ComponentDef {
  id: ComponentId;
  label: string;
  /** Nature affichée à l'écran (Tableau, Graphique, Indicateurs, Texte). */
  nature: string;
  parts: ComponentPart[];
  /** Colonnes du tableau, séries du graphique ou indicateurs chiffrés proposés. */
  indicators: Indicator[];
  defaults: string[];
  chart?: 'bar' | 'line';
  /** Le composant se filtre-t-il sur une période ? */
  periodic: boolean;
  defaultPeriod: PeriodId;
  /** Périodes proposées pour ce composant (étape 4), dans l'ordre d'affichage. */
  periods?: PeriodId[];
}

export const COMPONENTS: Record<ComponentId, ComponentDef> = {
  synthese: {
    id: 'synthese', label: 'Synthèse de situation', nature: 'Indicateurs et texte', parts: ['kpi', 'text'], periodic: true, defaultPeriod: 'month', periods: ['month', 'prevMonth', 'quarter'],
    indicators: [{ id: 'status', label: 'Statut du projet' }, { id: 'golive', label: 'Go-live prévu' }, { id: 'risks_open', label: 'Risques ouverts' }, { id: 'risks_critical', label: 'Risques critiques' }, { id: 'actions_late', label: 'Actions en retard' }, { id: 'decisions_pending', label: 'Décisions en attente' }, { id: 'milestones_period', label: 'Jalons de la période' }],
    defaults: ['status', 'golive', 'risks_critical', 'actions_late'],
  },
  planning: {
    id: 'planning', label: 'Planning', nature: 'Gantt', parts: ['board'], periodic: false, defaultPeriod: 'all',
    // Gantt des phases (phase en cours, repère du jour, avancement) ; au-delà de 25 lignes, tableau (GANTT_MAX_ROWS).
    indicators: [{ id: 'milestones', label: 'Jalons sur la frise' }, { id: 'subphases', label: 'Sous-phases' }],
    defaults: ['milestones'],
  },
  jalons: {
    id: 'jalons', label: 'Jalons', nature: 'Frise', parts: ['board'], periodic: true, defaultPeriod: 'next90', periods: ['next30', 'next60', 'next90', 'all'],
    indicators: [{ id: 'code', label: 'Code' }, { id: 'name', label: 'Jalon' }, { id: 'date', label: 'Date' }, { id: 'baseline', label: 'Référence' }, { id: 'slip', label: 'Écart (j)' }, { id: 'phase', label: 'Phase' }, { id: 'kpis', label: 'Indicateurs clés' }],
    defaults: ['code', 'name', 'date', 'baseline', 'slip', 'kpis'],
  },
  risques: {
    id: 'risques', label: 'Risques et problèmes', nature: 'Matrice et tableau', parts: ['board'], periodic: false, defaultPeriod: 'all',
    indicators: [{ id: 'matrix', label: 'Matrice P × I' }, { id: 'code', label: 'Code' }, { id: 'name', label: 'Risque' }, { id: 'score', label: 'Criticité' }, { id: 'p', label: 'Probabilité' }, { id: 'i', label: 'Impact' }, { id: 'plan', label: 'Plan de mitigation' }, { id: 'owner', label: 'Responsable' }, { id: 'due', label: 'Échéance' }, { id: 'status', label: 'Statut' }],
    defaults: ['matrix', 'code', 'name', 'score', 'p', 'i', 'plan', 'owner', 'due'],
  },
  actions: {
    id: 'actions', label: 'Actions', nature: 'Échéancier', parts: ['board'], periodic: true, defaultPeriod: 'all', periods: ['all', 'month', 'next30', 'next90'],
    // Échéancier (04/10/2026) : actions triées par urgence, frise centrée sur aujourd'hui, panneau des retards.
    indicators: [{ id: 'code', label: 'Code' }, { id: 'name', label: 'Action' }, { id: 'owner', label: 'Responsable' }, { id: 'due', label: 'Échéance' }, { id: 'status', label: 'Statut' }, { id: 'prio', label: 'Priorité' }, { id: 'kpis', label: 'Indicateurs clés' }],
    defaults: ['code', 'name', 'owner', 'due', 'status', 'kpis'],
  },
  decisions: {
    id: 'decisions', label: 'Décisions', nature: 'Arbitrages', parts: ['board'], periodic: true, defaultPeriod: 'quarter', periods: ['month', 'prevMonth', 'quarter', 'last3', 'last6', 'all'],
    // Arbitrages (04/10/2026) : décisions en attente quelle que soit la période (étape, attente), décisions prises sur la période.
    indicators: [{ id: 'code', label: 'Code' }, { id: 'name', label: 'Décision' }, { id: 'status', label: 'Étape' }, { id: 'date', label: 'Attente' }, { id: 'body', label: 'Instance' }, { id: 'decision', label: 'Décision prise' }, { id: 'impact', label: 'Impact' }],
    defaults: ['code', 'name', 'status', 'date', 'body', 'decision'],
  },
  barometre: {
    id: 'barometre', label: 'Baromètre du projet', nature: 'Tableau de bord', parts: ['board', 'chart'], chart: 'line', periodic: true, defaultPeriod: 'last6', periods: ['last3', 'last6', 'last12'],
    indicators: [{ id: 'score', label: 'Score et évolution' }, { id: 'sentiment', label: 'Avis des répondants' }, { id: 'domains', label: 'Score par domaine' }, { id: 'themes', label: 'Points clés' }],
    defaults: ['score', 'sentiment', 'domains', 'themes'],
  },
  dashboard: {
    id: 'dashboard', label: 'Tableau de bord', nature: 'Tableau de bord', parts: ['board'], periodic: false, defaultPeriod: 'all',
    // Phase en cours (réel, prévu, écart, chemin des phases) et santé du projet en tuiles (04/10/2026).
    indicators: [{ id: 'progress', label: 'Avancement réel (%)' }, { id: 'planned', label: 'Avancement prévu (%)' }, { id: 'risks_open', label: 'Risques ouverts' }, { id: 'actions_open', label: 'Actions ouvertes' }, { id: 'milestones_late', label: 'Jalons glissés' }, { id: 'decisions_pending', label: 'Décisions en attente' }],
    defaults: ['progress', 'planned', 'risks_open', 'actions_open', 'milestones_late', 'decisions_pending'],
  },
  budget: {
    id: 'budget', label: 'Budget', nature: 'Indicateurs', parts: ['kpi'], periodic: false, defaultPeriod: 'all',
    indicators: [{ id: 'committed', label: 'Engagé' }, { id: 'consumed', label: 'Consommé' }, { id: 'remaining', label: 'Reste à faire' }],
    defaults: ['committed', 'consumed', 'remaining'],
  },
};
export const COMPONENT_IDS = Object.keys(COMPONENTS) as ComponentId[];
/** Composants liés à un module optionnel de la Console (04/10/2026) : indisponibles tant que le module est inactif pour le projet. */
export const COMPONENT_MODULE: Partial<Record<ComponentId, string>> = { budget: 'bud' };
export const moduleOffMessage = (label: string) => `${label} : le module n'est pas activé pour ce projet (Console › Modules).`;
/** Indicateurs du graphique du tableau de bord (séries) ; les autres sont des indicateurs chiffrés. */
export const DASHBOARD_SERIES = ['progress', 'planned'];
/** Indicateurs chiffrés de la synthèse affichés en tuiles (au plus 4) ; le texte reprend les faits marquants. */
export const KPI_MAX = 4;

// ───────────── Périodes ─────────────

export type PeriodId = 'all' | 'month' | 'prevMonth' | 'quarter' | 'last3' | 'last6' | 'last12' | 'next30' | 'next60' | 'next90';
export const PERIODS: Array<{ id: PeriodId; label: string }> = [
  { id: 'all', label: 'Sans filtre de période' },
  { id: 'month', label: 'Mois en cours' },
  { id: 'prevMonth', label: 'Mois précédent' },
  { id: 'quarter', label: 'Trimestre en cours' },
  { id: 'last3', label: '3 derniers mois' },
  { id: 'last6', label: '6 derniers mois' },
  { id: 'last12', label: '12 derniers mois' },
  { id: 'next30', label: '30 prochains jours' },
  { id: 'next60', label: '60 prochains jours' },
  { id: 'next90', label: '90 prochains jours' },
];
const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (s: string) => new Date(`${s}T00:00:00Z`);
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const frDay = (s: string) => { const d = utc(s); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };

/** Bornes d'une période, recalculées à chaque publication à partir de la date du jour. */
export function periodRange(id: PeriodId, today: string): { start: string | null; end: string | null; label: string } {
  const d = utc(today), y = d.getUTCFullYear(), m = d.getUTCMonth();
  const r = (a: Date, b: Date) => ({ start: iso(a), end: iso(b), label: `${frDay(iso(a))} → ${frDay(iso(b))}` });
  switch (id) {
    case 'month': return r(new Date(Date.UTC(y, m, 1)), new Date(Date.UTC(y, m + 1, 0)));
    case 'prevMonth': return r(new Date(Date.UTC(y, m - 1, 1)), new Date(Date.UTC(y, m, 0)));
    case 'quarter': { const q = Math.floor(m / 3) * 3; return r(new Date(Date.UTC(y, q, 1)), new Date(Date.UTC(y, q + 3, 0))); }
    case 'last3': return r(new Date(Date.UTC(y, m - 2, 1)), new Date(Date.UTC(y, m + 1, 0)));
    case 'last6': return r(new Date(Date.UTC(y, m - 5, 1)), new Date(Date.UTC(y, m + 1, 0)));
    case 'last12': return r(new Date(Date.UTC(y, m - 11, 1)), new Date(Date.UTC(y, m + 1, 0)));
    case 'next30': return r(d, new Date(d.getTime() + 30 * 86400000));
    case 'next60': return r(d, new Date(d.getTime() + 60 * 86400000));
    case 'next90': return r(d, new Date(d.getTime() + 90 * 86400000));
    default: return { start: null, end: null, label: 'toutes dates' };
  }
}
export const inPeriod = (date: string | null | undefined, p: { start: string | null; end: string | null }) => !p.start || (!!date && date >= p.start && date <= p.end!);

// ───────────── Structure du template ─────────────

/** Composant tel que configuré à l'étape 4 (et stocké dans `ReportTemplate.components`). */
export interface ComponentConfig {
  id: ComponentId;
  scope: 'PROJECT' | 'WAVE' | 'PHASE' | 'WORKSTREAM';
  targetId?: string | null;
  period?: PeriodId;
  indicators?: string[];
  /** Ce composant ouvre une nouvelle section (page intercalaire) ; le premier en ouvre toujours une. */
  newSection?: boolean;
  sectionTitle?: string | null;
}
export interface Section { title: string; components: Array<ComponentConfig & { key: string }> }

/** Clé stable d'un composant dans le template : position dans l'ordre du rapport (c01, c02…). */
export const componentKey = (i: number) => `c${String(i + 1).padStart(2, '0')}`;
/** Identifiant d'une zone variable : `rise:` + clé, utilisé comme nom de forme dans le PowerPoint. */
export const fieldName = (id: string) => `rise:${id}`;

/** Indicateurs retenus (défauts du composant si rien n'est choisi), dans l'ordre du catalogue. */
export function indicatorsOf(c: ComponentConfig): string[] {
  const def = COMPONENTS[c.id];
  const chosen = c.indicators?.length ? c.indicators : def.defaults;
  return def.indicators.map((i) => i.id).filter((id) => chosen.includes(id));
}
export const periodOf = (c: ComponentConfig): PeriodId => (COMPONENTS[c.id].periodic ? c.period ?? COMPONENTS[c.id].defaultPeriod : 'all');

/** Répartition en sections : chaque composant marqué `newSection` (et le premier) ouvre une page intercalaire. */
export function sectionsOf(comps: ComponentConfig[]): Section[] {
  const out: Section[] = [];
  comps.forEach((c, i) => {
    if (!out.length || c.newSection) out.push({ title: (c.sectionTitle ?? '').trim() || COMPONENTS[c.id].label, components: [] });
    out[out.length - 1].components.push({ ...c, key: componentKey(i) });
  });
  return out;
}
/**
 * Plan du rapport, connu avant la génération (étape E, 04/10/2026) : pages (type, libellé) et structure (sections,
 * composants et numéro de leur page). Même ordre que la composition du template.
 */
export function reportPlan(comps: ComponentConfig[]) {
  const slides: Array<{ n: number; kind: 'cover' | 'divider' | 'standard' | 'closing'; label: string; component?: string }> = [{ n: 1, kind: 'cover', label: 'Couverture' }];
  const structure: Array<{ num: number; title: string; components: Array<{ key: string; name: string; page: number }> }> = [];
  if (comps.length) sectionsOf(comps).forEach((s, si) => {
    slides.push({ n: slides.length + 1, kind: 'divider', label: `Intercalaire · ${s.title}` });
    structure.push({ num: si + 1, title: s.title, components: [] });
    for (const c of s.components) {
      slides.push({ n: slides.length + 1, kind: 'standard', label: COMPONENTS[c.id].label, component: c.key });
      structure[si].components.push({ key: c.key, name: COMPONENTS[c.id].label, page: slides.length });
    }
  });
  slides.push({ n: slides.length + 1, kind: 'closing', label: 'Clôture' });
  return { slides, structure };
}
/** Pages du rapport : couverture, une intercalaire par section, une page par composant, clôture. */
export const pagesOf = (comps: ComponentConfig[]) => (comps.length ? 2 + sectionsOf(comps).length + comps.length : 2);

/** Contrôle de la configuration : indicateurs connus et au moins un, période admise. */
export function configErrors(comps: ComponentConfig[]): Record<string, string> {
  const err: Record<string, string> = {};
  comps.forEach((c, i) => {
    const def = COMPONENTS[c.id];
    const unknown = (c.indicators ?? []).filter((x) => !def.indicators.some((d) => d.id === x));
    if (unknown.length) err[`components.${i}`] = `${def.label} : indicateur inconnu (${unknown.join(', ')})`;
    else if (c.indicators && !c.indicators.length) err[`components.${i}`] = `${def.label} : choisissez au moins un indicateur`;
    if (c.period && !PERIODS.some((p) => p.id === c.period)) err[`components.${i}`] = `${def.label} : période inconnue`;
    else if (c.period && def.periodic && def.periods && !def.periods.includes(c.period as PeriodId)) err[`components.${i}`] = `${def.label} : période non proposée pour ce composant`;
    const kpis = def.parts.includes('kpi') ? indicatorsOf(c).filter((x) => !(c.id === 'dashboard' && DASHBOARD_SERIES.includes(x))) : [];
    if (kpis.length > KPI_MAX) err[`components.${i}`] = `${def.label} : ${KPI_MAX} indicateurs au plus sur une page`;
  });
  return err;
}

// ───────────── Valeurs et anomalies ─────────────

export interface Issue { severity: 'error' | 'warning'; component?: string; message: string }
export type ComponentData =
  | { part: 'table'; columns: string[]; rows: string[][] }
  | { part: 'chart'; categories: string[]; series: Array<{ name: string; values: Array<number | null> }> }
  | { part: 'kpi'; items: Array<{ id: string; label: string; value: string }> }
  | { part: 'text'; lines: string[] }
  | { part: 'board'; board: BoardKind; data: unknown };
/** Planches dessinées (03/10/2026) : Gantt, baromètre, frise des jalons, matrice et tableau des risques ; échéancier des actions, arbitrages, tableau de bord (04/10/2026). */
export type BoardKind = 'planning' | 'barometer' | 'milestones' | 'risks' | 'actions' | 'decisions' | 'dashboard';
export const BOARD_OF: Partial<Record<ComponentId, BoardKind>> = { planning: 'planning', barometre: 'barometer', jalons: 'milestones', risques: 'risks', actions: 'actions', decisions: 'decisions', dashboard: 'dashboard' };
/**
 * Composants passés d'un tableau ou de cartes et graphique à une planche (04/10/2026) : leurs anciennes parties restent
 * calculées pour les versions déjà publiées (dont le PowerPoint contient encore ces zones), sans servir à la rédaction.
 */
export const LEGACY_PARTS: Partial<Record<ComponentId, ComponentPart[]>> = { actions: ['table'], decisions: ['table'], dashboard: ['kpi', 'chart'] };
export interface ComponentValues { key: string; caption: string; parts: ComponentData[]; issues: Issue[] }
