/**
 * Préremplissage du fichier d'initialisation depuis la proposition commerciale (07/10/2026, maquette « Initialisation
 * projet v2 ») : règles pures, sans base ni fichier. Les champs de chaque onglet (en-têtes, obligatoires, listes,
 * références) sont lus dans le modèle Excel par le service ; ces règles normalisent ce que le modèle d'IA extrait,
 * classent chaque valeur (trouvée, incertaine, manquante), comptent les champs et bâtissent la liste « À vérifier ».
 * Testées dans `test/unit/prefill.spec.ts`.
 */
import { normKey } from './labels';

/** Seuil « incertain » : une valeur extraite avec une confiance inférieure (en %) est à vérifier. */
export const PREFILL_UNCERTAIN_BELOW = 70;
/** Taille maximale de chaque fichier déposé. */
export const PREFILL_MAX_BYTES = 25 * 1024 * 1024;
/** Fichiers déposés ensemble au plus (proposition et annexes, analysés comme un seul document). */
export const PREFILL_MAX_FILES = 10;

/** Fichier d'un dépôt (métadonnées seulement) : pages numérotées à la suite, d'un fichier à l'autre. */
export interface PrefillFile { nom: string; taille: number; pages: number; format: string; cle?: string | null }

/** Fichier et page dans ce fichier d'une page du dépôt (numérotation continue), ou null hors du dépôt. */
export function pageSource(files: PrefillFile[], page: number | null): { fichier: string; page: number } | null {
  if (!page || page < 1) return null;
  let first = 1;
  for (const f of files) {
    if (page < first + f.pages) return { fichier: f.nom, page: page - first + 1 };
    first += f.pages;
  }
  return null;
}
/** Source lisible d'une valeur : « page 9 » (un seul fichier) ou « Annexe.pdf, page 2 » (dépôt de plusieurs fichiers). */
export function sourceLabel(files: PrefillFile[], page: number | null): string {
  if (!page) return 'non indiquée';
  const s = files.length > 1 ? pageSource(files, page) : null;
  return s ? `${s.fichier}, page ${s.page}` : `page ${page}`;
}
/** Extensions acceptées (le type réel est contrôlé par la signature du fichier). */
export const PREFILL_EXTENSIONS = ['pdf', 'docx', 'pptx'] as const;
/** Durée de conservation par défaut du document, de son texte et du résultat (variable `PREFILL_RETENTION_HOURS`). */
export const PREFILL_RETENTION_HOURS_DEFAULT = 24;
/** Confiance retenue quand le modèle n'en donne pas : la valeur est alors à vérifier. */
export const PREFILL_DEFAULT_CONFIDENCE = 50;
/** Texte du document envoyé au modèle, au plus (caractères) : au-delà, la fin est coupée et signalée. */
export const PREFILL_TEXT_MAX_CHARS = 400_000;
/** Page estimée d'un DOCX sans saut de page : nombre de caractères par page. */
export const PREFILL_DOCX_PAGE_CHARS = 3_000;

export type PrefillCellKind = 'text' | 'date' | 'number' | 'list' | 'ref' | 'refs';
export type RefKind = 'teams' | 'roles' | 'persons' | 'lots' | 'phases' | 'subphases' | 'workstreams' | 'bodies';

export interface PrefillField {
  header: string;
  /** Colonne Excel (1 = A) ; pour « 05 Projet », la ligne du champ est `row`. */
  col: number;
  row?: number;
  required: boolean;
  kind: PrefillCellKind;
  /** Valeurs permises (liste du modèle). */
  list?: string[];
  /** Objet d'un onglet précédent visé (liste reliée), éventuellement à choix multiple « ; ». */
  ref?: RefKind;
  /** Valeur « Tous » acceptée (Dépendances des chantiers). */
  allowAll?: boolean;
}

