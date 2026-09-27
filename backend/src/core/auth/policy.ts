/**
 * Règles de sécurité de l'authentification (spécification AUTH, docs/specs/AUTH - specification.md).
 * Chaque valeur est une constante nommée, reprise dans docs/DECISIONS.md.
 */

/** Surfaces de connexion : le Cockpit (application) et la Console d'administration. */
export type Surface = 'APP' | 'ADMIN';
export const SURFACES: readonly Surface[] = ['APP', 'ADMIN'];

/** Échecs consécutifs tolérés par adresse e-mail (compte existant ou non) avant blocage. */
export const MAX_FAILURES = 5;
/** Échecs tolérés par adresse IP (toutes adresses e-mail confondues) avant blocage de l'IP. */
export const IP_MAX_FAILURES = 20;
/** Durée du blocage temporaire. */
export const LOCK_MINUTES = 15;
/** Un compteur d'échecs sans nouvel échec depuis ce délai repart de zéro. */
export const FAILURE_WINDOW_MINUTES = 15;
/** Durée minimale d'une réponse de connexion : le temps de réponse ne trahit pas l'existence du compte. */
export const LOGIN_MIN_MS = 400;

/** Inactivité tolérée avant expiration de la session, par surface (côté navigateur). */
export const IDLE_MINUTES: Record<Surface, number> = { APP: 30, ADMIN: 15 };
/** Marge du serveur au-delà de l'inactivité du navigateur (le navigateur ferme la session le premier). */
export const SERVER_IDLE_GRACE_MINUTES = 2;
/** Avertissement « Toujours là ? » avant l'expiration. */
export const IDLE_WARNING_SECONDS = 60;

/** Validité d'un lien de réinitialisation du mot de passe. */
export const RESET_TOKEN_MINUTES = 30;
/** Délai minimal entre deux envois de lien pour un même compte. */
export const RESET_RESEND_SECONDS = 60;
/** Nombre maximal de liens envoyés par heure pour un même compte. */
export const RESET_MAX_PER_HOUR = 5;
/** Entropie des jetons de réinitialisation et d'invitation. */
export const TOKEN_BYTES = 32;

/** Longueur minimale d'un mot de passe. */
export const PASSWORD_MIN_LENGTH = 12;
/** Longueur maximale (borne le coût du hachage). */
export const PASSWORD_MAX_LENGTH = 128;

/** Message unique d'échec de connexion : ne dit jamais lequel des deux champs est faux. */
export const INVALID_CREDENTIALS = 'Identifiant ou mot de passe incorrect';
/** Message neutre du mot de passe oublié : ne révèle pas quelles adresses ont un compte. */
export const FORGOT_NEUTRAL = 'Si un compte existe pour cette adresse, un e-mail vous a été envoyé';

/** Format d'adresse e-mail, identique à celui des écrans de connexion. */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Règles de complexité, dans l'ordre d'affichage des écrans. */
export function passwordRules(p: string): Array<{ label: string; ok: boolean }> {
  return [
    { label: `${PASSWORD_MIN_LENGTH} caractères minimum`, ok: p.length >= PASSWORD_MIN_LENGTH },
    { label: 'Majuscule et minuscule', ok: /[a-z]/.test(p) && /[A-Z]/.test(p) },
    { label: 'Au moins un chiffre', ok: /\d/.test(p) },
    { label: 'Un caractère spécial', ok: /[^A-Za-z0-9]/.test(p) },
  ];
}
