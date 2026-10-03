import { Box, PageKind, PAGE_LABELS, RoleMap, roleErrors, SHAPE_ROLES, ShapeInfo, ShapeRole } from './report-format';

/**
 * Intelligence artificielle de la génération des rapports (fonction « Génération de rapports », 03/10/2026) :
 * 1. rôles des formes d'une page modèle (titre, date, design fixe, contenu d'exemple…), proposés par l'IA puis
 *    validés par l'utilisateur ; 2. rédaction des titres-messages et de la synthèse de chaque publication, à partir des
 *    seules données du Cockpit, selon les skills « Rapports » et « Rédiger les slides PowerPoint ». Règles pures :
 *    consignes, lecture et contrôle des réponses (repli par règles si une réponse est refusée).
 */

/** Skills de Jev reprises comme consignes de rédaction (par leur nom, si elles sont actives). */
export const WRITING_SKILLS = ['Rapports', 'Rédiger les slides PowerPoint'];
/** Version des consignes (tracée avec chaque génération). */
export const WRITING_PROMPT_VERSION = 'rapports-v1';
export const TITLE_MAX = 110;
export const SYNTHESIS_MAX_SENTENCES = 5;
export const SENTENCE_MAX = 260;
/** Délai d'un appel : la publication attend la rédaction (repli par règles au-delà). */
export const WRITING_TIMEOUT_MS = 90_000;
export const ROLES_TIMEOUT_MS = 60_000;

const pct = (v: number, of: number) => Math.round((v / of) * 100);
const box = (b: Box, s: { cx: number; cy: number }) => `x=${pct(b.x, s.cx)}% y=${pct(b.y, s.cy)}% l=${pct(b.w, s.cx)}% h=${pct(b.h, s.cy)}%`;

// ───────────── Rôles des formes ─────────────

export const ROLES_SYSTEM = `Tu analyses une diapositive PowerPoint qui sert de modèle de page à un générateur de rapports de comité.
Pour chaque forme, tu choisis son rôle :
${SHAPE_ROLES.map((r) => `- ${r.id} : ${r.label}`).join('\n')}
Règles :
- « title » : la forme qui recevra le titre (titre du rapport sur la couverture, de la section sur l'intercalaire, titre-message sur la page standard). Une seule par page, sauf la clôture qui peut ne pas en avoir.
- « example » : tout contenu propre à l'exemple qui ne doit pas se répéter dans chaque rapport (textes de fond, cartes, chiffres, frises, tableaux, graphiques d'exemple). Sur la page standard, c'est la zone où le générateur posera les tableaux et graphiques.
- « fixed » : décor et identité visuelle (logos, fonds, bandeaux, formes décoratives, marques).
- Les rôles qui reçoivent un texte (title, subtitle, section, sectionNumber, date, period, project, client, committee, pageNumber) ne s'appliquent qu'aux formes de type text ou placeholder.
- Une date de remise ou d'édition devient « date » ; une période de mission ou de données, « period » ; le nom du client, « client ».
Réponds uniquement par un objet JSON {"roles": {"<id>": "<rôle>", …}} couvrant toutes les formes.`;

export function rolesPrompt(kind: PageKind, shapes: ShapeInfo[], size: { cx: number; cy: number }, suggestion: RoleMap): string {
  const rows = shapes.map((s) => ({ id: s.id, type: s.kind, ...(s.ph ? { placeholder: s.ph } : {}), position: box(s.box, size), corps: s.size, gras: s.bold, texte: s.text.replace(/\s+/g, ' ').slice(0, 160), proposition: suggestion[s.id] }));
  return `Type de page : ${PAGE_LABELS[kind]} (${kind}).\nFormes (de l'arrière-plan au premier plan) :\n${JSON.stringify(rows, null, 1)}\nLa colonne « proposition » vient de règles simples : corrige-la si nécessaire.`;
}

/** Lecture de la réponse : rôles connus pour toutes les formes, contrôle des rôles ; sinon null (repli sur les règles). */
export function parseRoles(text: string, kind: PageKind, shapes: ShapeInfo[], fallback: RoleMap): RoleMap | null {
  const json = /\{[\s\S]*\}/.exec(text)?.[0];
  if (!json) return null;
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { return null; }
  const map = (raw as { roles?: Record<string, string> })?.roles;
  if (!map || typeof map !== 'object') return null;
  const known = new Set<string>(SHAPE_ROLES.map((r) => r.id));
  const roles: RoleMap = {};
  for (const s of shapes) roles[s.id] = known.has(map[s.id]) ? (map[s.id] as ShapeRole) : fallback[s.id] ?? 'fixed';
  return roleErrors(kind, shapes, roles) ? null : roles;
}

// ───────────── Rédaction des titres-messages et de la synthèse ─────────────

export interface WritingFacts {
  report: { title: string; committee: string; project: string; date: string };
  components: Array<{ key: string; label: string; caption: string; titreMax?: number; kpis?: Array<{ label: string; value: string }>; table?: { columns: string[]; rows: string[][]; total: number }; chart?: { categories: string[]; series: Array<{ name: string; values: Array<number | null> }> }; facts?: string[] }>;
  /** Composant dont la page porte la synthèse rédigée. */
  synthesis: string | null;
}

