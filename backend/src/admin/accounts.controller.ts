import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { addDays } from '../domain/dates';
import { invitationEmail } from '../domain/invitation-email';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Account } from '@prisma/client';
import { z } from 'zod';
import { AdminOnly, Actor, CurrentActor, SuperAdminOnly } from '../core/auth/auth';
import { hashPassword, passwordProblem } from '../core/auth/password';
import { PASSWORD_MAX_LENGTH } from '../core/auth/policy';
import { AuditService } from '../core/audit.service';
import { PrismaService, Tx } from '../core/prisma.service';
import { MailerService } from '../core/mailer.service';
import { CredentialsService } from '../core/auth/credentials.service';
import { TodayService } from '../core/today.service';
import { badRequest, businessRule, conflict, forbidden, inUse, notFound, Usage } from '../core/errors';
import { techId } from '../core/ids';
import { parse } from '../core/http';
import { adminCtx, ProfilesService, SUSPENSION_ACTION } from './profiles.service';
import { ProjectDeletionService } from './project-deletion.service';
import { proposal } from '../domain/habilitation-proposals';
import { linkPerson } from '../core/person-links';

/** Validité d'une invitation (brief Console § 7.1). */
export const INVITE_VALIDITY_DAYS = 14;
/** Invitation sans réponse signalée dans « À traiter » au-delà de ce délai. */
export const INVITE_STALE_DAYS = 7;

const PROFILE = z
  .string()
  .transform((s) => ({ super: 'SUPER_ADMIN', admin: 'ADMIN', pmo: 'PMO', resp: 'RESPONSABLE', lec: 'LECTEUR' } as Record<string, string>)[s] ?? s.toUpperCase())
  .pipe(z.enum(['SUPER_ADMIN', 'ADMIN', 'PMO', 'RESPONSABLE', 'LECTEUR']));

/**
 * Habilitations d'un compte, projet par projet (profils multiples, 29/09/2026) : Administrateur de la plateforme
 * (indépendant), puis sur chaque projet rattaché PMO, ou des chantiers en Responsable et en Lecteur.
 */
const Habilitations = z
  .object({
    admin: z.boolean(),
    /** Super Admin (10/10/2026) : absent, le profil actuel est gardé ; n'a de sens qu'avec `admin`. */
    superAdmin: z.boolean().optional(),
    projects: z.array(z.object({ code: z.string().min(1), pmo: z.boolean().default(false), responsable: z.array(z.string().min(1)).default([]), lecteur: z.array(z.string().min(1)).default([]) }).strict()),
  })
  .strict();
type HabilitationsInput = z.infer<typeof Habilitations>;

const AccountCreate = z
  .object({
    fullName: z.string().trim().min(2, '2 caractères minimum').max(120),
    email: z.string().trim().toLowerCase().email('e-mail invalide'),
    profile: PROFILE.optional(),
    projectCodes: z.array(z.string().min(1)).min(1, 'au moins un projet').optional(),
    habilitations: Habilitations.optional(),
  })
  .strict()
  .refine((v) => !!v.habilitations || (!!v.profile && !!v.projectCodes), { message: 'profil et projets, ou habilitations, attendus', path: ['habilitations'] });
/**
 * Compte créé avec son mot de passe (Super Admin, 20/10/2026) : aucun e-mail, compte actif tout de suite, mot de passe
 * à changer à la première connexion. Évite d'être bloqué par les filtres de messagerie d'une société.
 */
const Password = z.object({ password: z.string().min(1, 'Saisissez le mot de passe').max(PASSWORD_MAX_LENGTH) }).strict();
const AccountPatch = z
  .object({ fullName: z.string().trim().min(2, '2 caractères minimum').max(120), email: z.string().trim().toLowerCase().email('e-mail invalide'), profile: PROFILE, projectCodes: z.array(z.string().min(1)).min(1, 'au moins un projet') })
  .partial()
  .strict();
