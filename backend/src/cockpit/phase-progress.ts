import { Tx } from '../core/prisma.service';
import { badRequest } from '../core/errors';
import { PHASE_PROGRESS_COMPUTED, WORKSTREAM_PROGRESS_COMPUTED, weightedProgress } from '../domain/progress-rollup';

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

/**
 * Avancement des chantiers (15/10/2026) : chantier rattaché à des sous-phases → moyenne de leurs avancements pondérée par
 * leur durée (`weightedProgress`), enregistrée dans `Workstream.progressPct` pour que la page Aujourd'hui, le Planning, les
 * rapports et Jev lisent le même chiffre. Appelé après toute écriture d'une sous-phase ou des liens chantier ↔ sous-phase.
 * Un chantier sans sous-phase garde son avancement saisi.
 */
export async function rollupWorkstreamProgress(db: Tx, wsIds: Array<string | null | undefined>): Promise<void> {
  for (const id of [...new Set(wsIds.filter((x): x is string => !!x))]) {
    const links = await db.workstreamSubphase.findMany({ where: { wsId: id }, select: { subphase: { select: { startDate: true, endDate: true, progressPct: true } } } });
    const pct = weightedProgress(links.map((l) => l.subphase));
    if (pct === null) continue;
    await db.workstream.updateMany({ where: { id, progressPct: { not: pct } }, data: { progressPct: pct, version: { increment: 1 } } });
  }
}

/** Chantiers rattachés à ces sous-phases, recalculés. */
export async function rollupWorkstreamsOfSubphases(db: Tx, subphaseIds: Array<string | null | undefined>): Promise<void> {
  const ids = [...new Set(subphaseIds.filter((x): x is string => !!x))];
  if (!ids.length) return;
  const links = await db.workstreamSubphase.findMany({ where: { subphaseId: { in: ids } }, select: { wsId: true } });
  await rollupWorkstreamProgress(db, links.map((l) => l.wsId));
}

/** Refuse la saisie directe de l'avancement d'un chantier rattaché à des sous-phases. */
export async function assertWorkstreamProgressEditable(db: Tx, wsId: string, progressPct: unknown): Promise<void> {
  if (progressPct === undefined) return;
  if (await db.workstreamSubphase.count({ where: { wsId } })) throw badRequest('Avancement du chantier calculé', { progressPct: WORKSTREAM_PROGRESS_COMPUTED });
}
