import { ModelStatsService } from './model-stats.service';
import { Body, Controller, Delete, Get, HttpCode, OnModuleInit, Param, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AdminOnly, Actor, CurrentActor } from '../core/auth/auth';
import { AuditService, WriteCtx } from '../core/audit.service';
import { PrismaService } from '../core/prisma.service';
import { LlmService, AI_BUDGET_LINES, AI_FUNCTIONS, AI_GROUPS, aiFunction, aiFunctionLabel } from '../core/llm.service';
import { decodeCursor, JOURNAL_FNS, JOURNAL_PAGE, JOURNAL_PAGE_MAX, JournalFn } from '../domain/journal';
import { JobsService } from '../core/jobs.service';
import { RevectorizeService } from './revectorize.service';
import { encryptSecret, keyFingerprint } from '../core/crypto';
import { badRequest, businessRule, conflict, inUse, notFound, Usage } from '../core/errors';
import { parse } from '../core/http';
import { adminCtx } from './profiles.service';
import { round2, UsageService } from './usage.service';
import { addDays, isoInTimezone } from '../domain/dates';
import { AiModel } from '@prisma/client';
import { chainStates, costOf, effectiveDimension, fitsOut, ModelCategory, normalizeDimensions, normalizePrice, Price, priceOf, reindexRequired, REINDEX_WARNING, Volume } from '../domain/ai-pricing';

/** Fréquence du test automatique des clés (brief Console § 10.1). */
export const KEY_TEST_CRON = '0 */2 * * *';
const SYSTEM_ACTOR = { accountId: 'system', sessionId: 'system', email: 'system@rise.local', fullName: 'Système', personId: null, isAdmin: true, surface: null, restricted: false, viaCookie: false };

const ApiKey = z.string().trim().min(20, '20 caractères minimum').max(400);
/** Plafond mensuel maximal saisissable pour une clé (€). */
export const PROVIDER_CAP_MAX_EUR = 100000;

/** Catégories de modèles ; seuls les LLM peuvent servir une fonction du Cockpit ou une règle de notification. */
export const MODEL_CATEGORIES = ['LLM', 'EMBEDDING', 'RERANKING'] as const;
export const GENERATIVE_CATEGORY = 'LLM';
const MODEL_CATEGORY_LABEL: Record<string, string> = { LLM: 'LLM', EMBEDDING: 'Embedding', RERANKING: 'Reranking' };
const Category = z.preprocess((v) => (typeof v === 'string' ? v.toUpperCase() : v), z.enum(MODEL_CATEGORIES, { errorMap: () => ({ message: 'LLM, Embedding ou Reranking' }) }));
const Money = z.number().min(0, 'montant invalide');
/** Tarif : unité (TOKENS : € / M tokens ; REQUESTS : € / 1 000 requêtes) et montants selon la catégorie. */
const PriceBody = z.object({
  unit: z.preprocess((v) => (typeof v === 'string' ? v.toUpperCase() : v), z.enum(['TOKENS', 'REQUESTS'])),
  in: Money.nullable().optional(),
  out: Money.nullable().optional(),
  per1k: Money.nullable().optional(),
}).strict();
const ModelFields = z.object({
  name: z.string().trim().min(1, 'obligatoire').max(80),
  description: z.string().max(300),
  category: Category,
  /** Date de sortie AAAA-MM-JJ. */
  releaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date AAAA-MM-JJ').nullable(),
  /** Longueur maximale d'une réponse (LLM). */
  maxOutputTokens: z.number().int('nombre entier').positive('entier > 0').max(10_000_000).nullable(),
  /** Identifiant chez le fournisseur (ex. qwen/qwen3-embedding-8b). */
  providerModelId: z.string().trim().max(160).nullable(),
  /** Longueur de contexte (tokens). */
  contextTokens: z.number().int('nombre entier').positive('entier > 0').max(100_000_000).nullable(),
  /** Dimensions de sortie acceptées et valeur par défaut (Embedding). */
  dimensions: z.array(z.number().int('nombre entier')).max(64),
  defaultDimension: z.number().int('nombre entier').nullable(),
  price: PriceBody,
  /** Tarifs au token à plat (compatibilité avec la première version de l'API). */
  priceIn: Money,
  priceOut: Money,
  active: z.boolean(),
  /** Mesures OpenRouter (06/10/2026) : identifiant OpenRouter, Intelligence Index, coût d'une session de 10 à 49 tours (€), débit (tokens/s). */
  openrouterId: z.string().trim().max(160).nullable(),
  benchmarkScore: z.number().min(0, '0 à 100').max(100, '0 à 100').nullable(),
  costPerSessionEur: z.number().min(0, 'positif').max(1000).nullable(),
  tokensPerSecond: z.number().min(0, 'positif').max(100_000).nullable(),
}).partial();
/** Mesures OpenRouter saisies (champs absents : inchangés). */
const statsOf = (i: z.infer<typeof ModelFields>) => ({
  ...(i.openrouterId !== undefined ? { openrouterId: i.openrouterId || null } : {}),
  ...(i.benchmarkScore !== undefined ? { benchmarkScore: i.benchmarkScore } : {}),
  ...(i.costPerSessionEur !== undefined ? { costPerSessionEur: i.costPerSessionEur } : {}),
  ...(i.tokensPerSecond !== undefined ? { tokensPerSecond: i.tokensPerSecond } : {}),
});
const ModelCreate = ModelFields.extend({ name: ModelFields.shape.name.unwrap(), category: Category, providerId: z.string().min(1, 'obligatoire') }).strict();

/**
 * Volume réel des 30 derniers jours (M tokens, requêtes) ; `null` pour une fonction estimée (`est`) tant
 * qu'elle n'a aucun appel : l'écran affiche alors l'estimation préfixée « ≈ » (spécification IA § 8).
 */
