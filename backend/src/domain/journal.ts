/**
 * Journal des appels (spécification JOURNAL) : règles pures, testées dans test/unit.
 * Lignes budgétaires filtrables, partage du coût entre entrée et sortie, curseur de pagination, export CSV.
 */

/** Filtre « fonction » du journal : les lignes budgétaires (Documents = ses trois étapes). */
export const JOURNAL_FNS = ['insights', 'rapports', 'guidage', 'docs', 'crud', 'init_projet'] as const;
export type JournalFn = (typeof JOURNAL_FNS)[number];

/** Taille de page du journal (« Afficher 10 de plus ») ; 100 au plus par appel. */
export const JOURNAL_PAGE = 10;
export const JOURNAL_PAGE_MAX = 100;

/** Étapes (functionId de UsageRecord) d'une ligne budgétaire. */
export function stepsOf(fn: JournalFn): string[] {
  return fn === 'docs' ? ['doc_vec', 'doc_rrk', 'doc_syn'] : [fn];
}

export interface CostRow {
  tokensIn: number;
  tokensOut: number;
  requests: number;
  costEur: number;
  priceIn: number | null;
  priceOut: number | null;
  pricePer1k: number | null;
}

/**
 * Part entrée / sortie du coût enregistré. Leur somme égale toujours `costEur` (la dépense de « Consommation
 * et coûts »). Tarif figé connu : entrée = tokensIn × priceIn / 1e6, sortie = le reste. Facturation à la requête :
 * tout en entrée. Appel antérieur au journal (tarif non enregistré) : estimation au tarif actuel du catalogue
 * (`catalogIn`), bornée par le coût enregistré ; à défaut, au prorata des jetons.
 */
export function splitCost(r: CostRow, catalogIn?: number | null): { costIn: number; costOut: number } {
  if (r.pricePer1k != null || (r.requests > 0 && r.tokensOut === 0 && r.priceIn == null)) return { costIn: r.costEur, costOut: 0 };
  const pin = r.priceIn ?? catalogIn ?? null;
  let costIn: number;
  if (pin != null) costIn = Math.min(r.costEur, (r.tokensIn * pin) / 1e6);
  else costIn = r.tokensIn + r.tokensOut ? (r.costEur * r.tokensIn) / (r.tokensIn + r.tokensOut) : 0;
  return { costIn, costOut: r.costEur - costIn };
}

/** Curseur opaque : date (ISO) et identifiant du dernier appel lu (tri : date décroissante, puis identifiant). */
export function encodeCursor(at: Date, id: string): string {
  return Buffer.from(`${at.toISOString()}|${id}`, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): { at: Date; id: string } | null {
  try {
    const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    const at = new Date(iso);
    return id && !isNaN(at.getTime()) ? { at, id } : null;
  } catch {
    return null;
  }
}

/** Nombre au format français du CSV : virgule décimale, sans séparateur de milliers. */
export function csvNum(v: number | null | undefined, decimals?: number): string {
  if (v == null) return '';
  const s = decimals == null ? String(v) : v.toFixed(decimals);
  return s.replace('.', ',');
}

/** Cellule CSV (séparateur « ; ») : entre guillemets si elle contient ; " ou un saut de ligne. */
export function csvCell(v: string): string {
  return /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Fichier CSV : UTF-8 avec BOM (Excel), séparateur « ; », lignes séparées par CRLF. */
export function csvFile(header: string[], rows: string[][]): string {
  return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
}
