import { AsyncLocalStorage } from 'node:async_hooks';
import diagnostics from 'node:diagnostics_channel';

/**
 * Traces de Jev (01/10/2026) : décomposition fine du traitement d'une question (de la question à la réponse) en étapes
 * chronométrées, imbriquées. Une trace est ouverte par `traced()` (une par question) ; toute fonction appelée dans ce
 * contexte peut ajouter une étape avec `span()` ou un repère avec `note()`, sans paramètre à transmettre
 * (AsyncLocalStorage). Hors trace, `span()` exécute simplement la fonction.
 *
 * Les connexions réseau ouvertes pendant une trace (résolution DNS, TCP, TLS : client HTTP de Node, `undici`) y sont
 * notées automatiquement : une connexion réutilisée n'apparaît pas, une connexion neuve apparaît avec sa durée.
 */
export interface TraceSpan {
  /** Rang de l'étape (ordre de début), profondeur dans l'arborescence et étape parente. */
  i: number;
  depth: number;
  parent: number | null;
  name: string;
  /** Début (ms depuis le début de la trace) et durée (ms) ; un repère a une durée nulle. */
  at: number;
  ms: number;
  detail?: Record<string, unknown>;
  error?: string;
}
export interface TraceResult { id: string; label: string; at: Date; totalMs: number; spans: TraceSpan[]; meta: Record<string, unknown> }

class Trace {
  readonly t0 = performance.now();
  readonly at = new Date();
  readonly spans: TraceSpan[] = [];
  readonly meta: Record<string, unknown> = {};
  readonly connects = new Map<string, number>();
  constructor(readonly id: string, readonly label: string) {}
  now() { return Math.round((performance.now() - this.t0) * 10) / 10; }
}

const traceStore = new AsyncLocalStorage<Trace>();
const spanStore = new AsyncLocalStorage<{ i: number; depth: number }>();

/** Écouteurs des traces terminées (journal du serveur, enregistrement en base). */
export const traceSinks: Array<(t: TraceResult) => void> = [];

let seq = 0;
/** Ouvre une trace pour `fn` ; à la fin (réussite ou erreur), la trace est remise aux écouteurs. */
export async function traced<T>(label: string, fn: () => Promise<T>, meta: Record<string, unknown> = {}): Promise<T> {
  const t = new Trace(`tr-${Date.now().toString(36)}-${(++seq).toString(36)}`, label);
  Object.assign(t.meta, meta);
  let failed: unknown = null;
  try {
    return await traceStore.run(t, () => spanStore.run({ i: -1, depth: -1 }, fn));
  } catch (e) {
    failed = e;
    throw e;
  } finally {
    if (failed) t.meta.error = failed instanceof Error ? failed.message : String(failed);
    const result: TraceResult = { id: t.id, label: t.label, at: t.at, totalMs: Math.round(t.now()), spans: t.spans, meta: t.meta };
    for (const s of traceSinks) {
      try { s(result); } catch { /* un écouteur en échec n'interrompt jamais la réponse */ }
    }
  }
}

/** Étape chronométrée de la trace en cours (sans trace : la fonction seule). `detail` peut être complété pendant l'étape. */
export async function span<T>(name: string, fn: (detail: Record<string, unknown>) => Promise<T>, detail: Record<string, unknown> = {}): Promise<T> {
  const t = traceStore.getStore();
  if (!t) return fn(detail);
  const parent = spanStore.getStore();
  const s: TraceSpan = { i: t.spans.length, depth: (parent?.depth ?? -1) + 1, parent: parent && parent.i >= 0 ? parent.i : null, name, at: t.now(), ms: 0 };
  t.spans.push(s);
  try {
    return await spanStore.run({ i: s.i, depth: s.depth }, () => fn(detail));
  } catch (e) {
    s.error = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    throw e;
  } finally {
    s.ms = Math.round((t.now() - s.at) * 10) / 10;
    if (Object.keys(detail).length) s.detail = detail;
  }
}

/** Repère (durée nulle) ou étape mesurée ailleurs (`ms`) dans la trace en cours. */
export function note(name: string, detail?: Record<string, unknown>, ms = 0) {
  const t = traceStore.getStore();
  if (!t) return;
  const parent = spanStore.getStore();
  t.spans.push({ i: t.spans.length, depth: (parent?.depth ?? -1) + 1, parent: parent && parent.i >= 0 ? parent.i : null, name, at: Math.round((t.now() - ms) * 10) / 10, ms, ...(detail ? { detail } : {}) });
}

/** Information générale de la trace (cas d'usage, modèle…). */
export function traceMeta(k: string, v: unknown) {
  const t = traceStore.getStore();
  if (t) t.meta[k] = v;
}

/** Trace en cours (identifiant), ou null. */
export const currentTraceId = () => traceStore.getStore()?.id ?? null;

// ── Connexions réseau (undici) : DNS + TCP + TLS d'une connexion neuve, notées dans la trace en cours. ──
const hostOf = (m: any) => `${m?.connectParams?.hostname ?? m?.connectParams?.host ?? '?'}:${m?.connectParams?.port ?? ''}`;
diagnostics.subscribe('undici:client:beforeConnect', (m: any) => {
  const t = traceStore.getStore();
  if (t) t.connects.set(hostOf(m), t.now());
});
diagnostics.subscribe('undici:client:connected', (m: any) => {
  const t = traceStore.getStore();
  if (!t) return;
  const k = hostOf(m), t0 = t.connects.get(k);
  if (t0 === undefined) return;
  t.connects.delete(k);
  note('connexion neuve (DNS + TCP + TLS)', { hote: k, protocole: m?.connectParams?.protocol ?? '' }, Math.round((t.now() - t0) * 10) / 10);
});
diagnostics.subscribe('undici:client:connectError', (m: any) => {
  const t = traceStore.getStore();
  if (!t) return;
  const k = hostOf(m), t0 = t.connects.get(k);
  t.connects.delete(k);
  note('connexion en échec', { hote: k, erreur: String(m?.error?.message ?? m?.error ?? '').slice(0, 200) }, t0 === undefined ? 0 : Math.round((t.now() - t0) * 10) / 10);
});

/** Trace lisible (journal du serveur) : une ligne par étape, indentée, durée et part du total. */
export function formatTrace(t: TraceResult): string {
  const pct = (ms: number) => (t.totalMs ? `${Math.round((ms / t.totalMs) * 100)} %` : '');
  const lines = [`[jev:trace] ${t.id} · ${t.label} · ${t.totalMs} ms${Object.keys(t.meta).length ? ` · ${Object.entries(t.meta).map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`).join(' ')}` : ''}`];
  for (const s of t.spans) {
    const d = s.detail ? ` — ${Object.entries(s.detail).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join(' · ')}` : '';
    lines.push(`  ${'  '.repeat(s.depth)}${s.ms ? `${String(Math.round(s.ms)).padStart(6)} ms ${pct(s.ms).padStart(5)}` : '     ·       '}  @${String(Math.round(s.at)).padStart(5)}  ${s.name}${d}${s.error ? `  ✗ ${s.error}` : ''}`);
  }
  return lines.join('\n');
}
