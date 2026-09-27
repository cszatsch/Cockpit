import { Body, Controller, Get, HttpCode, OnModuleInit, Param, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AdminOnly, Actor, CurrentActor } from '../core/auth/auth';
import { AuditService, WriteCtx } from '../core/audit.service';
import { PrismaService } from '../core/prisma.service';
import { LlmService, AI_FUNCTIONS } from '../core/llm.service';
import { JobsService } from '../core/jobs.service';
import { encryptSecret, keyFingerprint } from '../core/crypto';
import { badRequest, businessRule, conflict, notFound } from '../core/errors';
import { parse } from '../core/http';
import { adminCtx } from './profiles.service';
import { round2, UsageService } from './usage.service';
import { addDays } from '../domain/dates';

/** Fréquence du test automatique des clés (brief Console § 10.1). */
export const KEY_TEST_CRON = '0 */2 * * *';
const SYSTEM_ACTOR = { accountId: 'system', sessionId: 'system', email: 'system@rise.local', fullName: 'Système', personId: null, isAdmin: true, surface: null, restricted: false, viaCookie: false };

const ApiKey = z.string().trim().min(20, '20 caractères minimum').max(400);

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
        if (primary?.providerId === p.id && p.status !== 'OK' && (await this.usage.functionState(a.primaryModelId, a.fallbackModelId)) === 'FALLBACK') onFallback.push(a.functionId);
      }
      out.push({ id: p.id, name: p.name, keyPrefix: p.keyPrefix, keyLast4: p.keyLast4, hasKey: !!p.keyCipher, status: p.status, latencyMs: p.latencyMs, lastTestedAt: p.lastTestedAt, lastError: p.lastError, functionsOnFallback: onFallback, modelCount: models.filter((m) => m.providerId === p.id).length, version: p.version });
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
    const r = await this.llm.ping(p.id, p.keyCipher);
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

  private modelView(m: any) {
    return { id: m.id, providerId: m.providerId, name: m.name, description: m.description, priceIn: m.priceInPerMTok, priceOut: m.priceOutPerMTok, active: m.active, version: m.version };
  }

  @Get('models')
  async models(@Query('provider') provider?: string) {
    const rows = await this.prisma.aiModel.findMany({ where: provider ? { providerId: provider } : {}, orderBy: { createdAt: 'asc' } });
    return rows.map((m) => this.modelView(m));
  }

  @Patch('models/:id')
  async patchModel(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() body: unknown) {
    const input = parse(z.object({ name: z.string().trim().min(1).max(80), description: z.string().max(300), priceIn: z.number().min(0), priceOut: z.number().min(0), active: z.boolean() }).partial().strict(), body);
    const m = await this.prisma.aiModel.findUnique({ where: { id } });
    if (!m) throw notFound('Modèle introuvable');
    if (input.active === false && m.active) {
      // § 7.3 : chaque fonction garde un modèle principal actif.
      const uses = await this.prisma.modelAssignment.findMany({ where: { primaryModelId: id } });
      if (uses.length) throw conflict('MODEL_IN_USE', `Modèle principal de : ${uses.map((u) => AI_FUNCTIONS.find((f) => f.id === u.functionId)?.short).join(', ')} — changez d'abord l'affectation`, uses.map((u) => ({ entityType: 'MODEL_ASSIGNMENT', id: u.functionId, label: `Principal de ${u.functionId}` })));
    }
    const priceChanged = (input.priceIn !== undefined && input.priceIn !== m.priceInPerMTok) || (input.priceOut !== undefined && input.priceOut !== m.priceOutPerMTok);
    const row = await this.prisma.$transaction(async (db) => {
      const row = await db.aiModel.update({ where: { id }, data: { name: input.name, description: input.description, priceInPerMTok: input.priceIn, priceOutPerMTok: input.priceOut, active: input.active, version: { increment: 1 } } });
      const ctx = adminCtx(actor);
      if (priceChanged) await this.audit.action(db, ctx, { action: 'Modification du tarif d’un modèle', target: `${m.name} · ${m.priceInPerMTok}/${m.priceOutPerMTok} → ${row.priceInPerMTok}/${row.priceOutPerMTok} €/MTok`, severity: 'SENSITIVE', entityType: 'AiModel', entityId: id });
      if (input.active !== undefined && input.active !== m.active) await this.audit.action(db, ctx, { action: input.active ? 'Activation d’un modèle' : 'Désactivation d’un modèle', target: m.name, severity: 'SENSITIVE', entityType: 'AiModel', entityId: id });
      if ((input.name && input.name !== m.name) || (input.description !== undefined && input.description !== m.description)) await this.audit.action(db, ctx, { action: 'Modification d’un modèle', target: row.name, severity: 'INFO', entityType: 'AiModel', entityId: id });
      return row;
    });
    return this.modelView(row);
  }

  // ───────────── Affectation ─────────────

  @Get('assignments')
  async assignments() {
    const [asg, models] = await Promise.all([this.prisma.modelAssignment.findMany(), this.prisma.aiModel.findMany()]);
    const today = this.usage.todayIso();
    const rows = await this.usage.records(addDays(today, -29), today);
    return Promise.all(
      AI_FUNCTIONS.map(async (f) => {
        const a = asg.find((x) => x.functionId === f.id);
        const fr = rows.filter((r) => r.functionId === f.id);
        const tin = fr.reduce((s, r) => s + r.tokensIn, 0);
        const tout = fr.reduce((s, r) => s + r.tokensOut, 0);
        const byModel = [...new Set(fr.map((r) => r.modelId))].map((mid) => {
          const mr = fr.filter((r) => r.modelId === mid);
          return { modelId: mid, costEur: round2(mr.reduce((s, r) => s + r.costEur, 0)), tokensIn: mr.reduce((s, r) => s + r.tokensIn, 0), tokensOut: mr.reduce((s, r) => s + r.tokensOut, 0) };
        });
        // Coût mensuel estimé = volume des 30 derniers jours × tarif du modèle, entrée et sortie séparément (§ 7.3).
        const est = (mid: string | null | undefined) => {
          const m = models.find((x) => x.id === mid);
          return m ? round2((tin * m.priceInPerMTok + tout * m.priceOutPerMTok) / 1e6) : null;
        };
        return {
          functionId: f.id,
          name: f.name,
          short: f.short,
          description: f.description,
          primary: a?.primaryModelId ?? null,
          fallback: a?.fallbackModelId ?? null,
          state: a ? await this.usage.functionState(a.primaryModelId, a.fallbackModelId) : 'UNAVAILABLE',
          volume30d: { tokensIn: tin, tokensOut: tout },
          estimatedMonthlyCost: { primary: est(a?.primaryModelId), fallback: est(a?.fallbackModelId) },
          costByModel: byModel,
          version: a?.version ?? 0,
        };
      }),
    );
  }

  @Put('assignments')
  async putAssignments(@CurrentActor() actor: Actor, @Body() body: unknown) {
    const pair = z.object({ primary: z.string().min(1), fallback: z.string().min(1).nullable().optional() }).strict();
    const input = parse(z.object({ insights: pair, crud: pair, docs: pair }).partial().strict(), body);
    const models = await this.prisma.aiModel.findMany();
    for (const [fn, v] of Object.entries(input)) {
      const pm = models.find((m) => m.id === v!.primary);
      if (!pm) throw badRequest('Modèle inconnu', { [`${fn}.primary`]: 'introuvable' });
      if (!pm.active) throw businessRule('Le modèle principal doit être actif', { [`${fn}.primary`]: `${pm.name} est inactif` });
      if (v!.fallback) {
        if (!models.some((m) => m.id === v!.fallback)) throw badRequest('Modèle inconnu', { [`${fn}.fallback`]: 'introuvable' });
        if (v!.fallback === v!.primary) throw businessRule('Le secours doit différer du principal', { [`${fn}.fallback`]: 'identique au principal' });
      }
    }
    await this.prisma.$transaction(async (db) => {
      for (const [fn, v] of Object.entries(input)) {
        const before = await db.modelAssignment.findUnique({ where: { functionId: fn } });
        await db.modelAssignment.upsert({ where: { functionId: fn }, create: { functionId: fn, primaryModelId: v!.primary, fallbackModelId: v!.fallback ?? null }, update: { primaryModelId: v!.primary, fallbackModelId: v!.fallback ?? null, version: { increment: 1 } } });
        const label = AI_FUNCTIONS.find((f) => f.id === fn)?.name ?? fn;
        const name = (id: string | null | undefined) => models.find((m) => m.id === id)?.name ?? '—';
        if (before?.primaryModelId !== v!.primary) await this.audit.action(db, adminCtx(actor), { action: 'Changement de modèle principal', target: `${label} → ${name(v!.primary)}`, severity: 'SENSITIVE', entityType: 'ModelAssignment', entityId: fn });
        if ((before?.fallbackModelId ?? null) !== (v!.fallback ?? null)) await this.audit.action(db, adminCtx(actor), { action: 'Changement de modèle de secours', target: `${label} → ${name(v!.fallback)}`, severity: 'SENSITIVE', entityType: 'ModelAssignment', entityId: fn });
      }
    });
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
    if (!['day', 'function', 'model', 'provider'].includes(groupBy)) throw badRequest('Regroupement invalide', { groupBy: 'day, function, model ou provider' });
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

  @Get('budget-thresholds')
  thresholds() {
    return this.usage.thresholds();
  }

  @Put('budget-thresholds/:id')
  async putThreshold(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() body: unknown) {
    if (id !== 'all' && !AI_FUNCTIONS.some((f) => f.id === id)) throw notFound('Plafond inconnu');
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
