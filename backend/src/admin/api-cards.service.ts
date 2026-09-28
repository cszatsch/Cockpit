import { Injectable, OnModuleInit } from '@nestjs/common';
import { lookup } from 'dns/promises';
import { ApiCard } from '@prisma/client';
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
  latency24h,
  PROXY_CACHE_FAST_MS,
  PROXY_CACHE_MS,
  PROXY_FAST_CATEGORIES,
  redactKey,
  TEST_BODY_MAX,
} from '../domain/api-cards';

/** Contrôle de santé des cartes actives : toutes les 15 minutes (spécification § 6). */
export const API_HEALTH_CRON = '*/15 * * * *';

export type CallSource = 'PROXY' | 'HEALTH' | 'TEST';
export interface CallResult {
  code: number;
  ms: number | null;
  body: string;
  contentType: string;
  failure?: 'timeout' | 'network' | 'blocked';
}

/**
 * Appels sortants des cartes API : la clé est déchiffrée au dernier moment et ajoutée côté serveur
 * (marqueur `{key}` dans l'endpoint, sinon en-tête `X-Api-Key`), l'hôte est re-vérifié à chaque appel
 * (résolution DNS : protection contre le rebond DNS), les redirections ne sont pas suivies.
 */
@Injectable()
export class ApiCardsService implements OnModuleInit {
  /** Remplaçables dans les tests (aucun appel réseau réel). */
  fetchImpl: typeof fetch = (...a) => (config.offline ? Promise.reject(new Error('Service externe indisponible (mode hors ligne)')) : fetch(...a));
  lookupImpl: (host: string) => Promise<string[]> = async (host) => (await lookup(host, { all: true })).map((x) => x.address);
  /** Hors ligne, la résolution DNS n'est faite que si un résolveur de test est fourni. */
  resolveOffline = false;
  private cache = new Map<string, { until: number; r: CallResult }>();

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

  /** Appel réel de l'endpoint d'une carte, avec les paramètres transmis par le widget. */
  async call(card: ApiCard, query: Record<string, string> = {}, source: CallSource, widget?: string | null): Promise<CallResult> {
    const key = card.keyEncrypted ? decryptSecret(card.keyEncrypted) : null;
    const url = new URL(key ? card.endpoint.split(KEY_PLACEHOLDER).join(encodeURIComponent(key)) : card.endpoint.split(KEY_PLACEHOLDER).join(''));
    // Paramètres de l'endpoint = valeurs par défaut (utilisées par le contrôle de santé) ; ceux du widget les remplacent.
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const headers: Record<string, string> = { 'User-Agent': 'RISE-Cockpit/1.0', Accept: 'application/json, */*' };
    if (key && !card.endpoint.includes(KEY_PLACEHOLDER)) headers[KEY_HEADER] = key;
    const t0 = Date.now();
    let r: CallResult;
    try {
      await this.assertPublicHost(url.hostname);
      const res = await this.fetchImpl(url.toString(), { headers, redirect: 'manual', signal: AbortSignal.timeout(API_CALL_TIMEOUT_MS) });
      const text = await res.text();
      r = { code: res.status, ms: Date.now() - t0, body: redactKey(text, key), contentType: res.headers.get('content-type') || 'application/json' };
    } catch (e: any) {
      const failure = e instanceof ApiError ? 'blocked' : e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'timeout' : 'network';
      r = { code: 0, ms: null, body: redactKey(String(e?.message ?? e), key), contentType: 'text/plain', failure };
    }
    await this.prisma.apiCardCall.create({ data: { at: this.today.now(), cardId: card.id, code: r.code, ms: r.ms, source, widget: widget ?? null } });
    return r;
  }

  /** Test d'une carte (manuel ou contrôle de santé) : met à jour l'état, la latence et le dernier test. */
  async test(card: ApiCard, source: CallSource): Promise<{ code: number; ms: number | null; body: string }> {
    const r = await this.call(card, {}, source);
    const ok = r.code > 0 && r.code < 400;
    const body = r.body.length > TEST_BODY_MAX ? r.body.slice(0, TEST_BODY_MAX) + '\n…' : r.body;
    const lastTest = { code: r.code, ms: r.ms, at: this.today.now().toISOString(), body: prettify(body) };
    await this.prisma.apiCard.update({ where: { id: card.id }, data: { checkError: ok ? null : failureNote(r.code, r.failure), latencyMs: ok ? r.ms : card.latencyMs, lastTest } });
    return { code: r.code, ms: r.ms, body: lastTest.body };
  }

  /** Contrôle de santé de toutes les cartes actives. */
  async healthCheck(): Promise<number> {
    const cards = await this.prisma.apiCard.findMany({ where: { enabled: true } });
    for (const c of cards) await this.test(c, 'HEALTH').catch((e) => console.error('[api-cards]', c.id, e));
    return cards.length;
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
        quotaUsed,
        quotaLimit: c.quotaLimit,
        widgets: c.widgets,
        lastTest: (c.lastTest as { code: number; ms: number | null; at: string; body: string } | null) ?? null,
        version: c.version,
      };
    });
  }

  // ───────────── Proxy des widgets ─────────────

  /**
   * Proxy (spécification § 5) : carte désactivée ou en erreur → 503 ; quota atteint → 429 ; cache 5 min
   * (2 min pour la météo et le trafic) ; chaque appel réel est journalisé.
   */
  async proxy(cardId: string, query: Record<string, string>, widget?: string | null): Promise<CallResult> {
    const card = await this.prisma.apiCard.findUnique({ where: { id: cardId } });
    if (!card) throw new ApiError(404, 'NOT_FOUND', 'Carte API inconnue');
    const [view] = await this.views([card]);
    if (!card.enabled) throw new ApiError(503, 'CARD_DISABLED', `Service « ${card.name} » désactivé`);
    if (view.status === 'err') throw new ApiError(503, 'CARD_UNAVAILABLE', `Service « ${card.name} » indisponible : ${view.statusNote ?? 'erreur'}`);
    const cacheKey = `${card.id}?${Object.keys(query).sort().map((k) => `${k}=${query[k]}`).join('&')}`;
    const hit = this.cache.get(cacheKey);
    if (hit && hit.until > Date.now()) return hit.r;
    if (card.quotaLimit && (view.quotaUsed ?? 0) >= card.quotaLimit) throw new ApiError(429, 'QUOTA_EXCEEDED', `Quota journalier de « ${card.name} » atteint (${card.quotaLimit} appels)`);
    if (widget && !card.widgets.includes(widget)) await this.prisma.apiCard.update({ where: { id: card.id }, data: { widgets: { push: widget } } });
    const r = await this.call(card, query, 'PROXY', widget);
    if (!r.code) throw new ApiError(503, 'CARD_UNAVAILABLE', `Service « ${card.name} » injoignable`);
    if (r.code < 400) this.cache.set(cacheKey, { until: Date.now() + (PROXY_FAST_CATEGORIES.includes(card.category) ? PROXY_CACHE_FAST_MS : PROXY_CACHE_MS), r });
    return r;
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
