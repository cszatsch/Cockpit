import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../core/prisma.service';
import { StorageService } from '../core/storage.service';
import { JobsService } from '../core/jobs.service';
import { AuditService, WriteCtx } from '../core/audit.service';
import { TodayService } from '../core/today.service';

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
const IGNORED = new Set(['createdAt', 'updatedAt', 'version', 'rowVersion', 'projectId']);

/** Conservation « 12 mois », « 6 mois », « 90 jours »… → millisecondes. */
export function retentionMs(label: string): number {
  const m = /(\d+)\s*(mois|jours?|ans?|semaines?)/i.exec(label);
  if (!m) return 365 * 86_400_000;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  return n * (unit.startsWith('mois') ? 30.44 : unit.startsWith('an') ? 365 : unit.startsWith('sem') ? 7 : 1) * 86_400_000;
}

export interface SnapshotChange {
  op: 'add' | 'mod' | 'del';
  entity: string;
  object: string;
  field?: string | null;
  before?: unknown;
  after?: unknown;
}

/** Snapshots (brief Console § 7.5) : capture, planification, purge, comparaison, export. Aucune restauration. */
@Injectable()
export class SnapshotsService implements OnModuleInit {
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

  /** Capture les données du projet (JSON stocké) et les effectifs par entité. */
  async capture(snapshotId: string) {
    const s = await this.prisma.snapshot.findUnique({ where: { id: snapshotId } });
    if (!s) return;
    try {
      const data: Record<string, any[]> = {};
      const counts: Record<string, number> = {};
      for (const e of SNAPSHOT_ENTITIES) {
        data[e.key] = await (this.prisma as any)[e.delegate].findMany({ where: { projectId: s.projectId } });
        counts[e.label] = data[e.key].length;
      }
      const project = await this.prisma.project.findUnique({ where: { id: s.projectId } });
      const key = await this.storage.put(`snapshots/${s.projectId}`, Buffer.from(JSON.stringify({ project, takenAt: s.takenAt, data })), '.json');
      await this.prisma.snapshot.update({ where: { id: s.id }, data: { status: 'DONE', storageKey: key, stats: { counts } } });
    } catch (e) {
      await this.prisma.snapshot.update({ where: { id: s.id }, data: { status: 'FAILED' } });
      throw e;
    }
  }

  async load(id: string): Promise<{ data: Record<string, any[]> } | null> {
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
            if (IGNORED.has(f)) continue;
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

  /** Planification : exécute les snapshots dont le jour et l'heure correspondent, puis purge (§ 10.4). */
  async runScheduled(now = this.today.now()) {
    const day = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long' }).format(now).toLowerCase();
    const hour = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' }).format(now);
    for (const sc of await this.prisma.snapshotSchedule.findMany({ where: { enabled: true } })) {
      // Mensuelle (option de la console) : le 1er du mois, à l'heure choisie.
      const dom = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric' }).format(now);
      const f = sc.frequency.toLowerCase();
      const due = sc.hour.slice(0, 2) === hour && (f.startsWith('quotid') || (f.startsWith('mensu') ? dom === '1' : sc.day.toLowerCase() === day));
      if (due) {
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
