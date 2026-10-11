/**
 * Fiche d'arbitrage. Depuis le 10/10/2026 (fiche « barème commun », maquette 11a), la fiche se saisit sur un barème commun :
 * critères et poids communs aux options A et B, notes et justifications propres à chacune (`criteria` : name, weightPct,
 * scoreA, commentA, scoreB, commentB) ; les options n'ont plus de critères propres. Les fiches saisies du 09 au 10/10/2026
 * portent des critères par option (`options[].criteria` : intitulé, poids, note, description) : leur barème commun est
 * déduit ici (`legacyCriteria`), à l'enregistrement, pour l'onglet Décisions et la fiche 11a.
 */
export interface OptionCriterion { name: string; weightPct: number; score: number; comment: string }
export interface ArbOption { code: string; label: string; body?: string; criteria?: OptionCriterion[] }
export interface LegacyCriterion { name: string; weightPct: number; scoreA: number; commentA: string; scoreB: number; commentB: string }

const key = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/**
 * Critères communs déduits des critères par option : réunis par intitulé (sans tenir compte de la casse ni des
 * accents), dans l'ordre de l'option A puis des critères propres à B ; poids de A, sinon de B ; note 0 si l'option
 * n'a pas ce critère. Les critères sans intitulé sont ignorés. `null` si aucune option ne porte de critères.
 */
export function legacyCriteria(options: ArbOption[]): LegacyCriterion[] | null {
  const A = options.find((o) => o.code === 'A'), B = options.find((o) => o.code === 'B');
  if (!A?.criteria && !B?.criteria) return null;
  const out: LegacyCriterion[] = [];
  const at = new Map<string, LegacyCriterion>();
  for (const [side, o] of [['A', A], ['B', B]] as const) {
    for (const c of o?.criteria ?? []) {
      const k = key(c.name);
      if (!k) continue;
      let row = at.get(k);
      if (!row) { row = { name: c.name.trim(), weightPct: c.weightPct, scoreA: 0, commentA: '', scoreB: 0, commentB: '' }; at.set(k, row); out.push(row); }
      if (side === 'A') { row.scoreA = c.score; row.commentA = c.comment; } else { row.scoreB = c.score; row.commentB = c.comment; }
    }
  }
  return out;
}

/** Écart en dessous duquel deux notes sont à égalité (même seuil que la fiche 11a, `saisie-calc.js` `TIE`). */
export const ARB_TIE = 0.005;
/** Fiche telle que stockée (`Decision.arbitration`). */
export interface ArbitrationSheet { question?: string | null; options?: ArbOption[]; criteria?: LegacyCriterion[]; recommendation?: string | null }
/** Note d'une option (0 à 4) = Σ(poids × note) / Σ(poids), sur les critères notés de poids > 0 ; null sans note. */
export function arbScore(criteria: LegacyCriterion[], side: 'A' | 'B'): number | null {
  let W = 0, S = 0;
  for (const c of criteria) { const n = side === 'A' ? c.scoreA : c.scoreB; if (n > 0 && c.weightPct > 0) { W += c.weightPct; S += c.weightPct * n; } }
  return W ? S / W : null;
}
/**
 * Résumé d'une fiche pour un rapport (11/10/2026) : question, options A et B notées sur le barème commun, option
 * recommandée (la mieux notée ; aucune à égalité), critères par poids décroissant. null si la fiche est vide.
 */
export function arbitrationSummary(a: ArbitrationSheet | null | undefined) {
  if (!a) return null;
  const options = (a.options ?? []).filter((o) => o.code === 'A' || o.code === 'B');
  const criteria = (a.criteria?.length ? a.criteria : legacyCriteria(a.options ?? [])) ?? [];
  const label = (k: 'A' | 'B') => options.find((o) => o.code === k)?.label?.trim() ?? '';
  if (!label('A') && !label('B') && !criteria.length && !a.question?.trim()) return null;
  const sA = arbScore(criteria, 'A'), sB = arbScore(criteria, 'B');
  const reco: 'A' | 'B' | null = sA === null && sB === null ? null : Math.abs((sA ?? 0) - (sB ?? 0)) < ARB_TIE ? null : (sA ?? 0) > (sB ?? 0) ? 'A' : 'B';
  return {
    question: a.question?.trim() || null,
    options: (['A', 'B'] as const).map((k) => ({ code: k, label: label(k) || `Option ${k}`, score: k === 'A' ? sA : sB })),
    reco, tie: sA !== null && sB !== null && Math.abs(sA - sB) < ARB_TIE,
    criteria: criteria.filter((c) => c.weightPct > 0).sort((x, y) => y.weightPct - x.weightPct).map((c) => ({ name: c.name, weight: c.weightPct, a: c.scoreA, b: c.scoreB })),
  };
}
