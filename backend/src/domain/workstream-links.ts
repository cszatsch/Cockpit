/**
 * Rattachements d'un chantier (06/10/2026) : phases, sous-phases et dépendances. Règles pures, communes au Référentiel
 * du Cockpit et à l'import du fichier d'initialisation ; testées dans `test/unit/workstream-links.spec.ts`.
 */

/** Sous-phases qui n'appartiennent à aucune des phases du chantier (`phaseOf` : sous-phase → phase). */
export function foreignSubphases(subphaseIds: string[], phaseIds: string[], phaseOf: Map<string, string>): string[] {
  const phases = new Set(phaseIds);
  return subphaseIds.filter((s) => !phases.has(phaseOf.get(s) ?? ''));
}

/**
 * Phases retirées d'un chantier (décision D3 du 06/10/2026) : ses sous-phases de ces phases sont retirées avec lui.
 * Renvoie les sous-phases gardées et celles retirées.
 */
export function keepSubphasesOf(subphaseIds: string[], phaseIds: string[], phaseOf: Map<string, string>): { kept: string[]; dropped: string[] } {
  const foreign = new Set(foreignSubphases(subphaseIds, phaseIds, phaseOf));
  return { kept: subphaseIds.filter((s) => !foreign.has(s)), dropped: subphaseIds.filter((s) => foreign.has(s)) };
}

/**
 * Dates d'un chantier (07/10/2026) : celles saisies, sinon calculées — première date de début et dernière date de fin de
 * ses sous-phases, sinon de ses phases, sinon celles du projet. Chaque borne est complétée indépendamment.
 */
export function workstreamSpan(
  given: { start: string | null; end: string | null },
  subphases: Array<{ start: string | null; end: string | null }>,
  phases: Array<{ start: string | null; end: string | null }>,
  project: { start: string | null; end: string | null },
): { start: string | null; end: string | null } {
  const first = (xs: Array<string | null>) => xs.filter((x): x is string => !!x).sort()[0] ?? null;
  const last = (xs: Array<string | null>) => xs.filter((x): x is string => !!x).sort().pop() ?? null;
  return {
    start: given.start ?? first(subphases.map((s) => s.start)) ?? first(phases.map((p) => p.start)) ?? project.start,
    end: given.end ?? last(subphases.map((s) => s.end)) ?? last(phases.map((p) => p.end)) ?? project.end,
  };
}

/**
 * N° d'une sous-phase (07/10/2026, arbitrage du commanditaire) : numérotation libre, choisie par le directeur de projet
 * (5.1, 4.2.1, C2.1…), unique dans le projet. Seuls sont refusés l'espace, « ; » et « · », séparateurs des valeurs
 * multiples et des renvois (« 3.1 · Ateliers »). Message d'erreur, ou null si le N° convient.
 */
export const SUBPHASE_CODE_FORBIDDEN = /[\s;·]/;
export function subphaseCodeError(code: string): string | null {
  if (!code) return 'N° obligatoire';
  return SUBPHASE_CODE_FORBIDDEN.test(code) ? 'sans espace, « ; » ni « · »' : null;
}

/**
 * Code d'une nouvelle sous-phase (09/10/2026) : préfixe (n° du chantier choisi, sinon n° de la phase), point, rang suivant
 * parmi les codes du projet qui ont ce préfixe ; jamais un code déjà pris dans le projet (PMS numérote par chantier sur
 * tout le projet — 1.1 à 1.5 pour C1 —, RISE par phase ; l'ancien calcul, par phase et dans la phase seulement, pouvait
 * retomber sur un code existant).
 */
export function nextSubphaseCode(prefix: string | number, codes: string[]): string {
  const p = String(prefix), taken = new Set(codes.map((c) => c.trim().toUpperCase()));
  let rank = Math.max(0, ...codes.filter((c) => c.startsWith(p + '.')).map((c) => parseInt(c.slice(p.length + 1), 10) || 0)) + 1;
  while (taken.has(`${p}.${rank}`.toUpperCase())) rank++;
  return `${p}.${rank}`;
}

/** Valeurs d'une cellule à choix multiple du fichier d'initialisation : séparées par « ; », vides et doublons retirés. */
export function multiValues(raw: unknown): string[] {
  const out: string[] = [];
  for (const v of String(raw ?? '').split(';').map((x) => x.trim()).filter(Boolean)) if (!out.includes(v)) out.push(v);
  return out;
}

/**
 * Période d'un chantier sans dates propres (09/10/2026) : du début de la première de ses phases à la fin de la dernière.
 * Sans phase datée : null (le chantier reste sans dates, signalé « dates à renseigner » dans le Suivi d'avancement).
 */
export function periodOfPhases(phases: Array<{ startDate?: string | null; endDate?: string | null }>): { startDate: string; endDate: string } | null {
  const s = phases.map((p) => p.startDate).filter((x): x is string => !!x).sort();
  const e = phases.map((p) => p.endDate).filter((x): x is string => !!x).sort();
  return s.length && e.length ? { startDate: s[0], endDate: e[e.length - 1] } : null;
}
