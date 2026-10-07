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

/** Valeurs d'une cellule à choix multiple du fichier d'initialisation : séparées par « ; », vides et doublons retirés. */
export function multiValues(raw: unknown): string[] {
  const out: string[] = [];
  for (const v of String(raw ?? '').split(';').map((x) => x.trim()).filter(Boolean)) if (!out.includes(v)) out.push(v);
  return out;
}
