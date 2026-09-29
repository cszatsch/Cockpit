import { Injectable } from '@nestjs/common';
import { Account } from '@prisma/client';
import { PrismaService, Tx } from '../core/prisma.service';
import { Actor } from '../core/auth/auth';
import { WriteCtx } from '../core/audit.service';
import { AUDIENCE_PRIORITY, AudienceProfile, ChantierScope, profileScope } from '../domain/notification-rules';
import { Gaps, gaps, Proposal, proposal } from '../domain/habilitation-proposals';

/** Entrée « référentiel » d'un compte sur un projet (voir `ProfilesService.referential`). */
export interface ReferentialEntry {
  code: string;
  projectId: string;
  personId: string;
  personne: string;
  responsable: string[];
  rattachement: string[];
  proposition: Proposal;
  ecarts: Gaps;
}

export type ProfileCode = 'ADMIN' | 'PMO' | 'RESPONSABLE' | 'LECTEUR';
const RANK: Record<ProfileCode, number> = { ADMIN: 4, PMO: 3, RESPONSABLE: 2, LECTEUR: 1 };

export interface AccountRights {
  admin: boolean;
  /** Profils par projet : { RISE: { pmo, responsable[], lecteur[] } } */
  projects: Record<string, { pmo: boolean; responsable: string[]; lecteur: string[] }>;
  /** Profil le plus fort (affiché par la console, RG5). */
  strongest: ProfileCode | null;
}

/** Contexte d'écriture de la console : profil utilisé = ADMIN (brief Console § 8). */
export function adminCtx(actor: Actor): WriteCtx {
  return { actor, projectId: null, profileUsed: 'ADMIN', origin: 'MANUAL' };
}

/**
 * Habilitations d'un compte, qu'elles soient portées par le compte (profils globaux, lecteurs externes)
 * ou par la personne du référentiel correspondante (même e-mail) sur chaque projet.
 */