export interface PrefillTabSpec {
  index: number;
  /** Numéro affiché (« 01 »…« 14 ») et libellé (« Équipes »…). */
  n: string;
  label: string;
  sheet: string;
  /** Formulaire (05 Projet : une seule « ligne ») ou tableau à partir de la ligne 9. */
  form: boolean;
  fields: PrefillField[];
  /** Lignes disponibles dans le modèle (tableaux). */
  capacity: number;
}

/** Une valeur extraite : texte ou nombre, confiance (%), page source, motif court si incertaine. */
export interface PrefillCell {
  v: string | number | null;
  c: number;
  p: number | null;
  m?: string | null;
}
export type PrefillRow = Record<string, PrefillCell>;

export type TabStatus = 'rempli' | 'a_verifier' | 'non_trouve';
export interface PrefillCheck {
  ongletIndex: number;
  onglet: string;
  champ: string;
  valeur: string | null;
  type: 'incertain' | 'manquant';
  confiance: number | null;
  motif: string;
  page: number | null;
  /** Position dans l'Excel (ligne de la feuille, colonne) ; onglet entier : première cellule obligatoire de la ligne 9. */
  cell: { row: number; col: number };
}
export interface TabOutcome {
  ongletIndex: number;
  attendus: number;
  trouves: number;
  aVerifier: number;
  statut: TabStatus;
  checks: PrefillCheck[];
}

/** Clés connues des onglets déjà traités, pour relier les onglets suivants (listes ▾ du modèle). */
export type KnownKeys = Record<RefKind, string[]>;
export const emptyKnown = (): KnownKeys => ({ teams: [], roles: [], persons: [], lots: [], phases: [], subphases: [], workstreams: [], bodies: [] });

/** Rubriques en paires (libellé obligatoire) de l'onglet « 06 Info projet » ; les autres sont des listes. */
export const INFO_PAIR_RUBRIQUES = ['Le client', 'Périmètre fonctionnel', 'Périmètre applicatif'];
/** Rubriques obligatoires de Info projet (décision D1 du 06/10/2026). */
export const INFO_REQUIRED_RUBRIQUES = ['Programme en une phrase', 'Enjeux stratégiques'];
/** Champs du modèle jamais extraits : sans objet dans une proposition commerciale (la permission est ignorée à l'import, Q4). */
export const PREFILL_SKIPPED_FIELDS: Record<string, string[]> = { '03 Personnes': ['Permission'] };

// ───────────── valeurs ─────────────

const isEmpty = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
const clampConf = (c: unknown) => {
  const n = typeof c === 'number' ? c : typeof c === 'string' ? Number(c.replace('%', '')) : NaN;
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n <= 1 && n > 0 ? n * 100 : n))) : PREFILL_DEFAULT_CONFIDENCE;
};
const pageOf = (p: unknown): number | null => {
  const n = typeof p === 'number' ? p : typeof p === 'string' ? parseInt(p.replace(/\D/g, ''), 10) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
};
const MONTHS: Record<string, number> = { janv: 1, janvier: 1, fevr: 2, fevrier: 2, mars: 3, avr: 4, avril: 4, mai: 5, juin: 6, juil: 7, juillet: 7, aout: 8, sept: 9, septembre: 9, oct: 10, octobre: 10, nov: 11, novembre: 11, dec: 12, decembre: 12 };
const p2 = (n: number) => String(n).padStart(2, '0');

