import { Body, Controller, Get, Param, Post, Put, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Actor, AdminOnly, CurrentActor } from '../core/auth/auth';
import { AuditService } from '../core/audit.service';
import { PrismaService } from '../core/prisma.service';
import { parse } from '../core/http';
import { badRequest, forbidden, notFound } from '../core/errors';
import { csvOf, FEATURE_IDS, GRANS, Gran, parisDate } from '../domain/platform-usage';
import { PlatformUsageService, UsageQuery } from './platform-usage.service';
import { adminCtx } from './profiles.service';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const list = (v: unknown): string[] => (v === undefined || v === '' ? [] : (Array.isArray(v) ? v : String(v).split(',')).map(String).map((s) => s.trim()).filter(Boolean));

/** Paramètres communs ; `teams[]` et `users[]` acceptés répétés (`teams=a&teams=b`), en tableau (`teams[]=`) ou séparés par des virgules. */
export function usageQuery(q: Record<string, unknown>): UsageQuery {
  const gran = (q.gran ?? 'mois') as Gran;
  if (!GRANS.includes(gran)) throw badRequest('Granularité invalide', { gran: GRANS.join(', ') });
  const start = String(q.start ?? parisDate(new Date()));
  if (!ISO.test(start) || Number.isNaN(Date.parse(start))) throw badRequest('Début de période invalide', { start: 'AAAA-MM-JJ' });
  const scope = (q.scope ?? 'plat') as UsageQuery['scope'];
  if (!['plat', 'team', 'user'].includes(scope)) throw badRequest('Niveau invalide', { scope: 'plat, team, user' });
  const feature = q.feature ? String(q.feature) : null;
  if (feature && !FEATURE_IDS.includes(feature)) throw badRequest('Fonctionnalité inconnue', { feature: FEATURE_IDS.join(', ') });
  return {
    gran, start, scope, feature,
    teams: list(q.teams ?? q['teams[]']),
    projects: list(q.projects ?? q['projects[]']),
    users: list(q.users ?? q['users[]']),
    provider: q.provider ? String(q.provider) : null,
    model: q.model ? String(q.model) : null,
    compare: q.compare === undefined ? true : !['0', 'false', 'non'].includes(String(q.compare)),
  };
}
const sortDir = (v: unknown): 'asc' | 'desc' => (v === 'asc' ? 'asc' : 'desc');

/**
 * Consommation et coûts · Console › Accès (brief du 08/10/2026). Routes du brief `GET /console/usage/…`, servies sous
 * `/api/admin/consumption/…` : `/api/admin/usage/…` est déjà pris par la consommation IA (page IA › Consommation et coûts).
 * Droits appliqués ici : sans « Voir les coûts », aucun montant dans les réponses ; sans « Voir les données
 * individuelles », noms pseudonymisés et niveau Utilisateur refusé (403).
 */
