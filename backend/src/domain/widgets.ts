/**
 * Catalogue des widgets du tableau de bord du Cockpit (22 widgets, `RISE Cockpit.dc.html`), servi à la Console
 * (Registre des cartes API : « Alimente », « Associer un widget »). Un test vérifie qu'il reste identique au
 * catalogue du Cockpit (identifiants, noms, catégories).
 *
 * `tags` : tags de cartes API pour lesquels le widget est suggéré (« Suggérés pour <tag> »).
 * Météo et Trafic portent le nom de la ville du projet dans le Cockpit : « <ville> » ici.
 */
export interface WidgetDef {
  id: string;
  g: string;
  n: string;
  cat: string;
  tags: string[];
}

export const WIDGET_CATALOGUE: readonly WidgetDef[] = [
  { id: 'news', g: '◉', n: 'Actualité', cat: 'Contexte', tags: ['Actualités'] },
  { id: 'meteo', g: '☀', n: 'Météo · <ville>', cat: 'Contexte', tags: ['Météo', 'Environnement'] },
  { id: 'trafic', g: '⇅', n: 'Trafic · <ville>', cat: 'Contexte', tags: ['Trafic', 'Mobilité'] },
  { id: 'ai', g: '✦', n: 'L’essentiel, par Jev', cat: 'Synthèse', tags: ['Actualités', 'Finance', 'Environnement', 'Entreprises'] },
  { id: 'ech', g: '⧗', n: 'Échéances des 15 prochains jours', cat: 'Planning', tags: ['Calendrier'] },
  { id: 'golive', g: 'J', n: 'Compte à rebours Go-Live', cat: 'Planning', tags: [] },
  { id: 'av', g: '%', n: 'Avancement vs référence', cat: 'Planning', tags: [] },
  { id: 'jal', g: '◆', n: 'Prochains jalons', cat: 'Jalons', tags: [] },
  { id: 'crit', g: '▤', n: 'Chemin critique', cat: 'Planning', tags: [] },
  { id: 'ch', g: '≡', n: 'Météo des chantiers', cat: 'Chantiers', tags: [] },
  { id: 'risk', g: '!', n: 'Risques critiques', cat: 'Risques', tags: [] },
  { id: 'rtrend', g: '↗', n: 'Tendance des risques', cat: 'Risques', tags: [] },
  { id: 'pb', g: '⚑', n: 'Problèmes ouverts', cat: 'Risques', tags: [] },
  { id: 'dec', g: '⊙', n: 'Décisions en attente', cat: 'Décisions', tags: [] },
  { id: 'arb', g: '⚖', n: 'Fiches d’arbitrage', cat: 'Décisions', tags: [] },
  { id: 'copil', g: '▣', n: 'Prochain COPIL', cat: 'Comités', tags: [] },
  { id: 'act', g: '✓', n: 'Actions en retard', cat: 'Actions', tags: [] },
  { id: 'mine', g: '◎', n: 'Mes tâches', cat: 'Personnel', tags: [] },
  { id: 'liv', g: '▢', n: 'Livrables sous 30 jours', cat: 'Livrables', tags: [] },
  { id: 'baro', g: '♡', n: 'Baromètre des équipes', cat: 'Équipes', tags: [] },
  { id: 'inc', g: '≠', n: 'Incohérences à traiter', cat: 'Qualité', tags: [] },
  { id: 'docs', g: '▤', n: 'Documents récents', cat: 'Documents', tags: [] },
];

export const WIDGET_IDS: ReadonlySet<string> = new Set(WIDGET_CATALOGUE.map((w) => w.id));

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