/** Date d'une valeur extraite → « JJ/MM/AAAA » ; `partial` si le jour manque (premier du mois retenu, à vérifier). */
export function parsePrefillDate(raw: string): { date: string; partial: boolean } | null {
  const s = raw.trim();
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return valid(+m[1], +m[2], +m[3], false);
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return valid(+m[3], +m[2], +m[1], false);
  m = /^(\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return valid(1, +m[1], +m[2], true);
  m = /^(?:(\d{1,2})(?:er)?\s+)?([a-zéèûô.]+)\s+(\d{4})$/i.exec(s);
  if (m) {
    const mo = MONTHS[normKey(m[2]).replace(/\./g, '')];
    if (mo) return valid(m[1] ? +m[1] : 1, mo, +m[3], !m[1]);
  }
  return null;
  function valid(d: number, mo: number, y: number, partial: boolean) {
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return { date: `${p2(d)}/${p2(mo)}/${y}`, partial };
  }
}

/** Valeur canonique d'une liste (casse et accents ignorés), sinon null. */
export const matchList = (v: string, list: string[]) => list.find((x) => normKey(x) === normKey(v)) ?? null;

/** Référence vers un objet d'un onglet précédent : clé exacte, ou N° / nom pour les phases, lots et sous-phases. */
export function matchRef(v: string, ref: RefKind, known: KnownKeys): string | null {
  const keys = known[ref];
  const k = normKey(v);
  const exact = keys.find((x) => normKey(x) === k);
  if (exact) return exact;
  if (ref === 'lots') return keys.find((x) => normKey(x) === normKey(`Lot ${v.replace(/^lot\s*/i, '')}`)) ?? null;
  if (ref === 'phases' || ref === 'subphases') {
    // « 3 », « Realize » ou « 3 · Realize » ; sous-phase : « 3.1 » ou « 3.1 · Nom ».
    const code = v.split('·')[0].trim();
    return keys.find((x) => normKey(x.split('·')[0]) === normKey(code)) ?? keys.find((x) => normKey(x.split('·').slice(1).join('·')) === k) ?? null;
  }
  return null;
}

/** Valeurs d'une cellule à choix multiple (« ; »), vides et doublons retirés. */
const splitMulti = (v: string) => [...new Set(v.split(';').map((x) => x.trim()).filter(Boolean))];

/**
 * Normalise une valeur extraite selon son champ : date au format du modèle, liste canonique, référence reliée ;
 * une valeur hors liste ou une référence inconnue reste proposée mais devient incertaine, avec son motif.
 */
export function normalizeCell(field: PrefillField, raw: unknown, known: KnownKeys): PrefillCell | null {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : { v: raw };
  const val = o.v ?? o.valeur ?? o.value;
  if (isEmpty(val)) return null;
  let c = clampConf(o.c ?? o.confiance ?? o.confidence);
  const p = pageOf(o.p ?? o.page);
  let m = typeof (o.m ?? o.motif) === 'string' ? String(o.m ?? o.motif).trim().slice(0, 140) || null : null;
  let v: string | number = typeof val === 'number' ? val : String(val).trim().replace(/\s+/g, ' ');
  const doubt = (motif: string) => { c = Math.min(c, PREFILL_UNCERTAIN_BELOW - 1); m = m ?? motif; };
  switch (field.kind) {
    case 'date': {
      const d = parsePrefillDate(String(v));
      if (!d) doubt('Date à préciser.');
      else { v = d.date; if (d.partial) doubt('Mois connu, jour absent.'); }
      break;
    }
    case 'number': {
      const n = Number(String(v).replace(',', '.'));
      if (Number.isFinite(n)) v = n; else doubt('Nombre attendu.');
      break;
    }
    case 'list': {
      const x = matchList(String(v), field.list ?? []);
      if (x) v = x; else doubt('Valeur hors de la liste du modèle.');
      break;
    }
    case 'ref': {
      const x = matchRef(String(v), field.ref!, known);
      if (x) v = x; else doubt('Absent des onglets précédents.');
      break;
    }
    case 'refs': {
      const parts = splitMulti(String(v));
      if (field.allowAll && parts.some((x) => normKey(x) === 'tous')) { v = 'Tous'; break; }
      const out = parts.map((x) => {
        const r = matchRef(x, field.ref!, known);
        // Phases : N° du modèle ; sous-phases : N° (« 3.1 ») ; chantiers : nom.
        return r ? (field.ref === 'phases' || field.ref === 'subphases' ? r.split('·')[0].trim() : r) : null;
      });
      if (out.some((x) => !x)) doubt('Une valeur est absente des onglets précédents.');
      v = out.map((x, i) => x ?? parts[i]).join(' ; ');
      break;
    }
    default:
      // Texte : un numéro rendu en nombre (« 1.1 ») reste un texte, comme dans le modèle.
      v = String(v);
      if (v.length > 2000) v = v.slice(0, 2000);
  }
  if (c < PREFILL_UNCERTAIN_BELOW && !m) m = 'Confiance faible.';
  return { v, c, p, m: c < PREFILL_UNCERTAIN_BELOW ? m : null };
}

/**
 * Lignes extraites (réponse du modèle) → lignes normalisées, vides retirées, dans la limite du modèle. Deux passes :
 * un onglet peut viser ses propres lignes (Dépendances entre chantiers).
 */
export function normalizeRows(spec: PrefillTabSpec, raw: unknown, known: KnownKeys): PrefillRow[] {
  const first = normalizeOnce(spec, raw, known);
  return spec.fields.some((f) => f.kind === 'refs' && f.allowAll) ? normalizeOnce(spec, raw, knownAfter(spec, first, known)) : first;
}
/**
 * Confiance d'une valeur sûre du format compact (non déclarée dans « doutes ») : au-dessus du seuil, sous la confiance
 * maximale (la valeur reste extraite par un modèle).
 */
export const PREFILL_SURE_CONFIDENCE = 90;

/**
 * Ligne du format compact (`{ p, v: [...], doutes: { colonne: [confiance, motif, page?] } }`, colonnes données une fois)
 * → cellules `{ v, c, p, m }` par colonne ; une ligne déjà au format par cellule est rendue telle quelle.
 */
export function expandCompactRow(row: unknown, columns: string[]): Record<string, unknown> | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (!Array.isArray(r.v)) return r;
  const doubts = new Map(Object.entries((r.doutes && typeof r.doutes === 'object' ? r.doutes : {}) as Record<string, unknown>).map(([k, x]) => [normKey(k), x]));
  const out: Record<string, unknown> = {};
  columns.forEach((col, i) => {
    const v = (r.v as unknown[])[i];
    if (v === null || v === undefined || v === '') return;
    const d = doubts.get(normKey(col));
    const [c, m, p] = Array.isArray(d) ? d : d && typeof d === 'object' ? [(d as any).c ?? (d as any).confiance, (d as any).m ?? (d as any).motif, (d as any).p ?? (d as any).page] : [];
    out[col] = { v, c: d ? c ?? PREFILL_DEFAULT_CONFIDENCE : PREFILL_SURE_CONFIDENCE, p: p ?? r.p ?? null, m: m ?? null };
  });
  return out;
}

