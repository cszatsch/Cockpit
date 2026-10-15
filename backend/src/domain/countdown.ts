/**
 * Compte à rebours Go-Live du Cockpit (16/10/2026, maquette « Widget compte a rebours - Meche ») : réglages du widget
 * choisis par chaque utilisateur, gardés dans ses préférences (`UserPreferences.countdown`), un jeu par projet (la date
 * cible et le début de la mèche dépendent du projet). Champ absent = valeur par défaut du widget (date cible : Go-Live du
 * projet).
 */

/** Projets au plus dans les préférences d'un utilisateur. */
export const COUNTDOWN_MAX_PROJECTS = 50;
/** Longueur au plus des textes (titre, événement, messages). */
export const COUNTDOWN_TEXT_MAX = 80;
/** Couleurs d'accent proposées (maquette) ; toute couleur #rrggbb est acceptée. */
export const COUNTDOWN_ACCENTS = ['#f7a41c', '#5fd0c4', '#ff7a59', '#ffffff'] as const;
/** Seuils du décompte à la seconde, en heures (0 = désactivé). */
export const COUNTDOWN_THRESHOLDS = [48, 24, 0] as const;
export const COUNTDOWN_UNITS = ['calendar', 'business'] as const;
export const COUNTDOWN_THEMES = ['dark', 'light'] as const;

/** Date ISO AAAA-MM-JJ existante (pas de 31 février). */
export function isIsoDay(s: unknown): boolean {
  if (typeof s !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/** Heure HH:MM (00:00 à 23:59). */
export function isHourMinute(s: unknown): boolean {
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}