@ApiTags('console · consommation (accès)')
@ApiBearerAuth()
@AdminOnly()
@Controller('api/admin')
export class PlatformUsageController {
  constructor(
    private readonly usage: PlatformUsageService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get('consumption/options')
  async options(@CurrentActor() actor: Actor) {
    return this.usage.options(await this.usage.rightsOf(actor.accountId));
  }

  /** Totaux de la période et de la période précédente. */
  @Get('consumption/summary')
  async summary(@CurrentActor() actor: Actor, @Query() q: Record<string, unknown>) {
    return this.usage.summary(usageQuery(q), await this.usage.rightsOf(actor.accountId));
  }

  /** `[{ t, label, activeH, connectedH, costEur, prevActiveH, prevCostEur, unusual }]`. */
  @Get('consumption/series')
  async series(@CurrentActor() actor: Actor, @Query() q: Record<string, unknown>) {
    return this.usage.series(usageQuery(q), await this.usage.rightsOf(actor.accountId));
  }

  @Get('consumption/breakdown')
  async breakdown(@CurrentActor() actor: Actor, @Query() q: Record<string, unknown>) {
    const by = String(q.by ?? 'feature');
    if (!['feature', 'team', 'user'].includes(by)) throw badRequest('Découpage invalide', { by: 'feature, team, user' });
    return this.usage.breakdown(usageQuery(q), await this.usage.rightsOf(actor.accountId), by as 'feature' | 'team' | 'user');
  }

  @Get('consumption/users')
  async users(@CurrentActor() actor: Actor, @Query() q: Record<string, unknown>) {
    const page = q.page === undefined ? 1 : Number(q.page);
    if (!Number.isInteger(page) || page < 1) throw badRequest('Page invalide', { page: 'entier ≥ 1' });
    return this.usage.users(usageQuery(q), await this.usage.rightsOf(actor.accountId), String(q.sort ?? 'cost'), sortDir(q.dir), String(q.q ?? ''), page);
  }

  /** Export CSV de la sélection courante (UTF-8 avec BOM, « ; ») ; journalisé (qui, quand, quels filtres). */
  @Get('consumption/export.csv')
  async exportCsv(@CurrentActor() actor: Actor, @Res() res: any, @Query() q: Record<string, unknown>) {
    const query = usageQuery(q), rights = await this.usage.rightsOf(actor.accountId);
    const { per, head, body } = await this.usage.exportRows(query, rights, String(q.sort ?? 'cost'), sortDir(q.dir), String(q.q ?? ''));
    const filters = { gran: query.gran, start: per.start, scope: query.scope, projects: query.projects, teams: query.teams, users: query.users, feature: query.feature, provider: query.provider, model: query.model, q: String(q.q ?? '') || null, sort: q.sort ?? 'cost', dir: sortDir(q.dir), costs: rights.costs, individual: rights.individual };
    await this.audit.action(this.prisma, adminCtx(actor), { action: 'Export de la consommation (Accès)', target: `${per.label} · ${body.length} ligne(s)`, severity: rights.individual ? 'SENSITIVE' : 'INFO', entityType: 'UsageExport', details: filters });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="consommation-${per.gran}-${per.start}.csv"`);
    res.end(csvOf([head, ...body]));
  }

  /** Réglages : délai d'inactivité (min), facteur des hausses inhabituelles, seuil d'alerte sur l'évolution du coût (%). */
  @Get('consumption/settings')
  settings() {
    return this.usage.settings();
  }

  @Put('consumption/settings')
  async saveSettings(@CurrentActor() actor: Actor, @Body() body: unknown) {
    const input = parse(z.object({ idleMinutes: z.number().int().min(1).max(60), unusualFactor: z.number().min(1.1).max(5), costAlertPct: z.number().int().min(5).max(500) }).partial().strict(), body);
    const out = await this.usage.saveSettings(input);
    await this.audit.action(this.prisma, adminCtx(actor), { action: 'Réglages de la consommation (Accès)', target: Object.entries(input).map(([k, v]) => `${k} = ${v}`).join(' · '), severity: 'INFO', entityType: 'UsageSettings', details: input });
    return out;
  }

  /** Droits Consommation et coûts d'un administrateur (« Voir les coûts », « Voir les données individuelles »). */
  @Put('admins/:accountId/consumption-rights')
  async setRights(@CurrentActor() actor: Actor, @Param('accountId') accountId: string, @Body() body: unknown) {
    const input = parse(z.object({ seeCosts: z.boolean(), seeIndividual: z.boolean() }).partial().strict(), body);
    if (accountId === actor.accountId) throw forbidden('Vous ne pouvez pas modifier vos propres droits');
    const g = await this.prisma.adminGrant.findUnique({ where: { accountId } });
    if (!g) throw notFound('Administrateur introuvable');
    const a = await this.prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    const after = await this.prisma.$transaction(async (db) => {
      const r = await db.adminGrant.update({ where: { accountId }, data: input });
      await this.audit.action(db, adminCtx(actor), { action: 'Modification des droits de consommation', target: a.fullName, severity: 'SENSITIVE', entityType: 'AdminGrant', entityId: accountId, details: { avant: { seeCosts: g.seeCosts, seeIndividual: g.seeIndividual }, apres: { seeCosts: r.seeCosts, seeIndividual: r.seeIndividual } } });
      return r;
    });
    return { accountId, seeCosts: after.seeCosts, seeIndividual: after.seeIndividual };
  }

  /** Événements d'usage de la Console (interactions de l'administrateur). */
  @Post('me/activity')
  activity(@CurrentActor() actor: Actor, @Body() body: unknown) {
    return this.usage.record(actor, activityBody(body));
  }
}

/** Événements d'usage du Cockpit (`/api/me/…` : session du Cockpit). */
@ApiTags('moi')
@ApiBearerAuth()
@Controller('api/me')
export class ActivityController {
  constructor(private readonly usage: PlatformUsageService) {}

  @Post('activity')
  activity(@CurrentActor() actor: Actor, @Body() body: unknown) {
    return this.usage.record(actor, activityBody(body), parse(ActivityBody, body).project ?? null);
  }
}

export const ActivityBody = z.object({ project: z.string().max(60).nullable().optional(), events: z.array(z.object({ at: z.string().max(40), feature: z.string().max(20), kind: z.string().max(20).optional() }).strict()).max(200) }).strict();
export const activityBody = (body: unknown) => parse(ActivityBody, body).events.map((e) => ({ at: e.at, feature: e.feature, kind: e.kind ?? 'interaction' }));
