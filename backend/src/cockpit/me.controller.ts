import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PrismaService } from '../core/prisma.service';
import { AccessService } from '../core/access.service';
import { Actor, CurrentActor } from '../core/auth/auth';
import { parse } from '../core/http';
import { rightsSummary, strongestProfile } from '../domain/rights';
import { TodayService } from '../core/today.service';

const Preferences = z
  .object({
    dashboardLayout: z.unknown().optional(),
    theme: z.unknown().optional(),
    firstName: z.string().max(80).nullable().optional(),
    city: z.string().max(120).nullable().optional(),
    photoUrl: z.string().max(2_000_000).nullable().optional(),
    notifications: z.record(z.unknown()).optional(),
    language: z.string().max(40).nullable().optional(),
    timezone: z.string().max(60).nullable().optional(),
    // Profil (07/10/2026) : téléphone, pays de résidence, projet ouvert par défaut dans le Cockpit (code).
    phone: z.string().trim().max(40).nullable().optional(),
    country: z.string().trim().max(80).nullable().optional(),
    defaultProject: z.string().trim().max(40).nullable().optional(),
  })
  .strict();

/** Session et utilisateur (brief Cockpit § 9.2). */
@ApiTags('cockpit · session')
@ApiBearerAuth()
@Controller('api')
export class MeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly today: TodayService,
  ) {}

  /**
   * Compte, personne, habilitations et droits effectifs (RG5, calculés côté serveur).
   * `projectId` : projet courant (par défaut le premier projet accessible).
   */
  @Get('me')
  async me(@CurrentActor() actor: Actor, @Query('projectId') projectId?: string) {
    const account = await this.prisma.account.findUniqueOrThrow({ where: { id: actor.accountId } });
    const projects = await this.access.accessibleProjects(actor);
    const current =
      (projectId && projects.find((p) => p.project.id === projectId || p.project.code === projectId)) ||
      projects.find((p) => p.access.personId) ||
      projects[0];
    const person = current?.access.personId ? await this.prisma.person.findUnique({ where: { id: current.access.personId } }) : null;
    const habilitations = current
      ? await this.prisma.habilitation.findMany({
          where: {
            projectId: current.project.id,
            OR: [{ accountId: actor.accountId }, ...(current.access.personId ? [{ personId: current.access.personId }] : [])],
          },
          orderBy: { id: 'asc' },
        })
      : [];
    const preferences = await this.prisma.userPreferences.findUnique({ where: { accountId: actor.accountId } });
    // Profil (07/10/2026) : données réelles du compte et de sa personne du référentiel (plus de valeurs de démonstration).
    const team = person?.teamId ? await this.prisma.team.findUnique({ where: { id: person.teamId } }) : null;
    // Projets : rôle et affectation de la personne sur chacun (onglet « Projet » du profil).
    const persIds = projects.map((x) => x.access.personId).filter((x): x is string => !!x);
    const assigns = persIds.length ? await this.prisma.assignment.findMany({ where: { personId: { in: persIds } }, orderBy: { startDate: 'asc' } }) : [];
    const roleIds = [...new Set(assigns.map((a) => a.roleId))];
    const roleLabel = Object.fromEntries((roleIds.length ? await this.prisma.projectRole.findMany({ where: { id: { in: roleIds } } }) : []).map((r) => [r.id, r.label]));
    return {
      account: {
        id: account.id,
        email: account.email,
        fullName: account.fullName,
        status: account.status,
        personId: account.personId,
        photoUrl: account.photoUrl,
        lastLoginAt: account.lastLoginAt,
      },
      person: person && {
        id: person.id,
        firstName: person.firstName,
        lastName: person.lastName,
        name: `${person.firstName} ${person.lastName}`.trim(),
        email: person.email,
        teamId: person.teamId,
        title: person.title,
      },
      projectId: current?.project.id ?? null,
      // Menu « Projet » de la barre latérale (07/10/2026) : projets ouverts au compte, profil le plus utile au pilotage
      // (un Administrateur PMO voit « PMO » ; Administrateur seul : lecture).
      projects: projects.map(({ project, access }) => ({
        id: project.id,
        code: project.code,
        name: project.name,
        status: project.status,
        profile: access.pmo ? 'PMO' : access.responsable.length ? 'RESPONSABLE' : access.lecteur.length ? 'LECTEUR' : access.admin ? 'ADMIN' : null,
        client: (project as any).client?.name ?? null,
        ...(() => {
          const mine = assigns.filter((a) => a.projectId === project.id && a.personId === access.personId);
          return {
            roles: [...new Set(mine.map((a) => roleLabel[a.roleId]).filter(Boolean))],
            startDate: mine.length ? mine[0].startDate : null,
            endDate: mine.length && mine.every((a) => a.endDate) ? mine.map((a) => a.endDate!).sort().pop()! : null,
          };
        })(),
      })),
      profile: {
        lastName: person?.lastName ?? account.fullName.split(' ').slice(1).join(' '),
        firstName: person?.firstName ?? account.fullName.split(' ')[0],
        position: person?.title ?? null,
        company: team?.name ?? null,
        teamKind: team?.kind ?? null,
        lastLoginAt: account.lastLoginAt,
        updatedAt: preferences?.updatedAt ?? null,
      },
      habilitations: [
        ...(actor.isAdmin && current ? [{ id: `admin-${actor.accountId}`, projectId: current.project.id, personId: current.access.personId, accountId: actor.accountId, profile: 'ADMIN', wsId: null }] : []),
        ...habilitations.map((h) => ({ id: h.id, projectId: h.projectId, personId: h.personId, accountId: h.accountId, profile: h.profile, wsId: h.wsId })),
      ],
      effective: current
        ? {
            admin: current.access.admin,
            pmo: current.access.pmo,
            responsable: current.access.responsable,
            lecteur: current.access.lecteur,
            programDirector: current.access.programDirector,
            topProfile: strongestProfile(current.access),
          }
        : { admin: actor.isAdmin, pmo: false, responsable: [], lecteur: [], programDirector: false, topProfile: actor.isAdmin ? 'ADMIN' : null },
      rights: current ? rightsSummary(current.access) : null,
      console: actor.isAdmin,
      today: current ? this.today.today(current.project.timezone) : this.today.today(),
      preferences: preferences ?? {},
    };
  }

  @Patch('me/preferences')
  async patchPreferences(@CurrentActor() actor: Actor, @Body() body: unknown) {
    const input = parse(Preferences, body) as Record<string, any>;
    const data: Record<string, any> = {};
    for (const [k, v] of Object.entries(input)) if (v !== undefined) data[k] = v;
    return this.prisma.userPreferences.upsert({
      where: { accountId: actor.accountId },
      create: { accountId: actor.accountId, ...data },
      update: data,
    });
  }

  /** Projets accessibles (sélecteur de projet). */
  @Get('projects')
  async projects(@CurrentActor() actor: Actor) {
    const list = await this.access.accessibleProjects(actor);
    return list.map(({ project, access }) => ({
      id: project.id,
      code: project.code,
      name: project.name,
      status: project.status,
      startDate: project.startDate,
      targetEndDate: project.targetEndDate,
      topProfile: strongestProfile(access),
    }));
  }
}
