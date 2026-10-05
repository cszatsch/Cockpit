/**
 * Partager Cockpit (spécification `docs/specs/PARTAGE - specification.md`, 05/10/2026) : règles de calcul du paquet
 * d'installation Windows, partagées par le serveur et les tests.
 */
import { randomInt } from 'crypto';

export type ShareDataMode = 'current' | 'demo' | 'empty';
export type ShareUpdate = 'keep' | 'replace';
/** Étapes de la génération, dans l'ordre (`step` = indice de l'étape en cours ; 4 = terminé). */
export const SHARE_STEPS = ['compile', 'copy_db', 'encrypt', 'archive'] as const;

/** Alphabet du code : sans caractères ambigus (0/O, 1/I/L). */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** Code de déverrouillage : 12 caractères en 3 groupes (`XXXX-XXXX-XXXX`), générateur aléatoire cryptographique. */
export function unlockCode(): string {
  return [0, 1, 2].map(() => Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('')).join('-');
}
export const CODE_PATTERN = /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/;

/** Dérivation de la clé du paquet à partir du code (Argon2id) : paramètres stockés dans le paquet avec le sel. */
export const SHARE_KDF = { algorithm: 'argon2id', memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

/** Durée de validité des liens de téléchargement signés. */
export const SHARE_URL_TTL_MS = 15 * 60 * 1000;
/** Code non encore remis (personne sur l'écran à la fin) : gardé en mémoire au plus 1 h, puis oublié. */
export const SHARE_CODE_TTL_MS = 60 * 60 * 1000;

/** Taille estimée (octets) = application + données + fichiers. */
export const estimateSize = (app: number, data: number, files: number) => app + data + files;

/** Dépense IA possible : somme des plafonds des clés incluses ; « Illimitée » (null) si une clé n'a pas de plafond ; 0 sans clé. */
export function possibleSpend(caps: Array<number | null>): number | null {
  if (!caps.length) return 0;
  if (caps.some((c) => c === null || c === undefined)) return null;
  return caps.reduce<number>((a, c) => a + (c as number), 0);
}

/** Secrets du paquet : clés d'IA incluses, plus 1 si le SMTP est inclus. */
export const secretCount = (keys: number, smtp: boolean) => keys + (smtp ? 1 : 0);

/** Nom du fichier : `cockpit-<version>-<initiale><nom>.zip` (minuscules, sans accents). */
export function packageFileName(version: string, recipient: string): string {
  const n = recipient.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/).filter(Boolean);
  const who = ((n.length > 1 ? n[0][0] + n[n.length - 1] : n[0]) || 'paquet').replace(/[^a-z0-9]/g, '') || 'paquet';
  return `cockpit-${version}-${who}.zip`;
}

export const SHARE_EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/** Libellé des données pour l'historique (« Base actuelle · RISE », « Démonstration », « Cockpit vide », « · fichiers »). */
export function dataLabel(mode: ShareDataMode, projectNames: string[], files: boolean): string {
  const base = mode === 'current' ? `Base actuelle · ${projectNames.join(', ')}` : mode === 'demo' ? 'Démonstration' : 'Cockpit vide';
  return base + (files ? ' · fichiers' : '');
}

/** Masque d'une clé (`sk-ant-…4f2a`) : préfixe et 4 derniers caractères, jamais la clé. */
export const keyMask = (prefix: string | null | undefined, last4: string | null | undefined) => `${prefix ?? ''}…${last4 ?? '????'}`;

/** Erreurs de la demande de génération (champ → message). */
export function shareRequestErrors(r: { data: ShareDataMode; projects: string[]; recipient: { name: string; email: string } }): Record<string, string> {
  const e: Record<string, string> = {};
  if (!r.recipient.name.trim()) e['recipient.name'] = 'Nom du destinataire requis.';
  if (!SHARE_EMAIL.test(r.recipient.email.trim())) e['recipient.email'] = 'Adresse e-mail invalide.';
  if (r.data === 'current' && !r.projects.length) e.projects = 'Choisissez au moins un projet.';
  return e;
}