function volOf(f: { est?: unknown }, v: Volume): { in: number; out: number; req: number } | null {
  if (f.est && !v.tokensIn && !v.tokensOut && !v.requests) return null;
  return { in: v.tokensIn / 1e6, out: v.tokensOut / 1e6, req: v.requests };
}

/** Identifiant lisible d'un modèle : nom sans accents ni ponctuation (« Claude Sonnet 4.5 » → claude-sonnet-4-5). */
function modelSlug(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'modele';
}

/** Fournisseurs, modèles, affectation, consommation et plafonds (brief Console § 9.4-9.6). */
@ApiTags('console · intelligence artificielle')
@ApiBearerAuth()
@AdminOnly()
@Controller('api/admin')
export class AiController implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly llm: LlmService,
    private readonly usage: UsageService,
    private readonly jobs: JobsService,
    private readonly revectorizer: RevectorizeService,
    private readonly stats: ModelStatsService,
  ) {}

  onModuleInit() {
    this.jobs.register('providers.test', () => this.testAllInternal({ actor: SYSTEM_ACTOR, projectId: null, profileUsed: null, origin: 'SYSTEM' }).then(() => undefined));
    this.jobs.schedule('providers.test', KEY_TEST_CRON);
  }

  // ───────────── Fournisseurs ─────────────

  /** Jamais de clé en clair : préfixe et 4 derniers caractères uniquement (§ 4). */
  private async providerViews() {
    const [providers, models, asg] = await Promise.all([this.prisma.provider.findMany({ orderBy: { createdAt: 'asc' } }), this.prisma.aiModel.findMany(), this.prisma.modelAssignment.findMany()]);
    const out = [];
    for (const p of providers) {
      const onFallback = [];
      for (const a of asg) {
        const primary = models.find((m) => m.id === a.primaryModelId);
        if (primary?.providerId === p.id && p.status !== 'OK' && (await this.usage.functionState(a.primaryModelId, a.fallbackModelId, aiFunction(a.functionId)?.category)) === 'FALLBACK') onFallback.push(a.functionId);
      }
      out.push({ id: p.id, name: p.name, keyPrefix: p.keyPrefix, keyLast4: p.keyLast4, hasKey: !!p.keyCipher, monthlyCapEur: p.monthlyCapEur, status: p.status, latencyMs: p.latencyMs, lastTestedAt: p.lastTestedAt, lastError: p.lastError, functionsOnFallback: onFallback, modelCount: models.filter((m) => m.providerId === p.id).length, version: p.version });
    }
    return out;
  }

  @Get('providers')
  providers() {
    return this.providerViews();
  }

  private async test(id: string, ctx: WriteCtx) {
    const p = await this.prisma.provider.findUnique({ where: { id } });
    if (!p) throw notFound('Fournisseur introuvable');
    const r = await this.llm.ping(p);
    await this.prisma.provider.update({ where: { id }, data: { status: r.status, latencyMs: r.latencyMs, lastError: r.error, lastTestedAt: new Date(), version: { increment: 1 } } });
    if (r.status === 'ERROR' && p.status !== 'ERROR') {
      // Une clé en erreur bascule les fonctions sur leur secours ; alerte critique (§ 10.1).
      await this.audit.action(this.prisma, ctx, { action: 'Échec du test de clé API', target: `${p.name} · ${r.error}`, severity: 'CRITICAL', entityType: 'Provider', entityId: id });
    }
    return r;
  }

  @Post('providers')
  async create(@CurrentActor() actor: Actor, @Body() body: unknown) {
    const input = parse(z.object({ name: z.string().trim().min(2, '2 caractères minimum').max(60), apiKey: ApiKey }).strict(), body);
    const id = input.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!id || (await this.prisma.provider.findUnique({ where: { id } }))) throw conflict('DUPLICATE', `Le fournisseur « ${input.name} » existe déjà`);
    const fp = keyFingerprint(input.apiKey);
    await this.prisma.$transaction(async (db) => {
      await db.provider.create({ data: { id, name: input.name, keyPrefix: fp.prefix, keyLast4: fp.last4, keyCipher: encryptSecret(input.apiKey), status: 'UNTESTED' } });
      await this.audit.action(db, adminCtx(actor), { action: 'Ajout d’un fournisseur LLM', target: input.name, severity: 'CRITICAL', entityType: 'Provider', entityId: id });
    });
    await this.test(id, adminCtx(actor));
    return (await this.providerViews()).find((p) => p.id === id);
  }

  /** Remplacer une clé : stockage chiffré, test immédiat, action critique (§ 7.2). */
  @Put('providers/:id/key')
  async rotate(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() body: unknown) {
    const { apiKey } = parse(z.object({ apiKey: ApiKey }).strict(), body);
    const p = await this.prisma.provider.findUnique({ where: { id } });
    if (!p) throw notFound('Fournisseur introuvable');
    const fp = keyFingerprint(apiKey);
    await this.prisma.$transaction(async (db) => {
      await db.provider.update({ where: { id }, data: { keyPrefix: fp.prefix, keyLast4: fp.last4, keyCipher: encryptSecret(apiKey), status: 'UNTESTED', lastError: null, version: { increment: 1 } } });
      await this.audit.action(db, adminCtx(actor), { action: 'Rotation de clé API', target: p.name, severity: 'CRITICAL', entityType: 'Provider', entityId: id });
    });
    await this.test(id, adminCtx(actor));
    return (await this.providerViews()).find((x) => x.id === id);
  }

  /**
   * Plafond de dépense mensuel de la clé (€, null = sans plafond ; 05/10/2026) : rappel de la limite fixée chez le
   * fournisseur, repris par Partager Cockpit (« Dépense IA possible »). Action sensible.
   */
  @Put('providers/:id/cap')
  async cap(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() body: unknown) {
    const { monthlyCapEur } = parse(z.object({ monthlyCapEur: z.number().int('Montant entier en euros').min(1, '1 € minimum').max(PROVIDER_CAP_MAX_EUR, `${PROVIDER_CAP_MAX_EUR} € maximum`).nullable() }).strict(), body);
    const p = await this.prisma.provider.findUnique({ where: { id } });
    if (!p) throw notFound('Fournisseur introuvable');
    await this.prisma.$transaction(async (db) => {
      await db.provider.update({ where: { id }, data: { monthlyCapEur, version: { increment: 1 } } });
      await this.audit.action(db, adminCtx(actor), { action: 'Plafond mensuel d’une clé API', target: `${p.name} · ${monthlyCapEur === null ? 'sans plafond' : monthlyCapEur + ' € / mois'}`, severity: 'SENSITIVE', entityType: 'Provider', entityId: id, details: { avant: p.monthlyCapEur, apres: monthlyCapEur } });
    });
    return (await this.providerViews()).find((x) => x.id === id);
  }

  @Post('providers/:id/test')
  @HttpCode(200)
  async testOne(@CurrentActor() actor: Actor, @Param('id') id: string) {
    await this.test(id, adminCtx(actor));
    return (await this.providerViews()).find((x) => x.id === id);
  }

  private async testAllInternal(ctx: WriteCtx) {
    const ids = (await this.prisma.provider.findMany({ select: { id: true } })).map((p) => p.id);
    await Promise.all(ids.map((id) => this.test(id, ctx)));
    return this.providerViews();
  }

  /** Tester toutes les clés, en parallèle. */
  @Post('providers/test-all')
  @HttpCode(200)
  testAll(@CurrentActor() actor: Actor) {
    return this.testAllInternal(adminCtx(actor));
  }

  // ───────────── Modèles ─────────────

  private modelView(m: AiModel) {
    const price = priceOf(m);
    return {
      id: m.id, providerId: m.providerId, name: m.name, description: m.description, category: m.category,
      releaseDate: m.releaseDate ? m.releaseDate.toISOString().slice(0, 10) : null,
      maxOutputTokens: m.maxOutputTokens,
      providerModelId: m.providerModelId, contextTokens: m.contextTokens,
      dimensions: m.dimensions, defaultDimension: m.defaultDimension,
      price,
      // Compatibilité : tarifs au token à plat (null si sans objet).
      priceIn: m.priceInPerMTok, priceOut: m.priceOutPerMTok,
      openrouterId: m.openrouterId, benchmarkScore: m.benchmarkScore, costPerSessionEur: m.costPerSessionEur, tokensPerSecond: m.tokensPerSecond,
      statsAt: m.statsAt ? m.statsAt.toISOString() : null,
      active: m.active, version: m.version,
    };
  }

  @Get('models')
  async models(@Query('provider') provider?: string) {
    const rows = await this.prisma.aiModel.findMany({ where: provider ? { providerId: provider } : {}, orderBy: { createdAt: 'asc' } });
    return rows.map((m) => this.modelView(m));
  }

  /**
   * État final d'un modèle (création, ou modification fusionnée avec l'existant), contrôlé selon sa catégorie :
   * date de sortie (pas dans le futur ; obligatoire à la création), max output tokens (LLM seulement,
   * entier > 0, obligatoire pour un LLM créé), tarif adapté (`normalizePrice`).
   */
  private checkModel(input: z.infer<typeof ModelFields>, before: AiModel | null) {
    const category = (input.category ?? before?.category ?? 'LLM') as ModelCategory;
    const fields: Record<string, string> = {};
    const release = input.releaseDate !== undefined ? input.releaseDate : before?.releaseDate ? before.releaseDate.toISOString().slice(0, 10) : null;
    if (!before && !release) fields.releaseDate = 'obligatoire';
    if (release && release > new Date().toISOString().slice(0, 10)) fields.releaseDate = 'ne peut pas être dans le futur';
    let maxOut = input.maxOutputTokens !== undefined ? input.maxOutputTokens : (before?.maxOutputTokens ?? null);
    if (category !== 'LLM') maxOut = null;
    else if (!before && maxOut == null) fields.maxOutputTokens = 'obligatoire pour un LLM';
    const priceIn: Partial<Price> = input.price
      ? { unit: input.price.unit, in: input.price.in ?? null, out: input.price.out ?? null, per1k: input.price.per1k ?? null }
      : {
          unit: (before?.priceUnit as Price['unit']) ?? 'TOKENS',
          in: input.priceIn !== undefined ? input.priceIn : (before?.priceInPerMTok ?? null),
          out: input.priceOut !== undefined ? input.priceOut : (before?.priceOutPerMTok ?? null),
          per1k: before?.pricePer1kRequests ?? null,
        };
    // Changement de catégorie vers un tarif au token sans sortie : la sortie d'un ancien LLM est abandonnée.
    const priced = normalizePrice(category, priceIn);
    if ('errors' in priced) Object.assign(fields, priced.errors);
    // Dimensions : Embedding seulement ; obligatoires à la création, facultatives pour un modèle déjà saisi sans elles.
    const dimsIn = input.dimensions !== undefined ? input.dimensions : (before?.dimensions ?? []);
    const defIn = input.defaultDimension !== undefined ? input.defaultDimension : (before?.defaultDimension ?? null);
    const dims = category === 'EMBEDDING' && !dimsIn.length && before ? { dimensions: [], defaultDimension: null } : normalizeDimensions(category, dimsIn, defIn);
    if ('errors' in dims) Object.assign(fields, dims.errors);
    if (Object.keys(fields).length) throw badRequest('Modèle invalide', fields);
    const price = (priced as { price: Price }).price;
    return {
      category,
      releaseDate: release ? new Date(release) : null,
      maxOutputTokens: maxOut,
      providerModelId: input.providerModelId !== undefined ? input.providerModelId || null : (before?.providerModelId ?? null),
      contextTokens: input.contextTokens !== undefined ? input.contextTokens : (before?.contextTokens ?? null),
      ...(dims as { dimensions: number[]; defaultDimension: number | null }),
      priceUnit: price.unit,
      priceInPerMTok: price.in,
      priceOutPerMTok: price.out,
      pricePer1kRequests: price.per1k,
    };
  }

  private priceText(m: AiModel) {
    const p = priceOf(m);
    return p.unit === 'REQUESTS' ? `${p.per1k} € / 1 000 requêtes` : p.out != null ? `${p.in}/${p.out} €/MTok` : `${p.in} €/MTok en entrée`;
  }

  /** Ajout d'un modèle à un fournisseur existant (action sensible, tracée). */
  @Post('models')
  async createModel(@CurrentActor() actor: Actor, @Body() body: unknown) {
    const input = parse(ModelCreate, body);
    const provider = await this.prisma.provider.findUnique({ where: { id: input.providerId } });
    if (!provider) throw badRequest('Fournisseur inconnu', { providerId: 'introuvable' });
    if (await this.prisma.aiModel.findFirst({ where: { providerId: input.providerId, name: { equals: input.name, mode: 'insensitive' } } })) {
      throw conflict('DUPLICATE', `${provider.name} a déjà un modèle « ${input.name} »`);
    }
    const data = this.checkModel(input as z.infer<typeof ModelFields>, null);
    const base = modelSlug(input.name);
    let id = base;
    for (let n = 2; await this.prisma.aiModel.findUnique({ where: { id } }); n++) id = `${base}-${n}`;
    const row = await this.prisma.$transaction(async (db) => {
      const row = await db.aiModel.create({ data: { id, providerId: input.providerId, name: input.name, description: input.description ?? '', active: input.active ?? true, ...data, ...statsOf(input) } });
      await this.audit.action(db, adminCtx(actor), {
        action: 'Ajout d’un modèle', target: `${row.name} · ${provider.name} · ${MODEL_CATEGORY_LABEL[row.category]} · ${this.priceText(row)}`,
        severity: 'SENSITIVE', entityType: 'AiModel', entityId: id,
      });
      return row;
    });
    return this.modelView(row);
  }

  /** Usages qui empêchent de supprimer un modèle : affectation, règle de notification, historique de consommation. */
  private async modelUsages(id: string): Promise<Usage[]> {
    const out: Usage[] = [];
    for (const a of await this.prisma.modelAssignment.findMany({ where: { OR: [{ primaryModelId: id }, { fallbackModelId: id }] } })) {
      const fn = aiFunction(a.functionId)?.short ?? a.functionId;
      out.push({ entityType: 'MODEL_ASSIGNMENT', id: a.functionId, label: `${a.primaryModelId === id ? 'Principal' : 'Secours'} de ${fn}` });
    }
    for (const r of await this.prisma.notificationRule.findMany({ where: { modelId: id }, select: { id: true, name: true } })) {
      out.push({ entityType: 'NOTIFICATION_RULE', id: r.id, label: `Règle « ${r.name} »` });
    }
    const records = await this.prisma.usageRecord.count({ where: { modelId: id } });
    if (records) out.push({ entityType: 'USAGE_RECORD', id, label: `${records} ligne(s) de consommation (désactivez le modèle pour le retirer de l’affectation)` });
    return out;
  }

  /** Suppression d'un modèle jamais utilisé ; sinon 409 IN_USE avec les usages (le désactiver reste possible). */
  @Delete('models/:id')
  @HttpCode(204)
  async deleteModel(@CurrentActor() actor: Actor, @Param('id') id: string) {
    const m = await this.prisma.aiModel.findUnique({ where: { id } });
    if (!m) throw notFound('Modèle introuvable');
    const usages = await this.modelUsages(id);
    if (usages.length) throw inUse(usages);
    await this.prisma.$transaction(async (db) => {
      await db.aiModel.delete({ where: { id } });
      await this.audit.action(db, adminCtx(actor), { action: 'Suppression d’un modèle', target: m.name, severity: 'SENSITIVE', entityType: 'AiModel', entityId: id });
    });
  }

  /** Relevé des mesures OpenRouter à la demande (Intelligence Index, coût d'une session, débit) ; tracé. */
  @Post('models/stats/refresh')
  @HttpCode(200)
  async refreshStats(@CurrentActor() actor: Actor) {
    const r = await this.stats.refresh();
    await this.audit.action(this.prisma, adminCtx(actor), { action: 'Relevé des mesures OpenRouter', target: `${r.updated} modèle(s) mesuré(s) sur ${r.total} LLM`, severity: 'INFO', entityType: 'AiModel', details: r });
    return { ...r, models: (await this.prisma.aiModel.findMany({ orderBy: { createdAt: 'asc' } })).map((m) => this.modelView(m)) };
  }

  @Patch('models/:id')
  async patchModel(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() body: unknown) {
    const input = parse(ModelFields.strict(), body);
    const m = await this.prisma.aiModel.findUnique({ where: { id } });
    if (!m) throw notFound('Modèle introuvable');
    if (input.active === false && m.active) {
      // Un modèle affecté (principal ou secours) ne se désactive pas : seuls les modèles actifs sont proposés et
      // servent (vue « Fournisseurs et modèles », 02/10/2026). 409 avec les affectations à modifier.
      const uses = await this.prisma.modelAssignment.findMany({ where: { OR: [{ primaryModelId: id }, { fallbackModelId: id }] } });
      if (uses.length) {
        const list = uses.map((u) => ({ entityType: 'MODEL_ASSIGNMENT', id: u.functionId, label: `${u.primaryModelId === id ? 'Principal' : 'Secours'} de ${aiFunction(u.functionId)?.short ?? u.functionId}` }));
        throw conflict('MODEL_IN_USE', `${m.name} est affecté (${list.map((l) => l.label).join(', ')}) — réaffectez-le avant de le désactiver`, list);
      }
    }
    if (input.category && input.category !== m.category) {
      // Une fonction n'accepte qu'une catégorie ; une règle de notification rédige avec un LLM.
      const usages = (await this.modelUsages(id)).filter((u) => (u.entityType === 'MODEL_ASSIGNMENT' && aiFunction(u.id)?.category !== input.category) || (u.entityType === 'NOTIFICATION_RULE' && input.category !== 'LLM'));
      if (usages.length) throw conflict('MODEL_IN_USE', `${m.name} est utilisé comme ${MODEL_CATEGORY_LABEL[m.category]} : ${usages.map((u) => u.label).join(', ')} — changez d'abord l'affectation`, usages);
    }
    const data = this.checkModel(input, m);
    for (const a of await this.prisma.modelAssignment.findMany({ where: { OR: [{ primaryModelId: id }, { fallbackModelId: id }] } })) {
      const d = a.primaryModelId === id ? a.primaryDimension : a.fallbackDimension;
      if (d != null && data.dimensions.length && !data.dimensions.includes(d)) {
        throw conflict('DIMENSION_IN_USE', `La dimension ${d} est utilisée par ${aiFunctionLabel(a.functionId)} — changez d'abord l'affectation`, [{ entityType: 'MODEL_ASSIGNMENT', id: a.functionId, label: `${aiFunctionLabel(a.functionId)} · ${d} dimensions` }]);
      }
    }
    const priceChanged = data.priceUnit !== m.priceUnit || data.priceInPerMTok !== m.priceInPerMTok || data.priceOutPerMTok !== m.priceOutPerMTok || data.pricePer1kRequests !== m.pricePer1kRequests;
    const row = await this.prisma.$transaction(async (db) => {
      const row = await db.aiModel.update({ where: { id }, data: { name: input.name, description: input.description, active: input.active, ...data, ...statsOf(input), version: { increment: 1 } } });
      const ctx = adminCtx(actor);
      if (priceChanged) await this.audit.action(db, ctx, { action: 'Modification du tarif d’un modèle', target: `${m.name} · ${this.priceText(m)} → ${this.priceText(row)}`, severity: 'SENSITIVE', entityType: 'AiModel', entityId: id });
      if (input.active !== undefined && input.active !== m.active) await this.audit.action(db, ctx, { action: input.active ? 'Activation d’un modèle' : 'Désactivation d’un modèle', target: m.name, severity: 'SENSITIVE', entityType: 'AiModel', entityId: id });
      const infoChanged = (input.name && input.name !== m.name) || (input.description !== undefined && input.description !== m.description)
        || +(row.releaseDate ?? 0) !== +(m.releaseDate ?? 0) || row.maxOutputTokens !== m.maxOutputTokens
        || row.providerModelId !== m.providerModelId || row.contextTokens !== m.contextTokens || row.defaultDimension !== m.defaultDimension || row.dimensions.join() !== m.dimensions.join()
        || row.openrouterId !== m.openrouterId || row.benchmarkScore !== m.benchmarkScore || row.costPerSessionEur !== m.costPerSessionEur || row.tokensPerSecond !== m.tokensPerSecond;
      if (infoChanged) await this.audit.action(db, ctx, { action: 'Modification d’un modèle', target: row.name, severity: 'INFO', entityType: 'AiModel', entityId: id });
      if (input.category && input.category !== m.category) await this.audit.action(db, ctx, { action: 'Changement de catégorie d’un modèle', target: `${row.name} · ${MODEL_CATEGORY_LABEL[m.category]} → ${MODEL_CATEGORY_LABEL[row.category]}`, severity: 'SENSITIVE', entityType: 'AiModel', entityId: id });
      return row;
    });
    return this.modelView(row);
  }

  // ───────────── Fonctions et affectation ─────────────

  /** Volume réel des 30 derniers jours par fonction : tokens en entrée, en sortie et requêtes. */
  private async volumes30d() {
    // Fin de fenêtre : la plus tardive de la date du jour de la plateforme (DEMO_TODAY éventuel) et de la date
    // réelle, pour compter les appels réels horodatés après une date de démonstration.
    const today = [this.usage.todayIso(), isoInTimezone(new Date(), 'Europe/Paris')].sort().pop()!;
    const rows = await this.usage.records(addDays(today, -29), today);
    const out: Record<string, Volume> = {};
    for (const f of AI_FUNCTIONS) out[f.id] = { tokensIn: 0, tokensOut: 0, requests: 0 };
    // Sortie requise : le plus long rendu mesuré sur 30 jours (une ligne par appel), sinon la valeur déclarée.
    const maxOut: Record<string, number> = {};
    for (const r of rows) {
      const v = out[r.functionId];
      if (!v) continue;
      maxOut[r.functionId] = Math.max(maxOut[r.functionId] ?? 0, r.tokensOut);
      v.tokensIn += r.tokensIn;
      v.tokensOut += r.tokensOut;
      v.requests += r.requests;
    }
    const needOut = Object.fromEntries(AI_FUNCTIONS.filter((f) => f.category === 'LLM' && f.needOut).map((f) => [f.id, maxOut[f.id] || f.needOut!]));
    return { rows, volumes: out, needOut: needOut as Record<string, number | undefined> };
  }

  /** Fonctions IA : catégorie acceptée, chaîne et rang, volume réel des 30 derniers jours (spécification IA § 2). */
  @Get('functions')
  async functions() {
    const { volumes, needOut } = await this.volumes30d();
    return {
      functions: AI_FUNCTIONS.map((f) => ({ id: f.id, name: f.name, short: f.short, description: f.description, category: f.category, group: f.group ?? null, step: f.step ?? null, budgetLine: f.budgetLine, isNew: !!f.isNew, needOut: needOut[f.id] ?? null, scope: f.scope ?? 'cockpit', est: f.est ?? null, vol: volOf(f, volumes[f.id]), volume30d: volumes[f.id] })),
      groups: Object.entries(AI_GROUPS).map(([id, g]) => ({ id, name: g.name, description: g.description })),
    };
  }

  @Get('assignments')
  async assignments() {
    const [asg, models] = await Promise.all([this.prisma.modelAssignment.findMany(), this.prisma.aiModel.findMany()]);
    const { rows, volumes, needOut } = await this.volumes30d();
    const est = (fid: string, mid: string | null | undefined) => {
      const m = models.find((x) => x.id === mid);
      return m ? round2(costOf(m, volumes[fid])) : null;
    };
    const raw = await Promise.all(
      AI_FUNCTIONS.map(async (f) => {
        const a = asg.find((x) => x.functionId === f.id);
        return a ? this.usage.functionState(a.primaryModelId, a.fallbackModelId, f.category) : ('UNAVAILABLE' as const);
      }),
    );
    // Chaîne : une étape indisponible suspend les suivantes (BLOCKED).
    const state: Record<string, string> = {};
    AI_FUNCTIONS.forEach((f, i) => (state[f.id] = raw[i]));
    for (const g of Object.keys(AI_GROUPS)) {
      const steps = AI_FUNCTIONS.filter((f) => f.group === g).sort((a, b) => a.step! - b.step!);
      chainStates(steps.map((f) => state[f.id] as 'NOMINAL' | 'FALLBACK' | 'UNAVAILABLE')).forEach((s, i) => (state[steps[i].id] = s));
    }
    return AI_FUNCTIONS.map((f) => {
      const a = asg.find((x) => x.functionId === f.id);
      const fr = rows.filter((r) => r.functionId === f.id);
      const byModel = [...new Set(fr.map((r) => r.modelId))].map((mid) => {
        const mr = fr.filter((r) => r.modelId === mid);
        return { modelId: mid, costEur: round2(mr.reduce((s, r) => s + r.costEur, 0)), tokensIn: mr.reduce((s, r) => s + r.tokensIn, 0), tokensOut: mr.reduce((s, r) => s + r.tokensOut, 0), requests: mr.reduce((s, r) => s + r.requests, 0) };
      });
      return {
        functionId: f.id,
        name: f.name,
        short: f.short,
        description: f.description,
        category: f.category,
        group: f.group ?? null,
        step: f.step ?? null,
        isNew: !!f.isNew,
        scope: f.scope ?? 'cockpit',
        est: f.est ?? null,
        vol: volOf(f, volumes[f.id]),
        // Capacité de sortie : un LLM dont le max output tokens est inférieur tronquerait les rendus longs.
        needOut: needOut[f.id] ?? null,
        fits: needOut[f.id] ? { primary: fitsOut(needOut[f.id]!, models.find((m) => m.id === a?.primaryModelId)), fallback: a?.fallbackModelId ? fitsOut(needOut[f.id]!, models.find((m) => m.id === a.fallbackModelId)) : null } : null,
        primary: a?.primaryModelId ?? null,
        fallback: a?.fallbackModelId ?? null,
        // Taille des vecteurs (Embedding) : choisie, sinon la valeur par défaut du modèle.
        dimension: f.category === 'EMBEDDING' && a ? effectiveDimension(a.primaryDimension, models.find((m) => m.id === a.primaryModelId)) : null,
        fallbackDimension: f.category === 'EMBEDDING' && a?.fallbackModelId ? effectiveDimension(a.fallbackDimension, models.find((m) => m.id === a.fallbackModelId)) : null,
        state: state[f.id],
        volume30d: volumes[f.id],
        // Coût mensuel estimé = volume des 30 derniers jours × tarif du modèle (tokens ou requêtes, § 3).
        estimatedMonthlyCost: { primary: est(f.id, a?.primaryModelId), fallback: est(f.id, a?.fallbackModelId) },
        costByModel: byModel,
        version: a?.version ?? 0,
      };
    });
  }

  /**
   * Affectation : un principal et un secours facultatif par fonction, de la catégorie de la fonction (422 sinon),
   * principal actif, secours différent du principal. Une entrée d'audit par changement (principal, secours).
   */
  @Put('assignments')
  async putAssignments(@CurrentActor() actor: Actor, @Body() body: unknown) {
    const pair = z.object({ primary: z.string().min(1), fallback: z.string().min(1).nullable().optional(), dimension: z.number().int().nullable().optional(), fallbackDimension: z.number().int().nullable().optional() }).strict();
    const input = parse(z.object(Object.fromEntries(AI_FUNCTIONS.map((f) => [f.id, pair]))).partial().strict(), body) as Record<string, z.infer<typeof pair> | undefined>;
    const models = await this.prisma.aiModel.findMany();
    const asgBefore = await this.prisma.modelAssignment.findMany();
    let revectorize = false;
    for (const [fn, v] of Object.entries(input)) {
      if (!v) continue;
      const cat = aiFunction(fn)!.category;
      const pm = models.find((m) => m.id === v.primary);
      if (!pm) throw badRequest('Modèle inconnu', { [`${fn}.primary`]: 'introuvable' });
      if (!pm.active) throw businessRule('Le modèle principal doit être actif', { [`${fn}.primary`]: `${pm.name} est inactif` });
      if (pm.category !== cat) throw businessRule(`Cette fonction n’accepte qu’un modèle ${MODEL_CATEGORY_LABEL[cat]}`, { [`${fn}.primary`]: `${pm.name} est un modèle ${MODEL_CATEGORY_LABEL[pm.category]}` });
      if (v.fallback && aiFunction(fn)!.noFallback) throw businessRule('La vectorisation n’accepte pas de modèle de secours : changer de modèle impose de revectoriser les documents', { [`${fn}.fallback`]: 'non autorisé' });
      if (v.fallback) {
        const fm = models.find((m) => m.id === v.fallback);
        if (!fm) throw badRequest('Modèle inconnu', { [`${fn}.fallback`]: 'introuvable' });
        if (v.fallback === v.primary) throw businessRule('Le secours doit différer du principal', { [`${fn}.fallback`]: 'identique au principal' });
        if (!fm.active && fm.id !== asgBefore.find((a) => a.functionId === fn)?.fallbackModelId) throw businessRule('Le modèle de secours doit être actif', { [`${fn}.fallback`]: `${fm.name} est inactif` });
        if (fm.category !== cat) throw businessRule(`Cette fonction n’accepte qu’un modèle ${MODEL_CATEGORY_LABEL[cat]}`, { [`${fn}.fallback`]: `${fm.name} est un modèle ${MODEL_CATEGORY_LABEL[fm.category]}` });
      }
      // Dimension : seulement pour un Embedding, et parmi celles que le modèle accepte.
      for (const [slot, mid, d] of [['dimension', v.primary, v.dimension], ['fallbackDimension', v.fallback, v.fallbackDimension]] as const) {
        if (d == null) continue;
        const mm = models.find((m) => m.id === mid);
        if (cat !== 'EMBEDDING' || !mm) throw badRequest('Dimension sans objet', { [`${fn}.${slot}`]: 'réservée à un modèle d’embedding' });
        if (mm.dimensions.length && !mm.dimensions.includes(d)) throw businessRule(`${mm.name} ne produit pas de vecteurs de ${d} dimensions`, { [`${fn}.${slot}`]: `valeurs acceptées : ${mm.dimensions.join(', ')}` });
      }
    }
    await this.prisma.$transaction(async (db) => {
      for (const [fn, v] of Object.entries(input)) {
        if (!v) continue;
        const before = await db.modelAssignment.findUnique({ where: { functionId: fn } });
        const dimsData = aiFunction(fn)!.category === 'EMBEDDING'
          ? { primaryDimension: effectiveDimension(v.dimension, models.find((m) => m.id === v.primary)), fallbackDimension: v.fallback ? effectiveDimension(v.fallbackDimension, models.find((m) => m.id === v.fallback)) : null }
          : { primaryDimension: null, fallbackDimension: null };
        await db.modelAssignment.upsert({ where: { functionId: fn }, create: { functionId: fn, primaryModelId: v.primary, fallbackModelId: v.fallback ?? null, ...dimsData }, update: { primaryModelId: v.primary, fallbackModelId: v.fallback ?? null, ...dimsData, version: { increment: 1 } } });
        const f = aiFunction(fn)!;
        const label = f.group ? `${AI_GROUPS[f.group].name} · étape ${f.step} · ${f.name}` : f.name;
        const name = (id: string | null | undefined) => models.find((m) => m.id === id)?.name ?? '—';
        if (before?.primaryModelId !== v.primary) await this.audit.action(db, adminCtx(actor), { action: 'Changement de modèle principal', target: `${label} → ${name(v.primary)}`, severity: 'SENSITIVE', entityType: 'ModelAssignment', entityId: fn });
        if ((before?.fallbackModelId ?? null) !== (v.fallback ?? null)) await this.audit.action(db, adminCtx(actor), { action: 'Changement de modèle de secours', target: `${label} → ${name(v.fallback)}`, severity: 'SENSITIVE', entityType: 'ModelAssignment', entityId: fn });
        // Embedding : un changement de modèle ou de dimension oblige à réindexer les documents (tracé, critique).
        if (f.category === 'EMBEDDING' && before && reindexRequired({ modelId: before.primaryModelId, dimension: effectiveDimension(before.primaryDimension, models.find((m) => m.id === before.primaryModelId)) }, { modelId: v.primary, dimension: dimsData.primaryDimension })) {
          await this.audit.action(db, adminCtx(actor), { action: 'Revectorisation des documents planifiée', target: `${label} : ${name(before.primaryModelId)} → ${name(v.primary)} · ${dimsData.primaryDimension ?? '—'} dimensions`, severity: 'CRITICAL', entityType: 'ModelAssignment', entityId: fn, details: { warning: REINDEX_WARNING } });
          revectorize = true;
        }
      }
    });
    // Revectorisation automatique de la Base de connaissance et des guides (décision du 02/10/2026).
    if (revectorize) this.revectorizer.start();
    return this.assignments();
  }

  // ───────────── Consommation et plafonds ─────────────

  @Get('usage/month')
  month() {
    return this.usage.month();
  }

  @Get('usage')
  async series(@Query('from') from?: string, @Query('to') to?: string, @Query('groupBy') groupBy = 'day', @Query('projectId') projectId?: string) {
    const today = this.usage.todayIso();
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    const t = to && iso.test(to) ? to : today;
    const f = from && iso.test(from) ? from : addDays(t, -29);
    if (f > t) throw badRequest('Période invalide', { from: 'postérieure à la date de fin' });
    if (!['day', 'function', 'step', 'model', 'provider'].includes(groupBy)) throw badRequest('Regroupement invalide', { groupBy: 'day, function, step, model ou provider' });
    return this.usage.series(f, t, groupBy, projectId);
  }

  @Get('usage/export.csv')
  async exportCsv(@CurrentActor() actor: Actor, @Res() res: any, @Query('from') from?: string, @Query('to') to?: string) {
    const today = this.usage.todayIso();
    const t = to ?? today;
    const f = from ?? addDays(t, -29);
    const rows = await this.usage.records(f, t);
    const lines = ['date;projet;fonction;modele;fournisseur;tokens_entree;tokens_sortie;cout_eur;secours;source', ...rows.map((r) => [r.at.toISOString(), r.projectId ?? '', r.functionId, r.modelId, r.providerId, r.tokensIn, r.tokensOut, r.costEur.toFixed(4).replace('.', ','), r.fallbackUsed ? 'oui' : 'non', r.source].join(';'))];
    await this.audit.action(this.prisma, adminCtx(actor), { action: 'Export de la consommation IA', target: `${f} → ${t}`, severity: 'INFO', entityType: 'UsageRecord' });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="consommation-ia-${f}-${t}.csv"`);
    res.end('﻿' + lines.join('\n'));
  }

  // ───────────── Journal des appels (spécification JOURNAL § 4) ─────────────

  /** Période et filtres du journal : par défaut, le mois de la date du jour (du 1er à aujourd'hui). */
  private journalQuery(q: Record<string, string | undefined>) {
    const today = this.usage.todayIso();
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    if ((q.from && !iso.test(q.from)) || (q.to && !iso.test(q.to))) throw badRequest('Date invalide', { from: 'AAAA-MM-JJ', to: 'AAAA-MM-JJ' });
    const to = q.to ?? today;
    const from = q.from ?? `${to.slice(0, 8)}01`;
    if (from > to) throw badRequest('Période invalide', { from: 'postérieure à la date de fin' });
    if (addDays(from, 366) < to) throw badRequest('Période trop longue', { from: '366 jours au plus' });
    if (q.fn && !(JOURNAL_FNS as readonly string[]).includes(q.fn)) throw badRequest('Fonction inconnue', { fn: JOURNAL_FNS.join(', ') });
    if (q.provider && !/^[a-z0-9_-]{1,40}$/.test(q.provider)) throw badRequest('Fournisseur invalide', { provider: 'identifiant du fournisseur' });
    return { from, to, fn: q.fn as JournalFn | undefined, provider: q.provider || undefined };
  }

  /** Un point par jour, jours vides inclus : jetons et coût d'entrée et de sortie, appels ; `by=hour` : par heure d'une journée. */
  @Get('usage/daily')
  daily(@Query() q: Record<string, string>) {
    const j = this.journalQuery(q);
    if (q.by !== undefined && q.by !== 'hour') throw badRequest('Découpage invalide', { by: 'hour' });
    if (q.by === 'hour' && j.from !== j.to) throw badRequest('Découpage par heure : une seule journée', { by: 'from = to attendu' });
    return this.usage.daily(j.from, j.to, j.fn, q.by === 'hour');
  }

  /** Journal : du plus récent au plus ancien, pagination par curseur (`nextCursor`), `total` du filtre. */
  @Get('usage/calls')
  calls(@Query() q: Record<string, string>) {
    const j = this.journalQuery(q);
    const limit = q.limit === undefined ? JOURNAL_PAGE : Number(q.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > JOURNAL_PAGE_MAX) throw badRequest('Taille de page invalide', { limit: `1 à ${JOURNAL_PAGE_MAX}` });
    const cursor = q.cursor ? decodeCursor(q.cursor) : null;
    if (q.cursor && !cursor) throw badRequest('Curseur invalide', { cursor: 'valeur renvoyée par nextCursor' });
    return this.usage.calls(j.from, j.to, { fn: j.fn, provider: j.provider, cursor, limit });
  }

  /** Export du journal : UTF-8 avec BOM, séparateur « ; », décimales à la virgule, mêmes colonnes que le journal. */
  @Get('usage/calls.csv')
  async callsCsv(@CurrentActor() actor: Actor, @Res() res: any, @Query() q: Record<string, string>) {
    const j = this.journalQuery(q);
    const { csv, count } = await this.usage.callsCsv(j.from, j.to, j.fn, j.provider);
    await this.audit.action(this.prisma, adminCtx(actor), { action: 'Export du journal des appels IA', target: `${j.from} → ${j.to}${j.fn ? ` · ${j.fn}` : ''}${j.provider ? ` · ${j.provider}` : ''} · ${count} appel(s)`, severity: 'INFO', entityType: 'UsageRecord' });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="journal-appels-${j.from}-${j.to}.csv"`);
    res.end(csv);
  }

  @Get('budget-thresholds')
  thresholds() {
    return this.usage.thresholds();
  }

  @Put('budget-thresholds/:id')
  async putThreshold(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() body: unknown) {
    // Un plafond par ligne budgétaire (Documents = « docs », pour ses trois étapes), ou « all ».
    if (id !== 'all' && !AI_BUDGET_LINES.some((f) => f.id === id)) throw notFound('Plafond inconnu');
    const input = parse(
      z.object({ limitEur: z.number().positive().nullable().optional(), warnPct: z.number().int().min(50).max(100).refine((v) => v % 5 === 0, 'pas de 5'), enabled: z.boolean() }).strict(),
      body,
    );
    const before = await this.prisma.budgetThreshold.findUnique({ where: { id } });
    await this.prisma.$transaction(async (db) => {
      await db.budgetThreshold.upsert({ where: { id }, create: { id, limitEur: input.limitEur ?? null, warnPct: input.warnPct, enabled: input.enabled }, update: { limitEur: input.limitEur === undefined ? undefined : input.limitEur, warnPct: input.warnPct, enabled: input.enabled, version: { increment: 1 } } });
      await this.audit.action(db, adminCtx(actor), { action: 'Modification d’un plafond budgétaire IA', target: `${id} · ${before?.limitEur ?? '—'} € / ${before?.warnPct ?? '—'} % → ${input.limitEur === undefined ? before?.limitEur ?? '—' : input.limitEur ?? '—'} € / ${input.warnPct} %`, severity: 'SENSITIVE', entityType: 'BudgetThreshold', entityId: id });
    });
    return (await this.usage.thresholds()).find((t) => t.id === id);
  }
}
