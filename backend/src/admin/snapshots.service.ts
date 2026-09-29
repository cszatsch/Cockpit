import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../core/prisma.service';
import { StorageService } from '../core/storage.service';
import { JobsService } from '../core/jobs.service';
import { AuditService, WriteCtx } from '../core/audit.service';
import { TodayService } from '../core/today.service';
import { conflict, notFound } from '../core/errors';
import { DIFF_IGNORED_FIELDS, DiffItem, SAFETY_AUTHOR, SAFETY_LABEL, SnapshotChange, fieldLabel, formatValue, frDay, isSnapshotDue, toDiffItems } from '../domain/snapshots';

/** Entités capturées dans un snapshot (données du projet). */
export const SNAPSHOT_ENTITIES: Array<{ key: string; label: string; delegate: string; name: (r: any) => string }> = [
  { key: 'waves', label: 'Lot', delegate: 'wave', name: (r) => `Lot ${r.seq} · ${r.name}` },
  { key: 'phases', label: 'Phase', delegate: 'phase', name: (r) => `${r.code} · ${r.name}` },
  { key: 'subphases', label: 'Sous-phase', delegate: 'subphase', name: (r) => `${r.code} · ${r.name}` },
  { key: 'workstreams', label: 'Chantier', delegate: 'workstream', name: (r) => `${r.code} · ${r.name}` },
  { key: 'milestones', label: 'Jalon', delegate: 'milestone', name: (r) => `${r.code} · ${r.n}` },
  { key: 'deliverables', label: 'Livrable', delegate: 'deliverable', name: (r) => r.name },
  { key: 'teams', label: 'Équipe', delegate: 'team', name: (r) => r.name },
  { key: 'roles', label: 'Rôle', delegate: 'projectRole', name: (r) => r.label },
  { key: 'persons', label: 'Personne', delegate: 'person', name: (r) => `${r.firstName} ${r.lastName}` },
  { key: 'assignments', label: 'Affectation', delegate: 'assignment', name: (r) => `${r.personId} · ${r.roleId}` },
  { key: 'bodies', label: 'Instance', delegate: 'governanceBody', name: (r) => r.shortName },
  { key: 'risks', label: 'Risque', delegate: 'risk', name: (r) => `${r.code} · ${r.n}` },
  { key: 'issues', label: 'Problème', delegate: 'issue', name: (r) => `${r.code} · ${r.n}` },
  { key: 'actions', label: 'Action', delegate: 'action', name: (r) => `${r.code} · ${r.n}` },
  { key: 'decisions', label: 'Décision', delegate: 'decision', name: (r) => `${r.code} · ${r.t}` },
  { key: 'sessions', label: 'Séance', delegate: 'session', name: (r) => `${r.bodyId} n°${r.number}` },
  { key: 'reports', label: 'Rapport', delegate: 'reportInstance', name: (r) => r.name },
  { key: 'documents', label: 'Document', delegate: 'document', name: (r) => r.n },
  { key: 'progress', label: 'Avancement', delegate: 'workstreamProgress', name: (r) => r.label },
];
/**
 * Tables de liaison du projet (sans `projectId`), capturées avec leurs parents : sans elles, une restauration
 * perdrait les rattachements (supprimés en cascade avec les phases, chantiers, instances et documents).
 */
export const SNAPSHOT_LINKS: Array<{ key: string; delegate: string; where: (projectId: string) => object; ends: Array<[string, string]> }> = [
  { key: 'phaseWaves', delegate: 'phaseWave', where: (projectId) => ({ phase: { projectId } }), ends: [['phaseId', 'phases'], ['waveId', 'waves']] },
  { key: 'workstreamPhases', delegate: 'workstreamPhase', where: (projectId) => ({ ws: { projectId } }), ends: [['wsId', 'workstreams'], ['phaseId', 'phases']] },
  { key: 'workstreamWaves', delegate: 'workstreamWave', where: (projectId) => ({ ws: { projectId } }), ends: [['wsId', 'workstreams'], ['waveId', 'waves']] },
  { key: 'workstreamDependencies', delegate: 'workstreamDependency', where: (projectId) => ({ ws: { projectId } }), ends: [['wsId', 'workstreams'], ['dependsOnId', 'workstreams']] },
  { key: 'bodyMembers', delegate: 'bodyMember', where: (projectId) => ({ body: { projectId } }), ends: [['bodyId', 'bodies']] },
  { key: 'documentLinks', delegate: 'documentLink', where: (projectId) => ({ document: { projectId } }), ends: [['documentId', 'documents']] },
];

/** Délai maximal de la transaction de restauration (suppression puis recréation des données du projet). */
export const RESTORE_TIMEOUT_MS = 120_000;

