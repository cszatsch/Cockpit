import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AdminOnly, Actor, CurrentActor } from '../core/auth/auth';
import { AuditService } from '../core/audit.service';
import { encryptSecret } from '../core/crypto';
import { businessRule, conflict, notFound } from '../core/errors';
import { parse } from '../core/http';
import { PrismaService } from '../core/prisma.service';
import { API_CARD_CATEGORIES, API_CARD_NAME_MAX, API_KEY_MIN_LENGTH, endpointError } from '../domain/api-cards';
import { ApiCardsService } from './api-cards.service';
import { adminCtx } from './profiles.service';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date AAAA-MM-JJ attendue');
const Create = z
  .object({
    name: z.string(),
    category: z.enum(API_CARD_CATEGORIES),
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
    category: z.enum(API_CARD_CATEGORIES).optional(),
    endpoint: z.string().trim().optional(),
    keyExpiresAt: isoDate.nullable().optional(),
    quotaLimit: z.number().nullable().optional(),
  })
  .strict();
const Rotate = z.object({ key: z.string(), keyExpiresAt: isoDate.nullable().optional() }).strict();

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
    await this.check({ name: input.name?.trim(), endpoint: input.endpoint, quotaLimit: input.quotaLimit });
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
          // Endpoint modifié : l'erreur du dernier contrôle ne vaut plus.
          checkError: input.endpoint !== undefined && input.endpoint !== before.endpoint ? null : undefined,
          updatedBy: actor.fullName,
          version: { increment: 1 },
        },
      });
      if (input.enabled !== undefined && input.enabled !== before.enabled) await this.trace(db, actor, req, input.enabled ? 'Activation d’une carte API' : 'Désactivation d’une carte API', c.name, id);
      const fields = (['name', 'category', 'endpoint', 'quotaLimit'] as const).filter((k) => input[k] !== undefined && input[k] !== (before as any)[k]);
      if (input.keyExpiresAt !== undefined) fields.push('keyExpiresAt' as any);
      if (fields.length) await this.trace(db, actor, req, 'Modification d’une carte API', `${c.name} · ${fields.join(', ')}`, id);
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

  /** Refusée (409) tant qu'un widget consomme la carte. */
  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentActor() actor: Actor, @Req() req: Request, @Param('id') id: string) {
    const c = await this.one(id);
    if (c.widgets.length) throw conflict('IN_USE', `« ${c.name} » alimente ${c.widgets.length} widget(s) : ${c.widgets.join(', ')}`, c.widgets.map((w) => ({ entityType: 'WIDGET', id: w, label: w })));
    await this.prisma.$transaction(async (db) => {
      await db.apiCard.delete({ where: { id } });
      await this.trace(db, actor, req, 'Suppression d’une carte API', c.name, id);
    });
    this.cards.forget(id);
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
    res.status(r.code).setHeader('Content-Type', r.contentType).send(r.body);
  }
}
