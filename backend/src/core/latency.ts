import { AsyncLocalStorage } from 'async_hooks';
import { randomBytes } from 'crypto';

/**
 * Mesure des temps de traitement de Jev (spécification TEMPS § 3, 01/10/2026) : une ligne par étape exécutée et une
 * ligne `e2e` par prompt, horodatées côté serveur. Le contexte est porté par le fil d'exécution (AsyncLocalStorage) :
 * les services mesurés (passerelle LLM, SQL, écriture) n'ont aucun paramètre à transmettre ; hors prompt mesuré, rien
 * n'est enregistré. Les lignes partent à l'écriture après la réponse (`setImmediate`), sans jamais la retarder.
 */

export const LATENCY_CATEGORIES = ['guide_cockpit', 'guide_console', 'data_cockpit', 'data_console', 'update_cockpit', 'kb_document'] as const;
export type LatencyCategory = (typeof LATENCY_CATEGORIES)[number];
export const LATENCY_STEPS = ['route', 'vec', 'rrk', 'qry', 'exe', 'gen'] as const;
export type LatencyStep = (typeof LATENCY_STEPS)[number];
export type LatencyRole = 'primary' | 'fallback';

/** Modèle d'une étape sans modèle d'IA (exécution SQL, écriture en base). */
export const LATENCY_SERVICE_MODEL = 'svc';
/** Aiguillage : API TypeSafe de la carte « JEV » du Registre, présentée comme un modèle (choix du 01/10/2026). */
export const LATENCY_ROUTER_MODEL = 'jev-typesafe';

export interface StepTimingRow {
  requestId: string;
  category: LatencyCategory;
  step: LatencyStep | 'e2e';
  model: string;
  role: LatencyRole;
  startedAt: Date;
  endedAt: Date;
  errorType: string | null;
  errorMessage: string | null;
}

type Pending = Omit<StepTimingRow, 'requestId' | 'category'>;
interface Ctx { requestId: string; category: LatencyCategory | null; start: Date; rows: Pending[]; unserved: { type: string; message: string } | null }

const store = new AsyncLocalStorage<Ctx>();
const kindStore = new AsyncLocalStorage<LatencyStep>();

/** Écritures branchées par `LatencyService` (table `step_timings`). */
export const latencySinks: Array<(rows: StepTimingRow[]) => Promise<unknown> | void> = [];
const inFlight = new Set<Promise<unknown>>();

/** Attente des écritures en cours (essais automatiques). */
export async function latencyIdle(): Promise<void> {
  while (inFlight.size) await Promise.all([...inFlight]);
}

/** Type d'erreur affiché dans l'infobulle de l'écran, d'après le message de l'appel en échec. */
export function latencyErrorType(e: unknown): string {
  const m = String((e as any)?.response?.message ?? (e as any)?.message ?? e ?? '');
  const t = m.match(/délai de (\d+(?:[.,]\d+)?) s dépassé/i);
  if (t) return `Délai dépassé (${t[1].replace('.', ',')} s)`;
  if (/délai dépassé|timeout/i.test(m)) return 'Délai dépassé';
  if (/réponse vide/i.test(m)) return 'Réponse vide';
  if (/illisible/i.test(m)) return 'Réponse illisible';
  if (/injoignable/i.test(m)) return 'Service injoignable';
  const h = m.match(/· (\d{3})\b/);
  if (h) return `Erreur HTTP ${h[1]}`;
  if (/requête|sql|syntax/i.test(m)) return 'Requête invalide';
  return 'Erreur';
}

/**
 * Prompt mesuré : ouvre le contexte, puis écrit la ligne `e2e` (de la réception à la réponse) et les étapes, si la
 * catégorie a été fixée à l'aiguillage. Exception ou réponse non servie : `e2e` en erreur (exclue du bout en bout).
 */
export async function measuredPrompt<T>(fn: () => Promise<T>): Promise<T> {
  const ctx: Ctx = { requestId: `req_${Date.now().toString(36)}${randomBytes(4).toString('hex')}`, category: null, start: new Date(), rows: [], unserved: null };
  try {
    const r = await store.run(ctx, fn);
    finish(ctx, null);
    return r;
  } catch (e) {
    finish(ctx, e);
    throw e;
  }
}

