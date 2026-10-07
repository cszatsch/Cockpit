// Avancement d'une phase à partir de ses sous-phases (07/10/2026, arbitrage du commanditaire) :
// moyenne des avancements pondérée par la durée de chaque sous-phase, en jours calendaires (début et fin inclus).
// Une sous-phase sans dates complètes compte pour un jour, pour ne pas disparaître du calcul.

export interface RollupItem {
  startDate?: string | null;
  endDate?: string | null;
  progressPct: number;
}

/** Durée en jours (au moins 1) ; 1 si l'une des dates manque ou si la période est incohérente. */
export function durationDays(start?: string | null, end?: string | null): number {
  if (!start || !end) return 1;
  const ms = Date.parse(`${end.slice(0, 10)}T00:00:00Z`) - Date.parse(`${start.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(ms) || ms < 0) return 1;
  return Math.round(ms / 86_400_000) + 1;
}

/** Moyenne pondérée par la durée, arrondie à l'entier ; null sans sous-phase. */
export function weightedProgress(items: RollupItem[]): number | null {
  if (!items.length) return null;
  let sum = 0;
  let weight = 0;
  for (const it of items) {
    const d = durationDays(it.startDate, it.endDate);
    sum += Math.max(0, Math.min(100, it.progressPct || 0)) * d;
    weight += d;
  }
  return Math.round(sum / weight);
}

export const PHASE_PROGRESS_COMPUTED = 'Avancement calculé : moyenne de ses sous-phases pondérée par leur durée';
