/**
 * Règles métier calculées (brief Cockpit § 7) — module de domaine unique, sans accès à la base.
 * Aucune de ces valeurs n'est stockée.
 */
import { addDays, daysBetween } from './dates';

// ───── § 7.6 Fraîcheur (seuils fixes, non paramétrables) ─────
export const FRESHNESS_WATCH_DAYS = 7;
export const FRESHNESS_ALERT_DAYS = 14;

export type Freshness = 'OK' | 'WATCH' | 'ALERT';
export function freshness(days: number): Freshness {
  if (days > FRESHNESS_ALERT_DAYS) return 'ALERT';
  if (days > FRESHNESS_WATCH_DAYS) return 'WATCH';
  return 'OK';
}

// ───── § 7.2 Jalons ─────
/** Nombre de jours depuis la dernière confirmation (`today − confirmedAt`), borné à 0. */
export function confirmedDays(confirmedAtIso: string | null, today: string): number {
  if (!confirmedAtIso) return 0;
  return Math.max(0, daysBetween(confirmedAtIso, today));
}

/** Écart = iso − baselineIso (jours) ; « conforme » si 0. */
export function milestoneGap(iso: string, baselineIso: string | null): number {
  return daysBetween(baselineIso || iso, iso);
}

export type MilestoneState = 'past' | 'next' | 'upcoming';
/** past si iso < today ; next = premier jalon avec iso ≥ today (tri iso puis code) ; upcoming sinon. */
export function milestoneStates<T extends { iso: string; code: string }>(list: T[], today: string): Map<T, MilestoneState> {
  const sorted = [...list].sort((a, b) => a.iso.localeCompare(b.iso) || a.code.localeCompare(b.code));
  const out = new Map<T, MilestoneState>();
  let nextFound = false;
  for (const m of sorted) {
    if (m.iso < today) out.set(m, 'past');
    else if (!nextFound) {
      out.set(m, 'next');
      nextFound = true;
    } else out.set(m, 'upcoming');
  }
  return out;
}

/** Regroupement mensuel : clé iso[0..7], mois triés, jalons triés par iso puis code. */
export function groupByMonth<T extends { iso: string; code: string }>(list: T[]): Array<{ month: string; items: T[] }> {
  const map = new Map<string, T[]>();
  for (const m of [...list].sort((a, b) => a.iso.localeCompare(b.iso) || a.code.localeCompare(b.code))) {
    const k = m.iso.slice(0, 7);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(m);
  }
  return [...map.entries()].map(([month, items]) => ({ month, items }));
}

/** La date prévue sort-elle de la période de la phase ? (avertissement non bloquant, Q-N5) */
export function outsidePeriod(iso: string, start: string | null, end: string | null): boolean {
  return (!!start && iso < start) || (!!end && iso > end);
}

// ───── § 7.3 Risques ─────
export type Criticality = 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';
export const RISK_CRITICAL_MIN = 20;
export function riskScore(p: number, i: number): number {
  return p * i;
}
export function riskCriticality(p: number, i: number): Criticality {
  const s = p * i;
  if (s >= RISK_CRITICAL_MIN) return 'CRITICAL';
  if (s >= 12) return 'HIGH';
  if (s >= 6) return 'MODERATE';
  return 'LOW';
}

// ───── § 7.4 Actions ─────
export function actionLate(status: string, dueIso: string | null, today: string): boolean {
  return status !== 'DONE' && !!dueIso && dueIso < today;
}

// ───── § 7.5 Livrables ─────
export type DeliverableStatus = 'DONE' | 'LATE' | 'ACTIVE' | 'FUTURE';
export type DeliverableRiskCode = 'OK' | 'TENSION' | 'CRITICAL';
export const DELIVERABLE_CRITICAL_GAP = 18;
export const DELIVERABLE_TENSION_GAP = 6;
/** Durée par défaut d'une sous-phase sans date de fin (frontend `lvItems`). */
export const SUBPHASE_DEFAULT_DAYS = 120;

export function deliverableStatus(prog: number, start: string | null, due: string, today: string): DeliverableStatus {
  if (prog >= 100) return 'DONE';
  if (today > due) return 'LATE';
  if ((start && today >= start) || prog > 0) return 'ACTIVE';
  return 'FUTURE';
}

