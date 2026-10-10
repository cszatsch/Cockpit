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
