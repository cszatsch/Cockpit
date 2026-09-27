import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { config } from './config';

/**
 * Chiffrement applicatif AES-256-GCM des clés API (brief Console § 4).
 * La clé maître (`SECRETS_KEY`, 32 octets en hexadécimal) est hors base.
 * Format stocké : base64(iv) . base64(tag) . base64(chiffré)
 */
function masterKey(): Buffer {
  const hex = config.secretsKey;
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error('SECRETS_KEY doit contenir 64 caractères hexadécimaux');
  return Buffer.from(hex, 'hex');
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', masterKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), enc.toString('base64')].join('.');
}

export function decryptSecret(stored: string): string {
  const [iv, tag, enc] = stored.split('.').map((s) => Buffer.from(s, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', masterKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

/** Préfixe connu d'une clé (sk-ant-, sk-proj-, sk-, AIza) et 4 derniers caractères : seules parties exposées. */
export function keyFingerprint(key: string): { prefix: string; last4: string } {
  const known = ['sk-ant-', 'sk-proj-', 'sk-', 'AIza'];
  const prefix = known.find((p) => key.startsWith(p)) ?? '';
  return { prefix, last4: key.slice(-4) };
}
