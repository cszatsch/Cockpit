/**
 * Réponses de Jev dans la Console selon l'aiguillage (décision du 30/09/2026) : règles pures, sans réseau.
 * - USAGE : recherche dans le guide utilisateur (RAG) — vectorisation de la question par le modèle de l'index,
 *   recherche pgvector, reclassement, rédaction à partir des seuls extraits, sources (section, page).
 * - AMBIGU, HORS_SUJET ou aucun extrait pertinent : réponse de clarification (reformulations ou options).
 * - DONNÉES : traitement existant (requête sur les tables de la Console).
 */

// ───────────── Réglages (modifiables depuis la Console) ─────────────

export interface RagSettings {
  searchK: number;
  keepK: number;
  minSimilarity: number;
  embedTimeoutMs: number;
  rerankTimeoutMs: number;
  llmTimeoutMs: number;
}

/**
 * Valeurs par défaut : 8 extraits recherchés, 4 gardés après reclassement ; seuil de similarité cosinus calibré sur
 * les questions d'usage du jeu de test (voir docs/DECISIONS.md) ; délais : 10 s (vectorisation d'une question),
 * 8 s (reclassement), 30 s (rédaction).
 */
export const RAG_DEFAULTS: RagSettings = { searchK: 8, keepK: 4, minSimilarity: 0.58, embedTimeoutMs: 10_000, rerankTimeoutMs: 8_000, llmTimeoutMs: 30_000 };

/** Bornes acceptées à l'enregistrement. */
export const RAG_LIMITS = {
  searchK: [1, 30],
  keepK: [1, 10],
  minSimilarity: [0, 0.95],
  embedTimeoutMs: [1_000, 60_000],
  rerankTimeoutMs: [1_000, 60_000],
  llmTimeoutMs: [5_000, 120_000],
} as const;

/** Contrôles des réglages : message par champ, vide si tout est valide. */
export function ragSettingsErrors(s: RagSettings): Record<string, string> {
  const e: Record<string, string> = {};
  for (const [k, [min, max]] of Object.entries(RAG_LIMITS) as Array<[keyof RagSettings, readonly [number, number]]>) {
    const v = s[k];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) e[k] = `entre ${min} et ${max}`;
    else if (k !== 'minSimilarity' && !Number.isInteger(v)) e[k] = 'nombre entier attendu';
  }
  if (!e.keepK && !e.searchK && s.keepK > s.searchK) e.keepK = 'au plus le nombre d’extraits recherchés';
  return e;
}

/**
 * Réglages au format de l'écran « Guide utilisateur » (maquette Console Cockpit) : k (extraits recherchés), keep
 * (conservés), thr (seuil), délais en secondes tv (vectorisation), tr (reclassement), tw (rédaction).
 */
export interface ScreenRagSettings { k: number; keep: number; thr: number; tv: number; tr: number; tw: number }
export const toScreenSettings = (s: RagSettings): ScreenRagSettings => ({ k: s.searchK, keep: s.keepK, thr: s.minSimilarity, tv: s.embedTimeoutMs / 1000, tr: s.rerankTimeoutMs / 1000, tw: s.llmTimeoutMs / 1000 });
export const fromScreenSettings = (s: ScreenRagSettings): RagSettings => ({ searchK: s.k, keepK: s.keep, minSimilarity: s.thr, embedTimeoutMs: Math.round(s.tv * 1000), rerankTimeoutMs: Math.round(s.tr * 1000), llmTimeoutMs: Math.round(s.tw * 1000) });
/** Contrôle au format de l'écran : bornes de `RAG_LIMITS`, délais en secondes entières, conservés ≤ recherchés. */
export function screenSettingsErrors(s: ScreenRagSettings): Record<string, string> {
  const e: Record<string, string> = {};
  const lim: Array<[keyof ScreenRagSettings, number, number, boolean]> = [
    ['k', RAG_LIMITS.searchK[0], RAG_LIMITS.searchK[1], true], ['keep', RAG_LIMITS.keepK[0], RAG_LIMITS.keepK[1], true], ['thr', RAG_LIMITS.minSimilarity[0], RAG_LIMITS.minSimilarity[1], false],
    ['tv', RAG_LIMITS.embedTimeoutMs[0] / 1000, RAG_LIMITS.embedTimeoutMs[1] / 1000, true], ['tr', RAG_LIMITS.rerankTimeoutMs[0] / 1000, RAG_LIMITS.rerankTimeoutMs[1] / 1000, true], ['tw', RAG_LIMITS.llmTimeoutMs[0] / 1000, RAG_LIMITS.llmTimeoutMs[1] / 1000, true],
  ];
  for (const [k, min, max, int] of lim) {
    const v = s[k];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) e[k] = `entre ${String(min).replace('.', ',')} et ${String(max).replace('.', ',')}`;
    else if (int && !Number.isInteger(v)) e[k] = 'nombre entier attendu';
  }
  if (!e.k && !e.keep && s.keep > s.k) e.keep = 'au plus le nombre d’extraits recherchés';
  return e;
}