function normalizeOnce(spec: PrefillTabSpec, raw: unknown, known: KnownKeys): PrefillRow[] {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? ((raw as any).lignes ?? (raw as any).rows ?? [raw]) : [];
  const columns = raw && typeof raw === 'object' && Array.isArray((raw as any).colonnes) ? ((raw as any).colonnes as unknown[]).map(String) : spec.fields.map((f) => f.header);
  const rows: PrefillRow[] = [];
  for (const r0 of Array.isArray(list) ? list : []) {
    const r = expandCompactRow(r0, columns);
    if (!r) continue;
    const src = r;
    const byKey = new Map(Object.entries(src).map(([k, x]) => [normKey(k), x]));
    const row: PrefillRow = {};
    for (const f of spec.fields) {
      const cell = normalizeCell(f, byKey.get(normKey(f.header)), known);
      if (cell) row[f.header] = cell;
    }
    if (Object.keys(row).length) rows.push(row);
    if (rows.length >= (spec.form ? 1 : spec.capacity)) break;
  }
  return rows;
}

/** Clés des objets d'un onglet traité (format des listes ▾ du modèle), ajoutées aux clés connues. */
export function knownAfter(spec: PrefillTabSpec, rows: PrefillRow[], known: KnownKeys): KnownKeys {
  const out = { ...known };
  const val = (r: PrefillRow, h: string) => (r[h] && r[h].v !== null ? String(r[h].v) : '');
  const add = (k: RefKind, xs: string[]) => { out[k] = [...new Set([...known[k], ...xs.filter(Boolean)])]; };
  switch (spec.sheet) {
    case '01 Équipes': add('teams', rows.map((r) => val(r, 'Nom'))); break;
    case '02 Rôles': add('roles', rows.map((r) => val(r, 'Libellé'))); break;
    case '03 Personnes': add('persons', rows.map((r) => val(r, 'Nom complet'))); break;
    case '07 Lots': add('lots', rows.map((r) => (val(r, 'N°') ? `Lot ${val(r, 'N°')}` : ''))); break;
    case '08 Phases': add('phases', rows.map((r) => (val(r, 'N°') && val(r, 'Nom') ? `${val(r, 'N°')} · ${val(r, 'Nom')}` : ''))); break;
    case '09 Sous-phases': add('subphases', rows.map((r) => (val(r, 'N°') && val(r, 'Nom') ? `${val(r, 'N°')} · ${val(r, 'Nom')}` : ''))); break;
    case '10 Chantiers': add('workstreams', rows.map((r) => val(r, 'Nom'))); break;
    case '11 Instances': add('bodies', rows.map((r) => val(r, 'Nom'))); break;
  }
  return out;
}

