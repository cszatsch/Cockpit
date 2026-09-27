/**
 * Correspondances codes d'enum (API, anglais) ↔ libellés français (frontend).
 * Utilisées par l'amorçage, l'import Excel et la vue de compatibilité `GET /bootstrap`.
 */

export const PLAN_STATUS_FR = { PLANNED: 'Prévue', IN_PROGRESS: 'En cours', DONE: 'Terminée' } as const;
export const WAVE_STATUS_FR = { PLANNED: 'Prévu', IN_PROGRESS: 'En cours', DONE: 'Terminé' } as const;
export const WS_STATUS_FR = { ACTIVE: 'Actif', CLOSED: 'Clos' } as const;
export const CLIENT_STATUS_FR = { ACTIVE: 'Actif', INACTIVE: 'Inactif' } as const;

export const FREQUENCY_FR = {
  DAILY: 'Quotidienne',
  WEEKLY: 'Hebdomadaire',
  BIWEEKLY: 'Bimensuelle',
  MONTHLY: 'Mensuelle',
  QUARTERLY: 'Trimestrielle',
  SEMIANNUAL: 'Semestrielle',
  ON_DEMAND: 'À la demande',
} as const;

export const LEVEL_FR = { STRATEGIC: 'Stratégique', STEERING: 'Pilotage', OPERATIONAL: 'Opérationnel', OFF_CYCLE: 'Hors cycle' } as const;
export const MEMBER_ROLE_FR = { CHAIR: 'Président', MEMBER: 'Membre', SECRETARY: 'Secrétaire', GUEST: 'Invité' } as const;
export const PROJECT_STATUS_FR = { PREPARATION: 'Préparation', ACTIVE: 'Actif', CLOSED: 'Clos' } as const;

export const PRIORITY_FR = { HIGH: 'Haute', MEDIUM: 'Moyenne', LOW: 'Basse' } as const;
export const ACTION_STATUS_FR = { OPEN: 'À faire', IN_PROGRESS: 'En cours', BLOCKED: 'Bloquée', DONE: 'Terminée' } as const;
export const DECISION_STATUS_FR = {
  DRAFT: 'Brouillon',
  IN_REVIEW: 'En instruction',
  TO_ARBITRATE: 'À arbitrer',
  ARBITRATED: 'Arbitrée',
  CANCELLED: 'Annulée',
  SUPERSEDED: 'Remplacée',
} as const;
export const REPORT_STATUS_FR = { DRAFT: 'Brouillon', IN_REVIEW: 'En relecture', PUBLISHED: 'Publiée' } as const;
export const MISSION_STATUS_FR = { INVOICED: 'Facturé', IN_PROGRESS: 'En cours', NEGOTIATION: 'En négociation' } as const;
export const CONF_FR = { INTERNAL: 'Interne', RESTRICTED: 'Restreint' } as const;
export const SRC_FR = { UPLOADED: 'Déposé', GENERATED: 'Généré' } as const;
/** Tons (baromètre, signaux) : codes API ↔ codes courts du frontend. */
export const TONE_FRONT = { OK: 'ok', WATCH: 'vig', RISK: 'risk' } as const;
export const DELIVERABLE_RISK_FRONT = { OK: 'ok', TENSION: 'tens', CRITICAL: 'crit' } as const;

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Clé de comparaison insensible à la casse, aux accents et aux espaces multiples. */
export function normKey(s: string | null | undefined): string {
  return stripAccents(String(s ?? '')).toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
}

/** Recherche inverse libellé → code (tolérante aux accents, à la casse et au genre « Prévu/Prévue »). */
export function codeFromLabel<T extends Record<string, string>>(map: T, label: string | null | undefined): keyof T | null {
  const k = normKey(label).replace(/e$/, '');
  for (const [code, lab] of Object.entries(map)) {
    if (normKey(lab).replace(/e$/, '') === k || normKey(code) === normKey(label)) return code as keyof T;
  }
  return null;
}

export function invert<T extends Record<string, string>>(map: T): Record<string, keyof T> {
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k])) as Record<string, keyof T>;
}
