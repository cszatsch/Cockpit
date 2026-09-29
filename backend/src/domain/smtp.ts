/**
 * Serveur d'envoi SMTP (spécification SMTP § 3 à § 6) : règles pures, testées dans test/unit.
 * Réglages, validation, port proposé par chiffrement, classement d'un échec par étape du dialogue.
 */

export type SmtpEnc = 'starttls' | 'ssl' | 'none';
export type SmtpStep = 'connect' | 'tls' | 'auth' | 'from';

export interface SmtpDraft {
  host: string;
  port: number;
  enc: SmtpEnc;
  auth: boolean;
  user: string;
  from: string;
}

/** Port proposé par chiffrement (§ 3). */
export const SMTP_ENC_PORT: Record<SmtpEnc, number> = { starttls: 587, ssl: 465, none: 25 };
/** Délais du dialogue de test : connexion TCP et chaque réponse du serveur. */
export const SMTP_CONNECT_TIMEOUT_MS = 10_000;
export const SMTP_REPLY_TIMEOUT_MS = 10_000;
/** Accueil du serveur : un serveur muet au-delà attend en général TLS dès l'ouverture (port 465). */
export const SMTP_GREETING_TIMEOUT_MS = 5_000;
/** Valeurs de départ quand rien n'est enregistré ni configuré par variable d'environnement (§ 2, sans identifiant). */
export const SMTP_DEFAULTS: SmtpDraft = { host: 'smtp.gmail.com', port: 587, enc: 'starttls', auth: true, user: '', from: '' };

const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/** Contrôles du § 3 (mêmes règles que la vue) ; `hasPassword` : un mot de passe est déjà enregistré. */
export function smtpErrors(d: SmtpDraft, password: string | undefined, hasPassword: boolean): Record<string, string> {
  const e: Record<string, string> = {};
  if (!HOST.test(d.host.trim())) e.host = 'nom de domaine attendu';
  if (!(Number.isInteger(d.port) && d.port >= 1 && d.port <= 65535)) e.port = 'entre 1 et 65535';
  if (d.auth && !d.user.trim()) e.user = 'obligatoire avec l’authentification';
  if (d.auth && !password?.trim() && !hasPassword) e.password = 'obligatoire avec l’authentification';
  if (!EMAIL.test(d.from.trim())) e.from = 'adresse e-mail attendue';
  return e;
}

/** Réglages d'environnement (valeurs initiales) : SMTP_HOST, SMTP_PORT, SMTP_ENC, SMTP_USER, SMTP_FROM, sinon SMTP_URL. */
export function smtpFromEnv(env: Record<string, string | undefined>): SmtpDraft {
  const d: SmtpDraft = { ...SMTP_DEFAULTS };
  if (env.SMTP_URL) {
    try {
      const u = new URL(env.SMTP_URL);
      d.host = u.hostname;
      d.enc = u.protocol === 'smtps:' ? 'ssl' : 'starttls';
      d.port = Number(u.port) || SMTP_ENC_PORT[d.enc];
      d.user = decodeURIComponent(u.username);
      d.auth = !!u.username;
    } catch {
      /* SMTP_URL illisible : valeurs par défaut */
    }
  }
  if (env.SMTP_HOST) d.host = env.SMTP_HOST;
  if (env.SMTP_ENC && ['starttls', 'ssl', 'none'].includes(env.SMTP_ENC)) d.enc = env.SMTP_ENC as SmtpEnc;
  if (env.SMTP_PORT) d.port = Number(env.SMTP_PORT) || SMTP_ENC_PORT[d.enc];
  if (env.SMTP_USER !== undefined && env.SMTP_USER !== '') d.user = env.SMTP_USER;
  if (env.SMTP_AUTH) d.auth = env.SMTP_AUTH !== 'false';
  const from = env.SMTP_FROM || /<([^>]+)>/.exec(env.MAIL_FROM ?? '')?.[1] || (EMAIL.test(env.MAIL_FROM ?? '') ? env.MAIL_FROM! : '');
  d.from = from || d.user;
  return d;
}

/**
 * Étape en échec d'après la réponse du serveur ou l'erreur réseau (§ 4). `at` : commande en cours.
 * « 530 … STARTTLS » = chiffrement exigé ; « 530 Authentication Required » (même au MAIL FROM) = authentification.
 */
export function smtpFailStep(at: SmtpStep, code: string): SmtpStep {
  if (/STARTTLS/i.test(code) && /^530\b/.test(code)) return 'tls';
  if (/^(530|534|535|454 4\.7\.0)\b/.test(code) && !/STARTTLS/i.test(code)) return 'auth';
  return at;
}

/** Message court d'une erreur réseau ou TLS (« getaddrinfo ENOTFOUND hôte », « wrong version number »…). */
export function netErrorCode(e: { code?: string; message?: string }): string {
  const m = String(e.message ?? e.code ?? 'erreur');
  const ver = /wrong version number/i.exec(m);
  if (ver) return /SSL routines/i.test(m) ? 'SSL routines: wrong version number' : 'wrong version number';
  return m.replace(/^Error:\s*/, '').slice(0, 200);
}
