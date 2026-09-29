import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AdminOnly, Actor, CurrentActor } from '../core/auth/auth';
import { AuditService } from '../core/audit.service';
import { encryptSecret } from '../core/crypto';
import { ApiError, businessRule, conflict, notFound } from '../core/errors';
import { parse } from '../core/http';
import { PrismaService } from '../core/prisma.service';
import { API_CALL_TIMEOUT_MAX_MS, API_CARD_NAME_MAX, API_CARD_TAG_MAX, API_KEY_MIN_LENGTH, endpointError } from '../domain/api-cards';
import { WIDGET_CATALOGUE, WIDGET_IDS, widgetName } from '../domain/widgets';
import { ApiCardsService } from './api-cards.service';
import { FEED_ITEMS_DEFAULT, FEED_ITEMS_MAX, isFeed, mergeFeeds, parseFeed } from '../domain/rss';
import { parseNews } from '../domain/news';
import { adminCtx } from './profiles.service';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date AAAA-MM-JJ attendue');
/** Tag (catégorie) : libre, créé à la volée depuis la Console (REGISTRE API v3c § 4). */
const tag = z.string().trim().min(1, 'obligatoire').max(API_CARD_TAG_MAX);
const Create = z
  .object({
    name: z.string(),
    category: tag,
    endpoint: z.string().trim(),
    key: z.string().nullable().optional(),
    keyExpiresAt: isoDate.nullable().optional(),
    quotaLimit: z.number().nullable().optional(),
  })
  .strict();
const Update = z
  .object({
    enabled: z.boolean().optional(),
    name: z.string().optional(),
    category: tag.optional(),
    endpoint: z.string().trim().optional(),
    /** Nouvelle clé (envoyée seulement si elle a été saisie) ; null = la carte n'a plus de clé. */
    key: z.string().nullable().optional(),
    keyExpiresAt: isoDate.nullable().optional(),
    quotaLimit: z.number().nullable().optional(),
    /** Délai d'appel propre à la carte (service lent), 1 à 60 s ; null = délai par défaut (8 s). */
    timeoutMs: z.number().int().min(1000).max(API_CALL_TIMEOUT_MAX_MS).nullable().optional(),
  })
  .strict();
const Rotate = z.object({ key: z.string(), keyExpiresAt: isoDate.nullable().optional() }).strict();
const Widgets = z.object({ ids: z.array(z.string()).max(WIDGET_CATALOGUE.length) }).strict();

/** Identifiant lisible d'une carte (« OpenWeather » → openweather). */
const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'carte';

/**
 * Registre des cartes API (spécification REGISTRE API § 4 et § 8). La clé n'est jamais renvoyée ni tracée :
 * seuls ses 4 derniers caractères. Chaque action est tracée avec l'acteur, la carte et l'adresse IP.
 */
