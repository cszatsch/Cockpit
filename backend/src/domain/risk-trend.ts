/**
 * Tendance des risques (01/10/2026) : risques ouverts (non clos) et critiques à la fin de chaque semaine, calculés à
 * partir du registre et du journal d'audit, et non plus d'un bloc de démonstration figé.
 * - Un risque compte à partir de sa création ; il cesse de compter à sa clôture (dernier passage au statut CLOSED
 *   dans le journal d'audit, sinon sa dernière modification), s'il est clos aujourd'hui.
 * - Critique : probabilité × impact ≥ 20 (valeurs actuelles : leur historique n'est pas conservé).
 * - La série commence à la semaine du premier risque du registre (pas de semaines vides inventées avant).
 */
export const RISK_TREND_WEEKS = 8;
export const RISK_CRITICAL_SCORE = 20;

export interface TrendRisk { id: string; createdAt: Date; updatedAt: Date; status: string; p: number; i: number }
export interface RiskTrend { weeks: Array<[number, number]>; labels: string[]; total: number; critical: number; since: string | null }

/** Numéro de semaine ISO 8601. */
export function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - y0.getTime()) / 86_400_000 + 1) / 7);
}

export function riskTrend(risks: TrendRisk[], closedAt: Map<string, Date>, todayIso: string, weeks = RISK_TREND_WEEKS): RiskTrend {
  const endOf = (iso: string) => new Date(`${iso}T23:59:59.999Z`);
  const today = endOf(todayIso);
  const closeOf = (r: TrendRisk) => (r.status === 'CLOSED' ? closedAt.get(r.id) ?? r.updatedAt : null);
  const first = risks.length ? new Date(Math.min(...risks.map((r) => r.createdAt.getTime()))) : null;
  const out: RiskTrend = { weeks: [], labels: [], total: 0, critical: 0, since: first ? first.toISOString().slice(0, 10) : null };
  for (let k = weeks - 1; k >= 0; k--) {
    const end = new Date(today.getTime() - k * 7 * 86_400_000);
    // Semaines antérieures à la création du registre : non affichées.
    if (!first || end.getTime() < first.getTime()) continue;
    const open = risks.filter((r) => r.createdAt <= end && !((c) => c && c <= end)(closeOf(r)));
    out.weeks.push([open.length, open.filter((r) => r.p * r.i >= RISK_CRITICAL_SCORE).length]);
    out.labels.push(`S${isoWeek(end)}`);
  }
  const last = out.weeks[out.weeks.length - 1];
  out.total = last ? last[0] : 0;
  out.critical = last ? last[1] : 0;
  return out;
}
