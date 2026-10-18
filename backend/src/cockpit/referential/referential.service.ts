import { Injectable } from '@nestjs/common';
import { PrismaService, Tx } from '../../core/prisma.service';
import { AuditService, WriteCtx } from '../../core/audit.service';
import { TodayService } from '../../core/today.service';
import { ProjectScope } from '../../core/access.service';
import { Actor } from '../../core/auth/auth';
import { checkIfMatch, parse, withWarnings } from '../../core/http';
import { forbidden, inUse, notFound, Usage } from '../../core/errors';
import { canReadDocument, canReadLinks, canReadWs, canWriteReferential, riskLinks, seesAllWorkstreams } from '../../domain/rights';
import { EntityConfig, EntityCtx } from './entities';
import { UsagesService } from './usages.service';
import { assertPhaseProgressEditable, assertWorkstreamProgressEditable, rollupPhaseProgress, rollupWorkstreamProgress, rollupWorkstreamsOfSubphases } from '../phase-progress';

/** Création et suppression d'un client : depuis la Console seulement (audit du 18/10/2026). */
export const GLOBAL_FROM_CONSOLE = 'Les clients se créent et se suppriment depuis la Console';

/** Types d'usages filtrés selon les droits de lecture de l'appelant ; les autres (phases, chantiers, personnes…) sont ouverts à tous. */
const USAGES_CHECKED = new Set(['DOCUMENT', 'RISK', 'ACTION', 'ISSUE', 'DECISION', 'WORKSTREAM_PROGRESS', 'HABILITATION', 'MILESTONE']);

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
    // Entité partagée entre projets (le client) : le Cockpit ne voit que le client du projet de l'URL (audit du 18/10/2026).
    return def.global ? { AND: [extra, { id: scope.project.clientId }] } : { projectId: scope.project.id, ...extra };
  }

  async list(def: EntityConfig, scope: ProjectScope, query: Record<string, string> = {}) {
    const filter: Record<string, any> = {};
    for (const f of def.filters ?? []) {
      if (query[f] !== undefined) filter[f] = query[f] === 'true' ? true : query[f] === 'false' ? false : query[f];
    }
    const rows = await (this.prisma as any)[def.delegate].findMany({ where: this.where(def, scope, filter), include: def.include, orderBy: def.orderBy });
    return def.serializeMany(this.ctx(scope), rows.filter((r: any) => this.readable(def, scope, r)));
  }

  /** Ligne lisible par le profil (RG8, comme le `bootstrap`) : un jalon d'un chantier caché n'est pas rendu. */
  private readable(def: EntityConfig, scope: ProjectScope, row: { wsId?: string | null }) {
    return def.entityType !== 'MILESTONE' || !row.wsId || canReadWs(scope.access, row.wsId);
  }

  async findRow(def: EntityConfig, scope: ProjectScope, id: string, db: Tx = this.prisma) {
    const row = await (db as any)[def.delegate].findFirst({ where: this.where(def, scope, { id }), include: def.include });
    if (!row) throw notFound();
    return row;
  }

  async get(def: EntityConfig, scope: ProjectScope, id: string) {
    const row = await this.findRow(def, scope, id);
    if (!this.readable(def, scope, row)) throw notFound();
    return (await def.serializeMany(this.ctx(scope), [row]))[0];
  }

  async create(def: EntityConfig, actor: Actor, scope: ProjectScope, body: unknown, origin: WriteCtx['origin'] = 'MANUAL') {
    this.assertWrite(scope);
    if (def.global) throw forbidden(GLOBAL_FROM_CONSOLE);
    const input = parse(def.create, body);
    return this.prisma.$transaction(async (tx) => {
      const c = this.ctx(scope, tx);
      const { data, relations, warnings } = await def.prepare(c, input, null);
      const id = await def.newId(c, input);
      await (tx as any)[def.delegate].create({ data: { ...(def.global ? {} : { projectId: scope.project.id }), id, ...data } });
      if (relations) await relations(tx, id);
      if (def.entityType === 'SUBPHASE') await rollupPhaseProgress(tx, [(input as any).phaseId]);
      // Avancement des chantiers (15/10/2026) : ceux de la sous-phase créée, ou le chantier créé avec ses sous-phases.
      if (def.entityType === 'SUBPHASE') await rollupWorkstreamsOfSubphases(tx, [id]);
      if (def.entityType === 'WORKSTREAM') await rollupWorkstreamProgress(tx, [id]);
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
      if (def.entityType === 'PHASE') await assertPhaseProgressEditable(tx, id, (input as any).progressPct);
      if (def.entityType === 'WORKSTREAM') await assertWorkstreamProgressEditable(tx, id, (input as any).progressPct);
      const { data, relations, warnings } = await def.prepare(c, input, existing);
      await (tx as any)[def.delegate].update({ where: { id }, data: { ...data, version: { increment: 1 } } });
      if (relations) await relations(tx, id);
      // Avancement des chantiers recalculé (15/10/2026) : ceux de la sous-phase, ou le chantier (sous-phases modifiées).
      if (def.entityType === 'SUBPHASE') await rollupWorkstreamsOfSubphases(tx, [id]);
      if (def.entityType === 'WORKSTREAM') await rollupWorkstreamProgress(tx, [id]);
      const row = await this.findRow(def, scope, id, tx);
      // Avancement de la phase (ancienne et nouvelle) recalculé d'après ses sous-phases.
      if (def.entityType === 'SUBPHASE') await rollupPhaseProgress(tx, [existing.phaseId, row.phaseId]);
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
      if (def.entityType === 'WORKSTREAM') await rollupWorkstreamProgress(tx, [id]);
      const row = await this.findRow(def, scope, id, tx);
      const view = (await def.serializeMany(c, [row]))[0];
      await this.audit.record(tx, this.writeCtx(actor, scope), { entityType: def.entityType, entityId: id, before, after: view, wsId: def.wsOf?.(row) ?? null, target: def.label(row) });
      return withWarnings(view, warnings);
    });
  }

  async remove(def: EntityConfig, actor: Actor, scope: ProjectScope, id: string, ifMatch?: string, origin: WriteCtx['origin'] = 'MANUAL') {
    this.assertWrite(scope);
    if (def.global) throw forbidden(GLOBAL_FROM_CONSOLE);
    await this.prisma.$transaction(async (tx) => {
      const c = this.ctx(scope, tx);
      const existing = await this.findRow(def, scope, id, tx);
      checkIfMatch(ifMatch, existing.version);
      const usages = await this.usagesSvc.usages(tx, scope.project.id, def.entityType, id);
      if (usages.length) throw inUse(usages);
      const before = (await def.serializeMany(c, [existing]))[0];
      // Sous-phase rattachée à des chantiers (décision D3 du 06/10/2026) : suppression permise, le lien part en cascade
      // et chaque chantier touché garde sa trace au journal.
      const linked = def.entityType === 'SUBPHASE'
        ? await tx.workstream.findMany({ where: { projectId: scope.project.id, subphases: { some: { subphaseId: id } } }, include: { subphases: true } })
        : [];
      await (tx as any)[def.delegate].delete({ where: { id } });
      if (def.entityType === 'SUBPHASE') await rollupPhaseProgress(tx, [existing.phaseId]);
      if (def.entityType === 'SUBPHASE') await rollupWorkstreamProgress(tx, linked.map((w) => w.id));
      await this.audit.record(tx, this.writeCtx(actor, scope, origin), { entityType: def.entityType, entityId: id, before, after: null, wsId: def.wsOf?.(existing) ?? null, target: def.label(existing) });
      for (const w of linked) {
        const subs = w.subphases.map((s) => s.subphaseId).sort();
        await this.audit.record(tx, this.writeCtx(actor, scope), { entityType: 'WORKSTREAM', entityId: w.id, before: { subphaseIds: subs }, after: { subphaseIds: subs.filter((s) => s !== id) }, wsId: w.id, target: `${w.code} · ${w.name}` });
      }
    });
  }

  async usages(def: EntityConfig, scope: ProjectScope, id: string, actor: Actor) {
    const row = await this.findRow(def, scope, id);
    if (!this.readable(def, scope, row)) throw notFound();
    const all = await this.usagesSvc.usages(this.prisma, scope.project.id, def.entityType, id);
    // Client partagé : les autres projets qui l'utilisent ne sont pas révélés.
    return this.visibleUsages(scope, actor, def.global ? all.filter((u) => u.entityType !== 'PROJECT' || u.id === scope.project.id) : all);
  }

  /**
   * Usages lisibles par l'appelant (audit de sécurité du 18/10/2026) : objets des chantiers qu'il voit (RG8) et documents
   * Restreints réservés au PMO, à l'Admin et à l'auteur du dépôt. Le contrôle de suppression (409) garde la liste entière.
   */
  private async visibleUsages(scope: ProjectScope, actor: Actor, all: Usage[]): Promise<Usage[]> {
    const A = scope.access, projectId = scope.project.id;
    const ids = (t: string) => ({ projectId, id: { in: all.filter((u) => u.entityType === t).map((u) => u.id) } });
    const keep = new Set<string>();
    const add = (t: string, rows: any[], ok: (r: any) => boolean) => rows.forEach((r) => ok(r) && keep.add(`${t}:${r.id}`));
    add('DOCUMENT', await this.prisma.document.findMany({ where: ids('DOCUMENT') }), (d) => canReadDocument(A, actor.accountId, d));
    if (seesAllWorkstreams(A)) {
      return all.filter((u) => u.entityType !== 'DOCUMENT' || keep.has(`DOCUMENT:${u.id}`));
    }
    add('RISK', await this.prisma.risk.findMany({ where: ids('RISK') }), (r) => canReadLinks(A, riskLinks(r)));
    add('ACTION', await this.prisma.action.findMany({ where: ids('ACTION') }), (r) => canReadLinks(A, riskLinks(r)));
    add('ISSUE', await this.prisma.issue.findMany({ where: ids('ISSUE') }), (r) => canReadWs(A, r.wsId));
    add('DECISION', await this.prisma.decision.findMany({ where: ids('DECISION') }), (r) => canReadWs(A, r.wsId));
    add('WORKSTREAM_PROGRESS', await this.prisma.workstreamProgress.findMany({ where: ids('WORKSTREAM_PROGRESS') }), (r) => canReadWs(A, r.wsId));
    add('HABILITATION', await this.prisma.habilitation.findMany({ where: ids('HABILITATION') }), (r) => canReadWs(A, r.wsId));
    add('MILESTONE', await this.prisma.milestone.findMany({ where: ids('MILESTONE') }), (r) => !r.wsId || canReadWs(A, r.wsId));
    return all.filter((u) => !USAGES_CHECKED.has(u.entityType) || keep.has(`${u.entityType}:${u.id}`));
  }
}
