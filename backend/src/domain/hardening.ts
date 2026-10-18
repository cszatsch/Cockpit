import { isIP } from 'net';
import { timingSafeEqual } from 'crypto';

/**
 * Durcissements de la configuration et de l'exposition (audit de sécurité du 18/10/2026, lot 7) : règles pures,
 * appliquées par `main.ts`, la connexion de développement, le proxy des widgets, la connexion et Jev.
 */

/** Clé maître d'exemple, publique (`backend/.env.example`, `docker-compose.yml`, tests) : refusée en production. */
export const EXAMPLE_SECRETS_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

/** Message du refus de démarrer en production avec la clé d'exemple. */
export const EXAMPLE_SECRETS_KEY_MESSAGE =
  'SECRETS_KEY est la clé d’exemple publique du dépôt : démarrage refusé en production (NODE_ENV=production). ' +
  'Générez une clé propre (openssl rand -hex 32) dans .env.prod, redémarrez, puis saisissez de nouveau les clés d’IA, ' +
  'les clés des cartes API et le mot de passe SMTP dans la Console (chiffrés avec l’ancienne clé, ils ne se lisent plus).';

/** Erreurs de configuration qui interdisent le démarrage : seulement en production, seulement la clé d'exemple exacte. */
export function productionConfigErrors(env: Record<string, string | undefined>): string[] {
  if (env.NODE_ENV !== 'production') return [];
  return (env.SECRETS_KEY ?? '').trim().toLowerCase() === EXAMPLE_SECRETS_KEY ? [EXAMPLE_SECRETS_KEY_MESSAGE] : [];
}

/** Adresse de la boucle locale (IPv4, IPv6, IPv4 encapsulée en IPv6). */
export function isLoopback(address: string | null | undefined): boolean {
  if (!address) return false;
  const a = address.startsWith('::ffff:') ? address.slice(7) : address;
  return a === '::1' || (isIP(a) === 4 && a.startsWith('127.'));
}

/**
 * Proxy des widgets : contenu que le navigateur exécuterait sur l'origine de Cockpit (HTML, XHTML, SVG, scripts) refusé ;
 * les widgets attendent du JSON, du XML (RSS / Atom) ou du texte.
 */
export const PROXY_REFUSED_TYPES = /(^|[\s;,/+-])(html|xhtml|svg|javascript|ecmascript)([\s;,+-]|$)/i;
export function proxyContentRefused(contentType: string | null | undefined): boolean {
  return PROXY_REFUSED_TYPES.test(String(contentType ?? ''));
}
/** En-têtes de toute réponse du proxy : jamais interprétée par le navigateur comme une page active. */
export const PROXY_SAFE_HEADERS: Record<string, string> = { 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'" };

/**
 * Relais Cloud Run (`outils/gcp/relais/service.yaml`) : tous ses utilisateurs arrivent à l'API avec l'adresse du relais.
 * L'adresse du client qu'il transmet (`X-Rise-Client-Ip`, tirée de son X-Forwarded-For) n'est lue que si le relais est
 * déclaré de confiance : variable `RELAIS_SECRET` de l'API, égale à l'en-tête `X-Rise-Relais` qu'il envoie.
 */
export const RELAY_SECRET_HEADER = 'x-rise-relais';
export const RELAY_CLIENT_HEADER = 'x-rise-client-ip';
export function relayClientIp(headers: Record<string, unknown>, secret: string | null | undefined): string | null {
  if (!secret) return null;
  const sent = String(headers[RELAY_SECRET_HEADER] ?? '');
  const a = Buffer.from(sent), b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  // X-Forwarded-For du relais : la dernière adresse est celle que Google a vue (les précédentes viennent du client).
  const last = String(headers[RELAY_CLIENT_HEADER] ?? '').split(',').map((s) => s.trim()).filter(Boolean).at(-1) ?? '';
  return isIP(last) ? last : null;
}

/** Questions à Jev par compte et par jour civil (Cockpit et Console confondus). */
export const JEV_DAILY_QUESTIONS_MAX = 100;
export const jevQuotaMessage = (max = JEV_DAILY_QUESTIONS_MAX) =>
  `Vous avez posé ${max} questions à Jev aujourd’hui : c’est la limite quotidienne. Jev vous répondra de nouveau demain.`;

/** Plafond mensuel d'un fournisseur d'IA atteint : plus aucun appel payant jusqu'au mois suivant ou au relèvement. */
export const providerCapMessage = (provider: string, capEur: number) =>
  `plafond mensuel de ${provider} atteint (${capEur} €) : l’IA reprendra le 1er du mois prochain, ou dès qu’un Super Admin relève le plafond (Console › Fournisseurs et modèles)`;
