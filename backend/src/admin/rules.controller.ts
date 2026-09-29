import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { NotificationRule } from '@prisma/client';
import { z } from 'zod';
import { AdminOnly, Actor, CurrentActor } from '../core/auth/auth';
import { AuditService } from '../core/audit.service';
import { PrismaService } from '../core/prisma.service';
import { badRequest, businessRule, conflict, notFound } from '../core/errors';
import { techId } from '../core/ids';
import { parse } from '../core/http';
import { TodayService } from '../core/today.service';
import { adminCtx, ProfilesService } from './profiles.service';
import { blockingErrors, fromUiRule, PROFILE_LABELS, RuleRow, toUiHistory, toUiRule, UiRule } from '../domain/notification-rules';
import { LLM_RESPONSE_VARIABLE, NotificationsService, RuleContext } from './notifications.service';

const FREQ = z
  .string()
  .transform((s) => ({ imm: 'IMMEDIATE', quot: 'DAILY', hebdo: 'WEEKLY', perso: 'CUSTOM' } as Record<string, string>)[s] ?? s.toUpperCase())
  .pipe(z.enum(['IMMEDIATE', 'DAILY', 'WEEKLY', 'CUSTOM']));
const CHANNEL = z
  .string()
  .transform((s) => ({ app: 'APP', mail: 'EMAIL' } as Record<string, string>)[s] ?? s.toUpperCase())
  .pipe(z.enum(['APP', 'EMAIL']));
const KIND = z
  .string()
  .transform((s) => ({ alerte: 'ALERT', notif: 'NOTIFICATION' } as Record<string, string>)[s] ?? s.toUpperCase())
  .pipe(z.enum(['NOTIFICATION', 'ALERT']));
const TARGET = z.enum(['admin', 'pmo', 'resp', 'lec']);

const RuleBody = z
  .object({
    kind: KIND,
    name: z.string().trim().max(120),
    targetProfiles: z.array(TARGET),
    projectIds: z.array(z.string()),
    platform: z.boolean(),
    modelId: z.string(),
    prompt: z.string().max(4000),
    subject: z.string().max(300),
    body: z.string().max(4000),
    frequency: FREQ,
    day: z.string().max(20).nullable(),
    hour: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
    everyDays: z.number().int().min(1).max(90).nullable(),
    channels: z.array(CHANNEL),
    trigger: z.enum(['SCHEDULE', 'MILESTONE_LATE', 'RISK_CRITICAL', 'DOCUMENT_ANALYZED', 'BUDGET_THRESHOLD', 'MANUAL']),
    enabled: z.boolean(),
  })
  .partial()
  .strict();

/** Modèle `Rule` de la vue « Notifications et alertes » (spécification NOTIFICATIONS ET ALERTES § 2). */
const UiRuleBody = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'identifiant invalide').optional(),
    type: z.enum(['alerte', 'notification']),
    title: z.string().max(120),
    evt: z.string().max(200).optional(),
    profils: z.array(z.enum(['Admin', 'PMO', 'Responsable', 'Lecteur'])),
    projets: z.array(z.string().max(40)),
    canaux: z.array(z.enum(['app', 'mail'])),
    freq: z.enum(['imm', 'day', 'week', 'custom']),
    at: z.string().max(60),
    on: z.boolean(),
    model: z.string().nullable(),
    prompt: z.string().max(4000),
    subject: z.string().max(300),
    body: z.string().max(4000),
  })
  .strict();