@ApiTags('console · registre des cartes API')
@ApiBearerAuth()
@AdminOnly()
@Controller('api/admin/api-cards')
export class ApiCardsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cards: ApiCardsService,
  ) {}

  @Get()
  list() {
    return this.cards.views();
  }

  @Post()
  async create(@CurrentActor() actor: Actor, @Req() req: Request, @Body() body: unknown) {
    const input = parse(Create, body);
    const name = input.name.trim(), key = input.key?.trim() || null;
    await this.check({ name, endpoint: input.endpoint, key, quotaLimit: input.quotaLimit });
    let id = slug(name);
    for (let n = 2; await this.prisma.apiCard.findUnique({ where: { id } }); n++) id = `${slug(name)}-${n}`;
    const card = await this.prisma.$transaction(async (db) => {
      const c = await db.apiCard.create({
        data: { id, name, category: input.category, endpoint: input.endpoint, keyEncrypted: key ? encryptSecret(key) : null, keyLast4: key ? key.slice(-4) : null, keyExpiresAt: input.keyExpiresAt ? new Date(input.keyExpiresAt) : null, quotaLimit: input.quotaLimit ?? null, updatedBy: actor.fullName },
      });
      await this.trace(db, actor, req, 'Création d’une carte API', `${c.name} · ${c.category}${c.keyLast4 ? ` · clé ••••${c.keyLast4}` : ' · sans clé'}`, c.id);
      return c;
    });
    return (await this.cards.views([card]))[0];
  }

  /** `{ enabled }` (activation / désactivation) ou champs éditables. */
  @Patch(':id')
  async update(@CurrentActor() actor: Actor, @Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const input = parse(Update, body);
    const before = await this.one(id);
    const key = input.key === undefined ? undefined : input.key?.trim() || null;
    await this.check({ name: input.name?.trim(), endpoint: input.endpoint, key, quotaLimit: input.quotaLimit });
    const epChanged = input.endpoint !== undefined && input.endpoint !== before.endpoint;
    const card = await this.prisma.$transaction(async (db) => {
      const c = await db.apiCard.update({
        where: { id },
        data: {
          enabled: input.enabled,
          name: input.name?.trim(),
          category: input.category,
          endpoint: input.endpoint,
          keyExpiresAt: input.keyExpiresAt === undefined ? undefined : input.keyExpiresAt ? new Date(input.keyExpiresAt) : null,
          quotaLimit: input.quotaLimit,
          timeoutMs: input.timeoutMs,
          // Clé : nouvelle (chiffrée, 4 derniers caractères) ou retirée ; jamais renvoyée ni tracée en clair.
          ...(key === undefined ? {} : key ? { keyEncrypted: encryptSecret(key), keyLast4: key.slice(-4) } : { keyEncrypted: null, keyLast4: null, keyExpiresAt: null }),
          // Endpoint modifié : latence, dernière réponse et erreur du dernier contrôle ne valent plus (v3c § 4).
          ...(epChanged ? { latencyMs: null, lastTest: Prisma.DbNull, endpointSince: this.cards.now() } : {}),
          checkError: epChanged || key !== undefined ? null : undefined,
          updatedBy: actor.fullName,
          version: { increment: 1 },
        },
      });
      if (input.enabled !== undefined && input.enabled !== before.enabled) await this.trace(db, actor, req, input.enabled ? 'Activation d’une carte API' : 'Désactivation d’une carte API', c.name, id);
      const fields = (['name', 'category', 'endpoint', 'quotaLimit', 'timeoutMs'] as const).filter((k) => input[k] !== undefined && input[k] !== (before as any)[k]);
      if (input.keyExpiresAt !== undefined) fields.push('keyExpiresAt' as any);
      if (fields.length) await this.trace(db, actor, req, 'Modification d’une carte API', `${c.name} · ${fields.join(', ')}`, id);
      if (key) await this.trace(db, actor, req, 'Rotation de la clé d’une carte API', `${c.name} · ••••${before.keyLast4 ?? '—'} → ••••${c.keyLast4}`, id);
      else if (key === null && before.keyLast4) await this.trace(db, actor, req, 'Retrait de la clé d’une carte API', `${c.name} · ••••${before.keyLast4}`, id);
      return c;
    });
    this.cards.forget(id);
    return (await this.cards.views([card]))[0];
  }

  /** Rotation de la clé : tracée avec les 4 derniers caractères, ancienne → nouvelle. */
  @Put(':id/key')
  async rotate(@CurrentActor() actor: Actor, @Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const input = parse(Rotate, body);
    const key = input.key.trim();
    if (key.length < API_KEY_MIN_LENGTH) throw businessRule('Clé trop courte', { key: `${API_KEY_MIN_LENGTH} caractères au moins` });
    const before = await this.one(id);
    const card = await this.prisma.$transaction(async (db) => {
      const c = await db.apiCard.update({
        where: { id },
        data: { keyEncrypted: encryptSecret(key), keyLast4: key.slice(-4), keyExpiresAt: input.keyExpiresAt === undefined ? undefined : input.keyExpiresAt ? new Date(input.keyExpiresAt) : null, checkError: null, updatedBy: actor.fullName, version: { increment: 1 } },
      });
      await this.trace(db, actor, req, 'Rotation de la clé d’une carte API', `${c.name} · ••••${before.keyLast4 ?? '—'} → ••••${c.keyLast4}`, id);
      return c;
    });
    this.cards.forget(id);
    return (await this.cards.views([card]))[0];
  }

  /** Appel réel côté serveur (8 s au plus) → `{ code, ms, body }` ; le résultat met à jour l'état de la carte. */
  @Post(':id/test')
  @HttpCode(200)
  async test(@CurrentActor() actor: Actor, @Req() req: Request, @Param('id') id: string) {
    const card = await this.one(id);
    const r = await this.cards.test(card, 'TEST');
    await this.trace(this.prisma, actor, req, 'Test manuel d’une carte API', `${card.name} · ${r.code || 'injoignable'}${r.ms != null ? ` · ${r.ms} ms` : ''}`, id);
    return r;
  }

  /**
   * Suppression, y compris d'une carte qui alimente des widgets (REGISTRE API v3c § 4) : la Console liste les
   * widgets impactés et demande confirmation ; ils sont cités dans la trace.
   */
  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentActor() actor: Actor, @Req() req: Request, @Param('id') id: string) {
    const c = await this.one(id);
    await this.prisma.$transaction(async (db) => {
      await db.apiCard.delete({ where: { id } });
      await this.trace(db, actor, req, 'Suppression d’une carte API', c.name + (c.widgets.length ? ` · widgets impactés : ${c.widgets.map(widgetName).join(', ')}` : ''), id);
    });
    this.cards.forget(id);
  }

  /** Associe ou dissocie des widgets (identifiants du catalogue ; liste complète). */
  @Put(':id/widgets')
  async widgets(@CurrentActor() actor: Actor, @Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const { ids } = parse(Widgets, body);
    const unknown = ids.filter((w) => !WIDGET_IDS.has(w));
    if (unknown.length) throw businessRule('Widget inconnu', { ids: unknown.join(', ') });
    const before = await this.one(id);
    const next = [...new Set(ids)];
    const card = await this.prisma.$transaction(async (db) => {
      const c = await db.apiCard.update({ where: { id }, data: { widgets: next, updatedBy: actor.fullName, version: { increment: 1 } } });
      const added = next.filter((w) => !before.widgets.includes(w)), removed = before.widgets.filter((w) => !next.includes(w));
      if (added.length || removed.length) await this.trace(db, actor, req, 'Widgets alimentés par une carte API', `${c.name}${added.length ? ` · associée à ${added.map(widgetName).join(', ')}` : ''}${removed.length ? ` · dissociée de ${removed.map(widgetName).join(', ')}` : ''}`, id);
      return c;
    });
    return (await this.cards.views([card]))[0];
  }

  private async one(id: string) {
    const c = await this.prisma.apiCard.findUnique({ where: { id } });
    if (!c) throw notFound('Carte API introuvable');
    return c;
  }

  /** Validation (§ 4) : nom 1–60, https, hôte public (SSRF, y compris après résolution DNS), clé ≥ 8, quota entier > 0. */
  private async check(v: { name?: string; endpoint?: string; key?: string | null; quotaLimit?: number | null }) {
    const e: Record<string, string> = {};
    if (v.name !== undefined && (v.name.length < 1 || v.name.length > API_CARD_NAME_MAX)) e.name = `1 à ${API_CARD_NAME_MAX} caractères`;
    if (v.endpoint !== undefined) {
      const err = endpointError(v.endpoint);
      if (err) e.endpoint = err;
      else {
        try {
          await this.cards.assertPublicHost(new URL(v.endpoint.replace('{key}', 'CLE')).hostname);
        } catch (x: any) {
          e.endpoint = x?.message ?? 'Adresse refusée';
        }
      }
    }
    if (v.key != null && v.key.length < API_KEY_MIN_LENGTH) e.key = `${API_KEY_MIN_LENGTH} caractères au moins`;
    if (v.quotaLimit != null && !(Number.isInteger(v.quotaLimit) && v.quotaLimit > 0)) e.quotaLimit = 'entier supérieur à 0';
    if (Object.keys(e).length) throw businessRule('Carte API invalide', e);
  }

  private trace(db: any, actor: Actor, req: Request, action: string, target: string, cardId: string) {
    return this.audit.action(db, adminCtx(actor), { action, target, severity: 'SENSITIVE', entityType: 'ApiCard', entityId: cardId, details: { card_id: cardId, ip: req.ip ?? null } });
  }
}

