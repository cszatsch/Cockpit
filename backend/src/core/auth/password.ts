import { createHash } from 'crypto';
import { hash, verify, Algorithm } from '@node-rs/argon2';
import { config } from '../config';
import { PASSWORD_MAX_LENGTH, passwordRules } from './policy';

/**
 * Hachage Argon2id (paramètres recommandés par l'OWASP : 19 Mio, 2 itérations, 1 fil).
 * L'empreinte encode l'algorithme, les paramètres et le sel : elle suffit à la vérification.
 */
const ARGON2 = { algorithm: Algorithm.Argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/** Empreinte factice : une adresse inconnue coûte le même calcul qu'une adresse connue. */
let dummy: Promise<string> | null = null;
export function dummyHash(): Promise<string> {
  if (!dummy) dummy = hashPassword('rise-empreinte-factice-' + Math.random());
  return dummy;
}

/**
 * Mots de passe compromis les plus fréquents qui passent les règles de complexité
 * (issus des palmarès publics des fuites de données) ; comparés sans tenir compte de la casse.
 * Complété, si `PWNED_CHECK=true`, par l'API k-anonyme de Have I Been Pwned.
 */
const COMPROMISED = new Set(
  [
    'Password123!', 'Password1234!', 'P@ssw0rd1234', 'P@ssword1234', 'P@ssw0rd123!', 'Passw0rd123!', 'Motdepasse123!',
    'Motdepasse1!', 'MotDePasse2024!', 'MotDePasse2025!', 'MotDePasse2026!', 'Azerty123456!', 'Azertyuiop1!', 'Azerty@123456',
    'Qwerty123456!', 'Qwertyuiop1!', 'Qwerty@123456', 'Welcome12345!', 'Welcome@12345', 'Bienvenue123!', 'Bienvenue2026!',
    'Changeme1234!', 'Changeme@123', 'Admin123456!', 'Admin@123456', 'Administrator1!', 'Administrateur1!', 'Letmein12345!',
    'Iloveyou1234!', 'Sunshine1234!', 'Football1234!', 'Baseball1234!', 'Superman1234!', 'Princess1234!', 'Dragon123456!',
    'Monkey123456!', 'Master123456!', 'Trustno1234!', 'Abcd1234567!', 'Abc123456789!', 'Aa123456789!', 'Aa@123456789',
    'Zaq12wsxcde3!', '1qaz2wsx3edc!', '1Qaz2wsx3edc!', 'Qazwsx123456!', 'Summer2024!!', 'Summer2025!!', 'Winter2024!!',
    'Winter2025!!', 'Spring2025!!', 'Autumn2025!!', 'Janvier2026!', 'Septembre2026!', 'Onepoint2026!', 'Cockpit2026!',
    'Rise12345678!', 'Soleil123456!', 'Chocolat1234!', 'Doudou123456!', 'Marseille2026!', 'Paris2024!!!', 'Paris123456!',
  ].map((p) => p.toLowerCase()),
);

/** Vrai si le mot de passe figure dans une liste de mots de passe compromis. */
export async function isCompromised(password: string): Promise<boolean> {
  if (COMPROMISED.has(password.toLowerCase())) return true;
  if (process.env.PWNED_CHECK !== 'true' || config.offline) return false;
  // k-anonymat : seuls les 5 premiers caractères de l'empreinte SHA-1 quittent le serveur.
  const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();
  try {
    const r = await fetch(`https://api.pwnedpasswords.com/range/${sha1.slice(0, 5)}`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return false;
    const suffix = sha1.slice(5);
    return (await r.text()).split('\n').some((line) => line.split(':')[0].trim() === suffix);
  } catch {
    return false; // service injoignable : la liste locale reste appliquée
  }
}

/**
 * Contrôle serveur d'un nouveau mot de passe : complexité, différent du précédent, absent des
 * listes de mots de passe compromis. Renvoie le premier motif de refus, ou null.
 */
export async function passwordProblem(password: string, currentHash: string | null): Promise<string | null> {
  if (password.length > PASSWORD_MAX_LENGTH) return `${PASSWORD_MAX_LENGTH} caractères maximum`;
  const missing = passwordRules(password).filter((r) => !r.ok);
  if (missing.length) return `Règles non respectées : ${missing.map((r) => r.label.toLowerCase()).join(', ')}`;
  if (currentHash && (await verifyPassword(currentHash, password))) return 'Le nouveau mot de passe doit être différent du précédent';
  if (await isCompromised(password)) return 'Ce mot de passe figure dans une liste de mots de passe compromis ; choisissez-en un autre';
  return null;
}
