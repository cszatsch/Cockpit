import { Injectable } from '@nestjs/common';
import { PrismaService, Tx } from '../../core/prisma.service';
import { AuditService, WriteCtx } from '../../core/audit.service';
import { TodayService } from '../../core/today.service';
import { ProjectScope } from '../../core/access.service';
import { Actor } from '../../core/auth/auth';
import { checkIfMatch, parse, withWarnings } from '../../core/http';
import { forbidden, inUse, notFound } from '../../core/errors';
import { canWriteReferential } from '../../domain/rights';
import { EntityConfig, EntityCtx } from './entities';
import { UsagesService } from './usages.service';

/**
 * Moteur CRUD du Référentiel (brief Cockpit § 9.4) : même patron pour toutes les entités.
 * Écritures réservées au PMO (§ 8.5), historisées champ par champ (§ 7.10), suppression bloquée
 * par les usages (§ 7.7).
 */
@Injectable()
export class ReferentialService {
  constructor(
    readonly prisma: PrismaService,
    readonly audit: AuditService,
    private readonly todaySvc: TodayService,
    private readonly usagesSvc: UsagesService,
  ) {}

  ctx(scope: ProjectScope, db: Tx = this.prisma): EntityCtx {
    return { db, project: scope.project, access: scope.access, today: this.todaySvc.today(scope.project.timezone) };
  }

  writeCtx(actor: Actor, scope: ProjectScope, origin: WriteCtx['origin'] = 'MANUAL'): WriteCtx {
    return { actor, projectId: scope.project.id, profileUsed: 'PMO', origin };
  }

  assertWrite(scope: ProjectScope) {
    if (!canWriteReferential(scope.access)) throw forbidden('Le Référentiel est modifiable par le PMO uniquement');
  }

  private where(def: EntityConfig, scope: ProjectScope, extra: Record<string, any> = {}) {
    return def.global ? extra : { projectId: scope.project.id, ...extra };
  }

  async list(def: EntityConfig, scope: ProjectScope, query: Record<string, string> = {}) {
    const filter: Record<string, any> = {};
    for (const f of def.filters ?? []) {
      if (query[f] !== undefined) filter[f] = query[f] === 'true' ? true : query[f] === 'false' ? false : query[f];
    }
    const rows = await (this.prisma as any)[def.delegate].findMany({ where: this.where(def, scope, filter), include: def.include, orderBy: def.orderBy });
    return def.serializeMany(this.ctx(scope), rows);
  }

  async findRow(def: EntityConfig, scope: ProjectScope, id: string, db: Tx = this.prisma) {
    const row = await (db as any)[def.delegate].findFirst({ where: this.where(def, scope, { id }), include: def.include });
    if (!row) throw notFound();
    return row;
  }

  async get(def: EntityConfig, scope: ProjectScope, id: string) {
    const row = await this.findRow(def, scope, id);
    return (await def.serializeMany(this.ctx(scope), [row]))[0];
  }

  async create(def: EntityConfig, actor: Actor, scope: ProjectScope, body: unknown, origin: WriteCtx['origin'] = 'MANUAL') {
    this.assertWrite(scope);
    const input = parse(def.create, body);
    return this.prisma.$transaction(async (tx) => {
      const c = this.ctx(scope, tx);
      const { data, relations, warnings } = await def.prepare(c, input, null);
      const id = await def.newId(c, input);
      await (tx as any)[def.delegate].create({ data: { ...(def.global ? {} : { projectId: scope.project.id }), id, ...data } });
      if (relations) await relations(tx, id);
      const row = await this.findRow(def, scope, id, tx);
      const view = (await def.serializeMany(c, [row]))[0];
      await this.audit.record(tx, this.writeCtx(actor, scope, origin), { entityType: def.entityType, entityId: id, before: null, after: view, wsId: def.wsOf?.(row) ?? null, target: def.label(row) });
      return withWarnings(view, warnings);
    });
  }

  async patch(def: EntityConfig, actor: Actor, scope: ProjectScope, id: string, body: unknown, ifMatch?: string, origin: WriteCtx['origin'] = 'MANUAL') {
    this.assertWrite(scope);
    const input = parse(def.patch, body);
    return this.prisma.$transaction(async (tx) => {
      const c = this.ctx(scope, tx);
      const existing = await this.findRow(def, scope, id, tx);
      checkIfMatch(ifMatch, existing.version);
      const before = (await def.serializeMany(c, [existing]))[0];
      const { data, relations, warnings } = await def.prepare(c, input, existing);
      await (tx as any)[def.delegate].update({ where: { id }, data: { ...data, version: { increment: 1 } } });
      if (relations) await relations(tx, id);
      const row = await this.findRow(def, scope, id, tx);
      const view = (await def.serializeMany(c, [row]))[0];
      await this.audit.record(tx, this.writeCtx(actor, scope, origin), { entityType: def.entityType, entityId: id, before, after: view, wsId: def.wsOf?.(row) ?? null, target: def.label(row) });
      return withWarnings(view, warnings);
    });
  }

  /** Remplace une relation N-N (PUT …/waves, …/members, …/phases, …/dependencies). */
  async replaceRelation(def: EntityConfig, actor: Actor, scope: ProjectScope, id: string, body: Record<string, unknown>) {
    return this.patchRelations(def, actor, scope, id, body);
  }

  private async patchRelations(def: EntityConfig, actor: Actor, scope: ProjectScope, id: string, input: Record<string, unknown>) {
    this.assertWrite(scope);
    return this.prisma.$transaction(async (tx) => {
      const c = this.ctx(scope, tx);
      const existing = await this.findRow(def, scope, id, tx);
      const before = (await def.serializeMany(c, [existing]))[0];
      const { data, relations, warnings } = await def.prepare(c, parse(def.create.partial().strict(), input), existing);
      if (relations) await relations(tx, id);
      await (tx as any)[def.delegate].update({ where: { id }, data: { ...data, version: { increment: 1 } } });
      const row = await this.findRow(def, scope, id, tx);
      const view = (await def.serializeMany(c, [row]))[0];
      await this.audit.record(tx, this.writeCtx(actor, scope), { entityType: def.entityType, entityId: id, before, after: view, wsId: def.wsOf?.(row) ?? null, target: def.label(row) });
      return withWarnings(view, warnings);
    });
  }

  async remove(def: EntityConfig, actor: Actor, scope: ProjectScope, id: string, ifMatch?: string) {
    this.assertWrite(scope);
    await this.prisma.$transaction(async (tx) => {
      const c = this.ctx(scope, tx);
      const existing = await this.findRow(def, scope, id, tx);
      checkIfMatch(ifMatch, existing.version);
      const usages = await this.usagesSvc.usages(tx, scope.project.id, def.entityType, id);
      if (usages.length) throw inUse(usages);
      const before = (await def.serializeMany(c, [existing]))[0];
      await (tx as any)[def.delegate].delete({ where: { id } });
      await this.audit.record(tx, this.writeCtx(actor, scope), { entityType: def.entityType, entityId: id, before, after: null, wsId: def.wsOf?.(existing) ?? null, target: def.label(existing) });
    });
  }

  async usages(def: EntityConfig, scope: ProjectScope, id: string) {
    await this.findRow(def, scope, id);
    return this.usagesSvc.usages(this.prisma, scope.project.id, def.entityType, id);
  }
}
