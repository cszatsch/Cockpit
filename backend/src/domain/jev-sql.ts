/**
 * Jev de la Console, interrogation des données en langage naturel (Text-to-SQL, étape 2) : règles pures.
 * Extraction et contrôle de la requête écrite par le modèle, dictionnaire mis en forme pour le prompt,
 * résultats mis en forme pour la réponse. Testées dans test/unit.
 */

/** Rôle PostgreSQL d'exécution : lecture seule, droits limités aux vues du schéma `jev` (migration `…_jev_lecteur`). */
export const JEV_SQL_ROLE = 'jev_lecteur';
/** Durée maximale d'une requête. */
export const JEV_SQL_TIMEOUT_MS = 5000;
/** Lignes transmises au modèle au plus. */
export const JEV_SQL_MAX_ROWS = 200;
/** Taille maximale des résultats transmis au modèle (caractères JSON). */
export const JEV_SQL_MAX_RESULT_CHARS = 30_000;
/** Nouvelles tentatives quand la requête est refusée ou échoue (décision du 28/09/2026). */
export const JEV_SQL_RETRIES = 1;

/** Requête SQL d'une réponse du modèle : le contenu du premier bloc ```sql```, sinon null (réponse directe). */
export function extractSql(text: string): string | null {
  const m = text.match(/```sql\s*([\s\S]*?)```/i);
  return m ? m[1].trim() : null;
}

/**
 * Bloc ```sql ouvert mais jamais refermé : la réponse a été coupée par la limite de sortie du modèle
 * (`LIVE_MAX_OUTPUT_TOKENS`). Correction du 30/09/2026 : une telle réponse n'est jamais montrée ni envoyée telle quelle.
 */
export function sqlCut(text: string): boolean {
  return /```\s*sql/i.test(text) && extractSql(text) === null;
}

/** Réponse qui contient ou commence une requête (bloc sql, ou texte qui débute par SELECT / WITH) : jamais montrée telle quelle. */
export function looksLikeSql(text: string): boolean {
  return /```\s*sql/i.test(text) || /^\s*(select|with)\b/i.test(text);
}

/** Motif transmis au modèle pour qu'il réécrive une requête coupée. */
export const SQL_CUT_REASON = 'requête coupée car trop longue : écris une requête nettement plus courte (une seule instruction SELECT, colonnes utiles seulement), sans aucun texte autour';

const FORBIDDEN = /\b(insert|update|delete|merge|drop|alter|create|grant|revoke|truncate|copy|call|do|execute|vacuum|analyze|lock|comment|refresh|listen|notify|prepare|reindex|cluster|security|set_config|pg_sleep|dblink|lo_import|lo_export|query_to_xml\w*|cursor_to_xml\w*)\b/i;

/**
 * Contrôle d'une requête avant exécution : une seule instruction de lecture (SELECT ou WITH … SELECT),
 * sur les vues du schéma `jev` seulement. Renvoie le motif du refus, ou null.
 * Le rôle en lecture seule et la transaction READ ONLY restent la vraie garantie.
 */
