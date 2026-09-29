/**
 * Catalogue des widgets du tableau de bord du Cockpit (22 widgets, `RISE Cockpit.dc.html`), servi à la Console
 * (Registre des cartes API : « Alimente », « Associer un widget »). Un test vérifie qu'il reste identique au
 * catalogue du Cockpit (identifiants, noms, catégories).
 *
 * `apiCard` : carte API requise (Oui / Non) — le widget tire ses données d'un service externe du registre ; seuls ces
 * widgets peuvent être associés à une carte (« Associer un widget »).
 * `tags` : tags de cartes API pour lesquels le widget est suggéré (« Suggérés pour <tag> »).
 * Météo et Trafic portent le nom de la ville du projet dans le Cockpit : « <ville> » ici.
 */
export interface WidgetDef {
  id: string;
  g: string;
  n: string;
  cat: string;
  /** Carte API requise pour alimenter le widget. */
  apiCard: boolean;
  tags: string[];
}

export const WIDGET_CATALOGUE: readonly WidgetDef[] = [
  { id: 'news', g: '◉', n: 'Actualité', cat: 'Contexte', apiCard: true, tags: ['Actualités'] },
  { id: 'meteo', g: '☀', n: 'Météo · <ville>', cat: 'Contexte', apiCard: true, tags: ['Météo', 'Environnement'] },
  { id: 'trafic', g: '⇅', n: 'Trafic · <ville>', cat: 'Contexte', apiCard: true, tags: ['Trafic', 'Mobilité'] },
  { id: 'ai', g: '✦', n: 'L’essentiel, par Jev', cat: 'Synthèse', apiCard: false, tags: [] },
  { id: 'ech', g: '⧗', n: 'Échéances des 15 prochains jours', cat: 'Planning', apiCard: false, tags: [] },
  { id: 'golive', g: 'J', n: 'Compte à rebours Go-Live', cat: 'Planning', apiCard: false, tags: [] },
  { id: 'av', g: '%', n: 'Avancement vs référence', cat: 'Planning', apiCard: false, tags: [] },
  { id: 'jal', g: '◆', n: 'Prochains jalons', cat: 'Jalons', apiCard: false, tags: [] },
  { id: 'crit', g: '▤', n: 'Chemin critique', cat: 'Planning', apiCard: false, tags: [] },
  { id: 'ch', g: '≡', n: 'Météo des chantiers', cat: 'Chantiers', apiCard: false, tags: [] },
  { id: 'risk', g: '!', n: 'Risques critiques', cat: 'Risques', apiCard: false, tags: [] },
  { id: 'rtrend', g: '↗', n: 'Tendance des risques', cat: 'Risques', apiCard: false, tags: [] },
  { id: 'pb', g: '⚑', n: 'Problèmes ouverts', cat: 'Risques', apiCard: false, tags: [] },
  { id: 'dec', g: '⊙', n: 'Décisions en attente', cat: 'Décisions', apiCard: false, tags: [] },
  { id: 'arb', g: '⚖', n: 'Fiches d’arbitrage', cat: 'Décisions', apiCard: false, tags: [] },
  { id: 'copil', g: '▣', n: 'Prochain COPIL', cat: 'Comités', apiCard: false, tags: [] },
  { id: 'act', g: '✓', n: 'Actions en retard', cat: 'Actions', apiCard: false, tags: [] },
  { id: 'mine', g: '◎', n: 'Mes tâches', cat: 'Personnel', apiCard: false, tags: [] },
  { id: 'liv', g: '▢', n: 'Livrables sous 30 jours', cat: 'Livrables', apiCard: false, tags: [] },
  { id: 'baro', g: '♡', n: 'Baromètre des équipes', cat: 'Équipes', apiCard: false, tags: [] },
  { id: 'inc', g: '≠', n: 'Incohérences à traiter', cat: 'Qualité', apiCard: false, tags: [] },
  { id: 'docs', g: '▤', n: 'Documents récents', cat: 'Documents', apiCard: false, tags: [] },
];

export const WIDGET_IDS: ReadonlySet<string> = new Set(WIDGET_CATALOGUE.map((w) => w.id));
/** Widgets qu'une carte API peut alimenter (carte API requise). */
export const API_WIDGET_IDS: ReadonlySet<string> = new Set(WIDGET_CATALOGUE.filter((w) => w.apiCard).map((w) => w.id));

/** Anciens libellés envoyés par le Cockpit (en-tête `X-RISE-Widget`) → identifiant du catalogue. */
export const WIDGET_LEGACY_LABELS: Record<string, string> = { 'Météo · ville': 'meteo', 'Actualités': 'news', 'Trafic · ville': 'trafic' };

/** Identifiant du catalogue d'un widget déclaré par le Cockpit ; null s'il est inconnu. */
export function widgetId(v: string | null | undefined): string | null {
  if (!v) return null;
  const id = WIDGET_LEGACY_LABELS[v] ?? v;
  return WIDGET_IDS.has(id) ? id : null;
}

/** Nom affichable d'un widget (identifiant inconnu : tel quel). */
export function widgetName(id: string): string {
  return WIDGET_CATALOGUE.find((w) => w.id === id)?.n ?? id;
}
