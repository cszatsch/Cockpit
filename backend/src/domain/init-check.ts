/**
 * Contrôle de conformité de l'Excel d'initialisation rempli (voie Excel de l'écran « Initialisation d'un projet »,
 * maquette v3 du 07/10/2026) : les anomalies du contrôle du serveur (`checkWorkbook`, qui fait foi) réparties par
 * onglet, chacune avec son champ, la valeur lue, sa gravité et sa cellule exacte (« C14 »). Règles pures, testées.
 *
 * Seules les anomalies bloquantes empêchent la prévisualisation ; les avertissements (dont la colonne CONTRÔLE du
 * fichier, décision Q4) sont affichés sans bloquer.
 */
import type { CellValue, ParsedWorkbook } from '../import/excel-reader';
import type { ImportIssue } from '../import/referential-import';

export type Gravity = 'bloquant' | 'avertissement';
export type CheckStatus = 'conforme' | 'avertissements' | 'anomalies';

export interface InitAnomaly {
  ongletIndex: number;
  onglet: string;
  champ: string;
  valeur: string;
  motif: string;
  gravite: Gravity;
  /** Cellule exacte (« C14 ») ; « — » pour une anomalie de structure (onglet absent, nombre de lignes). */
  cellule: string;
}

export interface CheckTabOutcome {
  ongletIndex: number;
  attendus: number;
  trouves: number;
  aVerifier: number;
  anomaliesBloquantes: number;
  avertissements: number;
  statut: CheckStatus;
  anomalies: InitAnomaly[];
}

/** Champ d'une anomalie sans colonne (onglet absent, ancien modèle, nombre de lignes d'une rubrique). */
export const WHOLE_TAB = 'Onglet entier';
/** Code projet déjà pris (bibliothèque des projets) : anomalie bloquante de l'onglet 05 Projet. */
export const DUPLICATE_CODE_MOTIF = 'Code déjà utilisé dans la bibliothèque des projets.';

const LETTER = /^[A-Z]{1,3}$/;
const p2 = (n: number) => String(n).padStart(2, '0');

/** Valeur lue, telle qu'affichée : date au format JJ/MM/AAAA, nombre sans décimale inutile, vide → « ». */
export function shownValue(v: CellValue | undefined): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return `${p2(v.getUTCDate())}/${p2(v.getUTCMonth() + 1)}/${v.getUTCFullYear()}`;
  return String(v);
}

/** Motif en phrase : majuscule initiale, point final (comme les motifs de la maquette). */
export function sentence(m: string): string {
  const s = m.trim();
  const t = s.charAt(0).toUpperCase() + s.slice(1);
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}

/**
 * Anomalie du contrôle → ligne « À corriger » : colonne (lettre, ou en-tête quand le contrôle le donne) → lettre,
 * en-tête et valeur lue de la ligne ; « 05 Projet » est un formulaire (libellé de la ligne, valeur en D).
 */
export function toAnomaly(issue: ImportIssue, wb: ParsedWorkbook, sheets: readonly string[]): InitAnomaly | null {
  const ongletIndex = sheets.indexOf(issue.sheet);
  if (ongletIndex < 0) return null;
  const gravite: Gravity = issue.level === 'ERROR' ? 'bloquant' : 'avertissement';
  const base = { ongletIndex, onglet: issue.sheet, motif: sentence(issue.message), gravite };
  if (issue.sheet === '05 Projet') {
    const f = issue.row != null ? wb.projectForm.find((x) => x.row === issue.row) : undefined;
    return { ...base, champ: f?.label ?? WHOLE_TAB, valeur: shownValue(f?.value), cellule: issue.row != null ? `${issue.column && LETTER.test(issue.column) ? issue.column : 'D'}${issue.row}` : '—' };
  }
  const sh = wb.sheets[issue.sheet];
  const col = issue.source === 'FILE' && !issue.column
    ? sh?.columns.find((c) => c.type === 'CONTROL')
    : sh?.columns.find((c) => (issue.column && LETTER.test(issue.column) ? c.letter === issue.column : c.header === issue.column));
  const row = issue.row != null ? sh?.rows.find((r) => r.row === issue.row) : undefined;
  const valeur = col && row ? (col.type === 'CONTROL' ? row.control ?? '' : shownValue(row.values[col.header])) : '';
  const letter = col?.letter ?? (issue.column && LETTER.test(issue.column) ? issue.column : null);
  return { ...base, champ: col ? (col.type === 'CONTROL' ? 'Contrôle' : col.header) : WHOLE_TAB, valeur, cellule: letter && issue.row != null ? `${letter}${issue.row}` : '—' };
}

/**
 * Décompte par onglet (l'ordre des 14 onglets) : anomalies bloquantes, avertissements, statut ; champs attendus du
 * modèle (`fields`). Un code projet déjà pris s'ajoute en bloquant sur « 05 Projet » (cellule du code).
 */
export function checkTabs(issues: ImportIssue[], wb: ParsedWorkbook, sheets: readonly string[], fields: number[], duplicateCode: string | null): CheckTabOutcome[] {
  const list = issues.map((i) => toAnomaly(i, wb, sheets)).filter((a): a is InitAnomaly => !!a);
  if (duplicateCode && !list.some((a) => a.ongletIndex === sheets.indexOf('05 Projet') && /existe déjà/.test(a.motif))) {
    const f = wb.projectForm.find((x) => x.label === 'Code projet');
    list.push({ ongletIndex: sheets.indexOf('05 Projet'), onglet: '05 Projet', champ: 'Code projet', valeur: duplicateCode, motif: DUPLICATE_CODE_MOTIF, gravite: 'bloquant', cellule: f ? `D${f.row}` : '—' });
  }
  return sheets.map((_, i) => {
    const anomalies = list.filter((a) => a.ongletIndex === i).sort((a, b) => Number(a.gravite === 'avertissement') - Number(b.gravite === 'avertissement'));
    const b = anomalies.filter((a) => a.gravite === 'bloquant').length, w = anomalies.length - b;
    return { ongletIndex: i, attendus: fields[i] ?? 0, trouves: fields[i] ?? 0, aVerifier: 0, anomaliesBloquantes: b, avertissements: w, statut: b ? 'anomalies' : w ? 'avertissements' : 'conforme', anomalies };
  });
}

/** Issue du contrôle : seules les anomalies bloquantes rendent le fichier non conforme. */
export const checkResult = (tabs: Array<{ anomaliesBloquantes: number }>): 'conforme' | 'anomalies' => (tabs.some((t) => t.anomaliesBloquantes > 0) ? 'anomalies' : 'conforme');
