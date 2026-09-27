import { Injectable } from '@nestjs/common';
import { Project } from '@prisma/client';
import { PrismaService, Tx } from './prisma.service';
import { Actor } from './auth/auth';
import { notFound } from './errors';
import { buildAccess, hasAnyAccess, ProjectAccess, HabilitationRow } from '../domain/rights';

export interface ProjectScope {
  project: Project;
  access: ProjectAccess;
}

/** Résolution du projet et des droits effectifs de l'utilisateur sur ce projet. */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** Projet par id ou par code (le code est non modifiable et sert d'identifiant lisible). */
  async findProject(ref: string, db: Tx = this.prisma): Promise<Project | null> {
    return (
      (await db.project.findUnique({ where: { id: ref } })) ??
      (await db.project.findUnique({ where: { code: ref.toUpperCase() } }))
    );
  }

  /** Personne du référentiel correspondant au compte sur un projet (lien direct, sinon e-mail). */
  async personFor(actor: Pick<Actor, 'personId' | 'email'>, projectId: string, db: Tx = this.prisma): Promise<string | null> {
    if (actor.personId) {
      const p = await db.person.findUnique({ where: { id: actor.personId } });
      if (p && p.projectId === projectId) return p.id;
    }
    const byMail = await db.person.findFirst({ where: { projectId, email: { equals: actor.email, mode: 'insensitive' } } });
    return byMail?.id ?? null;
  }

  async accessFor(actor: Actor, project: Project, db: Tx = this.prisma): Promise<ProjectAccess> {
    const personId = await this.personFor(actor, project.id, db);
    const or: any[] = [{ accountId: actor.accountId }];
    if (personId) or.push({ personId });
    const rows = await db.habilitation.findMany({ where: { projectId: project.id, OR: or } });
    return buildAccess(
      project.id,
      personId,
      actor.isAdmin,
      rows.map((r) => ({ profile: r.profile, wsId: r.wsId }) as HabilitationRow),
      project.programDirectorId,
    );
  }

  /** Projet + droits ; 404 si le projet n'existe pas ou n'est pas accessible (RG16). */
  async scope(actor: Actor, projectRef: string): Promise<ProjectScope> {
    const project = await this.findProject(projectRef);
    if (!project) throw notFound('Projet introuvable');
    const access = await this.accessFor(actor, project);
    if (!hasAnyAccess(access)) throw notFound('Projet introuvable');
    return { project, access };
  }

  /** Projets accessibles au compte. */
  async accessibleProjects(actor: Actor): Promise<Array<{ project: Project; access: ProjectAccess }>> {
    const projects = await this.prisma.project.findMany({ orderBy: { createdAt: 'asc' }, include: { client: true } });
    const out: Array<{ project: Project; access: ProjectAccess }> = [];
    for (const project of projects) {
      const access = await this.accessFor(actor, project);
      if (hasAnyAccess(access)) out.push({ project, access });
    }
    return out;
  }
}
