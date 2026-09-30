import { Injectable, OnModuleInit } from '@nestjs/common';
import { lookup } from 'dns/promises';
import { Agent, fetch as undiciFetch } from 'undici';
import { ApiCard } from '@prisma/client';
import { isFeed } from '../domain/rss';
import { config } from '../core/config';
import { decryptSecret } from '../core/crypto';
import { ApiError } from '../core/errors';
import { JobsService } from '../core/jobs.service';
import { PrismaService } from '../core/prisma.service';
import { TodayService } from '../core/today.service';
import {
  API_CALL_TIMEOUT_MS,
  cardStatus,
  failureNote,
  isPrivateAddress,
  isPrivateHostname,
  KEY_HEADER,
  KEY_PLACEHOLDER,
  HEALTH_POST_INTERVAL_MS,
  latency24h,
  latencyMedian,
  PROXY_CACHE_FAST_MS,
  PROXY_CACHE_MS,
  PROXY_FAST_CATEGORIES,
  PROXY_STALE_MS,
  PROXY_CACHE_NEWS_MS,
  PROXY_NEWS_CATEGORIES,
  HEALTH_SKIP_IF_OK_MS,
  redactKey,
  TEST_BODY_MAX,
} from '../domain/api-cards';
import { widgetId } from '../domain/widgets';

/** Contrôle de santé des cartes actives : toutes les 15 minutes (spécification § 6). */
export const API_HEALTH_CRON = '*/15 * * * *';

export type CallSource = 'PROXY' | 'HEALTH' | 'TEST' | 'JEV';
export interface CallResult {
  code: number;
  ms: number | null;
  body: string;
  contentType: string;
  failure?: 'timeout' | 'network' | 'blocked';
  /** Réponse du proxy : appel réel, cache frais, ou dernière réponse réussie servie après un échec. */
  cache?: 'miss' | 'hit' | 'stale';
}

/**
 * Appels sortants des cartes API : la clé est déchiffrée au dernier moment et ajoutée côté serveur
 * (marqueur `{key}` dans l'endpoint, sinon en-tête `X-Api-Key`), l'hôte est re-vérifié à chaque appel
 * (résolution DNS : protection contre le rebond DNS), les redirections ne sont pas suivies.
 */
