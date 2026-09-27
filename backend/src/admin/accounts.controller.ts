import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Account } from '@prisma/client';
import { z } from 'zod';
import { AdminOnly, Actor, CurrentActor } from '../core/auth/auth';
import { AuditService } from '../core/audit.service';
import { PrismaService, Tx } from '../core/prisma.service';
import { MailerService } from '../core/mailer.service';
import { CredentialsService } from '../core/auth/credentials.service';
import { TodayService } from '../core/today.service';
import { badRequest, businessRule, conflict, inUse, notFound, Usage } from '../core/errors';
import { techId } from '../core/ids';
import { parse } from '../core/http';
import { adminCtx, ProfilesService } from './profiles.service';

/** Validité d'une invitation (brief Console § 7.1). */
export const INVITE_VALIDITY_DAYS = 14;
/** Invitation sans réponse signalée dans « À traiter » au-delà de ce délai. */
export const INVITE_STALE_DAYS = 7;

const PROFILE = z
  .string()
  .transform((s) => ({ admin: 'ADMIN', pmo: 'PMO', resp: 'RESPONSABLE', lec: 'LECTEUR' } as Record<string, string>)[s] ?? s.toUpperCase())
  .pipe(z.enum(['ADMIN', 'PMO', 'RESPONSABLE', 'LECTEUR']));

const AccountCreate = z
  .object({
    fullName: z.string().trim().min(2, '2 caractères minimum').max(120),
    email: z.string().trim().toLowerCase().email('e-mail invalide'),
    profile: PROFILE,
    projectCodes: z.array(z.string().min(1)).min(1, 'au moins un projet'),
  })
  .strict();
const AccountPatch = AccountCreate.partial().strict();

const DAY = 86_400_000;