// ───────────── classement et décompte ─────────────

/** Champ obligatoire pour cette ligne (Libellé de Info projet : seulement pour les rubriques en paires). */
const requiredFor = (spec: PrefillTabSpec, f: PrefillField, row: PrefillRow) =>
  spec.sheet === '06 Info projet' && f.header === 'Libellé' ? INFO_PAIR_RUBRIQUES.some((x) => normKey(x) === normKey(String(row['Rubrique']?.v ?? ''))) : f.required;

/** Nom court d'une ligne pour la liste « À vérifier » (« Email · C. Martin ») : première valeur obligatoire texte. */
function rowName(spec: PrefillTabSpec, row: PrefillRow): string {
  if (spec.form) return '';
  if (spec.sheet === '06 Info projet') return String(row['Libellé']?.v ?? row['Rubrique']?.v ?? '');
  const f = spec.fields.find((x) => x.required && row[x.header] && (x.kind === 'text' || x.kind === 'ref' || x.kind === 'number'));
  if (!f) return '';
  const v = String(row[f.header].v);
  return f.header === 'N°' ? `${f.header} ${v}` : v;
}

/**
 * Décompte d'un onglet (identique dans l'interface et dans l'Excel) :
 * - attendus = champs obligatoires de chaque ligne + champs facultatifs trouvés ; trouvés = cellules remplies ;
 * - à vérifier = valeurs incertaines (confiance < 70 %) + champs obligatoires manquants ;
 * - onglet sans ligne : « non trouvé », une seule ligne à vérifier (« Onglet entier »).
 */
