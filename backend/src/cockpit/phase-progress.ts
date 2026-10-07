import { Tx } from '../core/prisma.service';
import { badRequest } from '../core/errors';
import { PHASE_PROGRESS_COMPUTED, weightedProgress } from '../domain/progress-rollup';

/**
 * Recalcule et enregistre l'avancement des phases qui ont des sous-phases (moyenne pondérée par la durée,
 * `src/domain/progress-rollup.ts`). Appelé après toute écriture d'une sous-phase, pour que le planning,
 * les rapports et Jev lisent le même chiffre. Une phase sans sous-phase garde son avancement saisi.
 */
export async function rollupPhaseProgress(db: Tx, phaseIds: Array<string | null | undefined>): Promise<void> {
  for (const id of [...new Set(phaseIds.filter((x): x is string => !!x))]) {
    const subs = await db.subphase.findMany({ where: { phaseId: id }, select: { startDate: true, endDate: true, progressPct: true } });
    const pct = weightedProgress(subs);
    if (pct === null) continue;
    await db.phase.updateMany({ where: { id, progressPct: { not: pct } }, data: { progressPct: pct, version: { increment: 1 } } });
  }
}

/** Refuse la saisie directe de l'avancement d'une phase qui a des sous-phases. */
export async function assertPhaseProgressEditable(db: Tx, phaseId: string, progressPct: unknown): Promise<void> {
  if (progressPct === undefined) return;
  if (await db.subphase.count({ where: { phaseId } })) throw badRequest('Avancement de la phase calculé', { progressPct: PHASE_PROGRESS_COMPUTED });
}
