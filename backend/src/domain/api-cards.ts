/**
 * Registre des cartes API (spécification REGISTRE API) : règles pures, testées dans test/unit.
 * Validation des endpoints (https, protection SSRF), état affiché d'une carte, échéance de la clé,
 * seuils de notification et latence horaire sur 24 h.
 */
import { isIP } from 'net';

export const API_CARD_CATEGORIES = ['Météo', 'Trafic', 'Actualités', 'Environnement', 'Mobilité', 'Calendrier', 'Finance', 'Autre'] as const;
export type ApiCardCategory = (typeof API_CARD_CATEGORIES)[number];

export const API_CARD_NAME_MAX = 60;
export const API_KEY_MIN_LENGTH = 8;
/** Échéance proche de la clé : avertissement à 30 jours ; notifications à J-30, J-7 et J-1. */
export const KEY_EXPIRY_SOON_DAYS = 30;
export const KEY_EXPIRY_NOTICE_DAYS = [30, 7, 1] as const;
/** Quota journalier : avertissement à partir de 85 %. */
export const QUOTA_WARN_PCT = 85;
/** Délai d'un appel sortant (test, contrôle de santé, proxy). */
export const API_CALL_TIMEOUT_MS = 8000;
/** Réponse de test conservée : 2 Ko au plus. */
export const TEST_BODY_MAX = 2048;
/** Cache du proxy : 5 min, 2 min pour la météo et le trafic (données qui changent vite). */
export const PROXY_CACHE_MS = 5 * 60_000;
export const PROXY_CACHE_FAST_MS = 2 * 60_000;
export const PROXY_FAST_CATEGORIES: readonly string[] = ['Météo', 'Trafic'];
/** Emplacement de la clé dans l'endpoint ; sans ce marqueur, la clé part dans l'en-tête `X-Api-Key`. */
export const KEY_PLACEHOLDER = '{key}';
export const KEY_HEADER = 'X-Api-Key';

/** Adresse IP privée, locale ou réservée (IPv4, IPv6, IPv4 mappée en IPv6) : interdite (SSRF). */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    const mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return x === '::' || x === '::1' || /^f[cd]/.test(x) || /^fe[89ab]/.test(x);
  }
  return false;
}

/** Nom d'hôte interdit sans résolution : localhost et adresses privées écrites telles quelles. */
export function isPrivateHostname(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  return h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || isPrivateAddress(h);
}

/** Contrôle d'un endpoint (sans résolution DNS, faite à part) : message d'erreur ou null. */
export function endpointError(endpoint: string): string | null {
  let u: URL;
  try {
    u = new URL(endpoint.replace(KEY_PLACEHOLDER, 'CLE'));
  } catch {
    return 'URL invalide';
  }
  if (u.protocol !== 'https:') return 'L’URL doit commencer par https://';
  if (u.username || u.password) return 'Identifiants interdits dans l’URL';
  if (isPrivateHostname(u.hostname)) return 'Adresse privée ou locale interdite';
  return null;
}

/** Jours restants avant l'échéance de la clé (négatif : expirée), à partir de la date du jour ISO. */
export function daysLeft(expiresIso: string | null, todayIso: string): number | null {
  if (!expiresIso) return null;
  const d = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((d(expiresIso) - d(todayIso)) / 86_400_000);
}

export interface CardState {
  enabled: boolean;
  checkError: string | null;
  keyExpiresAt: string | null;
  quotaUsed: number | null;
  quotaLimit: number | null;
}

/**
 * État d'une carte, dans l'ordre de la spécification (§ 6) : désactivée → erreur du dernier contrôle →
 * clé expirée → clé expirant sous 30 jours → quota ≥ 85 % → opérationnelle.
 */
export function cardStatus(c: CardState, todayIso: string): { status: 'ok' | 'warn' | 'err'; note?: string } {
  const d = daysLeft(c.keyExpiresAt, todayIso);
  const q = c.quotaLimit ? Math.round(((c.quotaUsed ?? 0) / c.quotaLimit) * 100) : null;
  if (!c.enabled) return { status: 'ok', note: 'Désactivée' };
  if (c.checkError) return { status: 'err', note: c.checkError };
  if (d != null && d < 0) return { status: 'err', note: 'Clé expirée' };
  if (d != null && d <= KEY_EXPIRY_SOON_DAYS) return { status: 'warn', note: `Clé expire dans ${d} j` };
  if (q != null && q >= QUOTA_WARN_PCT) return { status: 'warn', note: `Quota à ${q} %` };
  return { status: 'ok' };
}

/** Palier de notification d'échéance : « 30 », « 7 », « 1 », « expired », ou null (rien à signaler). */
export function expiryLevel(d: number | null): string | null {
  if (d == null) return null;
  if (d < 0) return 'expired';
  const hit = [...KEY_EXPIRY_NOTICE_DAYS].reverse().find((n) => d <= n);
  return hit != null ? String(hit) : null;
}

/** Libellé d'un code d'échec (état et notification). */
export function failureNote(code: number, kind?: 'timeout' | 'network' | 'blocked'): string {
  if (kind === 'timeout') return 'Délai dépassé';
  if (kind === 'blocked') return 'Adresse privée bloquée';
  if (kind === 'network' || !code) return 'Injoignable';
  if (code === 401 || code === 403) return `Clé refusée · ${code}`;
  if (code === 429) return 'Quota du fournisseur dépassé · 429';
  return `Erreur ${code}`;
}

/**
 * Latence des 24 dernières heures : une valeur par heure (moyenne des appels réussis), `null` si l'heure
 * n'a eu que des échecs ou aucun appel. La dernière valeur est l'heure en cours.
 */
export function latency24h(calls: Array<{ at: Date; code: number; ms: number | null }>, now: Date): Array<number | null> {
  const end = now.getTime();
  const out: Array<number | null> = [];
  for (let i = 23; i >= 0; i--) {
    const from = end - (i + 1) * 3_600_000, to = end - i * 3_600_000;
    const ok = calls.filter((c) => c.at.getTime() > from && c.at.getTime() <= to && c.code > 0 && c.code < 400 && c.ms != null);
    out.push(ok.length ? Math.round(ok.reduce((s, c) => s + c.ms!, 0) / ok.length) : null);
  }
  return out;
}

/** Retire la clé d'un texte (réponse d'un fournisseur qui la renverrait) : la clé ne quitte jamais le serveur. */
export function redactKey(text: string, key: string | null): string {
  if (!key) return text;
  return text.split(key).join('••••' + key.slice(-4)).split(encodeURIComponent(key)).join('••••' + key.slice(-4));
}
