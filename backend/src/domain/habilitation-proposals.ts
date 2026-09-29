/**
 * Habilitations proposées par le référentiel (option retenue le 29/09/2026 : la Console propose, l'Administrateur
 * décide). Le PMO renseigne le référentiel dans le Cockpit ; la Console en déduit une proposition :
 *   - responsable d'un chantier (fiche Chantier)            → Responsable de ce chantier ;
 *   - chantiers de rattachement de la personne (fiche Personne) → Lecteur de ces chantiers.
 * Rien n'est appliqué automatiquement : l'Administrateur applique, ajuste ou écarte la proposition.
 */

export interface ProjectRightsLike {
  pmo: boolean;
  responsable: string[];
  lecteur: string[];
}

export interface Proposal {
  responsable: string[];
  lecteur: string[];
}

/** Écarts entre le référentiel et les droits réels d'un compte sur un projet. */
export interface Gaps {
  /** Chantiers dont la personne est responsable, sans droit de Responsable. */
  responsableManquant: string[];
  /** Droits de Responsable sur des chantiers dont la personne n'est plus responsable. */
  responsableEnTrop: string[];
  /** Chantiers de rattachement sans aucun accès. */
  lectureManquante: string[];
}

const uniqSorted = (xs: string[]) => [...new Set(xs)].sort();

export function proposal(owned: string[], attached: string[]): Proposal {
  const responsable = uniqSorted(owned);
  return { responsable, lecteur: uniqSorted(attached.filter((w) => !responsable.includes(w))) };
}

/**
 * Écarts signalés : un PMO voit et gère tous les chantiers (aucun écart) ; un Lecteur en plus de la proposition
 * n'est pas un écart (l'Administrateur peut ouvrir la lecture au-delà du référentiel).
 */
export function gaps(p: Proposal, actual: ProjectRightsLike | undefined): Gaps {
  const a = actual ?? { pmo: false, responsable: [], lecteur: [] };
  if (a.pmo) return { responsableManquant: [], responsableEnTrop: [], lectureManquante: [] };
  const access = new Set([...a.responsable, ...a.lecteur]);
  return {
    responsableManquant: p.responsable.filter((w) => !a.responsable.includes(w)),
    responsableEnTrop: uniqSorted(a.responsable.filter((w) => !p.responsable.includes(w))),
    lectureManquante: p.lecteur.filter((w) => !access.has(w)),
  };
}

export const gapCount = (g: Gaps) => g.responsableManquant.length + g.responsableEnTrop.length + g.lectureManquante.length;

/** Écarts en une phrase : « RISE : Responsable de C6 non attribué ; lecture de C2 manquante ». */
export function gapText(code: string, g: Gaps): string {
  const parts = [
    g.responsableManquant.length ? `Responsable de ${g.responsableManquant.join(', ')} non attribué` : '',
    g.responsableEnTrop.length ? `Responsable de ${g.responsableEnTrop.join(', ')} sans en être responsable` : '',
    g.lectureManquante.length ? `lecture de ${g.lectureManquante.join(', ')} manquante` : '',
  ].filter(Boolean);
  return `${code} : ${parts.join(' ; ')}`;
}