// ───────────── Extraits et sources ─────────────

export interface GuideExtract {
  id: string;
  sectionPath: string;
  heading: string;
  pageStart: number;
  pageEnd: number;
  content: string;
  /** Similarité cosinus (0 à 1) et score du reclassement (s'il a eu lieu). */
  similarity: number;
  rerankScore?: number | null;
}

/** Pages d'un extrait : « p. 31 » ou « p. 31-32 ». */
export const pagesOf = (x: Pick<GuideExtract, 'pageStart' | 'pageEnd'>) => (x.pageStart === x.pageEnd ? `p. ${x.pageStart}` : `p. ${x.pageStart}-${x.pageEnd}`);

/** Source affichée sous la réponse : « Guide · 3.18.4 Planification et règle de rattrapage · p. 31 ». */
export const guideSource = (x: Pick<GuideExtract, 'heading' | 'pageStart' | 'pageEnd'>) => `Guide · ${x.heading} · ${pagesOf(x)}`;

/** Sources : une par section, pages réunies (« p. 12-13 »), dans l'ordre des extraits. */
export function guideSources(xs: GuideExtract[]): string[] {
  const by = new Map<string, { heading: string; pageStart: number; pageEnd: number }>();
  for (const x of xs) {
    const s = by.get(x.heading);
    if (s) { s.pageStart = Math.min(s.pageStart, x.pageStart); s.pageEnd = Math.max(s.pageEnd, x.pageEnd); } else by.set(x.heading, { heading: x.heading, pageStart: x.pageStart, pageEnd: x.pageEnd });
  }
  return [...by.values()].map(guideSource);
}

/**
 * Préfixe des questions pour les modèles d'embedding « à instruction » (recommandation de Qwen3 Embedding : la
 * question reçoit une consigne, les extraits indexés n'en ont pas).
 */
export const EMBED_QUERY_PREFIXES: Array<{ match: RegExp; prefix: string }> = [
  { match: /qwen3[-_ ]?embedding/i, prefix: 'Instruct: Given a question about an administration console, retrieve the passages of its user guide that answer it\nQuery: ' },
];
export function queryForEmbedding(modelIdOrName: string, question: string): string {
  const p = EMBED_QUERY_PREFIXES.find((x) => x.match.test(modelIdOrName));
  return p ? p.prefix + question : question;
}

// ───────────── Prompts ─────────────

/** Partie stable (mise en cache) ajoutée au prompt de Jev pour une réponse à partir du guide de l'application. */
export const guideAnswerRules = (app: 'console' | 'cockpit' = 'console') => [
  '## Répondre à partir du guide utilisateur',
  `La question porte sur l’utilisation ou le fonctionnement ${app === 'cockpit' ? 'du Cockpit' : 'de la Console'}. Des extraits du guide utilisateur sont fournis dans la section « Extraits du guide utilisateur ».`,
  '- Réponds uniquement à partir de ces extraits : n’ajoute aucune règle, aucun délai, aucun libellé ni aucune étape qui n’y figure pas.',
  '- Cite tes sources dans le texte, sous la forme (section, p. N), par exemple (3.18.4 Planification et règle de rattrapage, p. 31).',
  '- Ne termine pas par une ligne ou une liste « Sources » : les sources s’affichent déjà sous la réponse.',
  '- Si les extraits ne permettent pas de répondre, dis-le clairement : « Le guide utilisateur ne précise pas… », puis indique ce qui s’en approche le plus, sans rien inventer.',
  '- Reprends les libellés exacts des boutons et des pages entre guillemets, et les étapes dans l’ordre.',
  // Cockpit : vouvoiement imposé (le ton de l'utilisateur et la Persona n'y changent rien, 01/10/2026).
  app === 'cockpit' ? '- Réponds en français, en vouvoyant l’utilisateur, sans formule de politesse.' : '- Réponds en français, au registre de l’utilisateur, sans formule de politesse.',
].join('\n');
export const GUIDE_ANSWER_RULES = guideAnswerRules('console');

