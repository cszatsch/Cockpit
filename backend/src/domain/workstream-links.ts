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
 * Dépendance circulaire entre chantiers : premier cycle trouvé (liste de chantiers, le premier répété à la fin), sinon null.
 * `deps` : chantier → chantiers dont il dépend (la dépendance « Tous » n'est pas un lien et n'entre pas dans le graphe).
 */
export function dependencyCycle(deps: Map<string, string[]>): string[] | null {
  const state = new Map<string, 0 | 1 | 2>();
  const path: string[] = [];
  const visit = (n: string): string[] | null => {
    state.set(n, 1);
    path.push(n);
    for (const m of deps.get(n) ?? []) {
      if (state.get(m) === 1) return [...path.slice(path.indexOf(m)), m];
      if (!state.get(m)) {
        const c = visit(m);
        if (c) return c;
      }
    }
    path.pop();
    state.set(n, 2);
    return null;
  };
  for (const n of deps.keys()) if (!state.get(n)) { const c = visit(n); if (c) return c; }
  return null;
}

/** Valeurs d'une cellule à choix multiple du fichier d'initialisation : séparées par « ; », vides et doublons retirés. */
export function multiValues(raw: unknown): string[] {
  const out: string[] = [];
  for (const v of String(raw ?? '').split(';').map((x) => x.trim()).filter(Boolean)) if (!out.includes(v)) out.push(v);
  return out;
}
