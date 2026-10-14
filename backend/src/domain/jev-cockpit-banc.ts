/**
 * Contrôles automatiques du banc des réponses du Jev du Cockpit (14/10/2026, `npm run jev:banc-cockpit`) : sans modèle,
 * à partir de la réponse, de ses sources et du référentiel du projet. Chaque motif rend la réponse non conforme ; la
 * justesse des chiffres et la qualité de la rédaction restent à relire dans l'Excel.
 */
export type BancAttendu = 'DONNEES' | 'SOURCE_DONNEES' | 'SOURCE_DOCS' | 'INEXISTANT' | 'DOCUMENTS' | 'MIXTE';

export interface BancRef {
  /** Chantiers du projet : code → nom. */
  chantiers: Map<string, string>;
  /** Codes des objets du projet (chantiers, risques, actions, jalons, décisions). */
  codes: Set<string>;
}

/** Longueur comparée pour un nom de chantier (le modèle abrège ou complète parfois la fin du nom). */
export const BANC_NAME_PREFIX = 14;
/** Début du complément comparé à la réponse des données (répétition). */
export const BANC_REPEAT_CHARS = 60;

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[*_`]/g, '').replace(/[’']/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

/** Réponse coupée en partie « données » et partie « D'après les documents » (vide s'il n'y en a pas). */
export function splitDocsPart(reply: string): { data: string; docs: string } {
  const i = reply.search(/^#{2,3}\s*D[’']apr[èe]s les documents/im);
  return i < 0 ? { data: reply, docs: '' } : { data: reply.slice(0, i), docs: reply.slice(i).replace(/^.*\n/, '') };
}

/**
 * Motifs de non-conformité d'une réponse (liste vide : conforme). `docOnly` : réponse tirée des seuls documents (cas 4a),
 * qui nomment les objets à leur façon (« C1 – Reporting » dans un livrable) : codes et noms ne sont pas comparés.
 */
export function bancChecks(attendu: BancAttendu, reply: string, sources: Array<{ entityType: string }>, ref: BancRef, opts: { docOnly?: boolean } = {}): string[] {
  const motifs: string[] = [];
  if (!reply.trim()) return ['réponse vide'];
  const { data, docs } = splitDocsPart(reply);
  const clean = opts.docOnly ? '' : data.replace(/\*\*/g, '');
  // Codes cités dans la partie « données » : ils doivent exister dans le projet (les documents ont leurs propres codes).
  for (const code of new Set(clean.match(/\b(?:R\d{2,}|A-\d{2,}|J\d{2,}|D-\d{3,}|C\d{1,2})\b/g) ?? [])) {
    if (!ref.codes.has(code)) motifs.push(`code inconnu du projet : ${code}`);
  }
  // Nom attribué à un code de chantier (« C1 — Datalake… »), sur la même ligne (« C2 » puis une puce « - Priorité » à
  // la ligne suivante n'est pas un nom) : il doit commencer comme le nom du référentiel.
  for (const m of clean.matchAll(/\b(C\d{1,2})[ \t]*[—–-][ \t]*([^\n|·,;:()]{4,90})/g)) {
    const want = ref.chantiers.get(m[1]);
    if (!want) continue;
    const a = norm(m[2]), b = norm(want), n = Math.min(BANC_NAME_PREFIX, a.length, b.length);
    if (a.slice(0, n) !== b.slice(0, n)) motifs.push(`nom de chantier inexact : ${m[1]} « ${m[2].trim()} » au lieu de « ${want} »`);
  }
  // Complément qui recopie la réponse des données.
  const head = norm(docs).slice(0, BANC_REPEAT_CHARS);
  if (head.length >= 30 && norm(data).includes(head)) motifs.push('complément qui répète la réponse des données');
  const hasDoc = sources.some((s) => s.entityType === 'DOCUMENT'), hasData = sources.some((s) => s.entityType === 'DATA');
  if (attendu === 'SOURCE_DONNEES' && (docs || hasDoc)) motifs.push('documents cités alors que les données seules étaient demandées');
  if (attendu === 'SOURCE_DOCS' && hasData) motifs.push('données consultées alors que les documents seuls étaient demandés');
  if ((attendu === 'SOURCE_DOCS' || attendu === 'DOCUMENTS') && !hasDoc) motifs.push('aucun document cité');
  if ((attendu === 'DONNEES' || attendu === 'SOURCE_DONNEES' || attendu === 'MIXTE') && !hasData) motifs.push('aucune donnée consultée');
  if (attendu === 'INEXISTANT' && !/\b(aucun|aucune|n[’' ]existe|introuvable|ne trouve|pas de (chantier|jalon|risque))/i.test(reply.slice(0, 400))) motifs.push('objet inexistant non signalé');
  return motifs;
}
