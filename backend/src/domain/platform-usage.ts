// Consommation et coûts · Console › Accès (brief du 08/10/2026, maquette « 1a Miroir ») : règles pures.
// Usage de la plateforme (temps actif, temps connecté) et dépenses d'IA, du global à l'utilisateur.

/** Fonctionnalités suivies (ordre d'affichage). */
export const USAGE_FEATURES = [
  { id: 'projets', name: 'Projets et saisie' },
  { id: 'jev', name: 'Jev · assistant' },
  { id: 'rapports', name: 'Rapports' },
  { id: 'documents', name: 'Documents' },
  { id: 'insights', name: 'Baromètre et insights' },
  { id: 'console', name: 'Console' },
] as const;
export type UsageFeature = (typeof USAGE_FEATURES)[number]['id'];
export const FEATURE_IDS = USAGE_FEATURES.map((f) => f.id) as string[];
export const featureName = (id: string) => USAGE_FEATURES.find((f) => f.id === id)?.name ?? id;

/**
 * Fonctionnalité d'une requête de l'API (appel d'IA fait pendant une requête : la fonctionnalité de l'écran qui l'a
 * demandé). Jev (Cockpit et Console) avant tout le reste, puis Console, Rapports, Documents, Baromètre et insights.
 */
export function featureOfPath(path: string): UsageFeature {
  const p = path.split('?')[0];
  if (/\/assistant\/|\/jev\//.test(p)) return 'jev';
  if (p.startsWith('/api/admin/') || p.startsWith('/api/ai/')) return 'console';
  if (/\/report-|\/reports?(\/|$)|\/committees?|\/sessions(\/|$)/.test(p)) return 'rapports';
  if (/\/documents(\/|$)|\/kb(\/|$)/.test(p)) return 'documents';
  if (/\/barometer|\/today|\/insights/.test(p)) return 'insights';
  return 'projets';
}

/** Fonctionnalité d'un appel d'IA fait hors requête (tâche de fond) : d'après la fonction d'IA. */
export const FEATURE_OF_FUNCTION: Record<string, UsageFeature> = {
  insights: 'insights',
  crud: 'jev',
  guidage: 'jev',
  rapports: 'rapports',
  init_projet: 'console',
  doc_vec: 'documents',
  doc_rrk: 'documents',
  doc_syn: 'documents',
};
export const featureOfFunction = (fn: string): UsageFeature => FEATURE_OF_FUNCTION[fn] ?? 'projets';

// ───────────── Réglages (constantes par défaut, modifiables par `PUT /api/admin/consumption/settings`) ─────────────

/** Une session sans événement depuis plus de ce délai cesse de compter dans le temps actif. */
export const IDLE_MINUTES_DEFAULT = 5;
/** Hausse inhabituelle (graphique) : valeur d'un point > facteur × moyenne des jours ouvrés de la période. */
export const UNUSUAL_FACTOR_DEFAULT = 1.6;
/** Tableau : pastille rouge quand l'évolution du coût atteint ou dépasse ce pourcentage. */
export const COST_ALERT_PCT_DEFAULT = 30;
/** Coût par heure active « en ambre » quand il dépasse la moyenne × ce facteur (vue en vis-à-vis). */
export const COST_PER_HOUR_AMBER = 1.15;
/** Événements d'usage envoyés par un écran : au plus un par fonctionnalité et par tranche de ce nombre de secondes. */
export const EVENT_THROTTLE_SECONDS = 20;
/** Événements plus anciens refusés à l'envoi (onglet resté hors ligne). */
export const EVENT_MAX_AGE_MINUTES = 90;
/** Conservation des événements bruts (les agrégats restent). */
export const USAGE_EVENTS_RETENTION_DAYS = 400;
/** Lignes par page du tableau détaillé. */
export const USERS_PAGE_SIZE = 20;
/** Barres de la vue en vis-à-vis : au plus ce nombre d'entités (les premières par temps actif). */
export const BREAKDOWN_MAX = 8;
/** Agrégats relus avant chaque réponse s'ils datent de plus de ce délai (la tâche de fond les tient à jour). */
export const AGGREGATE_FRESH_MS = 60_000;
/** Au-delà de ce retard (la tâche de fond passe toutes les 5 min), la lecture attend le recalcul. */
export const AGGREGATE_STALE_MS = 5 * 60_000;
/** Recalcul incrémental : les heures depuis le dernier passage moins cette marge (événements envoyés en retard). */
export const AGGREGATE_LOOKBACK_HOURS = 2;

/**
 * Temps actif d'une suite d'événements d'un même utilisateur (référence de la requête SQL d'agrégation) : chaque
 * événement compte jusqu'au suivant, au plus `idleMs` ; le dernier compte jusqu'à `endMs` (fin de session ou
 * maintenant), au plus `idleMs`. Deux onglets ouverts ne comptent pas deux fois (une seule suite par utilisateur).
 */
export function activeMs(times: number[], idleMs: number, endMs?: number): number {
  const t = [...times].sort((a, b) => a - b);
  let total = 0;
  for (let i = 0; i < t.length; i++) {
    const next = i + 1 < t.length ? t[i + 1] : endMs ?? t[i] + idleMs;
    total += Math.max(0, Math.min(idleMs, next - t[i]));
  }
  return total;
}

// ───────────── Périodes (fuseau Europe/Paris) ─────────────

export type Gran = 'jour' | 'semaine' | 'mois';
export const GRANS: Gran[] = ['jour', 'semaine', 'mois'];
const TZ = 'Europe/Paris';
const DAY = 86_400_000;
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const DOW = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const isoAdd = (iso: string, n: number) => new Date(Date.parse(iso + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
const dowOf = (iso: string) => new Date(iso + 'T00:00:00Z').getUTCDay();
/** Date civile de Paris d'un instant. */
export const parisDate = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
/** Heure de Paris (0–23) d'un instant. */
export const parisHour = (d: Date) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(d));
/** Instant UTC de minuit, heure de Paris, d'une date civile. */
export function parisMidnight(iso: string): Date {
  // Paris est à UTC+1 ou UTC+2 ; le jour d'un changement d'heure, minuit garde le décalage de la veille.
  for (const off of [2, 1]) {
    const t = new Date(Date.parse(iso + 'T00:00:00Z') - off * 3_600_000);
    if (parisDate(t) === iso && parisHour(t) === 0) return t;
  }
  return new Date(Date.parse(iso + 'T00:00:00Z') - 3_600_000);
}
/** Semaine ISO (numéro) d'une date. */
export function isoWeek(iso: string): number {
  const d = new Date(iso + 'T00:00:00Z');
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const first = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d.getTime() - first.getTime()) / DAY - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
}

export interface Bucket {
  /** Clé : date civile (AAAA-MM-JJ) pour Semaine et Mois ; instant UTC de début d'heure (ISO) pour Jour. */
  key: string;
  /** Libellé complet (info-bulle). */
  full: string;
  /** Jour ouvré (Semaine, Mois : lundi–vendredi ; Jour : 7 h – 19 h). */
  working: boolean;
}
export interface Period {
  gran: Gran;
  start: string;
  /** Bornes de la période : dates civiles [from, to] incluses. */
  from: string;
  to: string;
  buckets: Bucket[];
  label: string;
  /** Période précédente, même durée, immédiatement antérieure. */
  prevStart: string;
  vsLabel: string;
}

/** Début normalisé : 1er du mois, lundi de la semaine, ou le jour lui-même. */
export function normalizeStart(gran: Gran, start: string): string {
  if (gran === 'mois') return start.slice(0, 8) + '01';
  if (gran === 'semaine') return isoAdd(start, -((dowOf(start) + 6) % 7));
  return start;
}

export function periodOf(gran: Gran, start0: string): Period {
  const start = normalizeStart(gran, start0);
  const [y, m, d] = start.split('-').map(Number);
  if (gran === 'mois') {
    const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const buckets = Array.from({ length: n }, (_, i) => { const k = isoAdd(start, i), w = dowOf(k); return { key: k, full: cap(DOW[w].slice(0, 3)) + '. ' + (i + 1) + ' ' + MONTHS_SHORT[m - 1], working: w > 0 && w < 6 }; });
    const prevStart = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
    const [py, pm] = prevStart.split('-').map(Number);
    return { gran, start, from: start, to: isoAdd(start, n - 1), buckets, label: cap(MONTHS[m - 1]) + ' ' + y, prevStart, vsLabel: MONTHS[pm - 1] + ' ' + py };
  }
  if (gran === 'semaine') {
    const buckets = Array.from({ length: 7 }, (_, i) => { const k = isoAdd(start, i), w = dowOf(k), dd = Number(k.slice(8)); return { key: k, full: cap(DOW[w].slice(0, 3)) + '. ' + dd + ' ' + MONTHS_SHORT[Number(k.slice(5, 7)) - 1], working: w > 0 && w < 6 }; });
    const end = isoAdd(start, 6), wk = isoWeek(start);
    const sm = Number(start.slice(5, 7)), em = Number(end.slice(5, 7));
    const label = 'Semaine ' + wk + ' · ' + Number(start.slice(8)) + (sm !== em ? ' ' + MONTHS_SHORT[sm - 1] : '') + ' – ' + Number(end.slice(8)) + ' ' + MONTHS_SHORT[em - 1];
    return { gran, start, from: start, to: end, buckets, label, prevStart: isoAdd(start, -7), vsLabel: 'la semaine ' + isoWeek(isoAdd(start, -7)) };
  }
  // Jour : une case par heure de Paris (23 ou 25 lors d'un changement d'heure).
  const t0 = parisMidnight(start).getTime(), t1 = parisMidnight(isoAdd(start, 1)).getTime();
  const buckets: Bucket[] = [];
  for (let t = t0; t < t1; t += 3_600_000) { const h = parisHour(new Date(t)); buckets.push({ key: new Date(t).toISOString(), full: h + ' h – ' + (h + 1) + ' h', working: h >= 7 && h <= 19 }); }
  const prev = isoAdd(start, -1);
  return { gran, start, from: start, to: start, buckets, label: cap(DOW[dowOf(start)]) + ' ' + d + ' ' + MONTHS[m - 1] + ' ' + y, prevStart: prev, vsLabel: DOW[dowOf(prev)] + ' ' + Number(prev.slice(8)) };
}

/**
 * Hausses inhabituelles : un point est signalé si sa valeur dépasse `factor` × la moyenne des points ouvrés de la
 * période (jours ouvrés ; heures 7 h – 19 h en vue Jour). Sans point ouvré non nul, rien n'est signalé.
 */
export function unusualFlags(values: number[], working: boolean[], factor: number): boolean[] {
  const w = values.filter((_, i) => working[i]);
  const mean = w.length ? w.reduce((s, x) => s + x, 0) / w.length : 0;
  return values.map((v) => mean > 0 && v > factor * mean);
}

/** Nom pseudonymisé d'un utilisateur (droit « Voir les données individuelles » absent) : rang stable du compte. */
export const pseudonym = (rank: number) => 'Utilisateur ' + String(rank + 1).padStart(2, '0');

/** Montant en euros arrondi à deux décimales. */
export const eur = (x: number) => Math.round(x * 100) / 100;
/** Heures arrondies à 0,01. */
export const hours = (sec: number) => Math.round((sec / 3600) * 100) / 100;

/** Évolution relative (null sans base). */
export const evolution = (cur: number, prev: number) => (prev > 0 ? (cur - prev) / prev : null);

/** Cellule CSV (« ; », guillemets si nécessaire, virgule décimale). */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
  return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export const csvOf = (rows: unknown[][]) => '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