export function assessTab(spec: PrefillTabSpec, rows: PrefillRow[]): TabOutcome {
  const onglet = `${spec.n} ${spec.label}`;
  const checks: PrefillCheck[] = [];
  const firstReq = spec.fields.find((f) => f.required) ?? spec.fields[0];
  const cellOf = (f: PrefillField, i: number) => ({ row: spec.form ? f.row! : 9 + i, col: spec.form ? 4 : f.col });
  if (!rows.length) {
    return {
      ongletIndex: spec.index, attendus: spec.fields.filter((f) => f.required).length, trouves: 0, aVerifier: 1, statut: 'non_trouve',
      checks: [{ ongletIndex: spec.index, onglet, champ: 'Onglet entier', valeur: null, type: 'manquant', confiance: null, motif: 'Aucune donnée exploitable dans la proposition.', page: null, cell: cellOf(firstReq, 0) }],
    };
  }
  let attendus = 0, trouves = 0;
  rows.forEach((row, i) => {
    const who = rowName(spec, row);
    for (const f of spec.fields) {
      const cell = row[f.header], champ = who ? `${f.header} · ${who}` : f.header;
      if (cell) {
        attendus++; trouves++;
        if (cell.c < PREFILL_UNCERTAIN_BELOW) checks.push({ ongletIndex: spec.index, onglet, champ, valeur: String(cell.v), type: 'incertain', confiance: cell.c, motif: cell.m || 'Confiance faible.', page: cell.p, cell: cellOf(f, i) });
      } else if (requiredFor(spec, f, row)) {
        attendus++;
        checks.push({ ongletIndex: spec.index, onglet, champ, valeur: null, type: 'manquant', confiance: null, motif: 'Absent de la proposition.', page: null, cell: cellOf(f, i) });
      }
    }
  });
  // Info projet : « Programme en une phrase » et au moins un « Enjeu stratégique » (D1) ; ligne ajoutée à la suite.
  if (spec.sheet === '06 Info projet') {
    let next = rows.length;
    for (const rub of INFO_REQUIRED_RUBRIQUES) {
      if (rows.some((r) => normKey(String(r['Rubrique']?.v ?? '')) === normKey(rub))) continue;
      attendus++;
      const valCol = spec.fields.find((f) => f.header === 'Valeur') ?? firstReq;
      checks.push({ ongletIndex: spec.index, onglet, champ: rub, valeur: null, type: 'manquant', confiance: null, motif: 'Rubrique obligatoire absente de la proposition.', page: null, cell: { row: 9 + next++, col: valCol.col } });
    }
  }
  return { ongletIndex: spec.index, attendus, trouves, aVerifier: checks.length, statut: checks.length ? 'a_verifier' : 'rempli', checks };
}

/** Résultat global : complet si aucun onglet n'a de valeur à vérifier, sinon partiel. */
export const prefillResult = (outcomes: TabOutcome[]): 'complet' | 'partiel' => (outcomes.every((o) => o.statut === 'rempli') ? 'complet' : 'partiel');

// ───────────── progression ─────────────

/**
 * Temps restant lissé (s) : moyenne mobile entre l'estimation courante et la nouvelle mesure, puis bornée pour ne
 * jamais remonter ni chuter de plus de 30 % d'un coup (pas de saut brutal). `prev` null : première estimation.
 */
export function smoothEta(prev: number | null, raw: number, dtSec: number): number {
  const r = Math.max(0, raw);
  if (prev === null) return Math.round(r);
  const decayed = Math.max(0, prev - dtSec);
  const blended = 0.7 * decayed + 0.3 * r;
  const floor = decayed * 0.7;
  return Math.round(Math.min(prev, Math.max(floor, blended)));
}

/**
 * Estimation brute (analyse en parallèle) : temps écoulé par onglet terminé dans cette analyse × onglets restants ;
 * avant le premier onglet, une durée par défaut par onglet, moins le temps déjà écoulé.
 */
export function rawEta(tabsDone: number, elapsedSec: number, remaining: number, defaultPerTab = 6): number {
  return Math.max(0, tabsDone ? (elapsedSec / tabsDone) * remaining : defaultPerTab * remaining - elapsedSec);
}

/**
 * Vagues d'analyse (07/10/2026) : les onglets d'une vague partent ensemble, chacun ne visant que des onglets des vagues
 * précédentes (ou lui-même : dépendances entre chantiers). Index des onglets (0 = 01 Équipes). Vagues dans l'ordre des
 * onglets : une interruption ne laisse terminés que des onglets qui la précèdent, sauf ceux de sa propre vague.
 *   1 : 01 Équipes, 02 Rôles, 06 Info projet   (le premier appel part seul : il remplit le cache du document)
 *   2 : 03 Personnes   3 : 04 Affectations, 05 Projet, 07 Lots   4 : 08 Phases, 11 Instances
 *   5 : 09 Sous-phases, 12 Membres   6 : 10 Chantiers   7 : 13 Jalons, 14 Livrables
 */