/** Catalogue des widgets du Cockpit (22 widgets), pour « Alimente » et « Associer un widget » du registre. */
@ApiTags('console · registre des cartes API')
@ApiBearerAuth()
@AdminOnly()
@Controller('api/admin/widgets')
export class WidgetCatalogueController {
  @Get()
  list() {
    return WIDGET_CATALOGUE;
  }
}

/**
 * Proxy des widgets (spécification § 5) : `GET /api/widgets/proxy/:cardId?…`. La clé est ajoutée côté serveur ;
 * la réponse du fournisseur est renvoyée telle quelle (code, type, corps). Réservé aux utilisateurs connectés.
 */
@ApiTags('widgets · proxy des cartes API')
@ApiBearerAuth()
@Controller('api/widgets/proxy')
export class WidgetProxyController {
  constructor(private readonly cards: ApiCardsService) {}

  @Get(':cardId')
  async proxy(@Param('cardId') cardId: string, @Query() query: Record<string, string>, @Req() req: Request, @Res() res: Response) {
    const q = Object.fromEntries(Object.entries(query).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
    const widget = String(req.headers['x-rise-widget'] ?? '').slice(0, 60) || null;
    const r = await this.cards.proxy(cardId, q, widget);
    res.status(r.code).setHeader('Content-Type', r.contentType).setHeader('X-RISE-Cache', r.cache ?? 'miss').send(r.body);
  }
}

/**
 * Flux d'actualités (RSS / Atom) du registre : articles en texte clair, par flux ou agrégés (plus récents
 * d'abord, doublons retirés). Chaque flux passe par le proxy : cache, dernière réponse en réserve, quota, état.
 */
@ApiTags('widgets · flux d’actualités')
@ApiBearerAuth()
@Controller('api/widgets/feeds')
export class WidgetFeedsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cards: ApiCardsService,
  ) {}

  /** Tous les flux actifs (ou ceux de `cards=id1,id2`), `limit` articles au plus (10 par défaut, 50 au plus). */
  @Get()
  async all(@Query('cards') ids: string | undefined, @Query('limit') limit: string | undefined, @Req() req: Request) {
    const list = await this.prisma.apiCard.findMany({ where: { feed: true, enabled: true, ...(ids ? { id: { in: ids.split(',').map((x) => x.trim()) } } : {}) }, orderBy: { name: 'asc' } });
    const widget = String(req.headers['x-rise-widget'] ?? '').slice(0, 60) || null;
    const read = await Promise.all(list.map(async (c) => {
      try {
        return { card: c, feed: await this.read(c.id, widget), error: null as string | null };
      } catch (e: any) {
        return { card: c, feed: null, error: e?.message ?? 'indisponible' };
      }
    }));
    const n = clamp(limit);
    return {
      items: mergeFeeds(read.filter((r) => r.feed).map((r) => ({ source: r.card.name, feed: r.feed! })), n),
      sources: read.map((r) => ({ id: r.card.id, name: r.card.name, ok: !!r.feed, count: r.feed?.items.length ?? 0, error: r.error })),
    };
  }

  @Get(':cardId')
  async one(@Param('cardId') cardId: string, @Query('limit') limit: string | undefined, @Req() req: Request) {
    const card = await this.prisma.apiCard.findUnique({ where: { id: cardId } });
    if (!card) throw notFound('Carte API inconnue');
    const feed = await this.read(cardId, String(req.headers['x-rise-widget'] ?? '').slice(0, 60) || null);
    return { id: card.id, source: card.name, title: feed.title, items: feed.items.slice(0, clamp(limit)).map((i) => ({ ...i, source: card.name })) };
  }

  private async read(cardId: string, widget: string | null) {
    const r = await this.cards.proxy(cardId, {}, widget);
    if (r.code >= 400) throw new ApiError(502, 'FEED_ERROR', `Flux indisponible (${r.code})`);
    if (!isFeed(r.body)) throw new ApiError(502, 'NOT_A_FEED', 'La réponse n’est pas un flux RSS ou Atom');
    return parseFeed(r.body);
  }
}