@Injectable()
export class ApiCardsService implements OnModuleInit {
  /** Remplaçables dans les tests (aucun appel réseau réel). */
  fetchImpl: typeof fetch = (url: any, init: any) =>
    config.offline
      ? Promise.reject(new Error('Service externe indisponible (mode hors ligne)'))
      : // Délai de connexion aligné sur le délai de la carte : le client de Node le borne sinon à 10 s (GDELT le dépasse).
        (undiciFetch(url, { ...init, dispatcher: agentFor(init?.connectTimeoutMs ?? API_CALL_TIMEOUT_MS) }) as unknown as Promise<Response>);
  lookupImpl: (host: string) => Promise<string[]> = async (host) => (await lookup(host, { all: true })).map((x) => x.address);
  /** Hors ligne, la résolution DNS n'est faite que si un résolveur de test est fourni. */
  resolveOffline = false;
  private cache = new Map<string, { until: number; staleUntil: number; r: CallResult }>();
  /** Un seul appel en cours par requête identique (un service limité à 1 appel / 5 s, comme GDELT, répondrait 429). */
  private inflight = new Map<string, Promise<CallResult>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly today: TodayService,
  ) {}

  onModuleInit() {
    this.jobs.register('api-cards.health', () => this.healthCheck().then(() => undefined));
    this.jobs.schedule('api-cards.health', API_HEALTH_CRON);
  }

  /** Hôte public : refus si le nom ou l'une de ses adresses résolues est privée (SSRF). */
  async assertPublicHost(host: string): Promise<void> {
    if (isPrivateHostname(host)) throw new ApiError(422, 'PRIVATE_HOST', 'Adresse privée ou locale interdite');
    if (config.offline && !this.resolveOffline) return;
    let ips: string[];
    try {
      ips = await this.lookupImpl(host.replace(/^\[|\]$/g, ''));
    } catch {
      throw new ApiError(422, 'UNKNOWN_HOST', `Nom d’hôte introuvable : ${host}`);
    }
    if (!ips.length || ips.some(isPrivateAddress)) throw new ApiError(422, 'PRIVATE_HOST', 'Adresse privée ou locale interdite');
  }

  /** Instant courant du serveur (DEMO_NOW compris). */
  now(): Date {
    return this.today.now();
  }

  /** Appel réel de l'endpoint d'une carte, avec les paramètres transmis par le widget. */
  async call(card: ApiCard, query: Record<string, string> = {}, source: CallSource, widget?: string | null): Promise<CallResult> {
    const key = card.keyEncrypted ? decryptSecret(card.keyEncrypted) : null;
    const url = new URL(key ? card.endpoint.split(KEY_PLACEHOLDER).join(encodeURIComponent(key)) : card.endpoint.split(KEY_PLACEHOLDER).join(''));
    // Paramètres de l'endpoint = valeurs par défaut (utilisées par le contrôle de santé) ; ceux du widget les remplacent.
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const headers: Record<string, string> = { 'User-Agent': 'RISE-Cockpit/1.0', Accept: 'application/json, */*' };
    // Clé : marqueur {key} de l'endpoint, sinon Authorization: Bearer (BEARER) ou en-tête X-Api-Key (HEADER).
    if (key && !card.endpoint.includes(KEY_PLACEHOLDER)) {
      if (card.authMode === 'BEARER') headers.Authorization = `Bearer ${key}`;
      else headers[KEY_HEADER] = key;
    }
    const post = card.method === 'POST';
    if (post) headers['Content-Type'] = 'application/json';
    const t0 = Date.now();
    let r: CallResult;
    try {
      await this.assertPublicHost(url.hostname);
      const timeout = card.timeoutMs ?? API_CALL_TIMEOUT_MS;
      const res = await this.fetchImpl(url.toString(), { method: post ? 'POST' : 'GET', ...(post ? { body: card.body ?? '{}' } : {}), headers, redirect: 'manual', signal: AbortSignal.timeout(timeout), connectTimeoutMs: timeout } as RequestInit);
      const text = await res.text();
      r = { code: res.status, ms: Date.now() - t0, body: redactKey(text, key), contentType: res.headers.get('content-type') || 'application/json' };
    } catch (e: any) {
      const failure = e instanceof ApiError ? 'blocked' : e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'timeout' : 'network';
      r = { code: 0, ms: null, body: redactKey(String(e?.message ?? e), key), contentType: 'text/plain', failure };
    }
    await this.prisma.apiCardCall.create({ data: { at: this.today.now(), cardId: card.id, code: r.code, ms: r.ms, source, widget: widget ?? null } });
    // Une réponse RSS ou Atom fait de la carte un flux d'actualités (lu par /api/widgets/feeds).
    if (!card.feed && r.code > 0 && r.code < 400 && isFeed(r.body)) await this.prisma.apiCard.update({ where: { id: card.id }, data: { feed: true } });
    return r;
  }

  /** Test d'une carte (manuel ou contrôle de santé) : met à jour l'état, la latence et le dernier test. */
  async test(card: ApiCard, source: CallSource): Promise<{ code: number; ms: number | null; body: string }> {
    const r = await this.call(card, {}, source);
    // Seul un 2xx est un succès : une redirection (non suivie) signale une adresse déplacée.
    const ok = r.code >= 200 && r.code < 300;
    const body = r.body.length > TEST_BODY_MAX ? r.body.slice(0, TEST_BODY_MAX) + '\n…' : r.body;
    const lastTest = { code: r.code, ms: r.ms, at: this.today.now().toISOString(), body: prettify(body) };
    await this.prisma.apiCard.update({ where: { id: card.id }, data: { checkError: ok ? null : failureNote(r.code, r.failure), latencyMs: ok ? r.ms : card.latencyMs, lastTest } });
    return { code: r.code, ms: r.ms, body: lastTest.body };
  }

  /** Contrôle de santé de toutes les cartes actives. */
  async healthCheck(): Promise<number> {
    const cards = await this.prisma.apiCard.findMany({ where: { enabled: true } });
    // Contrôle passif : une carte qui a réussi un vrai appel dans l'heure est saine ; pas d'appel (ni de quota) en plus.
    const since = new Date(this.today.now().getTime() - HEALTH_SKIP_IF_OK_MS);
    const recent = await this.prisma.apiCardCall.findMany({ where: { at: { gte: since }, source: 'PROXY', code: { gte: 200, lt: 300 } }, select: { cardId: true }, distinct: ['cardId'] });
    const skip = new Set(recent.map((r) => r.cardId));
    // Carte en POST (appel facturé par le service) : re-testée une fois par 24 h, ou tant qu'elle est en erreur.
    const postDue = (c: ApiCard) => c.checkError || !(c.lastTest as any)?.at || this.today.now().getTime() - new Date((c.lastTest as any).at).getTime() >= HEALTH_POST_INTERVAL_MS;
    const todo = cards.filter((c) => (c.method === 'POST' ? postDue(c) : !skip.has(c.id) || c.checkError));
    for (const c of todo) await this.test(c, 'HEALTH').catch((e) => console.error('[api-cards]', c.id, e));
    return todo.length;
  }

  /** Appels du jour (depuis minuit, heure de Paris) par carte. */
  async quotaUsed(ids: string[]): Promise<Record<string, number>> {
    const now = this.today.now();
    const rows = await this.prisma.apiCardCall.groupBy({ by: ['cardId'], where: { cardId: { in: ids }, at: { gte: startOfParisDay(now), lte: now } }, _count: { _all: true } });
    return Object.fromEntries(rows.map((r) => [r.cardId, r._count._all]));
  }

  /** Vue d'une carte pour l'écran (jamais la clé : seulement ses 4 derniers caractères). */
  async views(cards?: ApiCard[]) {
    const list = cards ?? (await this.prisma.apiCard.findMany({ orderBy: { name: 'asc' } }));
    const now = this.today.now(), todayIso = this.today.today();
    const [used, calls] = await Promise.all([
      this.quotaUsed(list.map((c) => c.id)),
      this.prisma.apiCardCall.findMany({ where: { cardId: { in: list.map((c) => c.id) }, at: { gt: new Date(now.getTime() - 24 * 3_600_000), lte: now } }, select: { cardId: true, at: true, code: true, ms: true } }),
    ]);
    return list.map((c) => {
      const expires = c.keyExpiresAt ? c.keyExpiresAt.toISOString().slice(0, 10) : null;
      const quotaUsed = c.quotaLimit ? used[c.id] ?? 0 : null;
      const st = cardStatus({ enabled: c.enabled, checkError: c.checkError, keyExpiresAt: expires, quotaUsed, quotaLimit: c.quotaLimit }, todayIso);
      return {
        id: c.id,
        name: c.name,
        category: c.category,
        endpoint: c.endpoint,
        keyLast4: c.keyLast4,
        keyExpiresAt: expires,
        enabled: c.enabled,
        status: st.status,
        statusNote: st.note,
        latencyMs: c.latencyMs,
        latency24h: latency24h(calls.filter((x) => x.cardId === c.id), now),
        // Latence médiane 24 h (REGISTRE API v3c § 5) : appels postérieurs au dernier changement d'endpoint.
        latencyMedian24h: latencyMedian(calls.filter((x) => x.cardId === c.id && (!c.endpointSince || x.at > c.endpointSince))),
        quotaUsed,
        quotaLimit: c.quotaLimit,
        timeoutMs: c.timeoutMs ?? API_CALL_TIMEOUT_MS,
        authMode: c.authMode,
        method: c.method,
        body: c.body,
        feed: c.feed,
        widgets: c.widgets,
        lastTest: (c.lastTest as { code: number; ms: number | null; at: string; body: string } | null) ?? null,
        version: c.version,
      };
    });
  }

  // ───────────── Proxy des widgets ─────────────

  /**
   * Proxy (spécification § 5) : carte désactivée → 503 ; quota atteint → 429 ; cache 5 min (2 min pour la météo
   * et le trafic) ; chaque appel réel est journalisé. Carte en erreur ou appel en échec (délai, 5xx, 429) : la
   * dernière réponse réussie (24 h au plus) est servie, sinon 503. Un seul appel en cours par requête identique.
   */
  async proxy(cardId: string, query: Record<string, string>, widget?: string | null): Promise<CallResult> {
    const card = await this.prisma.apiCard.findUnique({ where: { id: cardId } });
    if (!card) throw new ApiError(404, 'NOT_FOUND', 'Carte API inconnue');
    const [view] = await this.views([card]);
    if (!card.enabled) throw new ApiError(503, 'CARD_DISABLED', `Service « ${card.name} » désactivé`);
    const cacheKey = `${card.id}?${Object.keys(query).sort().map((k) => `${k}=${query[k]}`).join('&')}`;
    const hit = this.cache.get(cacheKey), now = Date.now();
    const stale = hit && hit.staleUntil > now ? { ...hit.r, cache: 'stale' as const } : null;
    if (view.status === 'err') {
      if (stale) return stale;
      throw new ApiError(503, 'CARD_UNAVAILABLE', `Service « ${card.name} » indisponible : ${view.statusNote ?? 'erreur'}`);
    }
    if (hit && hit.until > now) return { ...hit.r, cache: 'hit' };
    const pending = this.inflight.get(cacheKey);
    if (pending) return pending;
    if (card.quotaLimit && (view.quotaUsed ?? 0) >= card.quotaLimit) throw new ApiError(429, 'QUOTA_EXCEEDED', `Quota journalier de « ${card.name} » atteint (${card.quotaLimit} appels)`);
    // Widget déclaré par le Cockpit (identifiant du catalogue) : associé à la carte à son premier appel.
    const wid = widgetId(widget);
    if (wid && !card.widgets.includes(wid)) await this.prisma.apiCard.update({ where: { id: card.id }, data: { widgets: { push: wid } } });
    const run = (async () => {
      const r = await this.call(card, query, 'PROXY', widget);
      const redirect = r.code >= 300 && r.code < 400, failed = !r.code || redirect || r.code >= 500 || r.code === 429;
      if (failed && stale) return stale;
      if (!r.code || redirect) throw new ApiError(503, 'CARD_UNAVAILABLE', `Service « ${card.name} » ${redirect ? `déplacé (redirection ${r.code})` : 'injoignable'}`);
      if (r.code < 400) this.cache.set(cacheKey, { until: Date.now() + (PROXY_FAST_CATEGORIES.includes(card.category) ? PROXY_CACHE_FAST_MS : PROXY_CACHE_MS), staleUntil: Date.now() + PROXY_STALE_MS, r });
      if (r.code < 400 && PROXY_NEWS_CATEGORIES.includes(card.category)) this.cache.get(cacheKey)!.until = Date.now() + PROXY_CACHE_NEWS_MS;
      return { ...r, cache: 'miss' as const };
    })();
    this.inflight.set(cacheKey, run);
    try {
      return await run;
    } finally {
      this.inflight.delete(cacheKey);
    }
  }

  /** Vide le cache d'une carte (clé remplacée, endpoint modifié, carte désactivée). */
  forget(cardId: string) {
    for (const k of this.cache.keys()) if (k.startsWith(cardId + '?')) this.cache.delete(k);
  }
}

/** Minuit à Paris pour l'instant donné. */
export function startOfParisDay(now: Date): Date {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return new Date(now.getTime() - ((n('hour') * 60 + n('minute')) * 60 + n('second')) * 1000 - now.getMilliseconds());
}

/** Réponse JSON indentée pour l'affichage du test (texte brut sinon). */
function prettify(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2).slice(0, TEST_BODY_MAX);
  } catch {
    return body;
  }
}

/** Un client HTTP par délai de connexion (réutilisé : connexions gardées ouvertes). */
const agents = new Map<number, Agent>();
function agentFor(connectTimeoutMs: number): Agent {
  let a = agents.get(connectTimeoutMs);
  if (!a) agents.set(connectTimeoutMs, (a = new Agent({ connect: { timeout: connectTimeoutMs } })));
  return a;
}