const PROFILE_ORDER = ['SUPER_ADMIN', 'ADMIN', 'PMO', 'RESPONSABLE', 'LECTEUR'] as const;

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
    private readonly deletion: ProjectDeletionService,
  ) {}

  /** E-mail d'invitation : lien à usage unique pour définir son mot de passe (pas d'inscription en libre-service ; texte et mise en page du 11/10/2026, `invitationEmail`). */
  private inviteMail(a: Account, raw: string, again: boolean) {
    const m = invitationEmail({ fullName: a.fullName, email: a.email, link: this.creds.resetLink(raw), validityDays: INVITE_VALIDITY_DAYS, expiresIso: addDays(this.today.today(), INVITE_VALIDITY_DAYS), again });
    return this.mailer.send({ to: [a.email], subject: m.subject, text: m.text, html: m.html });
  }

  /** `db` : la transaction en cours, pour que la vue « après » d'un audit lise bien les droits qui viennent d'être écrits. */
  private async view(accounts: Array<Account & { projects: { projectId: string }[] }>, db: Tx = this.prisma) {
    const rights = await this.profiles.rightsOf(accounts, db);
    // Ce que dit le référentiel (option 1 du 29/09/2026 : la Console propose, l'Administrateur décide).
    const referential = await this.profiles.referential(accounts, db);
    const now = this.today.now().getTime();
    const codes = Object.fromEntries((await db.project.findMany({ select: { id: true, code: true } })).map((p) => [p.id, p.code]));
    return accounts.map((a) => {
      const r = rights.get(a.id)!;
      const pids = [...new Set([...a.projects.map((p) => p.projectId), ...Object.keys(r.projects)])];
      const habilitations = pids.map((pid) => {
        const x = r.projects[pid] ?? { pmo: false, responsable: [], lecteur: [] };
        return { code: codes[pid] ?? pid, pmo: x.pmo, responsable: [...x.responsable].sort(), lecteur: x.lecteur.filter((w) => !x.responsable.includes(w)).sort() };
      });
      // Tous les profils détenus (un compte peut en cumuler plusieurs), du plus large au plus restreint.
      // Super Admin (10/10/2026) : profil d'administrateur le plus large, affiché à la place d'Admin.
      const has = { SUPER_ADMIN: r.superAdmin, ADMIN: r.admin && !r.superAdmin, PMO: habilitations.some((h) => h.pmo), RESPONSABLE: habilitations.some((h) => h.responsable.length > 0), LECTEUR: habilitations.some((h) => h.lecteur.length > 0) };
      return {
        id: a.id,
        fullName: a.fullName,
        email: a.email,
        personId: a.personId,
        status: a.status,
        profile: r.superAdmin ? 'SUPER_ADMIN' : r.strongest,
        profiles: PROFILE_ORDER.filter((p) => has[p]),
        admin: r.admin,
        superAdmin: r.superAdmin,
        habilitations,
        // E-mail du référentiel quand il diffère de celui du compte (personne liée) : l'Administrateur l'applique.
        emailReferentiel: (referential.get(a.id) ?? []).find((e) => e.emailEcart)?.email.trim().toLowerCase() ?? null,
        referentiel: (referential.get(a.id) ?? []).map(({ code, personne, active, responsable, rattachement, proposition, ecarts }) => ({ code, personne, active, responsable, rattachement, proposition, ecarts })),
        projectCodes: a.projects.map((p) => codes[p.projectId] ?? p.projectId),
        lastLoginAt: a.lastLoginAt,
        mustChangePassword: a.mustChangePassword,
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
    const profile = q.profile && q.profile !== 'tous' ? ({ super: 'SUPER_ADMIN', admin: 'ADMIN', pmo: 'PMO', resp: 'RESPONSABLE', lec: 'LECTEUR' } as Record<string, string>)[q.profile] ?? q.profile.toUpperCase() : null;
    const project = q.project && q.project !== 'tous' ? q.project.toUpperCase() : null;
    const text = (q.q ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const stale = q.staleDays ? Number(q.staleDays) : null;
    const base = all.filter(
      (a) =>
        (!project || a.projectCodes.includes(project)) &&
        (!text || `${a.fullName} ${a.email}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(text)) &&
        (stale === null || (a.status === 'ACTIVE' && (a.lastLoginDays ?? 9999) >= stale)),
    );
    // Profil : tout compte qui le détient (profils cumulés), et non seulement son profil le plus large.
    const byStatusBase = base.filter((a) => !profile || a.profiles.includes(profile as any));
    const byProfileBase = base.filter((a) => !status || a.status === status);
    const count = <T extends string>(rows: typeof all, key: (a: (typeof all)[number]) => T | null, keys: T[]) => Object.fromEntries(keys.map((k) => [k, rows.filter((a) => key(a) === k).length]));
    return {
      items: base.filter((a) => (!status || a.status === status) && (!profile || a.profiles.includes(profile as any))),
      counts: {
        byStatus: { total: byStatusBase.length, ...count(byStatusBase, (a) => a.status, ['ACTIVE', 'INVITED', 'SUSPENDED']) },
        byProfile: { total: byProfileBase.length, ...Object.fromEntries(PROFILE_ORDER.map((p) => [p, byProfileBase.filter((a) => a.profiles.includes(p)).length])) },
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

  /** Compte d'un Super Admin (10/10/2026) : seul un Super Admin le modifie, le suspend, le supprime ou change ses droits. */
  private async guardSuper(actor: Actor, id: string, db: Tx = this.prisma) {
    if (actor.isSuperAdmin) return;
    if ((await db.adminGrant.findUnique({ where: { accountId: id } }))?.superAdmin) throw forbidden('Compte d’un Super Admin : action réservée au Super Admin');
  }

  /** Attribue ou retire le profil Super Admin (le compte reste administrateur) : Super Admin seulement ; il en reste toujours un. */
  private async setSuper(db: Tx, actor: Actor, id: string, want: boolean) {
    const g = await db.adminGrant.findUnique({ where: { accountId: id } });
    if (!!g?.superAdmin === want) return;
    if (!actor.isSuperAdmin) throw forbidden('Profil Super Admin : attribution réservée au Super Admin');
    if (!want) {
      if (id === actor.accountId) throw conflict('SELF_ACTION', 'Vous ne pouvez pas retirer votre propre profil Super Admin');
      if ((await db.adminGrant.count({ where: { superAdmin: true } })) <= 1) throw conflict('LAST_SUPER_ADMIN', 'Il doit toujours rester au moins un Super Admin');
    }
    await db.adminGrant.upsert({ where: { accountId: id }, create: { accountId: id, grantedById: actor.accountId, superAdmin: want }, update: { superAdmin: want } });
    const who = (await db.account.findUnique({ where: { id } }))?.fullName ?? id;
    await this.audit.action(db, adminCtx(actor), { action: want ? 'Attribution du profil Super Admin' : 'Retrait du profil Super Admin', target: who, severity: 'CRITICAL', entityType: 'AdminGrant', entityId: id });
  }

  /** Q3 : l'Admin attribue ADMIN et PMO ; Responsable/Lecteur d'une personne du référentiel relèvent du PMO. */
  private async applyProfile(db: Tx, account: Account, profile: string, projects: Array<{ id: string }>) {
    await db.habilitation.deleteMany({ where: { accountId: account.id, profile: 'PMO' } });
    if (profile === 'ADMIN' || profile === 'SUPER_ADMIN') {
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

  /**
   * Créer un compte avec son mot de passe (Super Admin, 20/10/2026) : mêmes champs que l'invitation, plus `password` ;
   * le compte est actif, sans e-mail ni lien, et le mot de passe est à changer à la première connexion.
   */
  @Post('accounts/with-password')
  @SuperAdminOnly()
  async createWithPassword(@CurrentActor() actor: Actor, @Body() body: unknown) {
    const raw = (body ?? {}) as Record<string, unknown>;
    const { password } = parse(Password, { password: raw.password });
    const { password: _omit, ...rest } = raw;
    const input = parse(AccountCreate, rest);
    const problem = await passwordProblem(password, null);
    if (problem) throw badRequest('Mot de passe refusé', { password: problem });
    return this.createAccount(actor, input, false, password);
  }

  /**
   * Définir le mot de passe d'un compte invité (Super Admin, 20/10/2026) : le compte devient actif sans attendre l'e-mail
   * d'invitation, dont le lien ne sert plus ; le mot de passe est à changer à la première connexion.
   */
  @Post('accounts/:id/password')
  @HttpCode(200)
  @SuperAdminOnly()
  async setInvitedPassword(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() body: unknown) {
    const { password } = parse(Password, body);
    const a = await this.one(id);
    if (a.status !== 'INVITED') throw conflict('NOT_INVITED', 'Le mot de passe ne se définit ici que pour un compte invité');
    const problem = await passwordProblem(password, null);
    if (problem) throw badRequest('Mot de passe refusé', { password: problem });
    const passwordHash = await hashPassword(password);
    await this.prisma.$transaction(async (db) => {
      await db.account.update({ where: { id }, data: { status: 'ACTIVE', passwordHash, mustChangePassword: true, passwordChangedAt: this.today.now(), inviteExpiresAt: null, version: { increment: 1 } } });
      await db.passwordToken.updateMany({ where: { accountId: id, usedAt: null }, data: { usedAt: new Date() } });
      await this.audit.action(db, adminCtx(actor), { action: 'Mot de passe défini par le Super Admin', target: a.fullName, severity: 'SENSITIVE', entityType: 'Account', entityId: id, details: { email: a.email, mustChangePassword: true } });
    });
    return (await this.view([await this.one(id)]))[0];
  }

  /**
   * `keepReferentialRights` : compte d'une personne du référentiel dont les droits viennent déjà du PMO.
   * `password` : compte créé actif avec ce mot de passe (à changer à la première connexion), sans invitation ni e-mail.
   */
  private async createAccount(actor: Actor, input: z.infer<typeof AccountCreate>, keepReferentialRights: boolean, password?: string) {
    if (await this.prisma.account.findUnique({ where: { email: input.email } })) throw conflict('DUPLICATE', `Un compte existe déjà pour ${input.email}`);
    const passwordHash = password ? await hashPassword(password) : null;
    const hab = input.habilitations;
    const projects = await this.resolveProjects(hab ? hab.projects.map((p) => p.code) : input.projectCodes!);
    if (!projects.length && !hab?.admin) throw badRequest('Aucun accès', { habilitations: 'au moins un projet, ou le rôle d’administrateur' });
    const label = hab
      ? [hab.admin ? (hab.superAdmin ? 'SUPER_ADMIN' : 'ADMIN') : null, ...hab.projects.map((p) => `${p.code} ${p.pmo ? 'PMO' : `${p.responsable.length} resp. · ${p.lecteur.length} lect.`}`)].filter(Boolean).join(' · ')
      : input.profile!;
    const now = this.today.now();
    const created = await this.prisma.$transaction(async (db) => {
      const persons = await db.person.findMany({ where: { projectId: { in: projects.map((p) => p.id) }, accountId: null, email: { equals: input.email, mode: 'insensitive' } } });
      const person = persons[0];
      const a = await db.account.create({
        data: {
          id: techId('u'),
          email: input.email,
          fullName: input.fullName,
          personId: person?.id ?? null,
          ...(passwordHash
            ? { status: 'ACTIVE' as const, passwordHash, mustChangePassword: true, passwordChangedAt: now }
            : { status: 'INVITED' as const, invitedAt: now, inviteExpiresAt: new Date(now.getTime() + INVITE_VALIDITY_DAYS * DAY) }),
          projects: { create: projects.map((p) => ({ projectId: p.id })) },
        },
      });
      // Invitation par l'Administrateur : les personnes du référentiel à cette adresse sont rattachées au compte.
      for (const p of persons) await linkPerson(db, p.id, a.id);
      if (hab) await this.writeHabilitations(db, actor, a, hab);
      else if (!keepReferentialRights) {
        await this.applyProfile(db, a, input.profile!, projects);
        if (input.profile === 'SUPER_ADMIN') await this.setSuper(db, actor, a.id, true);
      }
      const details = { email: a.email, profile: input.profile ?? null, projects: projects.map((p) => p.code), habilitations: hab ?? null };
      if (passwordHash) {
        await this.audit.action(db, adminCtx(actor), { action: 'Création d’un compte avec mot de passe', target: `${a.fullName} · ${label}`, severity: 'SENSITIVE', entityType: 'Account', entityId: a.id, details: { ...details, mustChangePassword: true } });
        return { a, raw: null };
      }
      await this.audit.action(db, adminCtx(actor), { action: 'Invitation d’un utilisateur', target: `${a.fullName} · ${label}`, severity: 'INFO', entityType: 'Account', entityId: a.id, details });
      const raw = await this.creds.issueToken(db, a, 'INVITE', (hab ? hab.admin : input.profile === 'ADMIN' || input.profile === 'SUPER_ADMIN') ? 'ADMIN' : 'APP', INVITE_VALIDITY_DAYS * DAY);
      return { a, raw };
    });
    // Le compte est créé même si l'e-mail ne part pas (serveur d'envoi indisponible) : la réponse le dit, et
    // l'Administrateur relance l'invitation ; sinon la Console affichait une erreur et un nouvel essai tombait en doublon.
    if (!created.raw) return { ...(await this.view([await this.one(created.a.id)]))[0], inviteSent: null, inviteError: null };
    let inviteError: string | null = null;
    try {
      await this.inviteMail(created.a, created.raw, false);
    } catch (e) {
      inviteError = e instanceof Error ? e.message : String(e);
      console.warn('[comptes] e-mail d’invitation non envoyé :', inviteError);
    }
    const account = created.a;
    return { ...(await this.view([await this.one(account.id)]))[0], inviteSent: !inviteError, inviteError };
  }

  @Patch('accounts/:id')
  async patch(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() body: unknown) {
    const input = parse(AccountPatch, body);
    await this.guardSuper(actor, id);
    const a = await this.one(id);
    if (input.email && input.email !== a.email && (await this.prisma.account.findUnique({ where: { email: input.email } }))) throw conflict('DUPLICATE', `Un compte existe déjà pour ${input.email}`);
    const [before] = await this.view([a]);
    const rightsChange = input.profile !== undefined || input.projectCodes !== undefined;
    if (rightsChange && id === actor.accountId && input.profile && input.profile !== 'ADMIN' && input.profile !== 'SUPER_ADMIN') throw conflict('SELF_ACTION', 'Vous ne pouvez pas retirer vos propres droits d’administrateur');
    await this.prisma.$transaction(async (db) => {
      const projects = input.projectCodes ? await this.resolveProjects(input.projectCodes) : a.projects.map((p) => ({ id: p.projectId }));
      await db.account.update({ where: { id }, data: { fullName: input.fullName, email: input.email, version: { increment: 1 } } });
      // Nouvelle adresse : les liens déjà envoyés à l'ancienne (invitation, réinitialisation) ne servent plus.
      if (input.email && input.email !== a.email) await db.passwordToken.updateMany({ where: { accountId: id, usedAt: null }, data: { usedAt: new Date() } });
      if (input.projectCodes) {
        await db.accountProject.deleteMany({ where: { accountId: id } });
        await db.accountProject.createMany({ data: projects.map((p) => ({ accountId: id, projectId: p.id })) });
      }
      // Les profils ne sont recalculés que si le profil change, ou si les projets d'un profil global
      // (ADMIN, PMO) changent : modifier les projets d'un Responsable ou d'un Lecteur du référentiel
      // ne doit pas réattribuer un profil qui relève du PMO (Q3, 422).
      const profile = input.profile ?? before.profile ?? 'LECTEUR';
      const profileChanged = input.profile !== undefined && input.profile !== before.profile;
      if (profileChanged || (input.projectCodes !== undefined && (profile === 'ADMIN' || profile === 'SUPER_ADMIN' || profile === 'PMO'))) {
        // Super Admin : attribué ou retiré par un Super Admin seulement ; il en reste toujours un.
        if (profileChanged && before.superAdmin && profile !== 'SUPER_ADMIN') await this.setSuper(db, actor, id, false);
        if (profile !== 'ADMIN' && profile !== 'SUPER_ADMIN' && before.admin) {
          if ((await db.adminGrant.count()) <= 1) throw conflict('LAST_ADMIN', 'Il doit toujours rester au moins un administrateur');
          await db.adminGrant.delete({ where: { accountId: id } });
        }
        await this.applyProfile(db, { ...a, email: input.email ?? a.email }, profile, projects);
        if (profile === 'SUPER_ADMIN') await this.setSuper(db, actor, id, true);
      }
      const [after] = await this.view([await this.one(id, db)], db);
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

  /**
   * Appliquer l'e-mail du référentiel (décision du 30/09/2026) : l'adresse est lue sur la personne liée au compte, jamais
   * saisie. Les liens envoyés à l'ancienne adresse sont invalidés ; une invitation en attente est renvoyée à la nouvelle.
   */
  @Post('accounts/:id/referential-email')
  @HttpCode(200)
  async applyReferentialEmail(@CurrentActor() actor: Actor, @Param('id') id: string) {
    await this.guardSuper(actor, id);
    const a = await this.one(id);
    // Personne rattachée (lien direct, puis `Person.accountId`) dont l'e-mail diffère de celui du compte.
    const linked = await this.prisma.person.findMany({ where: { OR: [{ id: a.personId ?? '__' }, { accountId: a.id }] }, orderBy: { id: 'asc' } });
    const person = linked.find((p) => p.email.trim().toLowerCase() !== a.email.toLowerCase()) ?? linked[0] ?? null;
    if (!person) throw conflict('NO_REFERENTIAL_PERSON', 'Ce compte n’est lié à aucune personne du référentiel');
    const email = person.email.trim().toLowerCase();
    if (!z.string().email().safeParse(email).success) throw conflict('INVALID_EMAIL', `L’e-mail du référentiel (${person.email}) n’est pas valide : faites-le corriger par le PMO`);
    if (email === a.email.toLowerCase()) throw conflict('ALREADY_ALIGNED', 'L’e-mail du compte est déjà celui du référentiel');
    if (await this.prisma.account.findUnique({ where: { email } })) throw conflict('DUPLICATE', `Un compte existe déjà pour ${email}`);
    const now = this.today.now();
    const invited = a.status === 'INVITED';
    const raw = await this.prisma.$transaction(async (db) => {
      await db.account.update({ where: { id }, data: { email, ...(invited ? { invitedAt: now, inviteExpiresAt: new Date(now.getTime() + INVITE_VALIDITY_DAYS * DAY) } : {}), version: { increment: 1 } } });
      await db.passwordToken.updateMany({ where: { accountId: id, usedAt: null }, data: { usedAt: new Date() } });
      await this.audit.action(db, adminCtx(actor), { action: 'E-mail repris du référentiel', target: a.fullName, severity: 'SENSITIVE', entityType: 'Account', entityId: id, details: { before: a.email, after: email, inviteResent: invited } });
      if (!invited) return null;
      const isAdmin = !!(await db.adminGrant.findUnique({ where: { accountId: id } }));
      return this.creds.issueToken(db, { ...a, email }, 'INVITE', isAdmin ? 'ADMIN' : 'APP', INVITE_VALIDITY_DAYS * DAY);
    });
    let inviteError: string | null = null;
    if (raw) await this.inviteMail({ ...a, email }, raw, true).catch((e) => { inviteError = (e as Error).message || 'envoi impossible'; });
    return { ...(await this.view([await this.one(id)]))[0], inviteSent: raw ? !inviteError : null, inviteError };
  }

  /** Suspendre : ferme immédiatement toutes les sessions ; profils et données conservés (§ 7.1). */
  @Post('accounts/:id/suspend')
  @HttpCode(200)
  async suspend(@CurrentActor() actor: Actor, @Param('id') id: string) {
    await this.guardSuper(actor, id);
    if (id === actor.accountId) throw conflict('SELF_ACTION', 'Vous ne pouvez pas vous suspendre vous-même');
    const a = await this.one(id);
    if (a.status === 'SUSPENDED') throw conflict('ALREADY_SUSPENDED', 'Compte déjà suspendu');
    await this.prisma.$transaction(async (db) => {
      await db.account.update({ where: { id }, data: { status: 'SUSPENDED', version: { increment: 1 } } });
      const closed = await db.authSession.updateMany({ where: { accountId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.action(db, adminCtx(actor), { action: SUSPENSION_ACTION, target: a.fullName, severity: 'SENSITIVE', entityType: 'Account', entityId: id, details: { sessionsClosed: closed.count } });
    });
    return (await this.view([await this.one(id)]))[0];
  }

  @Post('accounts/:id/reactivate')
  @HttpCode(200)
  async reactivate(@CurrentActor() actor: Actor, @Param('id') id: string) {
    await this.guardSuper(actor, id);
    const a = await this.one(id);
    if (a.status !== 'SUSPENDED') throw conflict('NOT_SUSPENDED', 'Seul un compte suspendu peut être réactivé');
    await this.prisma.$transaction(async (db) => {
      await db.account.update({ where: { id }, data: { status: a.lastLoginAt || a.passwordHash ? 'ACTIVE' : 'INVITED', version: { increment: 1 } } });
      await this.audit.action(db, adminCtx(actor), { action: 'Réactivation d’un utilisateur', target: a.fullName, severity: 'SENSITIVE', entityType: 'Account', entityId: id });
    });
    return (await this.view([await this.one(id)]))[0];
  }

  /** Relancer : nouveau lien, compteur remis à zéro (§ 7.1). */
  @Post('accounts/:id/resend-invite')
  @HttpCode(200)
  async resend(@CurrentActor() actor: Actor, @Param('id') id: string) {
    await this.guardSuper(actor, id);
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
    // Journal d'audit : ne bloque plus la suppression (arbitrage du 11/10/2026). Chaque entrée garde le nom de l'auteur
    // (`actorName`) et le journal n'est jamais modifié : la trace reste lisible après la suppression du compte.
    const persons = await this.prisma.person.findMany({ where: { OR: [{ id: a.personId ?? '__' }, { accountId: a.id }, { email: { equals: a.email, mode: 'insensitive' } }] } });
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

  // ───────────── Supprimer les comptes suspendus (Utilisateurs, 11/10/2026) ─────────────

  /**
   * Comptes suspendus : ceux qui peuvent être supprimés et ceux qui sont gardés, avec la raison — administrateur de la Console,
   * suspendu par la suppression d'un projet encore restaurable (la restauration le réactivera), ou lié à des données (journal
   * d'audit, responsabilités dans un projet), comme pour la suppression d'un seul compte.
   */
  private async suspendedTriage(actor: Actor) {
    const accs = await this.prisma.account.findMany({ where: { status: 'SUSPENDED' }, orderBy: { fullName: 'asc' } });
    const [grants, restorable] = await Promise.all([this.prisma.adminGrant.findMany({ select: { accountId: true } }), this.deletion.restorableSuspensions()]);
    const admins = new Set(grants.map((g: { accountId: string }) => g.accountId));
    const deletable: Account[] = [], kept: Array<{ id: string; fullName: string; email: string; reason: string }> = [];
    for (const a of accs) {
      const keep = (reason: string) => kept.push({ id: a.id, fullName: a.fullName, email: a.email, reason });
      if (a.id === actor.accountId) continue;
      if (admins.has(a.id)) { keep('Administrateur de la Console : retirez d’abord ses droits'); continue; }
      if (restorable.has(a.id)) { keep(`Suspendu par la suppression du projet ${restorable.get(a.id)}, encore restaurable`); continue; }
      const usages = await this.accountUsages(a);
      if (usages.length) { keep(usages.slice(0, 2).map((u) => u.label).join(' · ') + (usages.length > 2 ? ` (+${usages.length - 2})` : '')); continue; }
      deletable.push(a);
    }
    return { deletable, kept };
  }

  @Get('accounts-suspended')
  async suspendedPreview(@CurrentActor() actor: Actor) {
    const { deletable, kept } = await this.suspendedTriage(actor);
    return { deletable: deletable.map((a) => ({ id: a.id, fullName: a.fullName, email: a.email })), kept };
  }

  /** Supprime les comptes suspendus supprimables (tri refait au moment de l'appel) ; chaque suppression est journalisée. */
  @Delete('accounts-suspended')
  async suspendedDelete(@CurrentActor() actor: Actor) {
    const { deletable, kept } = await this.suspendedTriage(actor);
    const deleted: string[] = [];
    for (const a of deletable) {
      try {
        await this.prisma.$transaction(async (db) => {
          await db.habilitation.deleteMany({ where: { accountId: a.id } });
          await db.person.updateMany({ where: { accountId: a.id }, data: { accountId: null } });
          await db.userPreferences.deleteMany({ where: { accountId: a.id } });
          await db.account.delete({ where: { id: a.id } });
          await this.audit.action(db, adminCtx(actor), { action: 'Suppression d’un utilisateur', target: `${a.fullName} · ${a.email}`, severity: 'CRITICAL', entityType: 'Account', entityId: a.id, details: { motif: 'Suppression des comptes suspendus' } });
        });
        deleted.push(a.id);
      } catch {
        kept.push({ id: a.id, fullName: a.fullName, email: a.email, reason: 'Données liées : suppression impossible' });
      }
    }
    return { deleted: deleted.length, kept };
  }

  @Delete('accounts/:id')
  @HttpCode(204)
  async remove(@CurrentActor() actor: Actor, @Param('id') id: string) {
    await this.guardSuper(actor, id);
    if (id === actor.accountId) throw conflict('SELF_ACTION', 'Vous ne pouvez pas supprimer votre propre compte');
    const a = await this.one(id);
    const usages = await this.accountUsages(a);
    if (usages.length) throw inUse(usages);
    await this.prisma.$transaction(async (db) => {
      await db.habilitation.deleteMany({ where: { accountId: id } });
      await db.adminGrant.deleteMany({ where: { accountId: id } });
      await db.person.updateMany({ where: { accountId: id }, data: { accountId: null } });
      await db.userPreferences.deleteMany({ where: { accountId: id } });
      await db.account.delete({ where: { id } });
      await this.audit.action(db, adminCtx(actor), { action: 'Suppression d’un utilisateur', target: `${a.fullName} · ${a.email}`, severity: 'CRITICAL', entityType: 'Account', entityId: id });
    });
  }

  // ───────────── Habilitations projet par projet (profils multiples) ─────────────

  /** Chantiers d'un projet, pour attribuer des chantiers en Responsable ou en Lecteur. */
  @Get('projects/:id/workstreams')
  async workstreams(@Param('id') id: string) {
    const [p] = await this.resolveProjects([id]);
    return (await this.prisma.workstream.findMany({ where: { projectId: p.id }, orderBy: { seq: 'asc' }, select: { id: true, code: true, name: true } })).map((w) => ({ id: w.id, code: w.code, name: w.name }));
  }

  /**
   * Remplace toutes les habilitations du compte : rôle d'administrateur, projets rattachés et, sur chacun, PMO ou
   * chantiers en Responsable / Lecteur. Décision du 29/09/2026 : tout s'attribue depuis la Console, y compris pour
   * une personne du référentiel (ses droits sont alors écrits sur la personne, comme ceux posés par le PMO).
   */
  @Put('accounts/:id/habilitations')
  async putHabilitations(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() body: unknown) {
    const input = parse(Habilitations, body);
    await this.guardSuper(actor, id);
    const a = await this.one(id);
    if (id === actor.accountId && !input.admin) throw conflict('SELF_ACTION', 'Vous ne pouvez pas retirer vos propres droits d’administrateur');
    const [before] = await this.view([a]);
    await this.prisma.$transaction(async (db) => {
      await this.writeHabilitations(db, actor, a, input);
      const [after] = await this.view([await this.one(id, db)], db);
      await this.audit.action(db, adminCtx(actor), {
        action: 'Modification des habilitations',
        target: `${a.fullName} · ${after.profiles.join(', ') || 'aucun profil'}`,
        severity: 'SENSITIVE',
        entityType: 'Account',
        entityId: id,
        details: { avant: { admin: before.admin, superAdmin: before.superAdmin, habilitations: before.habilitations }, apres: { admin: after.admin, superAdmin: after.superAdmin, habilitations: after.habilitations } },
      });
    });
    return this.get(id);
  }

  private async writeHabilitations(db: Tx, actor: Actor, a: Account, input: HabilitationsInput) {
    const codes = input.projects.map((p) => p.code.toUpperCase());
    if (new Set(codes).size !== codes.length) throw badRequest('Projet en double', { projects: 'un projet apparaît deux fois' });
    const projects = codes.length ? await this.resolveProjects(codes) : [];
    // Rôle d'administrateur : indépendant des projets ; il reste toujours au moins un administrateur.
    const grant = await db.adminGrant.findUnique({ where: { accountId: a.id } }), isAdmin = !!grant;
    // Super Admin (10/10/2026) : demandé, sinon gardé tant que le compte reste administrateur.
    const wantSuper = input.admin && (input.superAdmin ?? !!grant?.superAdmin);
    if (grant?.superAdmin && !wantSuper) await this.setSuper(db, actor, a.id, false);
    if (input.admin && !isAdmin) await db.adminGrant.create({ data: { accountId: a.id, grantedById: actor.accountId } });
    if (!input.admin && isAdmin) {
      if ((await db.adminGrant.count()) <= 1) throw conflict('LAST_ADMIN', 'Il doit toujours rester au moins un administrateur');
      await db.adminGrant.delete({ where: { accountId: a.id } });
    }
    if (wantSuper && !grant?.superAdmin) await this.setSuper(db, actor, a.id, true);
    // Projets touchés : ceux demandés et ceux rattachés jusqu'ici (un projet retiré perd ses habilitations).
    const attached = (await db.accountProject.findMany({ where: { accountId: a.id } })).map((x) => x.projectId);
    for (const pid of [...new Set([...attached, ...projects.map((p) => p.id)])]) {
      // Personne rattachée au compte ; sinon personne de même e-mail encore sans compte, que l'Administrateur rattache ici.
      const person =
        (await db.person.findFirst({ where: { projectId: pid, OR: [...(a.personId ? [{ id: a.personId }] : []), { accountId: a.id }] } })) ??
        (await db.person.findFirst({ where: { projectId: pid, accountId: null, email: { equals: a.email, mode: 'insensitive' as const } } }));
      if (person && projects.some((x) => x.id === pid)) await linkPerson(db, person.id, a.id);
      await db.habilitation.deleteMany({ where: { projectId: pid, OR: [{ accountId: a.id }, ...(person ? [{ personId: person.id }] : [])] } });
      const code = projects.find((x) => x.id === pid)?.code;
      const want = code ? input.projects.find((p) => p.code.toUpperCase() === code) : undefined;
      if (!want) continue;
      // Personne du référentiel : droits écrits sur la personne (mêmes lignes que celles du PMO dans le Cockpit).
      const owner = person ? { personId: person.id } : { accountId: a.id };
      if (want.pmo) {
        await db.habilitation.create({ data: { id: techId('hab'), projectId: pid, profile: 'PMO', ...owner } });
        continue;
      }
      const ws = new Set((await db.workstream.findMany({ where: { projectId: pid }, select: { id: true } })).map((w) => w.id));
      const unknown = [...want.responsable, ...want.lecteur].filter((w) => !ws.has(w));
      if (unknown.length) throw badRequest('Chantier inconnu', { projects: `${want.code} : ${unknown.join(', ')}` });
      for (const w of new Set(want.responsable)) await db.habilitation.create({ data: { id: techId('hab'), projectId: pid, profile: 'RESPONSABLE', wsId: w, ...owner } });
      for (const w of new Set(want.lecteur.filter((x) => !want.responsable.includes(x)))) await db.habilitation.create({ data: { id: techId('hab'), projectId: pid, profile: 'LECTEUR', wsId: w, ...owner } });
    }
    await db.accountProject.deleteMany({ where: { accountId: a.id } });
    if (projects.length) await db.accountProject.createMany({ data: projects.map((p) => ({ accountId: a.id, projectId: p.id })) });
  }

  // ───────────── Profils globaux et lecteurs externes (brief Cockpit § 9.11) ─────────────

  @Put('accounts/:id/global-profiles')
  async globalProfiles(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() body: unknown) {
    const input = parse(z.object({ projectId: z.string().min(1), profiles: z.array(z.enum(['ADMIN', 'PMO'])) }).strict(), body);
    await this.guardSuper(actor, id);
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
        await this.setSuper(db, actor, id, false);
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
    await this.guardSuper(actor, id);
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
    await this.guardSuper(actor, id);
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
    await this.guardSuper(actor, id);
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
      // Deux niveaux depuis le 10/10/2026 : Super Admin et Admin (menu IA en lecture seule).
      return { accountId: g.accountId, fullName: a?.fullName ?? '', email: a?.email ?? '', status: a?.status, level: g.superAdmin ? 'super' : 'admin', superAdmin: g.superAdmin, since: g.since, grantedBy: g.grantedById, seeCosts: g.seeCosts, seeIndividual: g.seeIndividual };
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

  /** Niveau d'un administrateur (10/10/2026) : Super Admin ou Admin ; Super Admin seulement, jamais son propre niveau. */
  @Put('admins/:accountId/level')
  async adminLevel(@CurrentActor() actor: Actor, @Param('accountId') accountId: string, @Body() body: unknown) {
    const { level } = parse(z.object({ level: z.enum(['super', 'admin']) }).strict(), body);
    if (!(await this.prisma.adminGrant.findUnique({ where: { accountId } }))) throw notFound('Administrateur introuvable');
    await this.prisma.$transaction((db) => this.setSuper(db, actor, accountId, level === 'super'));
    return this.admins();
  }

  @Delete('admins/:accountId')
  @HttpCode(204)
  async removeAdmin(@CurrentActor() actor: Actor, @Param('accountId') accountId: string) {
    if (accountId === actor.accountId) throw conflict('SELF_ACTION', 'Vous ne pouvez pas retirer vos propres droits d’administrateur');
    const g = await this.prisma.adminGrant.findUnique({ where: { accountId } });
    if (!g) throw notFound('Administrateur introuvable');
    if ((await this.prisma.adminGrant.count()) <= 1) throw conflict('LAST_ADMIN', 'Il doit toujours rester au moins un administrateur');
    await this.guardSuper(actor, accountId);
    const a = await this.one(accountId);
    await this.prisma.$transaction(async (db) => {
      await this.setSuper(db, actor, accountId, false);
      await db.adminGrant.delete({ where: { accountId } });
      await this.audit.action(db, adminCtx(actor), { action: 'Retrait d’un administrateur', target: a.fullName, severity: 'CRITICAL', entityType: 'AdminGrant', entityId: accountId });
    });
  }

  // ───────────── Q8 bis : demandes d'invitation émises par le PMO ─────────────

  /**
   * Demandes d'invitation. Pour la page Utilisateurs (11/10/2026 : une demande en attente apparaît parmi les invités,
   * avant même la création du compte) : projet, demandeur, droits proposés par le référentiel et notification à décider
   * (même décision que dans la cloche : délai d'annulation et message au PMO demandeur).
   */
  @Get('invitation-requests')
  async invitationRequests() {
    const rows = await this.prisma.invitationRequest.findMany({ orderBy: { createdAt: 'desc' } });
    const persons = await this.prisma.person.findMany({ where: { id: { in: rows.map((r) => r.personId) } } });
    const projects = new Map((await this.prisma.project.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.projectId))] } }, select: { id: true, code: true } })).map((p) => [p.id, p.code]));
    const by = new Map((await this.prisma.account.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.requestedById))] } }, select: { id: true, fullName: true } })).map((a) => [a.id, a.fullName]));
    const notes = new Map((await this.prisma.notification.findMany({ where: { key: { in: rows.map((r) => `invite:${r.id}`) } }, select: { id: true, key: true, status: true } })).map((n) => [n.key, n]));
    const codes = new Map((await this.prisma.workstream.findMany({ where: { projectId: { in: [...projects.keys()] } }, select: { id: true, seq: true } })).map((w) => [w.id, `C${w.seq}`]));
    return Promise.all(rows.map(async (r) => {
      const p = persons.find((x) => x.id === r.personId);
      const owned = p && r.status === 'PENDING' ? (await this.prisma.workstream.findMany({ where: { projectId: r.projectId, ownerId: p.id }, select: { id: true } })).map((w) => w.id) : [];
      const prop = p && r.status === 'PENDING' ? proposal(owned, p.wsIds) : null;
      const n = notes.get(`invite:${r.id}`);
      return {
        ...r, person: p ? { id: p.id, name: `${p.firstName} ${p.lastName}`, email: p.email } : null,
        projectCode: projects.get(r.projectId) ?? null, requestedByName: by.get(r.requestedById) ?? null,
        proposal: prop ? { responsable: prop.responsable.map((w) => codes.get(w) ?? w), lecteur: prop.lecteur.map((w) => codes.get(w) ?? w) } : null,
        notificationId: n?.id ?? null, notificationStatus: n?.status ?? null,
      };
    }));
  }

  @Post('invitation-requests/:id/approve')
  @HttpCode(200)
  async approveInvitation(@CurrentActor() actor: Actor, @Param('id') id: string) {
    const r = await this.prisma.invitationRequest.findUnique({ where: { id } });
    if (!r || r.status !== 'PENDING') throw notFound('Demande introuvable ou déjà traitée');
    const p = await this.prisma.person.findUniqueOrThrow({ where: { id: r.personId } });
    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: r.projectId } });
    // Droits proposés par le référentiel (responsable de chantier → Responsable, chantiers de rattachement → Lecteur),
    // appliqués à la création ; l'Administrateur peut les ajuster ensuite dans la fenêtre de l'utilisateur.
    const owned = (await this.prisma.workstream.findMany({ where: { projectId: project.id, ownerId: p.id }, select: { id: true } })).map((w) => w.id);
    const prop = proposal(owned, p.wsIds);
    const account = await this.createAccount(
      actor,
      { fullName: `${p.firstName} ${p.lastName}`.trim(), email: p.email.toLowerCase(), habilitations: { admin: false, projects: [{ code: project.code, pmo: false, responsable: prop.responsable, lecteur: prop.lecteur }] } },
      true,
    );
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
