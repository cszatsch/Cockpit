import { Body, Controller, Delete, Get, HttpCode, OnModuleInit, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { JevPromptService } from '../core/jev-prompt.service';
import { JevSqlService } from './jev-sql.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AdminOnly, Actor, CurrentActor } from '../core/auth/auth';
import { AuditService } from '../core/audit.service';
import { PrismaService } from '../core/prisma.service';
import { JobsService } from '../core/jobs.service';
import { TodayService } from '../core/today.service';
import { LlmService, aiFunctionLabel } from '../core/llm.service';
import { conflict, notFound } from '../core/errors';
import { parse } from '../core/http';
import { adminCtx } from './profiles.service';
import { UsageService } from './usage.service';
import { INVITE_STALE_DAYS } from './accounts.controller';
import { gapCount, gapText } from '../domain/habilitation-proposals';
import { ProfilesService } from './profiles.service';

/** Durée de conservation du journal d'audit (brief Console § 6.2). */
export const AUDIT_RETENTION_MONTHS = 24;
const SEV_IN: Record<string, string> = { info: 'INFO', sensible: 'SENSITIVE', critique: 'CRITICAL' };

/** Vue d'ensemble, journal d'audit, profil de l'administrateur, Jev de la console (brief Console § 9.1, 9.3, 9.11, 9.12). */
@ApiTags('console · supervision et compte')
@ApiBearerAuth()
@AdminOnly()
@Controller('api/admin')
export class ConsoleController implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly usage: UsageService,
    private readonly llm: LlmService,
    private readonly jobs: JobsService,
    private readonly today: TodayService,
    private readonly jevPrompt: JevPromptService,
    private readonly jevSql: JevSqlService,
    private readonly profiles: ProfilesService,
  ) {}

  onModuleInit() {
    this.jobs.register('audit.purge', () => this.purgeAudit().then(() => undefined));
    this.jobs.schedule('audit.purge', '15 3 * * *');
  }

  /** Purge de conservation (24 mois) : seule suppression autorisée par le trigger du journal. */
  async purgeAudit(now = this.today.now()) {
    const limit = new Date(now);
    limit.setUTCMonth(limit.getUTCMonth() - AUDIT_RETENTION_MONTHS);
    return this.prisma.$transaction(async (db) => {
      await db.$executeRawUnsafe(`SET LOCAL rise.allow_audit_purge = 'on'`);
      const r = await db.auditEntry.deleteMany({ where: { at: { lt: limit } } });
      return r.count;
    });
  }

  // ───────────── Journal d'audit (RG13-15) ─────────────

  private async auditRows(q: Record<string, string | undefined>) {
    const where: Prisma.AuditEntryWhereInput = {};
    if (q.severity && q.severity !== 'tous') where.severity = (SEV_IN[q.severity] ?? q.severity.toUpperCase()) as any;
    if (q.projectId) where.projectId = q.projectId;
    if (q.actor) where.OR = [{ accountId: q.actor }, { actorName: { contains: q.actor, mode: 'insensitive' } }];
    if (q.entityType) where.entityType = q.entityType;
    if (q.from || q.to) where.at = { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(`${q.to}T23:59:59Z`) } : {}) };
    if (q.q) where.AND = [{ OR: [{ action: { contains: q.q, mode: 'insensitive' } }, { target: { contains: q.q, mode: 'insensitive' } }, { actorName: { contains: q.q, mode: 'insensitive' } }] }];
    return this.prisma.auditEntry.findMany({ where, orderBy: { at: 'desc' }, take: Math.min(Number(q.limit) || 500, 5000) });
  }

  private auditView(a: any) {
    return { id: a.id, at: a.at, who: a.actorName, accountId: a.accountId, profileUsed: a.profileUsed, action: a.action, target: a.target, severity: a.severity, origin: a.origin, projectId: a.projectId, wsId: a.wsId, entityType: a.entityType, entityId: a.entityId, field: a.field, oldValue: a.oldValue, newValue: a.newValue };
  }

  @Get('audit')
  async auditList(@Query() q: Record<string, string>) {
    return (await this.auditRows(q)).map((a) => this.auditView(a));
  }

  @Get('audit/export.csv')
  async auditCsv(@CurrentActor() actor: Actor, @Query() q: Record<string, string>, @Res() res: any) {
    const rows = await this.auditRows({ ...q, limit: '5000' });
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = ['date;utilisateur;profil;action;cible;niveau;projet;entite;id;champ;avant;apres', ...rows.map((a) => [a.at.toISOString(), a.actorName, a.profileUsed ?? '', a.action, a.target ?? '', a.severity, a.projectId ?? '', a.entityType, a.entityId ?? '', a.field ?? '', a.oldValue === null ? '' : JSON.stringify(a.oldValue), a.newValue === null ? '' : JSON.stringify(a.newValue)].map(esc).join(';'))];
    await this.audit.action(this.prisma, adminCtx(actor), { action: 'Export du journal d’audit', target: `${rows.length} entrée(s)`, severity: 'SENSITIVE', entityType: 'AuditEntry' });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="journal-audit.csv"');
    res.end('﻿' + lines.join('\n'));
  }

  // ───────────── Vue d'ensemble : « À traiter » (§ 7.9) ─────────────

  @Get('overview')
  async overview() {
    const now = this.today.now();
    const [providers, asg, models, invited, requests, invitationRequests, failures, month, accounts, snaps, recentSensitive] = await Promise.all([
      this.prisma.provider.findMany(),
      this.prisma.modelAssignment.findMany(),
      this.prisma.aiModel.findMany(),
      this.prisma.account.findMany({ where: { status: 'INVITED', invitedAt: { lt: new Date(now.getTime() - INVITE_STALE_DAYS * 86_400_000) } } }),
      this.prisma.moduleRequest.findMany({ where: { status: 'PENDING' } }),
      this.prisma.invitationRequest.findMany({ where: { status: 'PENDING' } }),
      this.prisma.delivery.findMany({ where: { status: 'ERROR', at: { gt: new Date(now.getTime() - 7 * 86_400_000) } }, orderBy: { at: 'desc' } }),
      this.usage.month(),
      this.prisma.account.groupBy({ by: ['status'], _count: true }),
      this.prisma.snapshot.findFirst({ where: { status: 'DONE' }, orderBy: { takenAt: 'desc' } }),
      this.prisma.auditEntry.findMany({ where: { severity: { in: ['SENSITIVE', 'CRITICAL'] } }, orderBy: { at: 'desc' }, take: 6 }),
    ]);
    const attention: Array<{ level: 'error' | 'warn' | 'info'; kind: string; title: string; detail: string; target: string; ids?: string[] }> = [];
    for (const p of providers.filter((x) => x.status === 'ERROR')) {
      const fns = [];
      for (const a of asg) {
        const pm = models.find((m) => m.id === a.primaryModelId);
        if (pm?.providerId === p.id) fns.push(`${aiFunctionLabel(a.functionId)} tourne sur son modèle de secours`);
      }
      attention.push({ level: 'error', kind: 'PROVIDER_ERROR', title: `Clé API ${p.name} invalide`, detail: [p.lastError, ...fns].filter(Boolean).join(' · '), target: 'providers', ids: [p.id] });
    }
    for (const t of month.thresholds.filter((x) => x.status === 'EXCEEDED' || x.status === 'ALERT')) {
      attention.push({ level: t.status === 'EXCEEDED' || (t.limitEur && t.spent >= t.limitEur) ? 'error' : 'warn', kind: 'BUDGET', title: `${t.name} : ${t.pct} % du plafond`, detail: `${t.spent} € dépensés sur ${t.limitEur} € · projection ${t.projection} €`, target: 'conso', ids: [t.id] });
    }
    // Libellés lisibles : nom de la règle, canal en français, nom de la personne (et non leurs identifiants).
    const ruleNames = new Map((await this.prisma.notificationRule.findMany({ where: { id: { in: failures.slice(0, 5).map((f) => f.ruleId) } }, select: { id: true, name: true } })).map((r) => [r.id, r.name]));
    const people = new Map((await this.prisma.person.findMany({ where: { id: { in: invitationRequests.map((r) => r.personId) } }, select: { id: true, projectId: true, firstName: true, lastName: true } })).map((p) => [`${p.projectId}|${p.id}`, `${p.firstName} ${p.lastName}`]));
    const CHANNEL_FR: Record<string, string> = { APP: 'Dans l’application', EMAIL: 'E-mail' };
    for (const f of failures.slice(0, 5)) attention.push({ level: 'error', kind: 'DELIVERY_FAILED', title: 'Échec d’envoi de notification', detail: [ruleNames.get(f.ruleId) ?? f.ruleId, CHANNEL_FR[f.channel] ?? f.channel, f.error].filter(Boolean).join(' · '), target: 'notifs', ids: [f.id] });
    if (invited.length) attention.push({ level: 'warn', kind: 'STALE_INVITES', title: `${invited.length} invitation(s) sans réponse depuis plus de ${INVITE_STALE_DAYS} jours`, detail: invited.map((a) => a.fullName).join(', '), target: 'users', ids: invited.map((a) => a.id) });
    for (const r of requests) attention.push({ level: 'info', kind: 'MODULE_REQUEST', title: `Demande d’activation : ${r.moduleId}`, detail: `${r.requestedBy} · ${r.projectId}`, target: 'modules', ids: [r.id] });
    // Écarts entre le référentiel (responsables de chantier, chantiers de rattachement) et les droits réels des comptes.
    const live = await this.prisma.account.findMany({ where: { status: { in: ['ACTIVE', 'INVITED'] } } });
    const ref = await this.profiles.referential(live);
    const off = live.map((a) => ({ a, items: (ref.get(a.id) ?? []).filter((e) => gapCount(e.ecarts) > 0) })).filter((x) => x.items.length);
    if (off.length) {
      attention.push({
        level: 'warn',
        kind: 'REFERENTIAL_GAP',
        title: `${off.length} compte${off.length > 1 ? 's' : ''} : droits différents du référentiel`,
        detail: off.slice(0, 3).map((x) => `${x.a.fullName} (${x.items.map((e) => gapText(e.code, e.ecarts)).join(' · ')})`).join(' · ') + (off.length > 3 ? '…' : ''),
        target: 'users',
        ids: off.map((x) => x.a.id),
      });
    }
    for (const r of invitationRequests) attention.push({ level: 'info', kind: 'INVITATION_REQUEST', title: 'Demande d’invitation du PMO', detail: `${people.get(`${r.projectId}|${r.personId}`) ?? r.personId} · ${r.projectId}`, target: 'users', ids: [r.id] });
    const rank = { error: 0, warn: 1, info: 2 };
    attention.sort((a, b) => rank[a.level] - rank[b.level]);
    const count = (s: string) => accounts.find((x) => x.status === s)?._count ?? 0;
    return {
      date: now,
      health: attention.some((a) => a.level === 'error') ? 'error' : attention.some((a) => a.level === 'warn') ? 'warn' : 'ok',
      vitals: [
        { id: 'accounts', label: 'Comptes actifs', value: count('ACTIVE'), detail: `${count('INVITED')} invité(s) · ${count('SUSPENDED')} suspendu(s)` },
        { id: 'providers', label: 'Fournisseurs opérationnels', value: providers.filter((p) => p.status === 'OK').length, detail: `sur ${providers.length}` },
        { id: 'spend', label: 'Dépense IA du mois', value: month.spent, detail: `projection ${month.projection} €` },
        { id: 'snapshot', label: 'Dernier snapshot', value: snaps?.takenAt ?? null, detail: snaps ? `${snaps.projectId} · ${snaps.kind}` : 'aucun' },
      ],
      attention,
      recentSensitive: recentSensitive.map((a) => this.auditView(a)),
    };
  }

  // ───────────── Mon profil (administrateur connecté) ─────────────

  private async meView(actor: Actor) {
    const a = await this.prisma.account.findUniqueOrThrow({ where: { id: actor.accountId } });
    const prefs = await this.prisma.userPreferences.findUnique({ where: { accountId: a.id } });
    const [firstName, ...rest] = a.fullName.split(' ');
    const grant = await this.prisma.adminGrant.findUnique({ where: { accountId: a.id } });
    return { id: a.id, firstName, lastName: rest.join(' '), fullName: a.fullName, email: a.email, photoUrl: a.photoUrl, profile: a.profile ?? {}, adminSince: grant?.since ?? null, notifications: prefs?.notifications ?? { crit: true, budget: true, req: true, hebdo: true, fail: false }, version: a.version };
  }

  @Get('me/profile')
  me(@CurrentActor() actor: Actor) {
    return this.meView(actor);
  }

  @Patch('me/profile')
  async patchMe(@CurrentActor() actor: Actor, @Body() body: unknown) {
    const input = parse(
      z
        .object({
          firstName: z.string().trim().min(1).max(60),
          lastName: z.string().trim().min(1).max(60),
          email: z.string().trim().toLowerCase().email('e-mail invalide'),
          photoUrl: z.string().max(2_000_000).nullable(),
          position: z.string().max(120),
          company: z.string().max(120),
          team: z.string().max(120),
          phone: z.string().max(40),
          city: z.string().max(80),
          country: z.string().max(80),
          language: z.string().max(40),
          timezone: z.string().max(60),
        })
        .partial()
        .strict(),
      body,
    );
    const a = await this.prisma.account.findUniqueOrThrow({ where: { id: actor.accountId } });
    if (input.email && input.email !== a.email && (await this.prisma.account.findUnique({ where: { email: input.email } }))) throw conflict('DUPLICATE', `Un compte existe déjà pour ${input.email}`);
    const cur = await this.meView(actor);
    const { firstName, lastName, email, photoUrl, ...profile } = input;
    await this.prisma.$transaction(async (db) => {
      await db.account.update({
        where: { id: a.id },
        data: { fullName: `${firstName ?? cur.firstName} ${lastName ?? cur.lastName}`.trim(), email, photoUrl, profile: { ...((a.profile as object) ?? {}), ...profile }, version: { increment: 1 } },
      });
      const mailChanged = !!email && email !== a.email;
      await this.audit.action(db, adminCtx(actor), { action: mailChanged ? 'Changement d’adresse e-mail' : 'Modification du profil', target: a.fullName, severity: mailChanged ? 'SENSITIVE' : 'INFO', entityType: 'Account', entityId: a.id });
    });
    return this.meView(actor);
  }

  @Get('me/sessions')
  async mySessions(@CurrentActor() actor: Actor) {
    const rows = await this.prisma.authSession.findMany({ where: { accountId: actor.accountId, revokedAt: null }, orderBy: { lastSeenAt: 'desc' } });
    return rows.map((s) => ({ id: s.id, device: s.device, location: s.location, createdAt: s.createdAt, lastSeenAt: s.lastSeenAt, current: s.id === actor.sessionId }));
  }

  @Delete('me/sessions/:id')
  @HttpCode(204)
  async revokeMine(@CurrentActor() actor: Actor, @Param('id') id: string) {
    if (id === actor.sessionId) throw conflict('SELF_ACTION', 'Utilisez la déconnexion pour fermer la session courante');
    const s = await this.prisma.authSession.findFirst({ where: { id, accountId: actor.accountId, revokedAt: null } });
    if (!s) throw notFound('Session introuvable');
    await this.prisma.$transaction(async (db) => {
      await db.authSession.update({ where: { id }, data: { revokedAt: new Date() } });
      await this.audit.action(db, adminCtx(actor), { action: 'Révocation d’une session', target: s.device ?? id, severity: 'SENSITIVE', entityType: 'AuthSession', entityId: id });
    });
  }

  @Patch('me/notifications')
  async myNotifications(@CurrentActor() actor: Actor, @Body() body: unknown) {
    const input = parse(z.record(z.boolean()), body);
    const cur = await this.prisma.userPreferences.findUnique({ where: { accountId: actor.accountId } });
    const notifications = { ...((cur?.notifications as object) ?? {}), ...input };
    await this.prisma.userPreferences.upsert({ where: { accountId: actor.accountId }, create: { accountId: actor.accountId, notifications }, update: { notifications } });
    return notifications;
  }

  // ───────────── Jev (console) ─────────────

  /**
   * Jev de la console (spécification IA § 8) : **seul un modèle d'IA répond**, celui de la fonction `guidage`
   * (principal, sinon secours), avec le prompt système de la Console : base, Identité, Personnalité (Soul),
   * skill « Guidage console », page ouverte. Aucun moteur de mots-clés, aucune action. Les questions sur les
   * données passent par le dictionnaire des données et une requête en lecture seule (`JevSqlService`) ; les vues
   * consultées sont renvoyées dans `sources`. Aucune clé API n'est lisible. Modèles indisponibles : le motif.
   */
  @Post('assistant/messages')
  @HttpCode(200)
  async jev(@Body() body: unknown) {
    const input = parse(z.object({ context: z.object({ section: z.string().max(40) }).strict(), text: z.string().trim().min(1).max(2000) }).strict(), body);
    try {
      const res = await this.jevSql.ask(input.text, input.context.section);
      return { reply: res.reply, sources: res.sources, actions: [], ai: res.ai };
    } catch (e: any) {
      const why = String(e?.response?.message ?? e?.message ?? 'modèles indisponibles');
      return { reply: `Je ne peux pas répondre pour l’instant : ${why}`, sources: [], actions: [], ai: null, unavailable: why };
    }
  }

}