/** Règles de notification et d'alerte, aperçu, test, historique des envois (brief Console § 9.8). */
@ApiTags('console · notifications')
@ApiBearerAuth()
@AdminOnly()
@Controller('api/admin')
export class RulesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifs: NotificationsService,
    private readonly profiles: ProfilesService,
    private readonly today: TodayService,
  ) {}

  view(r: NotificationRule) {
    return { id: r.id, kind: r.kind, name: r.name, targetProfiles: r.targetProfiles, projectIds: r.projectIds, platform: r.platform, modelId: r.modelId, prompt: r.prompt, subject: r.subject, body: r.body, frequency: r.frequency, day: r.day, hour: r.hour, everyDays: r.everyDays, channels: r.channels, trigger: r.trigger, enabled: r.enabled, version: r.version };
  }

  /** Règles d'enregistrement (§ 7.6) : 400 si nom vide, aucun profil, aucun canal, aucun projet (hors plateforme), prompt vide, modèle inactif. */
  private async validate(r: Omit<NotificationRule, 'createdAt' | 'updatedAt' | 'version'>) {
    const fields: Record<string, string> = {};
    if (!r.name.trim()) fields.name = 'obligatoire';
    if (!r.targetProfiles.length) fields.targetProfiles = 'au moins un profil';
    if (!r.channels.length) fields.channels = 'au moins un canal';
    if (!r.platform && !r.projectIds.length) fields.projectIds = 'au moins un projet (hors règle de plateforme)';
    if (!r.prompt.trim()) fields.prompt = 'obligatoire';
    if (r.prompt.includes(`{${LLM_RESPONSE_VARIABLE}}`)) fields.prompt = `{${LLM_RESPONSE_VARIABLE}} n'est utilisable que dans le message`;
    const model = r.modelId ? await this.prisma.aiModel.findUnique({ where: { id: r.modelId } }) : null;
    if (!r.modelId) fields.modelId = 'obligatoire';
    else if (!model) fields.modelId = 'modèle inconnu';
    else if (!model.active) fields.modelId = 'modèle inactif';
    else if (model.category !== 'LLM') fields.modelId = 'un LLM est requis pour rédiger le message';
    if (r.frequency === 'CUSTOM' && !r.everyDays) fields.everyDays = 'obligatoire pour une fréquence personnalisée';
    if (r.projectIds.length) {
      const found = await this.prisma.project.count({ where: { code: { in: r.projectIds } } });
      if (found !== new Set(r.projectIds).size) fields.projectIds = 'projet inconnu';
    }
    if (Object.keys(fields).length) throw badRequest('Règle invalide', fields);
  }

  @Get('notification-rules')
  async list() {
    return (await this.prisma.notificationRule.findMany({ orderBy: { createdAt: 'asc' } })).map((r) => this.view(r));
  }

  @Post('notification-rules')
  async create(@CurrentActor() actor: Actor, @Body() body: unknown) {
    const i = parse(RuleBody, body);
    const kind = (i.kind ?? 'NOTIFICATION') as NotificationRule['kind'];
    const r = {
      id: techId('n'),
      kind,
      name: i.name ?? '',
      targetProfiles: i.targetProfiles ?? [],
      projectIds: (i.projectIds ?? []).map((c) => c.toUpperCase()),
      platform: i.platform ?? false,
      modelId: i.modelId ?? '',
      prompt: i.prompt ?? '',
      subject: i.subject ?? '',
      body: i.body ?? '',
      frequency: (i.frequency ?? (kind === 'ALERT' ? 'IMMEDIATE' : 'WEEKLY')) as NotificationRule['frequency'],
      day: i.day ?? null,
      hour: i.hour ?? null,
      everyDays: i.everyDays ?? null,
      channels: (i.channels ?? ['APP']) as NotificationRule['channels'],
      // Déclencheur (ajout au brief) : manuel par défaut pour une alerte créée dans la console.
      trigger: (i.trigger ?? (kind === 'ALERT' ? 'MANUAL' : 'SCHEDULE')) as NotificationRule['trigger'],
      enabled: i.enabled ?? false,
    };
    await this.validate(r);
    const row = await this.prisma.$transaction(async (db) => {
      const row = await db.notificationRule.create({ data: r });
      await this.audit.action(db, adminCtx(actor), { action: 'Création d’une règle de notification', target: row.name, severity: 'INFO', entityType: 'NotificationRule', entityId: row.id });
      return row;
    });
    return this.view(row);
  }

  private async one(id: string) {
    const r = await this.prisma.notificationRule.findUnique({ where: { id } });
    if (!r) throw notFound('Règle introuvable');
    return r;
  }

  @Patch('notification-rules/:id')
  async patch(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() body: unknown) {
    const cur = await this.one(id);
    const i = parse(RuleBody, body);
    const next = { ...cur, ...Object.fromEntries(Object.entries(i).filter(([, v]) => v !== undefined)), projectIds: (i.projectIds ?? cur.projectIds).map((c) => c.toUpperCase()) } as NotificationRule;
    await this.validate(next);
    const { createdAt: _c, updatedAt: _u, version: _v, id: _i, ...data } = next;
    const row = await this.prisma.$transaction(async (db) => {
      const row = await db.notificationRule.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
      await this.audit.action(db, adminCtx(actor), { action: 'Modification d’une règle de notification', target: row.name, severity: 'INFO', entityType: 'NotificationRule', entityId: id });
      return row;
    });
    return this.view(row);
  }

  /**
   * Suppression d'une règle (notification ou alerte). L'historique de ses envois est conservé (traçabilité des
   * messages envoyés et de leur coût) ; l'action est tracée au journal d'audit (sensible).
   */
  @Delete('notification-rules/:id')
  @HttpCode(204)
  async remove(@CurrentActor() actor: Actor, @Param('id') id: string) {
    const cur = await this.one(id);
    await this.prisma.$transaction(async (db) => {
      await db.notificationRule.delete({ where: { id } });
      await this.audit.action(db, adminCtx(actor), { action: 'Suppression d’une règle de notification', target: cur.name, severity: 'SENSITIVE', entityType: 'NotificationRule', entityId: id, details: { name: cur.name, kind: cur.kind, enabled: cur.enabled } });
    });
  }

  private async toggle(actor: Actor, id: string, enabled: boolean) {
    const cur = await this.one(id);
    if (enabled) await this.validate(cur);
    const row = await this.prisma.$transaction(async (db) => {
      const row = await db.notificationRule.update({ where: { id }, data: { enabled, version: { increment: 1 } } });
      await this.audit.action(db, adminCtx(actor), { action: enabled ? 'Activation d’une règle' : 'Désactivation d’une règle', target: row.name, severity: 'INFO', entityType: 'NotificationRule', entityId: id });
      return row;
    });
    return this.view(row);
  }

  @Post('notification-rules/:id/enable')
  @HttpCode(200)
  enable(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.toggle(actor, id, true);
  }

  @Post('notification-rules/:id/disable')
  @HttpCode(200)
  disable(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.toggle(actor, id, false);
  }

  /** Aperçu : génération réelle avec un contexte d'exemple ; `{reponse_llm}` remplacé dans le message. */
  @Post('notification-rules/:id/preview')
  @HttpCode(200)
  async preview(@Param('id') id: string, @Body() body: unknown) {
    const r = await this.one(id);
    const { sampleContext } = parse(z.object({ sampleContext: z.record(z.string()).default({}) }).strict(), body ?? {});
    const ctx: RuleContext = { projet: 'RISE', jalon: 'J06 · Go / No-Go Go-Live', risque: 'Reprise & qualité des données au démarrage', seuil: '80 %', semaine: 'semaine 39', document: 'CR du 20e COPIL.pdf', ...sampleContext };
    const project = await this.prisma.project.findFirst({ where: { code: ctx.projet } });
    return this.notifs.generate(r, ctx, project?.id ?? null);
  }

  /** « M'envoyer un test » : génère réellement le message et l'envoie à l'administrateur connecté. */
  @Post('notification-rules/:id/test')
  @HttpCode(200)
  async test(@CurrentActor() actor: Actor, @Param('id') id: string) {
    const r = await this.one(id);
    const code = r.projectIds[0] ?? null;
    const project = code ? await this.prisma.project.findFirst({ where: { code } }) : null;
    const out = await this.notifs.deliver(r, project?.id ?? null, { projet: project?.code ?? 'Plateforme', jalon: 'J06 · Go / No-Go Go-Live', risque: 'Risque de test', seuil: '80 %', semaine: 'semaine de test', document: 'document de test' }, null, { accountIds: [actor.accountId] });
    return out.map((d) => this.deliveryView(d));
  }

  deliveryView(d: any) {
    return { id: d.id, ruleId: d.ruleId, at: d.at, channel: d.channel, recipientsCount: d.recipientsCount, status: d.status, error: d.error, costEur: d.costEur, tokens: d.tokens, projectId: d.projectId, subject: d.subject };
  }

  @Get('deliveries')
  async deliveries(@Query('ruleId') ruleId?: string, @Query('limit') limit?: string) {
    const rows = await this.prisma.delivery.findMany({ where: ruleId ? { ruleId } : {}, orderBy: { at: 'desc' }, take: Math.min(500, Number(limit) || 100) });
    return rows.map((d) => this.deliveryView(d));
  }

  @Post('deliveries/:id/retry')
  @HttpCode(200)
  async retry(@CurrentActor() actor: Actor, @Param('id') id: string) {
    const d = await this.prisma.delivery.findUnique({ where: { id } });
    if (!d) throw notFound('Envoi introuvable');
    if (d.status !== 'ERROR') throw businessRule('Seul un envoi en échec peut être relancé', { id: 'envoi réussi' });
    const r = await this.one(d.ruleId);
    const project = d.projectId ? await this.prisma.project.findUnique({ where: { id: d.projectId } }) : null;
    const out = await this.notifs.deliver({ ...r, channels: [d.channel] }, d.projectId, { projet: project?.code }, null, d.recipients.length ? { accountIds: d.recipients } : undefined);
    await this.audit.action(this.prisma, adminCtx(actor), { action: 'Relance d’un envoi de notification', target: r.name, severity: 'INFO', entityType: 'Delivery', entityId: id });
    return out.map((x) => this.deliveryView(x));
  }

  // ── Vue « Notifications et alertes » (NOTIFICATIONS ET ALERTES - specification.md § 4) : modèle `Rule` du § 2 ──

  /** LLM actifs : seuls modèles proposés et acceptés pour rédiger un message. */
  private async llmIds() {
    return new Set((await this.prisma.aiModel.findMany({ where: { active: true, category: 'LLM' }, select: { id: true } })).map((m) => m.id));
  }

  /**
   * Contrôles d'enregistrement de la vue : nom, au moins un canal, {reponse_llm} absent du prompt, modèle LLM actif
   * s'il est choisi, projets connus. Aucun modèle ou aucun destinataire n'empêche pas d'enregistrer : ce sont les cas
   * bloquants du § 3, qui empêchent seulement l'envoi.
   */
  private async validateUi(r: Omit<RuleRow, 'id' | 'trigger'>, llm: Set<string>) {
    const fields: Record<string, string> = {};
    if (!r.name) fields.title = 'obligatoire';
    if (!r.channels.length) fields.canaux = 'au moins un canal';
    if (r.prompt.includes(`{${LLM_RESPONSE_VARIABLE}}`)) fields.prompt = `{${LLM_RESPONSE_VARIABLE}} n'est utilisable que dans le message`;
    if (r.modelId && !llm.has(r.modelId)) fields.model = 'LLM inconnu ou inactif';
    if (r.projectIds.length) {
      const found = await this.prisma.project.count({ where: { code: { in: r.projectIds } } });
      if (found !== r.projectIds.length) fields.projets = 'projet inconnu';
    }
    if (Object.keys(fields).length) throw badRequest('Règle invalide', fields);
  }

  private async uiView(r: NotificationRule, llm?: Set<string>) {
    return toUiRule(r as RuleRow, llm ?? (await this.llmIds()));
  }

  @Get('notifications/rules')
  async uiList() {
    const llm = await this.llmIds();
    return (await this.prisma.notificationRule.findMany({ orderBy: { createdAt: 'asc' } })).map((r) => toUiRule(r as RuleRow, llm));
  }

  /** Nombre de destinataires actifs par profil (comptes actifs ayant ce profil sur au moins un projet ; Admin : administrateurs). */
  @Get('notifications/counts')
  async uiCounts() {
    const out: Record<string, number> = {};
    for (const [code, label] of Object.entries(PROFILE_LABELS)) out[label] = (await this.profiles.recipients([code], null)).length;
    return out;
  }

  /**
   * Création depuis la vue. L'identifiant choisi par la vue est repris (la vue garde la règle sous cet identifiant
   * jusqu'au rechargement) ; 409 s'il existe déjà. Déclencheur : manuel pour une alerte, planifié pour une notification.
   */
  @Post('notifications/rules')
  async uiCreate(@CurrentActor() actor: Actor, @Body() body: unknown) {
    const u = parse(UiRuleBody, body);
    const id = u.id ?? techId('n');
    if (await this.prisma.notificationRule.findUnique({ where: { id } })) throw conflict('ALREADY_EXISTS', 'Une règle porte déjà cet identifiant');
    const llm = await this.llmIds();
    const data = fromUiRule(u as UiRule);
    await this.validateUi(data, llm);
    const row = await this.prisma.$transaction(async (db) => {
      const row = await db.notificationRule.create({ data: { id, ...data, trigger: data.kind === 'ALERT' ? 'MANUAL' : 'SCHEDULE' } });
      await this.audit.action(db, adminCtx(actor), { action: 'Création d’une règle de notification', target: row.name, severity: 'INFO', entityType: 'NotificationRule', entityId: row.id });
      return row;
    });
    return this.uiView(row, llm);
  }

  /** Enregistrement du brouillon de la vue (règle complète). */
  @Put('notifications/rules/:id')
  async uiSave(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() body: unknown) {
    await this.one(id);
    const u = parse(UiRuleBody, body);
    const llm = await this.llmIds();
    const data = fromUiRule(u as UiRule);
    await this.validateUi(data, llm);
    const row = await this.prisma.$transaction(async (db) => {
      const row = await db.notificationRule.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
      await this.audit.action(db, adminCtx(actor), { action: 'Modification d’une règle de notification', target: row.name, severity: 'INFO', entityType: 'NotificationRule', entityId: id });
      return row;
    });
    return this.uiView(row, llm);
  }

  /** Interrupteur de la liste et bouton Désactiver / Activer : effet immédiat, hors brouillon. */
  @Patch('notifications/rules/:id')
  async uiToggle(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() body: unknown) {
    const { on } = parse(z.object({ on: z.boolean() }).strict(), body);
    await this.one(id);
    const row = await this.prisma.$transaction(async (db) => {
      const row = await db.notificationRule.update({ where: { id }, data: { enabled: on, version: { increment: 1 } } });
      await this.audit.action(db, adminCtx(actor), { action: on ? 'Activation d’une règle' : 'Désactivation d’une règle', target: row.name, severity: 'INFO', entityType: 'NotificationRule', entityId: id });
      return row;
    });
    return this.uiView(row);
  }

  @Delete('notifications/rules/:id')
  @HttpCode(204)
  uiRemove(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.remove(actor, id);
  }

  /**
   * « M'envoyer un test » : génère et envoie à l'administrateur connecté. Le corps peut porter le brouillon affiché
   * (non enregistré) ; sinon la règle enregistrée est utilisée. 422 si un cas bloquant subsiste.
   */
  @Post('notifications/rules/:id/test')
  @HttpCode(200)
  async uiTest(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() body: unknown) {
    const cur = await this.one(id);
    const hasDraft = !!body && typeof body === 'object' && Object.keys(body).length > 0;
    const llm = await this.llmIds();
    let rule: NotificationRule = cur;
    if (hasDraft) {
      const data = fromUiRule(parse(UiRuleBody, body) as UiRule);
      await this.validateUi(data, llm);
      rule = { ...cur, ...data };
    }
    const errs = blockingErrors(rule, llm);
    if (errs.length) throw businessRule(errs.join(' '), { rule: 'envoi bloqué' });
    const code = rule.platform ? null : rule.projectIds[0] ?? null;
    const project = code ? await this.prisma.project.findFirst({ where: { code } }) : null;
    const out = await this.notifs.deliver(rule, project?.id ?? null, { projet: project?.code ?? 'Plateforme', jalon: 'J06 · Go / No-Go Go-Live', risque: 'Risque de test', seuil: '80 %', semaine: 'semaine de test', document: 'document de test' }, null, { accountIds: [actor.accountId] });
    const now = this.today.now();
    return out.map((d) => toUiHistory(d, now));
  }

  /** Historique des envois, du plus récent au plus ancien ; `rule` : une seule règle, sinon toutes. */
  @Get('notifications/history')
  async uiHistory(@Query('rule') rule?: string, @Query('limit') limit?: string) {
    const rows = await this.prisma.delivery.findMany({ where: rule ? { ruleId: rule } : {}, orderBy: { at: 'desc' }, take: Math.min(500, Number(limit) || 200) });
    const now = this.today.now();
    return rows.map((d) => toUiHistory(d, now));
  }
}