/** Risque automatique (sans `riskOverride`) : LATE → CRITICAL ; ACTIVE : écart = % temps écoulé − prog. */
export function deliverableAutoRisk(prog: number, start: string | null, due: string, today: string): DeliverableRiskCode {
  const st = deliverableStatus(prog, start, due, today);
  if (st === 'LATE') return 'CRITICAL';
  if (st !== 'ACTIVE') return 'OK';
  const s = start ?? due;
  const total = Math.max(1, daysBetween(s, due));
  const elapsed = Math.min(1, Math.max(0, daysBetween(s, today) / total));
  const gap = elapsed * 100 - prog;
  if (gap > DELIVERABLE_CRITICAL_GAP) return 'CRITICAL';
  if (gap > DELIVERABLE_TENSION_GAP) return 'TENSION';
  return 'OK';
}

export function deliverableRisk(prog: number, start: string | null, due: string, today: string, override: DeliverableRiskCode | null): DeliverableRiskCode {
  return override ?? deliverableAutoRisk(prog, start, due, today);
}

/** Dates effectives d'un livrable sans dates propres : celles de sa sous-phase (frontend). */
export function deliverableDates(start: string | null, due: string | null, sp: { startDate: string | null; endDate: string | null }) {
  const s = start ?? sp.startDate;
  const d = due ?? sp.endDate ?? (s ? addDays(s, SUBPHASE_DEFAULT_DAYS) : null);
  return { start: s, due: d };
}

// ───── Q9 Signal d'avancement (écart réel / cible) ─────
export const SIG_RISK_GAP = -20;
export const SIG_WATCH_GAP = 0;
export type Signal = 'OK' | 'WATCH' | 'RISK';
export function progressSignal(valuePct: number, targetPct: number): Signal {
  const gap = valuePct - targetPct;
  if (gap < SIG_RISK_GAP) return 'RISK';
  if (gap < SIG_WATCH_GAP) return 'WATCH';
  return 'OK';
}

// ───── § 7.8 Séances ─────
export function sessionToConfirm(status: string, dateIso: string, today: string): boolean {
  return status === 'PLANNED' && dateIso <= today;
}

/** Transitions de statut autorisées (Q7). Renvoie un message d'erreur ou null. */
export function sessionTransitionError(from: string, to: string, dateIso: string, today: string): string | null {
  if (from === to) return null;
  if (from === 'HELD') return 'Une séance tenue ne peut plus changer de statut';
  if (from === 'PLANNED' && to === 'HELD' && dateIso > today) return 'Une séance future ne peut pas être confirmée';
  if (from === 'CANCELLED' && to === 'HELD') return 'Une séance annulée doit d\'abord être rétablie';
  return null;
}

export function sessionDateChangeError(status: string): string | null {
  return status === 'PLANNED' ? null : 'Seules les séances planifiées peuvent changer de date';
}

// ───── § 7.11 Affectations ─────
export function assignmentActive(a: { startDate: string; endDate: string | null }, today: string): boolean {
  return a.startDate <= today && (!a.endDate || a.endDate >= today);
}

// ───── Compte à rebours ─────
export function countdown(target: string, today: string): string {
  const d = daysBetween(today, target);
  return d >= 0 ? `J-${d}` : `J+${-d}`;
}

// ───── Planning (frontend `plItems`) ─────
/** Avancement prévu : forcé, sinon proportion du temps écoulé. */
export function plannedPct(start: string | null, end: string | null, today: string, override: number | null): number {
  if (override !== null && override !== undefined) return override;
  if (!start || !end) return 0;
  const total = Math.max(1, daysBetween(start, end));
  return Math.round(Math.min(1, Math.max(0, daysBetween(start, today) / total)) * 100);
}

export function to100(values: number[]): number[] {
  const total = values.reduce((a, b) => a + b, 0) || 1;
  const raw = values.map((x) => (x * 100) / total);
  const fl = raw.map(Math.floor);
  let rest = 100 - fl.reduce((a, b) => a + b, 0);
  raw
    .map((x, j) => [x - fl[j], j] as const)
    .sort((a, b) => b[0] - a[0])
    .forEach(([, j]) => {
      if (rest > 0) {
        fl[j]++;
        rest--;
      }
    });
  return fl;
}