export const PREFILL_WAVES: number[][] = [[0, 1, 5], [2], [3, 4, 6], [7, 10], [8, 11], [9], [12, 13]];
/** Onglet qui produit les clés de chaque liste reliée. */
export const REF_SOURCE: Record<RefKind, number> = { teams: 0, roles: 1, persons: 2, lots: 6, phases: 7, subphases: 8, workstreams: 9, bodies: 10 };

/** Page lue affichée : position de lecture estimée (onglet en cours et part écoulée de son analyse) sur le document. */
export function readingPage(tabIndex: number, fraction: number, pages: number, total = 14): number {
  const pos = (tabIndex + Math.max(0, Math.min(1, fraction))) / total;
  return Math.max(1, Math.min(pages, Math.ceil(pos * pages) || 1));
}

// ───────────── échanges avec le modèle d'IA ─────────────

/**
 * Texte du dépôt avec ses repères de page, envoyé une fois (partie mise en cache) pour les 14 onglets. Plusieurs
 * fichiers : pages numérotées à la suite, chaque repère rappelle le fichier et sa page.
 */
export function documentContext(pages: string[], name: string, files: PrefillFile[] = []): string {
  const multi = files.length > 1;
  let out = multi
    ? `DOCUMENTS : ${files.length} fichiers lus comme un seul document (${files.map((f) => f.nom).join(' ; ')}), ${pages.length} pages numérotées à la suite\n`
    : `DOCUMENT : ${name} (${pages.length} page${pages.length > 1 ? 's' : ''})\n`;
  for (let i = 0; i < pages.length; i++) {
    const src = multi ? pageSource(files, i + 1) : null;
    const block = `\n=== PAGE ${i + 1}${src ? ` (${src.fichier}, page ${src.page})` : ''} ===\n${pages[i].trim()}\n`;
    if (out.length + block.length > PREFILL_TEXT_MAX_CHARS) { out += `\n[… texte coupé après la page ${i}]\n`; break; }
    out += block;
  }
  return out;
}

export const PREFILL_SYSTEM = [
  'Tu prépares le fichier d’initialisation d’un projet de transformation à partir de la proposition commerciale jointe.',
  'Règles :',
  '- N’utilise que le document : n’invente aucune personne, date, adresse e-mail ni valeur. Une information absente est omise.',
  '- Pour chaque ligne, donne la page du document où elle figure (repères « === PAGE n === ») ; la page principale si ses valeurs sont sur plusieurs pages.',
  '- Une valeur écrite telle quelle dans le document est sûre : rien à ajouter. Une valeur déduite, convertie, ramenée à une moyenne ou choisie entre deux formulations est incertaine : déclare-la dans « doutes » avec sa confiance (0 à 69) et un motif court (moins de 12 mots), par exemple « Déduit d’un volume en jours. », « Deux intitulés différents dans le document. » ; ajoute sa page si elle diffère de celle de la ligne.',
  '- Format compact : les colonnes une seule fois, puis chaque ligne en liste de valeurs dans l’ordre des colonnes (null si absente).',
  '- Dates au format JJ/MM/AAAA ; si seul le mois est connu, écris MM/AAAA.',
  '- Réponds uniquement par un objet JSON, sans texte autour.',
].join('\n');

/**
 * Consignes du modèle (partie stable, mise en cache) : règles fixes du code, puis la skill « Préremplissage d’un projet »
 * (vocabulaire et attendus de chaque onglet, exemples RISE ; modifiable dans Console › Skills). Le format de réponse
 * et la liste des champs restent ceux du code : ils priment sur la skill.
 */
export function prefillSystem(skill: { n: string; t: string } | null): string {
  if (!skill || !skill.t.trim()) return PREFILL_SYSTEM;
  return `${PREFILL_SYSTEM}\n- En cas de contradiction, le format de réponse et la liste des champs de chaque onglet priment sur la skill ci-dessous.\n\n## Skill : ${skill.n}\n${skill.t.trim()}`;
}

