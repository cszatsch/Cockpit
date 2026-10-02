/**
 * Composants des rapports de comité (étapes 3 et 4 de « Créer un template », 03/10/2026) : nature de chaque
 * composant (tableau, graphique, indicateurs, texte), indicateurs proposés, périodes, structure en sections et
 * identifiants stables des zones variables du template PowerPoint.
 */

export type ComponentId = 'synthese' | 'planning' | 'jalons' | 'risques' | 'actions' | 'decisions' | 'barometre' | 'dashboard' | 'budget';
/** Éléments posés sur la page standard d'un composant. */
export type ComponentPart = 'table' | 'chart' | 'kpi' | 'text';
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
}

export const COMPONENTS: Record<ComponentId, ComponentDef> = {
  synthese: {
    id: 'synthese', label: 'Synthèse de situation', nature: 'Indicateurs et texte', parts: ['kpi', 'text'], periodic: true, defaultPeriod: 'month',
    indicators: [{ id: 'status', label: 'Statut du projet' }, { id: 'golive', label: 'Go-live prévu' }, { id: 'risks_open', label: 'Risques ouverts' }, { id: 'risks_critical', label: 'Risques critiques' }, { id: 'actions_late', label: 'Actions en retard' }, { id: 'decisions_pending', label: 'Décisions en attente' }, { id: 'milestones_period', label: 'Jalons de la période' }],
    defaults: ['status', 'golive', 'risks_critical', 'actions_late'],
  },
  planning: {
    id: 'planning', label: 'Planning', nature: 'Tableau', parts: ['table'], periodic: false, defaultPeriod: 'all',
    indicators: [{ id: 'code', label: 'Code' }, { id: 'name', label: 'Phase' }, { id: 'start', label: 'Début' }, { id: 'end', label: 'Fin' }, { id: 'progress', label: 'Avancement' }, { id: 'status', label: 'Statut' }],
    defaults: ['code', 'name', 'start', 'end', 'progress', 'status'],
  },
  jalons: {
    id: 'jalons', label: 'Jalons', nature: 'Tableau', parts: ['table'], periodic: true, defaultPeriod: 'next90',
    indicators: [{ id: 'code', label: 'Code' }, { id: 'name', label: 'Jalon' }, { id: 'date', label: 'Date' }, { id: 'baseline', label: 'Référence' }, { id: 'slip', label: 'Écart (j)' }, { id: 'phase', label: 'Phase' }],
    defaults: ['code', 'name', 'date', 'baseline', 'slip'],
  },
  risques: {
    id: 'risques', label: 'Risques et problèmes', nature: 'Tableau', parts: ['table'], periodic: false, defaultPeriod: 'all',
    indicators: [{ id: 'code', label: 'Code' }, { id: 'name', label: 'Risque' }, { id: 'score', label: 'Criticité' }, { id: 'p', label: 'Probabilité' }, { id: 'i', label: 'Impact' }, { id: 'owner', label: 'Responsable' }, { id: 'due', label: 'Échéance' }, { id: 'status', label: 'Statut' }],
    defaults: ['code', 'name', 'score', 'owner', 'status'],
  },
  actions: {
    id: 'actions', label: 'Actions', nature: 'Tableau', parts: ['table'], periodic: true, defaultPeriod: 'all',
    indicators: [{ id: 'code', label: 'Code' }, { id: 'name', label: 'Action' }, { id: 'owner', label: 'Responsable' }, { id: 'due', label: 'Échéance' }, { id: 'status', label: 'Statut' }, { id: 'prio', label: 'Priorité' }],
    defaults: ['code', 'name', 'owner', 'due', 'status'],
  },
  decisions: {
    id: 'decisions', label: 'Décisions', nature: 'Tableau', parts: ['table'], periodic: true, defaultPeriod: 'quarter',
    indicators: [{ id: 'code', label: 'Code' }, { id: 'name', label: 'Décision' }, { id: 'status', label: 'Statut' }, { id: 'date', label: 'Date' }, { id: 'body', label: 'Instance' }],
    defaults: ['code', 'name', 'status', 'date'],
  },
  barometre: {
    id: 'barometre', label: 'Baromètre du projet', nature: 'Graphique', parts: ['chart'], chart: 'line', periodic: true, defaultPeriod: 'last6',
    indicators: [{ id: 'score', label: 'Score global' }, { id: 'respondents', label: 'Répondants' }],
    defaults: ['score'],
  },
  dashboard: {
    id: 'dashboard', label: 'Tableau de bord', nature: 'Indicateurs et graphique', parts: ['kpi', 'chart'], chart: 'bar', periodic: false, defaultPeriod: 'all',
    indicators: [{ id: 'progress', label: 'Avancement réel (%)' }, { id: 'planned', label: 'Avancement prévu (%)' }, { id: 'risks_open', label: 'Risques ouverts' }, { id: 'actions_open', label: 'Actions ouvertes' }, { id: 'milestones_late', label: 'Jalons glissés' }],
    defaults: ['progress', 'planned', 'risks_open', 'actions_open'],
  },
  budget: {
    id: 'budget', label: 'Budget', nature: 'Indicateurs', parts: ['kpi'], periodic: false, defaultPeriod: 'all',
    indicators: [{ id: 'committed', label: 'Engagé' }, { id: 'consumed', label: 'Consommé' }, { id: 'remaining', label: 'Reste à faire' }],
    defaults: ['committed', 'consumed', 'remaining'],
  },
};
export const COMPONENT_IDS = Object.keys(COMPONENTS) as ComponentId[];
/** Indicateurs du graphique du tableau de bord (séries) ; les autres sont des indicateurs chiffrés. */
export const DASHBOARD_SERIES = ['progress', 'planned'];
/** Indicateurs chiffrés de la synthèse affichés en tuiles (au plus 4) ; le texte reprend les faits marquants. */
export const KPI_MAX = 4;

// ───────────── Périodes ─────────────

export type PeriodId = 'all' | 'month' | 'quarter' | 'last3' | 'last6' | 'next30' | 'next90';
export const PERIODS: Array<{ id: PeriodId; label: string }> = [
  { id: 'all', label: 'Sans filtre de période' },
  { id: 'month', label: 'Mois en cours' },
  { id: 'quarter', label: 'Trimestre en cours' },
  { id: 'last3', label: '3 derniers mois' },
  { id: 'last6', label: '6 derniers mois' },
  { id: 'next30', label: '30 prochains jours' },
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
    case 'quarter': { const q = Math.floor(m / 3) * 3; return r(new Date(Date.UTC(y, q, 1)), new Date(Date.UTC(y, q + 3, 0))); }
    case 'last3': return r(new Date(Date.UTC(y, m - 2, 1)), new Date(Date.UTC(y, m + 1, 0)));
    case 'last6': return r(new Date(Date.UTC(y, m - 5, 1)), new Date(Date.UTC(y, m + 1, 0)));
    case 'next30': return r(d, new Date(d.getTime() + 30 * 86400000));
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
  | { part: 'text'; lines: string[] };
export interface ComponentValues { key: string; caption: string; parts: ComponentData[]; issues: Issue[] }
