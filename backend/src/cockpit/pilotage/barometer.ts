import { ProjectScope } from '../../core/access.service';
import { Actor } from '../../core/auth/auth';
import { notFound } from '../../core/errors';
import { PrismaService } from '../../core/prisma.service';
import { canWriteWs } from '../../domain/rights';
import { TransactionalService } from './transactional';

/** Chantier porteur du baromètre (brief § 8.6 : C8 « Pilotage et transverse »). */
export const BAROMETER_WS_CODE = 'C8';

/** Chantier porteur du baromètre et droit d'écriture (PMO, ou Responsable de ce chantier). */
export async function barometerWriteWs(prisma: PrismaService, scope: ProjectScope): Promise<{ ok: boolean; wsId: string | null }> {
  const ws = await prisma.workstream.findFirst({ where: { projectId: scope.project.id, code: BAROMETER_WS_CODE } });
  return { ok: canWriteWs(scope.access, ws?.id), wsId: ws?.id ?? null };
}

/**
 * Suppression d'un relevé du baromètre (12/10/2026 ; écran et Jev) : le relevé du mois et la note de ce mois de chaque
 * chantier du comparateur, en une transaction tracée au journal (origine indiquée par l'appelant).
 */
export async function removeBarometerSurvey(prisma: PrismaService, tx: TransactionalService, actor: Actor, scope: ProjectScope, month: string, wsId: string | null) {
  const existing = await prisma.barometerSurvey.findFirst({ where: { projectId: scope.project.id, OR: [{ month }, { key: month }] } });
  if (!existing) throw notFound('Relevé introuvable');
  return prisma.$transaction(async (db) => {
    await db.barometerSurvey.delete({ where: { id: existing.id } });
    for (const d of await db.barometerDomain.findMany({ where: { projectId: scope.project.id } })) {
      const series = { ...((d.series as Record<string, unknown>) ?? {}) };
      if (!(existing.month in series)) continue;
      delete series[existing.month];
      await db.barometerDomain.update({ where: { id: d.id }, data: { series: series as any, version: { increment: 1 } } });
    }
    await tx.audit.record(db, tx.wctx(actor, scope, wsId), { entityType: 'BAROMETER_SURVEY', entityId: existing.month, before: existing as any, after: null, wsId, target: existing.label });
    return { month: existing.month, label: existing.label, deleted: true };
  });
}
