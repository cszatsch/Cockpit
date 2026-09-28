/**
 * Reproduction déterministe de `genUsage()` de la Console (consommation de démonstration).
 * Utilisée uniquement par l'amorçage : en fonctionnement, `UsageRecord` est alimenté par chaque appel LLM.
 */

function rng(seed: number) {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DEMO_FUNCTIONS = [
  { id: 'insights', vin: 120e6, vout: 18e6 },
  { id: 'crud', vin: 50e6, vout: 12e6 },
  // Ancienne « Analyse de documents » : sa consommation est celle de l'étape Synthèse (LLM).
  { id: 'doc_syn', vin: 180e6, vout: 9e6 },
];

export interface DemoUsageRow {
  day: number;
  date: string;
  fn: string;
  model: string;
  provider: string;
  tin: number;
  tout: number;
  cost: number;
  fallback: boolean;
}

export function genDemoUsage(
  models: Array<{ id: string; providerId: string; priceInPerMTok: number | null; priceOutPerMTok: number | null }>,
  asg: Record<string, { p: string; f: string }>,
  endIso = '2026-09-26',
  monthSpent = 1032.4,
): DemoUsageRow[] {
  const r = rng(11);
  const P = Object.fromEntries(models.map((m) => [m.id, m]));
  const end = new Date(`${endIso}T12:00:00Z`);
  const rows: DemoUsageRow[] = [];
  for (let d = 0; d < 90; d++) {
    const dt = new Date(end.getTime() - (89 - d) * 86_400_000);
    const wd = dt.getUTCDay();
    const wf = wd === 0 || wd === 6 ? 0.28 : 1;
    const tr = 0.82 + d / 320;
    for (const fn of DEMO_FUNCTIONS) {
      let f = wf * tr * (0.78 + 0.44 * r());
      if (d === 89) f *= 0.43;
      const tin = (fn.vin / 30) * f;
      const tout = (fn.vout / 30) * f;
      for (const [m, share, fb] of [
        [asg[fn.id].p, 0.95, false],
        [asg[fn.id].f, 0.05, true],
      ] as Array<[string, number, boolean]>) {
        rows.push({ day: d, date: dt.toISOString().slice(0, 10), fn: fn.id, model: m, provider: P[m].providerId, tin: tin * share, tout: tout * share, cost: 0, fallback: fb });
      }
    }
  }
  for (const x of rows) x.cost = (x.tin * (P[x.model].priceInPerMTok ?? 0) + x.tout * (P[x.model].priceOutPerMTok ?? 0)) / 1e6;
  const monthStart = endIso.slice(0, 8) + '01';
  const mtd = rows.filter((x) => x.date >= monthStart).reduce((a, x) => a + x.cost, 0);
  const k = monthSpent / mtd;
  for (const x of rows) {
    x.tin = Math.round(x.tin * k);
    x.tout = Math.round(x.tout * k);
    x.cost *= k;
  }
  return rows;
}