/** Conservation « 12 mois », « 6 mois », « 90 jours »… → millisecondes. */
export function retentionMs(label: string): number {
  const m = /(\d+)\s*(mois|jours?|ans?|semaines?)/i.exec(label);
  if (!m) return 365 * 86_400_000;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  return n * (unit.startsWith('mois') ? 30.44 : unit.startsWith('an') ? 365 : unit.startsWith('sem') ? 7 : 1) * 86_400_000;
}

export type { SnapshotChange } from '../domain/snapshots';

/** Suivi d'une capture en cours (`GET /snapshot-jobs/:id`), en mémoire du processus qui capture. */
export interface CaptureJob {
  progress: number;
  error?: string;
}

/**
 * Snapshots (brief Console § 7.5, vue `Snapshots.dc.html`) : capture avec progression, planification, purge,
 * comparaison consolidée, restauration précédée d'une sauvegarde de sécurité, export.
 */
@Injectable()
export class SnapshotsService implements OnModuleInit {
  private readonly log = new Logger('Snapshots');
  private readonly jobsInProgress = new Map<string, CaptureJob>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly jobs: JobsService,
    private readonly audit: AuditService,
    private readonly today: TodayService,
  ) {}

  onModuleInit() {
    this.jobs.register('snapshot.capture', (d) => this.capture(d.snapshotId));
    this.jobs.register('snapshots.scheduled', () => this.runScheduled());
    this.jobs.schedule('snapshots.scheduled', '0 * * * *');
  }

  /** Capture les données du projet et ses tables de liaison (JSON stocké), et les effectifs par entité. */
  async capture(snapshotId: string) {
    const s = await this.prisma.snapshot.findUnique({ where: { id: snapshotId } });
    if (!s) return;
    const job = this.jobsInProgress.get(s.id);
    const steps = SNAPSHOT_ENTITIES.length + SNAPSHOT_LINKS.length + 1;
    const step = (n: number) => {
      if (job) job.progress = Math.round((n / steps) * 100);
    };
    try {
      const data: Record<string, any[]> = {};
      const links: Record<string, any[]> = {};
      const counts: Record<string, number> = {};
      let n = 0;
      for (const e of SNAPSHOT_ENTITIES) {
        data[e.key] = await (this.prisma as any)[e.delegate].findMany({ where: { projectId: s.projectId } });
        counts[e.label] = data[e.key].length;
        step(++n);
      }
      for (const l of SNAPSHOT_LINKS) {
        links[l.key] = await (this.prisma as any)[l.delegate].findMany({ where: l.where(s.projectId) });
        step(++n);
      }
      const project = await this.prisma.project.findUnique({ where: { id: s.projectId } });
      const key = await this.storage.put(`snapshots/${s.projectId}`, Buffer.from(JSON.stringify({ project, takenAt: s.takenAt, data, links })), '.json');
      await this.prisma.snapshot.update({ where: { id: s.id }, data: { status: 'DONE', storageKey: key, stats: { counts } } });
      step(steps);
    } catch (e) {
      if (job) job.error = (e as Error).message;
      await this.prisma.snapshot.update({ where: { id: s.id }, data: { status: 'FAILED' } });
      throw e;
    }
  }

  /** Lance la capture dans ce processus sans l'attendre ; sa progression se lit avec `job()`. */
  startCapture(snapshotId: string) {
    this.jobsInProgress.set(snapshotId, { progress: 0 });
    setImmediate(() => this.capture(snapshotId).catch((e) => this.log.warn(`Capture ${snapshotId} en échec : ${(e as Error).message}`)));
  }

  /** État d'une capture : en cours (progression réelle), terminée ou en échec ; `null` si le snapshot n'existe pas. */
  async job(snapshotId: string) {
    const s = await this.prisma.snapshot.findUnique({ where: { id: snapshotId } });
    if (!s) return null;
    const j = this.jobsInProgress.get(s.id);
    if (s.status === 'DONE') {
      this.jobsInProgress.delete(s.id);
      return { statut: 'termine' as const, progression: 100, snapshot: s };
    }
    if (s.status === 'FAILED') {
      this.jobsInProgress.delete(s.id);
      return { statut: 'echec' as const, progression: j?.progress ?? 0, erreur: j?.error ?? 'La capture a échoué', snapshot: s };
    }
    return { statut: 'en_cours' as const, progression: Math.min(99, j?.progress ?? 0), snapshot: s };
  }

  async load(id: string): Promise<{ data: Record<string, any[]>; links?: Record<string, any[]> } | null> {
    const s = await this.prisma.snapshot.findUnique({ where: { id } });
    if (!s?.storageKey) return null;
    const buf = await this.storage.get(s.storageKey);
    return buf ? JSON.parse(buf.toString('utf8')) : null;
  }

  /** Écarts entre deux snapshots A (avant) et B (après) : ajouts, modifications (champ, avant, après), suppressions. */
  async compare(aId: string, bId: string) {
    const [a, b] = await Promise.all([this.prisma.snapshot.findUnique({ where: { id: aId } }), this.prisma.snapshot.findUnique({ where: { id: bId } })]);
    if (!a || !b || a.projectId !== b.projectId) return null;
    const [older, newer] = a.takenAt <= b.takenAt ? [a, b] : [b, a];
    let changes: SnapshotChange[] = [];
    const [da, db] = await Promise.all([this.load(older.id), this.load(newer.id)]);
    if (da && db) {
      for (const e of SNAPSHOT_ENTITIES) {
        const before = new Map((da.data[e.key] ?? []).map((r: any) => [r.id, r]));
        const after = new Map((db.data[e.key] ?? []).map((r: any) => [r.id, r]));
        for (const [id, r] of after) {
          const o = before.get(id);
          if (!o) {
            changes.push({ op: 'add', entity: e.label, object: e.name(r) });
            continue;
          }
          for (const f of Object.keys(r)) {
            if (DIFF_IGNORED_FIELDS.has(f)) continue;
            if (JSON.stringify(o[f]) !== JSON.stringify(r[f])) changes.push({ op: 'mod', entity: e.label, object: e.name(r), field: f, before: o[f], after: r[f] });
          }
        }
        for (const [id, o] of before) if (!after.has(id)) changes.push({ op: 'del', entity: e.label, object: e.name(o) });
      }
    } else {
      // Snapshots de démonstration (sans contenu) : écarts connus, cumulés de A (exclu) à B (inclus).
      const between = await this.prisma.snapshot.findMany({ where: { projectId: a.projectId, takenAt: { gt: older.takenAt, lte: newer.takenAt } }, orderBy: { takenAt: 'asc' } });
      changes = between.flatMap((s) => ((s.stats as any)?.changesFromPrevious ?? []) as SnapshotChange[]);
    }
    const summary = { add: changes.filter((c) => c.op === 'add').length, mod: changes.filter((c) => c.op === 'mod').length, del: changes.filter((c) => c.op === 'del').length, byEntity: {} as Record<string, number> };
    for (const c of changes) summary.byEntity[c.entity] = (summary.byEntity[c.entity] ?? 0) + 1;
    return { a: older.id, b: newer.id, summary, changes };
  }

  /**
   * `GET /snapshots/:a/diff/:b` : écarts de A (le plus ancien) à B, consolidés (première valeur → dernière valeur),
   * champs et valeurs en clair. `null` si l'un manque ou s'ils ne sont pas du même projet.
   */
  async diff(aId: string, bId: string): Promise<DiffItem[] | null> {
    const r = await this.compare(aId, bId);
    if (!r) return null;
    const [da, db] = await Promise.all([this.load(r.a), this.load(r.b)]);
    // Un snapshot de démonstration face à une vraie capture : rien de comparable (et surtout pas « aucune différence »).
    if (!da !== !db) throw conflict('SNAPSHOT_SANS_CONTENU', 'L’un des deux snapshots est un snapshot de démonstration : il ne contient pas de données à comparer');
    if (!da || !db) return toDiffItems(r.changes); // démonstration : écarts saisis en clair
    const names = new Map<string, string>();
    for (const d of [da, db]) for (const e of SNAPSHOT_ENTITIES) for (const row of d.data[e.key] ?? []) names.set(row.id, e.name(row));
    return toDiffItems(
      r.changes.map((c) => (c.op === 'mod' && c.field ? { ...c, field: fieldLabel(c.entity, c.field), before: formatValue(c.entity, c.field, c.before, names), after: formatValue(c.entity, c.field, c.after, names) } : c)),
    );
  }

  /**
   * Restauration : crée d'abord le snapshot « Sécurité avant restauration » (état actuel, capturé en entier), puis
   * remplace les données du projet par celles du snapshot, tout ou rien, et trace l'opération (critique).
   * Refusée (409) pour un snapshot de démonstration, qui ne contient pas de données.
   */
  async restore(snapshotId: string, ctx: WriteCtx) {
    const s = await this.prisma.snapshot.findUnique({ where: { id: snapshotId } });
    if (!s) throw notFound('Snapshot introuvable');
    const content = s.status === 'DONE' ? await this.load(s.id) : null;
    if (!content) throw conflict('SNAPSHOT_SANS_CONTENU', 'Ce snapshot de démonstration ne contient pas de données : restauration impossible');
    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: s.projectId } });
    const safety = await this.prisma.snapshot.create({ data: { projectId: s.projectId, kind: 'MANUAL', label: SAFETY_LABEL, takenBy: SAFETY_AUTHOR, takenById: ctx.actor.accountId, status: 'RUNNING' } });
    await this.capture(safety.id); // en échec : rien n'est restauré
    await this.prisma.$transaction(
      async (db) => {
        const tx = db as any;
        // Rattachements actuels, repris pour un snapshot antérieur à la capture des tables de liaison.
        const current: Record<string, any[]> = {};
        if (!content.links) for (const l of SNAPSHOT_LINKS) current[l.key] = await tx[l.delegate].findMany({ where: l.where(s.projectId) });
        for (const e of [...SNAPSHOT_ENTITIES].reverse()) await tx[e.delegate].deleteMany({ where: { projectId: s.projectId } });
        for (const e of SNAPSHOT_ENTITIES) {
          const rows = (content.data[e.key] ?? []).map((r) => restorable(e.delegate, r));
          if (rows.length) await tx[e.delegate].createMany({ data: rows });
        }
        const ids = (k: string) => new Set((content.data[k] ?? []).map((r: any) => r.id));
        for (const l of SNAPSHOT_LINKS) {
          const rows = content.links ? (content.links[l.key] ?? []) : current[l.key].filter((r) => l.ends.every(([f, k]) => ids(k).has(r[f])));
          if (rows.length) await tx[l.delegate].createMany({ data: rows.map((r: any) => restorable(l.delegate, r)), skipDuplicates: true });
        }
        await this.audit.action(db, { ...ctx, projectId: s.projectId }, {
          action: 'Restauration d’un snapshot',
          target: `${project.code} · état du ${frDay(s.takenAt.toISOString())}`,
          severity: 'CRITICAL',
          entityType: 'Snapshot',
          entityId: s.id,
          details: { projet: project.code, snapshot: s.id, etat: s.takenAt.toISOString(), libelle: s.label, securite: safety.id },
        });
      },
      { timeout: RESTORE_TIMEOUT_MS, maxWait: RESTORE_TIMEOUT_MS },
    );
    return { restored: s, safety: await this.prisma.snapshot.findUniqueOrThrow({ where: { id: safety.id } }) };
  }

  /** Planification : exécute les snapshots dont le jour et l'heure correspondent, puis purge (§ 10.4). */
  async runScheduled(now = this.today.now()) {
    for (const sc of await this.prisma.snapshotSchedule.findMany({ where: { enabled: true } })) {
      if (isSnapshotDue(sc, now)) {
        const s = await this.prisma.snapshot.create({ data: { projectId: sc.projectId, kind: 'AUTO', status: 'RUNNING' } });
        await this.capture(s.id);
      }
      await this.purge(sc.projectId, retentionMs(sc.retention), now);
    }
  }

  /** Purge au-delà de la conservation (manuels compris, uniquement au-delà de la durée). */
  async purge(projectId: string, keepMs: number, now = this.today.now()) {
    const old = await this.prisma.snapshot.findMany({ where: { projectId, takenAt: { lt: new Date(now.getTime() - keepMs) } } });
    for (const s of old) {
      if (s.storageKey) await this.storage.remove(s.storageKey);
      await this.prisma.snapshot.delete({ where: { id: s.id } });
    }
    if (old.length) await this.audit.action(this.prisma, { actor: { accountId: 'system', sessionId: 'system', email: '', fullName: 'Système', personId: null, isAdmin: true }, projectId, profileUsed: null, origin: 'SYSTEM' } as WriteCtx, { action: 'Purge des snapshots', target: `${projectId} · ${old.length} snapshot(s)`, severity: 'INFO', entityType: 'Snapshot' });
    return old.length;
  }
}

/**
 * Ligne d'un snapshot → données de `createMany` : seuls les champs scalaires encore présents dans le modèle
 * (un champ retiré depuis la capture est ignoré) ; un JSON vide devient `DbNull`.
 */
function restorable(delegate: string, row: Record<string, unknown>) {
  const model = Prisma.dmmf.datamodel.models.find((m) => m.name.toLowerCase() === delegate.toLowerCase());
  if (!model) return row;
  const out: Record<string, unknown> = {};
  for (const f of model.fields) {
    if (f.kind === 'object' || !(f.name in row)) continue;
    const v = row[f.name];
    out[f.name] = f.type === 'Json' && v == null ? Prisma.DbNull : v;
  }
  return out;
}