export function writingSystem(skills: Array<{ n: string; t: string }>): string {
  const guide = skills.map((s) => `### Skill « ${s.n} »\n${s.t}`).join('\n\n');
  return `Tu rédiges les textes d'un rapport de comité PowerPoint généré par le Cockpit RISE. Le fichier, sa mise en page et ses tableaux sont produits par l'application : tu n'écris que les titres-messages des pages et, s'il est demandé, le texte de synthèse.
Règles impératives :
- Vouvoiement, français professionnel, phrases courtes ; aucun Markdown, aucun guillemet autour des textes.
- Un titre-message par page : il dit le message de la page (« Le Go-Live tient, sous réserve de la recette »), pas son intitulé (« Planning ») ; il tient dans sa zone : « titreMax » caractères au plus (espaces compris), sinon ${TITLE_MAX} ; sans point final.
- La synthèse : ${SYNTHESIS_MAX_SENTENCES} phrases au plus, ${SENTENCE_MAX} caractères au plus chacune, les chiffres avant les adjectifs.
- N'écris aucun nombre qui ne figure pas tel quel dans les données : ni total, ni décompte, ni durée, ni écart calculés, ni mois en chiffres (écris « oct. 2026 » comme dans les données). Si une donnée manque, dis-le sobrement.
- Réponds uniquement par un objet JSON {"titres": {"<clé>": "<titre>", …}, "synthese": ["<phrase>", …]}.
Consignes de rédaction reprises des skills de Jev (ignore ce qu'elles disent sur l'absence de fichier PowerPoint : ici, l'application le produit) :
${guide}`;
}

export function writingPrompt(f: WritingFacts): string {
  return `Rapport « ${f.report.title} » · ${f.report.committee} · projet ${f.report.project} · données au ${f.report.date}.
Pages à titrer (clé, intitulé, données) :
${JSON.stringify(f.components, null, 1)}
${f.synthesis ? `Rédige aussi la synthèse (page de la clé ${f.synthesis}).` : 'Pas de synthèse à rédiger : renvoie "synthese": [].'}`;
}

/** Seconde demande : seuls les textes refusés, avec le motif du refus. */
export function retryPrompt(f: WritingFacts, rejected: string[]): string {
  return `${writingPrompt(f)}
Ta réponse précédente a été refusée au contrôle pour ces textes :
${rejected.map((r) => `- ${r}`).join('\n')}
Réécris uniquement ces textes en respectant les règles (même format JSON ; omets les autres clés).`;
}

/** Nombres cités (« 12,8 », « 2027 », « 48 % ») : chacun doit figurer dans les données fournies. */
const numbers = (s: string) => (s.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(',', '.').replace(/^0+(?=\d)/, ''));
const clean = (s: string) => s.replace(/[*_#`]/g, '').replace(/^[«"“\s-–•]+|[»"”\s]+$/g, '').replace(/\s+/g, ' ').trim();

/**
 * Lecture et contrôle de la réponse : titres d'une ligne (au plus ${TITLE_MAX} caractères, sans point final), phrases de
 * synthèse bornées, aucun nombre absent des données. Un texte refusé est remplacé par le texte par règles (motif tracé).
 */
export function parseWriting(text: string, f: WritingFacts): { titles: Record<string, string>; synthesis: string[] | null; rejected: string[] } {
  const rejected: string[] = [];
  const json = /\{[\s\S]*\}/.exec(text)?.[0];
  let raw: { titres?: Record<string, unknown>; synthese?: unknown } = {};
  try { raw = json ? JSON.parse(json) : {}; } catch { rejected.push('réponse illisible (JSON)'); }
  const allowed = new Set(numbers(JSON.stringify(f)));
  const badNumber = (s: string) => numbers(s).find((n) => !allowed.has(n) && !allowed.has(n.replace(/\.0+$/, '')));
  const titles: Record<string, string> = {};
  for (const c of f.components) {
    const t = typeof raw.titres?.[c.key] === 'string' ? clean(raw.titres[c.key] as string).replace(/\.$/, '') : '';
    if (!t) { rejected.push(`${c.key} : titre absent`); continue; }
    const max = Math.min(TITLE_MAX, c.titreMax ?? TITLE_MAX);
    if (t.length > max) { rejected.push(`${c.key} : titre trop long (${t.length} caractères pour ${max}) « ${t} »`); continue; }
    const n = badNumber(t);
    if (n) { rejected.push(`${c.key} : nombre absent des données (${n}) dans « ${t} »`); continue; }
    titles[c.key] = t;
  }
  let synthesis: string[] | null = null;
  if (f.synthesis) {
    const lines = Array.isArray(raw.synthese) ? (raw.synthese as unknown[]).filter((x): x is string => typeof x === 'string').map(clean).filter(Boolean) : [];
    const n = lines.map(badNumber).find(Boolean);
    if (!lines.length) rejected.push('synthèse absente');
    else if (lines.length > SYNTHESIS_MAX_SENTENCES || lines.some((l) => l.length > SENTENCE_MAX)) rejected.push('synthèse trop longue');
    else if (n) rejected.push(`synthèse : nombre absent des données (${n}) dans « ${lines.find((l) => badNumber(l)) ?? ''} »`);
    else synthesis = lines;
  }
  return { titles, synthesis, rejected };
}