/** Consigne d'un onglet : champs, obligatoires, listes permises et clés des onglets déjà remplis. */
export function tabPrompt(spec: PrefillTabSpec, known: KnownKeys): string {
  const refName: Record<RefKind, string> = { teams: 'équipes', roles: 'rôles', persons: 'personnes', lots: 'lots', phases: 'phases', subphases: 'sous-phases', workstreams: 'chantiers', bodies: 'instances' };
  const lines = spec.fields.map((f) => {
    let d = `- « ${f.header} »${f.required ? ' (obligatoire)' : ''}`;
    if (f.kind === 'date') d += ' : date JJ/MM/AAAA';
    if (f.kind === 'number') d += ' : nombre entier';
    if (f.kind === 'list') d += ` : une valeur parmi ${f.list!.map((x) => `« ${x} »`).join(', ')}`;
    if (f.kind === 'ref' || f.kind === 'refs') {
      const keys = known[f.ref!];
      d += f.kind === 'refs' ? ` : plusieurs ${refName[f.ref!]} séparées par « ; »${f.allowAll ? ', ou « Tous »' : ''}` : ` : une des ${refName[f.ref!]}`;
      d += keys.length ? ` parmi ${keys.slice(0, 200).map((x) => `« ${x} »`).join(', ')}` : ' (aucune connue : laisse vide)';
    }
    return d;
  });
  const cols = JSON.stringify(spec.fields.map((f) => f.header));
  const shape = `{"colonnes":${cols},"lignes":[{"p":3,"v":[…une valeur par colonne, null si absente…],"doutes":{"<colonne>":[58,"motif court",7]}}]}`
    + (spec.form ? ' — une seule ligne' : ` — une ligne par élément, au plus ${spec.capacity} ; « doutes » seulement pour les valeurs incertaines`);
  const extra: Record<string, string> = {
    '01 Équipes': 'Sociétés et entités impliquées (client, intégrateur, éditeur, cabinet…).',
    '02 Rôles': 'Rôles du projet (Directeur de programme, Chef de projet, Pilotes métiers…).',
    '03 Personnes': 'Personnes nommées dans le document ; « Email » seulement s’il est écrit.',
    '04 Affectations': 'Qui tient quel rôle, à partir de quand.',
    '05 Projet': 'Fiche du projet ; « Code projet » : court, en majuscules, sans espace (nom de code du projet s’il existe).',
    '06 Info projet': `Contexte : une ligne par élément. « Libellé » obligatoire pour ${INFO_PAIR_RUBRIQUES.map((x) => `« ${x} »`).join(', ')}, vide pour les autres rubriques ; une seule ligne « Programme en une phrase ».`,
    '07 Lots': 'Lots ou vagues de déploiement (N° 1, 2…).',
    '08 Phases': 'Grandes étapes de la méthode, numérotées 1, 2… ; « Lot » au format « Lot N ».',
    '09 Sous-phases': 'Découpage de chaque phase : N° unique, numérotation du projet (par défaut N° de la phase et rang : « 3.1 », « 3.2 »…).',
    '10 Chantiers': 'Domaines de travail transverses (Finance, Migration…).',
    '11 Instances': 'Comités de gouvernance (COPIL, comité de projet…).',
    '12 Membres': 'Composition des instances.',
    '13 Jalons': 'Dates clés du projet.',
    '14 Livrables': 'Productions attendues, rattachées à une sous-phase.',
  };
  return [`ONGLET ${spec.sheet} — ${extra[spec.sheet] ?? ''}`, 'Champs :', ...lines, `Format de réponse : ${shape}`].join('\n');
}

/** Objet JSON de la réponse du modèle (bloc de code ou texte autour tolérés), sinon null. */
export function parseModelJson(text: string): unknown {
  const s = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const i = s.indexOf('{'), j = s.lastIndexOf('}');
  if (i < 0 || j <= i) return null;
  try { return JSON.parse(s.slice(i, j + 1)); } catch { return null; }
}