/** Partie variable : extraits (section et pages), puis la question. */
export function guideExtractsBlock(xs: GuideExtract[]): string {
  return ['## Extraits du guide utilisateur', ...xs.map((x, i) => `### Extrait ${i + 1} · ${x.heading} · ${pagesOf(x)}\n${x.content}`)].join('\n\n');
}

/** Ce que Jev sait faire (rappelé dans la clarification). */
export const JEV_CAPABILITIES = 'Je réponds à deux sortes de questions sur la Console d’administration RISE : son utilisation (où trouver un écran ou un réglage, comment faire, quelles règles s’appliquent, d’après le guide utilisateur) et ses données (comptes, droits, IA et coûts, projets, snapshots, notifications, modules, cartes API, journal d’audit).';

export type ClarifyReason = 'AMBIGU' | 'HORS_SUJET' | 'AUCUN_EXTRAIT' | 'GUIDE_NON_INDEXE' | 'INDISPONIBLE';

/** Consignes de la réponse de clarification (partie stable, mise en cache). */
export const CLARIFY_RULES = [
  '## Demander une précision',
  `Ce que tu sais faire : ${JEV_CAPABILITIES}`,
  '- Réponds en français, en 3 à 5 lignes au plus.',
  '- Dis en une phrase ce qui manque pour répondre, sans reproche.',
  '- Propose 2 ou 3 reformulations ou options précises, en liste, que l’utilisateur peut reprendre telles quelles (une sur l’utilisation de la Console, une sur ses données, si les deux ont du sens).',
  '- N’invente aucune donnée et aucune règle de la Console.',
].join('\n');

/** Demande de clarification (partie variable), selon le motif. */
export function clarifyPrompt(question: string, reason: ClarifyReason): string {
  const why: Record<ClarifyReason, string> = {
    AMBIGU: 'La demande est ambiguë : elle peut porter sur l’utilisation de la Console ou sur ses données, ou elle est trop vague.',
    HORS_SUJET: 'La demande semble sans rapport avec la Console d’administration : rappelle poliment ton périmètre, puis propose des questions possibles.',
    AUCUN_EXTRAIT: 'Aucun passage du guide utilisateur ne répond à cette demande : dis-le clairement (« Je n’ai pas trouvé cette information dans le guide utilisateur »), puis propose des reformulations ou une question sur les données.',
    GUIDE_NON_INDEXE: 'Le guide utilisateur n’est pas disponible pour la recherche (aucun guide indexé, ou modèle de vectorisation indisponible) : dis-le, puis propose une question sur les données ou de consulter la page Guide utilisateur.',
    INDISPONIBLE: 'La recherche dans le guide est momentanément indisponible : dis-le, puis propose de reformuler ou de poser une question sur les données.',
  };
  return `Génère une réponse à cette demande, qui nécessite une clarification de la part de l’utilisateur :\n${question}\n\n${why[reason]}`;
}

/** Reformulation d'une question de suite en question autonome (avant la recherche dans le guide). */
export const REFORMULATE_SYSTEM = [
  'Tu reformules la dernière question d’un administrateur de la Console d’administration RISE pour qu’elle se comprenne seule, sans la conversation.',
  'Remplace les pronoms et les ellipses par ce qu’ils désignent dans les échanges précédents. Garde le sens et la langue ; n’ajoute rien.',
  'Si la question se comprend déjà seule, recopie-la telle quelle.',
  'Réponds uniquement par la question reformulée, sur une ligne, sans guillemets.',
].join('\n');

/** Réponse de reformulation → question sur une ligne (garde la question d'origine si la réponse est inexploitable). */
export function cleanReformulation(raw: string, original: string): string {
  const t = raw.replace(/^[«"“\s]+|[»"”\s]+$/g, '').split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  return t && t.length <= 500 ? t : original;
}
