/**
 * Catalogue des widgets du tableau de bord du Cockpit (22 widgets, `RISE Cockpit.dc.html`), servi à la Console
 * (Registre des cartes API : « Alimente », « Associer un widget »). Un test vérifie qu'il reste identique au
 * catalogue du Cockpit (identifiants, noms, catégories).
 *
 * `apiCard` : carte API requise (Oui / Non) — le widget tire ses données d'un service externe du registre ; seuls ces
 * widgets peuvent être associés à une carte (« Associer un widget »).
 * `tags` : tags de cartes API pour lesquels le widget est suggéré (« Suggérés pour <tag> »).
 * Météo et Trafic portent le nom de la ville du projet dans le Cockpit : « <ville> » ici.
 *
 * Registre des cartes API (15/10/2026) : `group: 'thematic'` pour les 8 widgets alimentés par une carte (matrice
 * thème × langue du registre, `theme`, `lang`) ; `context` n'est plus utilisé.
 */
export interface WidgetDef {
  id: string;
  g: string;
  n: string;
  cat: string;
  /** Carte API requise pour alimenter le widget. */
  apiCard: boolean;
  tags: string[];
  /** Widgets alimentés par une carte API : ligne « Contexte » ou matrice des widgets thématiques du registre. */
  group?: 'context' | 'thematic';
  /** Widget thématique : thème (libellé de la ligne de la matrice) et langue (colonne). */
  theme?: string;
  lang?: 'FR' | 'EN';
}

export const WIDGET_CATALOGUE: readonly WidgetDef[] = [
  // Actualité : plus associable à une carte depuis le 15/10/2026 (8 widgets du registre) ; la tuile du Cockpit lit les
  // cartes du widget News FR (`GET /api/widgets/news?widget=news_fr`).
  { id: 'news', g: '◉', n: 'Actualité', cat: 'Contexte', apiCard: false, tags: [] },
  { id: 'meteo', g: '☀', n: 'Météo · <ville>', cat: 'Contexte', apiCard: true, tags: ['Météo'], group: 'thematic', theme: 'Météo', lang: 'FR' },
  { id: 'trafic', g: '⇅', n: 'Trafic · <ville>', cat: 'Contexte', apiCard: true, tags: ['Trafic'], group: 'thematic', theme: 'Trafic', lang: 'FR' },
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

/**
 * Widgets du registre (consigne du commanditaire du 15/10/2026) : 8 widgets alimentés par une carte — Actualités Eco,
 * News et Sports en français et en anglais, Météo et Trafic en français seulement (ci-dessus, dans le catalogue du
 * tableau de bord). Matrice du registre : une ligne par thème (`theme`), une colonne par langue (`lang`).
 * Tuiles « Actualités » du Cockpit : titres des cartes associées (`GET /api/widgets/news?widget=…`).
 */
export const THEMATIC_THEMES: ReadonlyArray<readonly [string, string, string[]]> = [
  ['eco', 'Actualités Eco', ['Actualités Eco']],
  ['news', 'News', ['News']],
  ['sport', 'Sports', ['Sports']],
];
export const THEMATIC_WIDGETS: readonly WidgetDef[] = THEMATIC_THEMES.flatMap(([t, l, tags]) =>
  (['FR', 'EN'] as const).map((lang) => ({ id: `${t}_${lang.toLowerCase()}`, g: '◉', n: `${l} ${lang}`, cat: 'Actualités', apiCard: true, tags, group: 'thematic' as const, theme: l, lang })),
);
/** Catalogue servi au registre (`GET /api/admin/widgets`) : widgets du tableau de bord, puis widgets thématiques. */
export const REGISTRY_WIDGETS: readonly WidgetDef[] = [...WIDGET_CATALOGUE, ...THEMATIC_WIDGETS];
/** Widgets d'actualités lus par `GET /api/widgets/news?widget=…` (tuiles Actualités du Cockpit). */
export const NEWS_WIDGET_IDS: ReadonlySet<string> = new Set(THEMATIC_WIDGETS.map((w) => w.id));

export const WIDGET_IDS: ReadonlySet<string> = new Set(REGISTRY_WIDGETS.map((w) => w.id));
/** Widgets qu'une carte API peut alimenter (carte API requise). */
export const API_WIDGET_IDS: ReadonlySet<string> = new Set(REGISTRY_WIDGETS.filter((w) => w.apiCard).map((w) => w.id));

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
  return REGISTRY_WIDGETS.find((w) => w.id === id)?.n ?? id;
}

/** Widgets d'une carte sous les identifiants du catalogue (anciens libellés convertis, doublons retirés). */
export function cardWidgets(ws: readonly string[]): string[] {
  return [...new Set(ws.map((w) => widgetId(w) ?? w))];
}