@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ce que dit le référentiel pour chaque compte lié à une personne (par e-mail ou `personId`), projet par projet :
   * chantiers dont elle est responsable, chantiers de rattachement, proposition d'habilitations et écarts avec les
   * droits réels. Les comptes sans personne du référentiel n'ont pas d'entrée.
   */
  async referential(accounts: Account[], db: Tx = this.prisma): Promise<Map<string, ReferentialEntry[]>> {
    const rights = await this.rightsOf(accounts, db);
    const persons = await db.person.findMany({
      where: { OR: [{ email: { in: accounts.map((a) => a.email.toLowerCase()), mode: 'insensitive' } }, { id: { in: accounts.map((a) => a.personId).filter(Boolean) as string[] } }] },
      select: { id: true, projectId: true, email: true, firstName: true, lastName: true, wsIds: true },
    });
    const owned = await db.workstream.findMany({ where: { ownerId: { in: persons.map((p) => p.id) } }, select: { id: true, projectId: true, ownerId: true } });
    const codes = Object.fromEntries((await db.project.findMany({ select: { id: true, code: true } })).map((p) => [p.id, p.code]));
    const out = new Map<string, ReferentialEntry[]>();
    for (const a of accounts) {
      const mine = persons.filter((p) => p.id === a.personId || p.email.toLowerCase() === a.email.toLowerCase());
      out.set(
        a.id,
        mine.map((p) => {
          const own = owned.filter((w) => w.ownerId === p.id && w.projectId === p.projectId).map((w) => w.id);
          const prop = proposal(own, p.wsIds);
          return { code: codes[p.projectId] ?? p.projectId, projectId: p.projectId, personId: p.id, personne: `${p.firstName} ${p.lastName}`.trim(), responsable: prop.responsable, rattachement: [...p.wsIds].sort(), proposition: prop, ecarts: gaps(prop, rights.get(a.id)!.projects[p.projectId]) };
        }),
      );
    }
    return out;
  }

  async rightsOf(accounts: Account[], db: Tx = this.prisma): Promise<Map<string, AccountRights>> {
    const grants = new Set((await db.adminGrant.findMany()).map((g) => g.accountId));
    const emails = accounts.map((a) => a.email.toLowerCase());
    const persons = await db.person.findMany({ where: { email: { in: emails, mode: 'insensitive' } }, select: { id: true, email: true, projectId: true } });
    const personIds = [...new Set([...persons.map((p) => p.id), ...accounts.map((a) => a.personId).filter(Boolean) as string[]])];
    const habs = await db.habilitation.findMany({ where: { OR: [{ accountId: { in: accounts.map((a) => a.id) } }, { personId: { in: personIds } }] } });
    const out = new Map<string, AccountRights>();
    for (const a of accounts) {
      const mine = new Set<string>(persons.filter((p) => p.email.toLowerCase() === a.email.toLowerCase()).map((p) => p.id));
      if (a.personId) mine.add(a.personId);
      const r: AccountRights = { admin: grants.has(a.id), projects: {}, strongest: null };
      for (const h of habs) {
        if (h.accountId !== a.id && !(h.personId && mine.has(h.personId))) continue;
        const pr = (r.projects[h.projectId] ??= { pmo: false, responsable: [], lecteur: [] });
        if (h.profile === 'PMO') pr.pmo = true;
        else if (h.profile === 'RESPONSABLE' && h.wsId) pr.responsable.push(h.wsId);
        else if (h.profile === 'LECTEUR' && h.wsId) pr.lecteur.push(h.wsId);
      }
      let best: ProfileCode | null = r.admin ? 'ADMIN' : null;
      for (const pr of Object.values(r.projects)) {
        const p: ProfileCode | null = pr.pmo ? 'PMO' : pr.responsable.length ? 'RESPONSABLE' : pr.lecteur.length ? 'LECTEUR' : null;
        if (p && (!best || RANK[p] > RANK[best])) best = p;
      }
      r.strongest = best;
      out.set(a.id, r);
    }
    return out;
  }

  /** Comptes actifs ayant l'un des profils ciblés sur un projet (destinataires des notifications, RG5/RG8). */
  /**
   * Destinataires regroupés par profil (un texte par profil) : chaque compte rejoint le profil ciblé le plus large
   * qu'il détient (admin > pmo > resp > lec), et chaque groupe reçoit le périmètre commun à ses membres.
   */
  async audiences(profiles: string[], projectId: string | null): Promise<Array<{ profile: AudienceProfile; accounts: Account[]; chantiers: ChantierScope }>> {
    const accounts = await this.prisma.account.findMany({ where: { status: 'ACTIVE' } });
    const rights = await this.rightsOf(accounts);
    const want = new Set(profiles);
    const groups = new Map<AudienceProfile, Account[]>();
    for (const a of accounts) {
      const r = rights.get(a.id)!;
      const projects = projectId ? [r.projects[projectId]].filter(Boolean) : Object.values(r.projects);
      const has: Record<AudienceProfile, boolean> = {
        admin: r.admin,
        pmo: projects.some((p) => p.pmo),
        resp: projects.some((p) => p.responsable.length > 0),
        lec: projects.some((p) => p.lecteur.length > 0),
      };
      const p = AUDIENCE_PRIORITY.find((x) => want.has(x) && has[x]);
      if (p) groups.set(p, [...(groups.get(p) ?? []), a]);
    }
    return AUDIENCE_PRIORITY.filter((p) => groups.has(p)).map((profile) => {
      const members = groups.get(profile)!;
      const chantiers = projectId ? profileScope(profile, members.map((a) => rights.get(a.id)!.projects[projectId])) : ('*' as const);
      return { profile, accounts: members, chantiers };
    });
  }

  async recipients(profiles: string[], projectId: string | null): Promise<Account[]> {
    const accounts = await this.prisma.account.findMany({ where: { status: 'ACTIVE' } });
    const rights = await this.rightsOf(accounts);
    const want = new Set(profiles.map((p) => ({ admin: 'ADMIN', pmo: 'PMO', resp: 'RESPONSABLE', lec: 'LECTEUR' } as Record<string, string>)[p] ?? p.toUpperCase()));
    return accounts.filter((a) => {
      const r = rights.get(a.id)!;
      if (want.has('ADMIN') && r.admin) return true;
      const projects = projectId ? [r.projects[projectId]].filter(Boolean) : Object.values(r.projects);
      return projects.some((pr) => (want.has('PMO') && pr.pmo) || (want.has('RESPONSABLE') && pr.responsable.length > 0) || (want.has('LECTEUR') && pr.lecteur.length > 0));
    });
  }
}