export function sqlError(raw: string): string | null {
  const sql = stripComments(raw).trim().replace(/;\s*$/, '');
  if (!sql) return 'requête vide';
  if (sql.includes(';')) return 'une seule instruction est permise';
  if (!/^(select|with)\b/i.test(sql)) return 'seule une lecture (SELECT) est permise';
  const bare = sql.replace(/'(?:[^']|'')*'/g, "''");
  const bad = bare.match(FORBIDDEN);
  if (bad) return `mot interdit : ${bad[1].toUpperCase()}`;
  if (/\b(pg_\w+|information_schema)\b/i.test(bare)) return 'tables système interdites : seules les vues jev.* sont lisibles';
  const schemas = [...bare.matchAll(/\b([a-z_][a-z0-9_]*|"[^"]+")\s*\.\s*(?:[a-z_"])/gi)].map((m) => m[1].replace(/"/g, '').toLowerCase());
  // Seul le schéma jev est permis devant un nom de table ; alias de table (t.col) : acceptés.
  if (schemas.some((s) => s === 'public')) return 'seules les vues jev.* sont lisibles';
  return null;
}

function stripComments(s: string): string {
  return s.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/** Vues citées par une requête (sources affichées sous la réponse), dans l'ordre du dictionnaire. */
export function viewsUsed(sql: string, views: string[]): string[] {
  const s = stripComments(sql).toLowerCase();
  return views.filter((v) => new RegExp(`\\b(jev\\s*\\.\\s*)?"?${v}"?\\b`).test(s));
}

export interface DictRow {
  nom: string;
  description: string;
  relations: string;
  usages: string;
  regles: string;
  colonnes: Array<{ nom: string; type: string; signification: string; exemplesUnites: string | null }>;
}

/** Dictionnaire mis en forme pour le modèle (fiches actives, lues en base à chaque question). */
export function renderDictionary(tables: DictRow[], schema = 'jev'): string {
  const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);
  return tables
    .map((t) => {
      const out = [`### ${schema}.${t.nom}`, t.description, 'Colonnes :'];
      for (const c of t.colonnes) out.push(`- ${c.nom} (${c.type}) : ${c.signification}${c.exemplesUnites ? ` [${c.exemplesUnites}]` : ''}`);
      if (lines(t.relations).length) out.push('Relations :', ...lines(t.relations).map((x) => `- ${x}`));
      if (lines(t.usages).length) out.push('Usages :', ...lines(t.usages).map((x) => `- ${x}`));
      if (lines(t.regles).length) out.push('Règles :', ...lines(t.regles).map((x) => `- ${x}`));
      return out.join('\n');
    })
    .join('\n\n');
}

/** Consignes de l'étape « écrire la requête », ajoutées au prompt système de la Console. */
/** Variante des consignes : données de la Console (par défaut) ou du Cockpit (rédaction des notifications). */
export interface SqlScope {
  title: string;
  schema: string;
  /** Ce que couvrent les données (« comptes, modèles, coûts… »). */
  topics: string;
  /** Réponse directe (sans SQL) quand la demande n'exige pas de données. */
  direct: string;
  /** Précision de périmètre ajoutée aux consignes (droits). */
  scope?: string;
}
export const CONSOLE_SQL_SCOPE: SqlScope = {
  title: 'Données de la Console',
  schema: 'jev',
  topics: 'comptes, modèles, coûts, cartes, journal…',
  direct: 'Si la question ne demande pas de données (comment faire, où trouver, que signifie), réponds directement à l’utilisateur, sans SQL.',
};

/**
 * Consignes de lecture des données. `todayIso` / `nowParis` à null : la date et l'heure ne sont pas écrites ici mais
 * dans le « Contexte de la demande » (`requestContext`), placé après : la partie stable reste identique d'un appel à
 * l'autre et peut être mise en cache (mémoire de Jev, décision du 30/09/2026).
 */
export function sqlInstructions(dictionary: string, todayIso: string | null, nowParis: string | null, v: SqlScope = CONSOLE_SQL_SCOPE): string {
  return [
    `## ${v.title}`,
    'Tu peux lire les données de la plateforme au moyen d’une requête SQL (PostgreSQL) sur les vues en lecture seule décrites ci-dessous, et seulement celles-ci.',
    `- Si la question porte sur des données de la plateforme (${v.topics}), réponds UNIQUEMENT par une requête courte dans un bloc \`\`\`sql … \`\`\`, sans aucun autre texte (ni salutation, ni explication).`,
    `- ${v.direct}`,
    `- Une seule instruction SELECT (WITH permis), vues préfixées par ${v.schema}. ; respecte les règles de chaque fiche (statuts, dates, calculs) ; noms de colonnes exactement comme dans les fiches.`,
    ...(v.scope ? [`- ${v.scope}`] : []),
    `- ${todayIso === null ? 'Date du jour de la plateforme et heure de Paris : voir « Contexte de la demande »' : `Date du jour de la plateforme : ${todayIso}. Maintenant (heure de Paris) : ${nowParis}`}. Utilise ces valeurs écrites en toutes lettres dans la requête, jamais CURRENT_DATE, now() ni CURRENT_TIMESTAMP. Toutes les dates-heures des vues sont en heure de Paris.`,
    `- Limite-toi aux colonnes utiles ; ${JEV_SQL_MAX_ROWS} lignes au plus sont lues.`,
    '',
    '## Dictionnaire des données',
    dictionary,
  ].join('\n');
}

/**
 * Partie variable du prompt système de Jev (après la partie stable mise en cache) : page ouverte, date et heure, et
 * résumé des échanges plus anciens de la conversation.
 */
export function requestContext(page: string, todayIso: string, nowParis: string, summary?: string | null): string {
  return [
    '## Contexte de la demande',
    page,
    `Date du jour de la plateforme : ${todayIso}. Maintenant (heure de Paris) : ${nowParis}.`,
    ...(summary ? ['', '## Résumé des échanges précédents de la conversation', summary] : []),
  ].join('\n');
}

/** Consignes de l'étape « rédiger la réponse » à partir des résultats. */
export const ANSWER_INSTRUCTIONS = [
  '## Réponse à partir des données',
  'La question de l’utilisateur a été traduite en requête SQL, exécutée sur les données de la plateforme. Réponds à la question à partir des résultats fournis, et d’eux seuls :',
  '- N’invente aucune valeur. Si les résultats sont vides, dis qu’aucune donnée ne correspond. S’ils sont tronqués, dis-le.',
  '- Traduis les codes (INVITED = invité, OK = opérationnel…) d’après le dictionnaire ; ne montre pas la requête SQL.',
  '- Tu n’agis pas à la place de l’utilisateur : n’offre pas d’ouvrir une page ni d’exécuter une action ; indique où la faire dans la Console si c’est utile.',
  '- Garde le même registre (tutoiement ou vouvoiement) d’un bout à l’autre de la réponse, celui de ta Personnalité.',
].join('\n');

/** Valeur lisible par le modèle : entiers longs → nombre, dates-heures (déjà en heure de Paris) → « AAAA-MM-JJ HH:MM:SS ». */
function plain(v: unknown): unknown {
  if (typeof v === 'bigint') return Number(v);
  if (v instanceof Date) return v.toISOString().slice(0, 19).replace('T', ' ').replace(/ 00:00:00$/, '');
  if (v && typeof v === 'object' && typeof (v as any).toFixed === 'function' && typeof (v as any).toNumber === 'function') return (v as any).toNumber();
  if (Array.isArray(v)) return v.map(plain);
  return v;
}

/** Résultats d'une requête mis en forme pour le modèle (bornés en lignes et en taille). */
export function formatRows(rows: Array<Record<string, unknown>>): { text: string; count: number; truncated: boolean } {
  const truncated = rows.length > JEV_SQL_MAX_ROWS;
  const kept = rows.slice(0, JEV_SQL_MAX_ROWS).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, plain(v)])));
  let text = JSON.stringify(kept);
  let cut = truncated;
  if (text.length > JEV_SQL_MAX_RESULT_CHARS) {
    text = text.slice(0, JEV_SQL_MAX_RESULT_CHARS) + '…';
    cut = true;
  }
  return { text, count: kept.length, truncated: cut };
}