function finish(ctx: Ctx, e: unknown) {
  if (!ctx.category) return;
  const fail = e !== null ? { type: latencyErrorType(e), message: msgOf(e) } : ctx.unserved;
  const all: Pending[] = [...ctx.rows, { step: 'e2e', model: LATENCY_SERVICE_MODEL, role: 'primary', startedAt: ctx.start, endedAt: new Date(), errorType: fail?.type ?? null, errorMessage: fail?.message ?? null }];
  const rows = all.map((r) => ({ ...r, requestId: ctx.requestId, category: ctx.category! }));
  if (!latencySinks.length) return;
  const p: Promise<unknown> = new Promise<void>((res) => setImmediate(res))
    .then(() => Promise.all(latencySinks.map((s) => s(rows))))
    .catch((err) => console.warn('[latency] mesures non enregistrées :', err instanceof Error ? err.message : err))
    .finally(() => inFlight.delete(p));
  inFlight.add(p);
}

const msgOf = (e: unknown) => String((e as any)?.response?.message ?? (e as any)?.message ?? e ?? '').slice(0, 500);

/** Catégorie du prompt, fixée à l'aiguillage ; `null` : prompt non compté (clarification, hors sujet). */
export function latencyCategory(c: LatencyCategory | null) {
  const ctx = store.getStore();
  if (ctx) ctx.category = c;
}

/** Aucune réponse servie (modèle ou service indisponible) : le prompt est compté en erreur, hors bout en bout. */
export function latencyUnserved(e: unknown) {
  const ctx = store.getStore();
  if (ctx && !ctx.unserved) ctx.unserved = { type: latencyErrorType(e), message: msgOf(e) };
}

/** Étape des appels au modèle faits dans `fn` (par défaut : génération). */
export function latencyKind<T>(kind: LatencyStep, fn: () => Promise<T>): Promise<T> {
  return kindStore.run(kind, fn);
}
export const currentLatencyKind = (fallback: LatencyStep = 'gen'): LatencyStep => kindStore.getStore() ?? fallback;

/** Ligne d'étape enregistrée directement (aiguillage : réponse reçue mais en échec). */
export function recordStep(step: LatencyStep, model: string, role: LatencyRole, startedAt: Date, endedAt: Date, error?: { type: string; message?: string } | null) {
  store.getStore()?.rows.push({ step, model, role, startedAt, endedAt, errorType: error?.type ?? null, errorMessage: error?.message?.slice(0, 500) ?? null });
}

/** Aiguillage par l'API de la carte JEV : ligne « route », en erreur si la classification a échoué (repli). */
export function recordRoute(startedAt: Date, r: { status: string; error?: string | null }) {
  const type = r.status === 'OK' ? null : r.status === 'TIMEOUT' ? 'Délai dépassé' : r.status === 'NOT_CONFIGURED' ? 'Carte non configurée' : r.status === 'INVALID' ? 'Réponse illisible' : latencyErrorType(r.error ?? '');
  recordStep('route', LATENCY_ROUTER_MODEL, 'primary', startedAt, new Date(), type ? { type, message: r.error ?? undefined } : null);
}

/** Étape chronométrée : en erreur, elle garde sa durée jusqu'à l'échec, puis l'erreur repart à l'appelant. */
export async function timedStep<T>(step: LatencyStep, model: string, role: LatencyRole, fn: () => Promise<T>): Promise<T> {
  if (!store.getStore()) return fn();
  const t0 = new Date();
  try {
    const r = await fn();
    recordStep(step, model, role, t0, new Date());
    return r;
  } catch (e) {
    recordStep(step, model, role, t0, new Date(), { type: latencyErrorType(e), message: msgOf(e) });
    throw e;
  }
}

/**
 * Dernier appel requalifié (premier appel « requête SQL » qui répond directement : génération) : ses lignes sont les
 * dernières `from` consécutives (principal en échec et secours compris).
 */
export function relabelLastStep(from: LatencyStep, to: LatencyStep) {
  const rows = store.getStore()?.rows;
  if (!rows) return;
  for (let i = rows.length - 1; i >= 0 && rows[i].step === from; i--) rows[i].step = to;
}