const clamp = (limit: string | undefined) => Math.min(FEED_ITEMS_MAX, Math.max(1, Number(limit) || FEED_ITEMS_DEFAULT));

/** Catégories des actualités : générales (cartes Actualités) ou économiques (cartes Finance). */
const NEWS_CATEGORY: Record<string, string> = { actualites: 'Actualités', economie: 'Finance' };

/**
 * Actualités agrégées (tuile Actualités) : toutes les cartes actives de la catégorie, quel que soit le
 * fournisseur (GNews, NewsData.io, Finnhub, flux RSS / Atom), plus récentes d'abord, doublons retirés.
 * `category` : `actualites` (défaut) ou `economie`. Une source en échec est signalée sans bloquer les autres.
 */
@ApiTags('widgets · flux d’actualités')
@ApiBearerAuth()
@Controller('api/widgets/news')
export class WidgetNewsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cards: ApiCardsService,
  ) {}

  @Get()
  async news(@Query('category') category: string | undefined, @Query('limit') limit: string | undefined, @Req() req: Request) {
    const cat = NEWS_CATEGORY[category ?? 'actualites'];
    if (!cat) throw businessRule('Catégorie inconnue', { category: 'actualites ou economie' });
    const list = await this.prisma.apiCard.findMany({ where: { enabled: true, category: cat }, orderBy: { name: 'asc' } });
    const widget = String(req.headers['x-rise-widget'] ?? '').slice(0, 60) || null;
    const read = await Promise.all(list.map(async (c) => {
      try {
        const r = await this.cards.proxy(c.id, {}, widget);
        if (r.code >= 400) throw new ApiError(502, 'NEWS_ERROR', `Service en erreur (${r.code})`);
        const parsed = parseNews(r.body);
        if (!parsed) throw new ApiError(502, 'NOT_NEWS', 'Réponse non reconnue (format d’actualités inconnu)');
        return { card: c, parsed, error: null as string | null };
      } catch (e: any) {
        return { card: c, parsed: null, error: e?.message ?? 'indisponible' };
      }
    }));
    const n = Math.min(FEED_ITEMS_MAX, Math.max(1, Number(limit) || FEED_ITEMS_DEFAULT));
    // Source affichée : le journal d'origine quand le fournisseur le donne (agrégateurs), sinon le nom de la carte.
    const items = mergeFeeds(read.filter((r) => r.parsed).map((r) => ({ source: r.card.name, feed: { title: r.card.name, items: r.parsed!.items } })), n)
      .map((i: any) => ({ title: i.title, url: i.url, date: i.date, summary: i.summary, image: i.image, source: i.publisher || i.source, via: i.source }));
    return { category: category ?? 'actualites', items, sources: read.map((r) => ({ id: r.card.id, name: r.card.name, ok: !!r.parsed, format: r.parsed?.format ?? null, count: r.parsed?.items.length ?? 0, error: r.error })) };
  }
}