/** Comptes d'accès, administrateurs et sessions (brief Console § 9.2-9.3). Réservé à l'Admin. */
@ApiTags('console · comptes')
@ApiBearerAuth()
@AdminOnly()
@Controller('api/admin')
export class AccountsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly profiles: ProfilesService,
    private readonly mailer: MailerService,
    private readonly today: TodayService,
    private readonly creds: CredentialsService,
  ) {}

  /** E-mail d'invitation : lien à usage unique pour définir son mot de passe (pas d'inscription en libre-service). */
  private inviteMail(a: Account, raw: string, again: boolean) {
    return this.mailer.send({
      to: [a.email],
      subject: again ? 'Invitation à RISE Cockpit (relance)' : 'Invitation à RISE Cockpit',
      text:
        `Bonjour ${a.fullName}, ${again ? 'voici un nouveau lien d’accès' : 'vous êtes invité(e) sur RISE Cockpit'}.\n\n` +
        `Pour activer votre compte, choisissez votre mot de passe en ouvrant ce lien :\n${this.creds.resetLink(raw)}\n\n` +
        `Ce lien est à usage unique et valable ${INVITE_VALIDITY_DAYS} jours.`,
    });
  }

  private async view(accounts: Array<Account & { projects: { projectId: string }[] }>) {
    const rights = await this.profiles.rightsOf(accounts);
    const now = this.today.now().getTime();
    const codes = Object.fromEntries((await this.prisma.project.findMany({ select: { id: true, code: true } })).map((p) => [p.id, p.code]));
    return accounts.map((a) => {
      const r = rights.get(a.id)!;
      return {
        id: a.id,
        fullName: a.fullName,
        email: a.email,
        personId: a.personId,
        status: a.status,
        profile: r.strongest,
        admin: r.admin,
        projectCodes: a.projects.map((p) => codes[p.projectId] ?? p.projectId),
        lastLoginAt: a.lastLoginAt,
        lastLoginDays: a.lastLoginAt ? Math.floor((now - a.lastLoginAt.getTime()) / DAY) : null,
        invitedAt: a.invitedAt,
        invitedDays: a.status === 'INVITED' && a.invitedAt ? Math.floor((now - a.invitedAt.getTime()) / DAY) : null,
        inviteExpiresAt: a.status === 'INVITED' ? a.inviteExpiresAt : null,
        inviteExpired: a.status === 'INVITED' && !!a.inviteExpiresAt && a.inviteExpiresAt.getTime() < now,
        version: a.version,
      };
    });
  }

  /**
   * Liste filtrée + compteurs synchronisés : les compteurs de statut sont calculés sur le filtre
   * (profil, projet, recherche, inactivité) sans le statut, ceux de profil sans le profil (§ 9.2).
   */
  @Get('accounts')
  async list(@Query() q: { status?: string; profile?: string; project?: string; q?: string; staleDays?: string }) {
    const all = await this.view(await this.prisma.account.findMany({ include: { projects: true }, orderBy: { createdAt: 'asc' } }));
    const status = q.status && q.status !== 'tous' ? ({ actif: 'ACTIVE', invité: 'INVITED', suspendu: 'SUSPENDED' } as Record<string, string>)[q.status] ?? q.status.toUpperCase() : null;
    const profile = q.profile && q.profile !== 'tous' ? ({ admin: 'ADMIN', pmo: 'PMO', resp: 'RESPONSABLE', lec: 'LECTEUR' } as Record<string, string>)[q.profile] ?? q.profile.toUpperCase() : null;
    const project = q.project && q.project !== 'tous' ? q.project.toUpperCase() : null;
    const text = (q.q ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const stale = q.staleDays ? Number(q.staleDays) : null;
    const base = all.filter(
      (a) =>
        (!project || a.projectCodes.includes(project)) &&
        (!text || `${a.fullName} ${a.email}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(text)) &&
        (stale === null || (a.status === 'ACTIVE' && (a.lastLoginDays ?? 9999) >= stale)),
    );
    const byStatusBase = base.filter((a) => !profile || a.profile === profile);
    const byProfileBase = base.filter((a) => !status || a.status === status);
    const count = <T extends string>(rows: typeof all, key: (a: (typeof all)[number]) => T | null, keys: T[]) => Object.fromEntries(keys.map((k) => [k, rows.filter((a) => key(a) === k).length]));
    return {
      items: base.filter((a) => (!status || a.status === status) && (!profile || a.profile === profile)),
      counts: {
        byStatus: { total: byStatusBase.length, ...count(byStatusBase, (a) => a.status, ['ACTIVE', 'INVITED', 'SUSPENDED']) },
        byProfile: { total: byProfileBase.length, ...count(byProfileBase, (a) => a.profile, ['ADMIN', 'PMO', 'RESPONSABLE', 'LECTEUR']) },
      },
    };
  }

  private async one(id: string, db: Tx = this.prisma) {
    const a = await db.account.findUnique({ where: { id }, include: { projects: true } });
    if (!a) throw notFound('Compte introuvable');
    return a;
  }

  /** Détail : projets, chantiers par projet (lecture seule, depuis les habilitations). */
  @Get('accounts/:id')
  async get(@Param('id') id: string) {
    const a = await this.one(id);
    const [v] = await this.view([a]);
    const rights = (await this.profiles.rightsOf([a])).get(a.id)!;
    const projects = await this.prisma.project.findMany({ where: { id: { in: [...new Set([...a.projects.map((p) => p.projectId), ...Object.keys(rights.projects)])] } } });
    const ws = await this.prisma.workstream.findMany({ where: { projectId: { in: projects.map((p) => p.id) } }, select: { id: true, code: true, name: true, projectId: true } });
    return {
      ...v,
      projects: projects.map((p) => {
        const r = rights.projects[p.id] ?? { pmo: false, responsable: [], lecteur: [] };
        const label = (ids: string[]) => ws.filter((w) => ids.includes(w.id)).map((w) => ({ id: w.id, code: w.code, name: w.name }));
        return { projectId: p.id, code: p.code, name: p.name, pmo: r.pmo, responsable: label(r.responsable), lecteur: label(r.lecteur), attached: a.projects.some((x) => x.projectId === p.id) };
      }),
    };
  }

  private async resolveProjects(codes: string[]) {
    const projects = await this.prisma.project.findMany({ where: { OR: [{ code: { in: codes.map((c) => c.toUpperCase()) } }, { id: { in: codes } }] } });
    if (projects.length !== new Set(codes.map((c) => c.toUpperCase())).size) throw badRequest('Projet inconnu', { projectCodes: 'un ou plusieurs projets sont introuvables' });
    return projects;
  }

  /** Q3 : l'Admin attribue ADMIN et PMO ; Responsable/Lecteur d'une personne du référentiel relèvent du PMO. */
  private async applyProfile(db: Tx, account: Account, profile: string, projects: Array<{ id: string }>) {
    await db.habilitation.deleteMany({ where: { accountId: account.id, profile: 'PMO' } });
    if (profile === 'ADMIN') {
      await db.adminGrant.upsert({ where: { accountId: account.id }, create: { accountId: account.id }, update: {} });
      return;
    }
    if (profile === 'PMO') {
      for (const p of projects) await db.habilitation.create({ data: { id: techId('hab'), projectId: p.id, accountId: account.id, profile: 'PMO' } });
      return;
    }
    const persons = await db.person.findMany({ where: { projectId: { in: projects.map((p) => p.id) }, email: { equals: account.email, mode: 'insensitive' } } });
    if (persons.length) throw businessRule('Profil à attribuer par le PMO dans le Référentiel du Cockpit', { profile: `${profile} d'une personne du référentiel : attribué par chantier par le PMO` });
    if (profile === 'RESPONSABLE') throw businessRule('Un compte externe ne peut être que Lecteur', { profile: 'RESPONSABLE réservé aux personnes du référentiel' });
    // LECTEUR externe : chantiers attribués par PUT /accounts/{id}/reader-scopes.
  }

  @Post('accounts')
  async invite(@CurrentActor() actor: Actor, @Body() body: unknown) {
    return this.createAccount(actor, parse(AccountCreate, body), false);
  }

  /** `keepReferentialRights` : compte d'une personne du référentiel dont les droits viennent déjà du PMO. */
  private async createAccount(actor: Actor, input: z.infer<typeof AccountCreate>, keepReferentialRights: boolean) {
    if (await this.prisma.account.findUnique({ where: { email: input.email } })) throw conflict('DUPLICATE', `Un compte existe déjà pour ${input.email}`);
    const projects = await this.resolveProjects(input.projectCodes);
    const now = this.today.now();
    const created = await this.prisma.$transaction(async (db) => {
      const person = await db.person.findFirst({ where: { projectId: { in: projects.map((p) => p.id) }, email: { equals: input.email, mode: 'insensitive' } } });
      const a = await db.account.create({
        data: {
          id: techId('u'),
          email: input.email,
          fullName: input.fullName,
          personId: person?.id ?? null,
          status: 'INVITED',
          invitedAt: now,
          inviteExpiresAt: new Date(now.getTime() + INVITE_VALIDITY_DAYS * DAY),
          projects: { create: projects.map((p) => ({ projectId: p.id })) },
        },
      });
      if (!keepReferentialRights) await this.applyProfile(db, a, input.profile, projects);
      await this.audit.action(db, adminCtx(actor), { action: 'Invitation d’un utilisateur', target: `${a.fullName} · ${input.profile}`, severity: 'INFO', entityType: 'Account', entityId: a.id, details: { email: a.email, profile: input.profile, projects: input.projectCodes } });
      const raw = await this.creds.issueToken(db, a, 'INVITE', input.profile === 'ADMIN' ? 'ADMIN' : 'APP', INVITE_VALIDITY_DAYS * DAY);
      return { a, raw };
    });
    await this.inviteMail(created.a, created.raw, false);
    const account = created.a;
    return (await this.view([await this.one(account.id)]))[0];
  }

  @Patch('accounts/:id')
  async patch(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() body: unknown) {
    const input = parse(AccountPatch, body);
    const a = await this.one(id);
    if (input.email && input.email !== a.email && (await this.prisma.account.findUnique({ where: { email: input.email } }))) throw conflict('DUPLICATE', `Un compte existe déjà pour ${input.email}`);
    const [before] = await this.view([a]);
    const rightsChange = input.profile !== undefined || input.projectCodes !== undefined;
    if (rightsChange && id === actor.accountId && input.profile && input.profile !== 'ADMIN') throw conflict('SELF_ACTION', 'Vous ne pouvez pas retirer vos propres droits d’administrateur');
    await this.prisma.$transaction(async (db) => {
      const projects = input.projectCodes ? await this.resolveProjects(input.projectCodes) : a.projects.map((p) => ({ id: p.projectId }));
      await db.account.update({ where: { id }, data: { fullName: input.fullName, email: input.email, version: { increment: 1 } } });
      if (input.projectCodes) {
        await db.accountProject.deleteMany({ where: { accountId: id } });
        await db.accountProject.createMany({ data: projects.map((p) => ({ accountId: id, projectId: p.id })) });
      }
      // Les profils ne sont recalculés que si le profil change, ou si les projets d'un profil global
      // (ADMIN, PMO) changent : modifier les projets d'un Responsable ou d'un Lecteur du référentiel
      // ne doit pas réattribuer un profil qui relève du PMO (Q3, 422).
      const profile = input.profile ?? before.profile ?? 'LECTEUR';
      const profileChanged = input.profile !== undefined && input.profile !== before.profile;
      if (profileChanged || (input.projectCodes !== undefined && (profile === 'ADMIN' || profile === 'PMO'))) {
        if (profile !== 'ADMIN' && before.admin) {
          if ((await db.adminGrant.count()) <= 1) throw conflict('LAST_ADMIN', 'Il doit toujours rester au moins un administrateur');
          await db.adminGrant.delete({ where: { accountId: id } });
        }
        await this.applyProfile(db, { ...a, email: input.email ?? a.email }, profile, projects);
      }
      const [after] = await this.view([await this.one(id, db)]);
      await this.audit.action(db, adminCtx(actor), {
        action: rightsChange ? 'Modification des habilitations' : 'Modification d’un utilisateur',
        target: after.fullName,
        severity: rightsChange ? 'SENSITIVE' : 'INFO',
        entityType: 'Account',
        entityId: id,
        details: { before: { fullName: before.fullName, email: before.email, profile: before.profile, projectCodes: before.projectCodes }, after: { fullName: after.fullName, email: after.email, profile: after.profile, projectCodes: after.projectCodes } },
      });
    });
    return (await this.view([await this.one(id)]))[0];
  }

  /** Suspendre : ferme immédiatement toutes les sessions ; profils et données conservés (§ 7.1). */
  @Post('accounts/:id/suspend')
  @HttpCode(200)
  async suspend(@CurrentActor() actor: Actor, @Param('id') id: string) {
    if (id === actor.accountId) throw conflict('SELF_ACTION', 'Vous ne pouvez pas vous suspendre vous-même');
    const a = await this.one(id);
    if (a.status === 'SUSPENDED') throw conflict('ALREADY_SUSPENDED', 'Compte déjà suspendu');
    await this.prisma.$transaction(async (db) => {
      await db.account.update({ where: { id }, data: { status: 'SUSPENDED', version: { increment: 1 } } });
      const closed = await db.authSession.updateMany({ where: { accountId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.action(db, adminCtx(actor), { action: 'Suspension d’un utilisateur', target: a.fullName, severity: 'SENSITIVE', entityType: 'Account', entityId: id, details: { sessionsClosed: closed.count } });
    });
    return (await this.view([await this.one(id)]))[0];
  }

  @Post('accounts/:id/reactivate')
  @HttpCode(200)
  async reactivate(@CurrentActor() actor: Actor, @Param('id') id: string) {
    const a = await this.one(id);
    if (a.status !== 'SUSPENDED') throw conflict('NOT_SUSPENDED', 'Seul un compte suspendu peut être réactivé');
    await this.prisma.$transaction(async (db) => {
      await db.account.update({ where: { id }, data: { status: a.lastLoginAt ? 'ACTIVE' : 'INVITED', version: { increment: 1 } } });
      await this.audit.action(db, adminCtx(actor), { action: 'Réactivation d’un utilisateur', target: a.fullName, severity: 'SENSITIVE', entityType: 'Account', entityId: id });
    });
    return (await this.view([await this.one(id)]))[0];
  }

  /** Relancer : nouveau lien, compteur remis à zéro (§ 7.1). */
  @Post('accounts/:id/resend-invite')
  @HttpCode(200)
  async resend(@CurrentActor() actor: Actor, @Param('id') id: string) {
    const a = await this.one(id);
    if (a.status !== 'INVITED') throw conflict('NOT_INVITED', 'Seule une invitation en attente peut être relancée');
    const now = this.today.now();
    const raw = await this.prisma.$transaction(async (db) => {
      await db.account.update({ where: { id }, data: { invitedAt: now, inviteExpiresAt: new Date(now.getTime() + INVITE_VALIDITY_DAYS * DAY), version: { increment: 1 } } });
      await this.audit.action(db, adminCtx(actor), { action: 'Relance d’une invitation', target: a.fullName, severity: 'INFO', entityType: 'Account', entityId: id });
      const isAdmin = !!(await db.adminGrant.findUnique({ where: { accountId: id } }));
      return this.creds.issueToken(db, a, 'INVITE', isAdmin ? 'ADMIN' : 'APP', INVITE_VALIDITY_DAYS * DAY);
    });
    await this.inviteMail(a, raw, true);
    return (await this.view([await this.one(id)]))[0];
  }

  /** RG12 : suppression refusée si le compte est lié (auteur d'audit, responsable d'objets, membre d'instance). */
  async accountUsages(a: Account): Promise<Usage[]> {
    const out: Usage[] = [];
    const audits = await this.prisma.auditEntry.count({ where: { accountId: a.id } });
    if (audits) out.push({ entityType: 'AUDIT_ENTRY', id: a.id, label: `${audits} entrée(s) du journal d'audit` });
    const persons = await this.prisma.person.findMany({ where: { OR: [{ id: a.personId ?? '__' }, { email: { equals: a.email, mode: 'insensitive' } }] } });
    for (const p of persons) {
      const P = { projectId: p.projectId };
      const owned = [
        ...(await this.prisma.action.findMany({ where: { ...P, ownerId: p.id }, select: { id: true } })).map((x) => ({ entityType: 'ACTION', id: x.id })),
        ...(await this.prisma.risk.findMany({ where: { ...P, ownerId: p.id }, select: { id: true } })).map((x) => ({ entityType: 'RISK', id: x.id })),
        ...(await this.prisma.issue.findMany({ where: { ...P, ownerId: p.id }, select: { id: true } })).map((x) => ({ entityType: 'ISSUE', id: x.id })),
        ...(await this.prisma.milestone.findMany({ where: { ...P, ownerId: p.id }, select: { id: true } })).map((x) => ({ entityType: 'MILESTONE', id: x.id })),
        ...(await this.prisma.deliverable.findMany({ where: { ...P, ownerId: p.id }, select: { id: true } })).map((x) => ({ entityType: 'DELIVERABLE', id: x.id })),
        ...(await this.prisma.workstream.findMany({ where: { ...P, ownerId: p.id }, select: { id: true } })).map((x) => ({ entityType: 'WORKSTREAM', id: x.id })),
        ...(await this.prisma.decision.findMany({ where: { ...P, makerId: p.id }, select: { id: true } })).map((x) => ({ entityType: 'DECISION', id: x.id })),
      ];
      for (const o of owned) out.push({ ...o, label: `Responsable de ${o.entityType} ${o.id}` });
      for (const b of await this.prisma.governanceBody.findMany({ where: { ...P, members: { some: { personId: p.id } } } })) out.push({ entityType: 'GOVERNANCE_BODY', id: b.id, label: `Membre de ${b.shortName}` });
    }
    return out;
  }

  @Delete('accounts/:id')
  @HttpCode(204)
  async remove(@CurrentActor() actor: Actor, @Param('id') id: string) {
    if (id === actor.accountId) throw conflict('SELF_ACTION', 'Vous ne pouvez pas supprimer votre propre compte');
    const a = await this.one(id);
    const usages = await this.accountUsages(a);
    if (usages.length) throw inUse(usages);
    await this.prisma.$transaction(async (db) => {
      await db.habilitation.deleteMany({ where: { accountId: id } });
      await db.adminGrant.deleteMany({ where: { accountId: id } });
      await db.userPreferences.deleteMany({ where: { accountId: id } });
      await db.account.delete({ where: { id } });
      await this.audit.action(db, adminCtx(actor), { action: 'Suppression d’un utilisateur', target: `${a.fullName} · ${a.email}`, severity: 'CRITICAL', entityType: 'Account', entityId: id });
    });
  }

  // ───────────── Profils globaux et lecteurs externes (brief Cockpit § 9.11) ─────────────

  @Put('accounts/:id/global-profiles')
  async globalProfiles(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() body: unknown) {
    const input = parse(z.object({ projectId: z.string().min(1), profiles: z.array(z.enum(['ADMIN', 'PMO'])) }).strict(), body);
    const a = await this.one(id);
    const [project] = await this.resolveProjects([input.projectId]);
    if (id === actor.accountId && !input.profiles.includes('ADMIN')) throw conflict('SELF_ACTION', 'Vous ne pouvez pas retirer vos propres droits d’administrateur');
    await this.prisma.$transaction(async (db) => {
      await db.habilitation.deleteMany({ where: { accountId: id, projectId: project.id, profile: 'PMO' } });
      if (input.profiles.includes('PMO')) await db.habilitation.create({ data: { id: techId('hab'), projectId: project.id, accountId: id, profile: 'PMO' } });
      const isAdmin = !!(await db.adminGrant.findUnique({ where: { accountId: id } }));
      if (input.profiles.includes('ADMIN') && !isAdmin) await db.adminGrant.create({ data: { accountId: id, grantedById: actor.accountId } });
      if (!input.profiles.includes('ADMIN') && isAdmin) {
        if ((await db.adminGrant.count()) <= 1) throw conflict('LAST_ADMIN', 'Il doit toujours rester au moins un administrateur');
        await db.adminGrant.delete({ where: { accountId: id } });
      }
      await db.accountProject.upsert({ where: { accountId_projectId: { accountId: id, projectId: project.id } }, create: { accountId: id, projectId: project.id }, update: {} });
      await this.audit.action(db, adminCtx(actor), { action: 'Attribution d’un profil global', target: `${a.fullName} · ${project.code} · ${input.profiles.join(', ') || 'aucun'}`, severity: 'SENSITIVE', entityType: 'Account', entityId: id });
    });
    return this.get(id);
  }

  /** Lecteur externe (partenaire, actionnaire) sur les chantiers choisis par l'Admin (§ 8.3). */
  @Put('accounts/:id/reader-scopes')
  async readerScopes(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() body: unknown) {
    const input = parse(z.object({ projectId: z.string().min(1), wsIds: z.array(z.string().min(1)) }).strict(), body);
    const a = await this.one(id);
    const [project] = await this.resolveProjects([input.projectId]);
    const person = await this.prisma.person.findFirst({ where: { projectId: project.id, email: { equals: a.email, mode: 'insensitive' } } });
    if (person) throw businessRule('Personne du référentiel : ses chantiers sont attribués par le PMO', { accountId: 'compte lié à une personne du référentiel' });
    const ws = await this.prisma.workstream.findMany({ where: { projectId: project.id, id: { in: input.wsIds } } });
    if (ws.length !== new Set(input.wsIds).size) throw badRequest('Chantier inconnu', { wsIds: 'un ou plusieurs chantiers sont introuvables' });
    await this.prisma.$transaction(async (db) => {
      await db.habilitation.deleteMany({ where: { accountId: id, projectId: project.id, profile: 'LECTEUR' } });
      for (const w of input.wsIds) await db.habilitation.create({ data: { id: techId('hab'), projectId: project.id, accountId: id, profile: 'LECTEUR', wsId: w } });
      await db.accountProject.upsert({ where: { accountId_projectId: { accountId: id, projectId: project.id } }, create: { accountId: id, projectId: project.id }, update: {} });
      await this.audit.action(db, adminCtx(actor), { action: 'Attribution des chantiers d’un lecteur externe', target: `${a.fullName} · ${project.code} · ${input.wsIds.join(', ') || 'aucun'}`, severity: 'SENSITIVE', entityType: 'Account', entityId: id });
    });
    return this.get(id);
  }

  // ───────────── Sessions ─────────────

  private sessionView(s: any, currentId?: string) {
    return { id: s.id, device: s.device, location: s.location, createdAt: s.createdAt, lastSeenAt: s.lastSeenAt, current: s.id === currentId };
  }

  @Get('accounts/:id/sessions')
  async sessions(@CurrentActor() actor: Actor, @Param('id') id: string) {
    await this.one(id);
    const rows = await this.prisma.authSession.findMany({ where: { accountId: id, revokedAt: null }, orderBy: { lastSeenAt: 'desc' } });
    return rows.map((s) => this.sessionView(s, actor.sessionId));
  }

  @Delete('accounts/:id/sessions/:sid')
  @HttpCode(204)
  async revoke(@CurrentActor() actor: Actor, @Param('id') id: string, @Param('sid') sid: string) {
    const a = await this.one(id);
    const s = await this.prisma.authSession.findFirst({ where: { id: sid, accountId: id, revokedAt: null } });
    if (!s) throw notFound('Session introuvable');
    await this.prisma.$transaction(async (db) => {
      await db.authSession.update({ where: { id: sid }, data: { revokedAt: new Date() } });
      await this.audit.action(db, adminCtx(actor), { action: 'Révocation d’une session', target: `${a.fullName} · ${s.device ?? ''}`, severity: 'SENSITIVE', entityType: 'AuthSession', entityId: sid });
    });
  }

  @Delete('accounts/:id/sessions')
  @HttpCode(204)
  async revokeAll(@CurrentActor() actor: Actor, @Param('id') id: string) {
    const a = await this.one(id);
    await this.prisma.$transaction(async (db) => {
      // Pour son propre compte, la session courante est conservée.
      const r = await db.authSession.updateMany({ where: { accountId: id, revokedAt: null, ...(id === actor.accountId ? { NOT: { id: actor.sessionId } } : {}) }, data: { revokedAt: new Date() } });
      await this.audit.action(db, adminCtx(actor), { action: 'Révocation de toutes les sessions', target: a.fullName, severity: 'SENSITIVE', entityType: 'AuthSession', entityId: id, details: { closed: r.count } });
    });
  }

  // ───────────── Administrateurs ─────────────

  @Get('admins')
  async admins() {
    const grants = await this.prisma.adminGrant.findMany({ orderBy: { since: 'asc' } });
    const accounts = await this.prisma.account.findMany({ where: { id: { in: grants.map((g) => g.accountId) } } });
    return grants.map((g) => {
      const a = accounts.find((x) => x.id === g.accountId);
      // Un seul niveau d'administrateur (brief Console § 5).
      return { accountId: g.accountId, fullName: a?.fullName ?? '', email: a?.email ?? '', status: a?.status, level: 'admin', since: g.since, grantedBy: g.grantedById };
    });
  }

  @Post('admins')
  async addAdmin(@CurrentActor() actor: Actor, @Body() body: unknown) {
    const { accountId } = parse(z.object({ accountId: z.string().min(1) }).strict(), body);
    const a = await this.one(accountId);
    if (a.status !== 'ACTIVE') throw businessRule('Seul un compte actif peut devenir administrateur', { accountId: 'compte non actif' });
    if (await this.prisma.adminGrant.findUnique({ where: { accountId } })) throw conflict('DUPLICATE', 'Ce compte est déjà administrateur');
    await this.prisma.$transaction(async (db) => {
      await db.adminGrant.create({ data: { accountId, grantedById: actor.accountId } });
      await this.audit.action(db, adminCtx(actor), { action: 'Ajout d’un administrateur', target: a.fullName, severity: 'CRITICAL', entityType: 'AdminGrant', entityId: accountId });
    });
    return this.admins();
  }

  @Delete('admins/:accountId')
  @HttpCode(204)
  async removeAdmin(@CurrentActor() actor: Actor, @Param('accountId') accountId: string) {
    if (accountId === actor.accountId) throw conflict('SELF_ACTION', 'Vous ne pouvez pas retirer vos propres droits d’administrateur');
    const g = await this.prisma.adminGrant.findUnique({ where: { accountId } });
    if (!g) throw notFound('Administrateur introuvable');
    if ((await this.prisma.adminGrant.count()) <= 1) throw conflict('LAST_ADMIN', 'Il doit toujours rester au moins un administrateur');
    const a = await this.one(accountId);
    await this.prisma.$transaction(async (db) => {
      await db.adminGrant.delete({ where: { accountId } });
      await this.audit.action(db, adminCtx(actor), { action: 'Retrait d’un administrateur', target: a.fullName, severity: 'CRITICAL', entityType: 'AdminGrant', entityId: accountId });
    });
  }

  // ───────────── Q8 bis : demandes d'invitation émises par le PMO ─────────────

  @Get('invitation-requests')
  async invitationRequests() {
    const rows = await this.prisma.invitationRequest.findMany({ orderBy: { createdAt: 'desc' } });
    const persons = await this.prisma.person.findMany({ where: { id: { in: rows.map((r) => r.personId) } } });
    return rows.map((r) => {
      const p = persons.find((x) => x.id === r.personId);
      return { ...r, person: p ? { id: p.id, name: `${p.firstName} ${p.lastName}`, email: p.email } : null };
    });
  }

  @Post('invitation-requests/:id/approve')
  @HttpCode(200)
  async approveInvitation(@CurrentActor() actor: Actor, @Param('id') id: string) {
    const r = await this.prisma.invitationRequest.findUnique({ where: { id } });
    if (!r || r.status !== 'PENDING') throw notFound('Demande introuvable ou déjà traitée');
    const p = await this.prisma.person.findUniqueOrThrow({ where: { id: r.personId } });
    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: r.projectId } });
    const account = await this.createAccount(actor, { fullName: `${p.firstName} ${p.lastName}`.trim(), email: p.email.toLowerCase(), profile: 'LECTEUR', projectCodes: [project.code] }, true);
    await this.prisma.invitationRequest.update({ where: { id }, data: { status: 'APPROVED', decidedAt: new Date(), decidedById: actor.accountId } });
    return account;
  }

  @Post('invitation-requests/:id/reject')
  @HttpCode(200)
  async rejectInvitation(@CurrentActor() actor: Actor, @Param('id') id: string) {
    const r = await this.prisma.invitationRequest.findUnique({ where: { id } });
    if (!r || r.status !== 'PENDING') throw notFound('Demande introuvable ou déjà traitée');
    await this.prisma.$transaction(async (db) => {
      await db.invitationRequest.update({ where: { id }, data: { status: 'REJECTED', decidedAt: new Date(), decidedById: actor.accountId } });
      await this.audit.action(db, adminCtx(actor), { action: 'Refus d’une demande d’invitation', target: r.personId, severity: 'INFO', entityType: 'InvitationRequest', entityId: id });
    });
    return { id, status: 'REJECTED' };
  }
}
