/**
 * Règles de notification : conversion entre la table `NotificationRule` et le modèle `Rule` de la vue « Notifications »
 * (spécification NOTIFICATIONS ET ALERTES § 2), cas bloquants (§ 3), historique. Depuis le 30/09/2026, il n'y a plus
 * d'alertes : toutes les règles sont des notifications envoyées à heure fixe (quotidienne ou hebdomadaire).
 * Règles pures, sans base.
 */

export type UiProfile = 'Admin' | 'PMO' | 'Responsable' | 'Lecteur';
/** Fréquences de la vue ; « Personnalisée » est retirée depuis le 29/09/2026, « Immédiate » depuis le 30/09/2026. */
export type UiFreq = 'day' | 'week';
export type UiChannel = 'app' | 'mail';

/** Modèle `Rule` de la vue (§ 2). `projets: ['*']` = tous les projets. */
export interface UiRule {
  id: string;
  title: string;
  profils: UiProfile[];
  projets: string[];
  canaux: UiChannel[];
  freq: UiFreq;
  at: string;
  on: boolean;
  model: string | null;
  prompt: string;
  subject: string;
  body: string;
}

/** Ligne d'historique de la vue (§ 2), complétée de l'instant exact et de l'erreur éventuelle. */
export interface UiHistory {
  id: string;
  rid: string;
  w: string;
  c: string;
  d: string;
  ok: boolean;
  at: string;
  error: string | null;
  /** Envoi planifié : ON_TIME, CATCH_UP (rattrapé), REPLACED (remplacé), MISSED (abandonné) ; null sinon. */
  mode: string | null;
  /** Heure prévue (ISO) d'un envoi planifié. */
  planned: string | null;
  /** Ligne d'explication affichée sous le nom de la règle (« Rattrapé · prévu mar. 29/09 09:00, envoyé mer. 30/09 10:12 »). */
  note: string;
}

/** Colonnes de la table utiles à la conversion. */
export interface RuleRow {
  id: string;
  name: string;
  targetProfiles: string[];
  projectIds: string[];
  platform: boolean;
  modelId: string;
  prompt: string;
  subject: string;
  body: string;
  frequency: 'DAILY' | 'WEEKLY' | 'CUSTOM';
  day: string | null;
  hour: string | null;
  everyDays: number | null;
  channels: ('APP' | 'EMAIL')[];
  enabled: boolean;
}

/** Profils : code de la table → libellé de la vue (ordre d'affichage). */
export const PROFILE_LABELS: Record<string, UiProfile> = { admin: 'Admin', pmo: 'PMO', resp: 'Responsable', lec: 'Lecteur' };
const PROFILE_CODES = Object.fromEntries(Object.entries(PROFILE_LABELS).map(([k, v]) => [v, k])) as Record<UiProfile, string>;

// CUSTOM (ancienne fréquence « Personnalisée ») n'existe plus en base (migration du 29/09/2026) ; présentée comme quotidienne par sécurité.
const FREQ_TO_UI: Record<RuleRow['frequency'], UiFreq> = { DAILY: 'day', WEEKLY: 'week', CUSTOM: 'day' };
const FREQ_FROM_UI: Record<UiFreq, RuleRow['frequency']> = { day: 'DAILY', week: 'WEEKLY' };

/** Calendrier d'envoi : quotidien à 07:00, hebdomadaire le lundi à 07:00 par défaut ; heures par pas de 30 minutes. */
export const DEFAULT_WEEK_DAY = 'lundi';
export const DEFAULT_WEEK_HOUR = '07:00';
export const DEFAULT_HOUR = '07:00';
export const SEND_STEP_MINUTES = 30;
/** Fuseau des heures d'envoi : celui de l'organisation (heure de Paris), affiché dans la vue. */
export const NOTIFICATION_TIMEZONE = 'Europe/Paris';
export const NOTIFICATION_TIMEZONE_LABEL = 'heure de Paris';

/** Heure d'envoi valide : HH:MM par pas de 30 minutes. */
export function isSendTime(h: string | null | undefined): boolean {
  return !!h && /^([01]\d|2[0-3]):(00|30)$/.test(h);
}

/** Créneau de 30 minutes d'un instant, au format HH:MM (« 07:47 » → « 07:30 »). */
export function sendSlot(hhmm: string): string {
  return hhmm.slice(0, 3) + (Number(hhmm.slice(3, 5)) < 30 ? '00' : '30');
}

// ───────────── Planification des envois (décision du 30/09/2026) ─────────────

/**
 * Rattrapage (décision du 30/09/2026) : un envoi manqué (plateforme arrêtée) part au redémarrage jusqu'au lendemain
 * du jour prévu, 23:59, dans le fuseau du projet ; au-delà, il est abandonné (échec dans « À traiter »). Plusieurs
 * occurrences manquées d'une même règle pour un projet : seule la plus récente part, les autres sont « remplacées ».
 */
export const CATCH_UP_EXTRA_DAYS = 1;
/** Rattrapages envoyés par minute au plus (du plus ancien au plus récent), pour ne pas saturer les canaux. */
export const CATCH_UP_PER_MINUTE = 10;
/** Envoi « à l'heure » : parti moins de 5 minutes après l'heure prévue ; au-delà, « rattrapé ». */
export const ON_TIME_TOLERANCE_MS = 5 * 60_000;
/** Mémoire de la rédaction : le dernier envoi de la règle (même projet, même profil) s'il date de moins de 35 jours. */
export const NOTIFICATION_MEMORY_DAYS = 35;
/** Occurrences comptées au plus au rattrapage d'une règle (arrêt très long). */
const MAX_MISSED_OCCURRENCES = 1000;

/** Parties de date et d'heure d'un instant dans un fuseau (par défaut celui de l'organisation). */
function zonedParts(d: Date, tz = NOTIFICATION_TIMEZONE) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute };
}

/** Jour (AAAA-MM-JJ) d'un instant dans un fuseau (par défaut heure de Paris). */
export function parisDay(d: Date, tz = NOTIFICATION_TIMEZONE): string {
  const p = zonedParts(d, tz);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

/** Instant correspondant à une date et une heure d'un fuseau (changements d'heure compris). */
export function zonedTime(tz: string, y: number, m: number, d: number, h: number, min: number): Date {
  const want = Date.UTC(y, m - 1, d, h, min);
  let t = want;
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(new Date(t), tz);
    t += want - Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
  }
  return new Date(t);
}

export function parisTime(y: number, m: number, d: number, h: number, min: number): Date {
  return zonedTime(NOTIFICATION_TIMEZONE, y, m, d, h, min);
}

/** Limite de rattrapage d'un envoi prévu : lendemain du jour prévu, 23:59:59, dans le fuseau du projet. */
export function catchUpDeadline(scheduledAt: Date, projectTz: string): Date {
  const p = zonedParts(scheduledAt, projectTz);
  const day = new Date(Date.UTC(p.y, p.m - 1, p.d + CATCH_UP_EXTRA_DAYS));
  return new Date(zonedTime(projectTz, day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), 23, 59).getTime() + 59_999);
}

/** Occurrences d'une règle entre `first` (incluse) et `now` (incluse), dans l'ordre chronologique. */
export function occurrencesUntil(r: { enabled: boolean; frequency: string; day: string | null; hour: string | null }, first: Date, now: Date): Date[] {
  const out: Date[] = [];
  for (let t: Date | null = first; t && t.getTime() <= now.getTime() && out.length < MAX_MISSED_OCCURRENCES; t = nextSendAt(r, t)) out.push(t);
  return out;
}

/** Heure lisible d'un envoi (historique) : « mar. 29/09 09:00 », heure de Paris. */
export function sendTimeFr(d: Date): string {
  const f = new Intl.DateTimeFormat('fr-FR', { timeZone: NOTIFICATION_TIMEZONE, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
  return f.replace(/\s+(\d{2}:\d{2})$/, ' $1');
}

/** Règle planifiée dont l'envoi suit une heure (quotidienne, hebdomadaire ; « personnalisée » : comme quotidienne). */
export function isTimedRule(r: { enabled: boolean; frequency: string }): boolean {
  return r.enabled && ['DAILY', 'WEEKLY', 'CUSTOM'].includes(r.frequency);
}

/** Ce qui détermine le prochain envoi : s'il change (règle modifiée), la date du prochain envoi est recalculée. */
export function scheduleKey(r: { enabled: boolean; frequency: string; day: string | null; hour: string | null }): string {
  return isTimedRule(r) ? [r.frequency, r.frequency === 'WEEKLY' ? (r.day ?? DEFAULT_WEEK_DAY).toLowerCase() : '', r.hour ?? (r.frequency === 'WEEKLY' ? DEFAULT_WEEK_HOUR : DEFAULT_HOUR)].join('|') : 'off';
}

/** Prochain envoi d'une règle, strictement après `from` (heure de Paris) ; null si la règle ne suit pas une heure. */
export function nextSendAt(r: { enabled: boolean; frequency: string; day: string | null; hour: string | null }, from: Date): Date | null {
  if (!isTimedRule(r)) return null;
  const weekly = r.frequency === 'WEEKLY';
  const [hh, mm] = (r.hour ?? (weekly ? DEFAULT_WEEK_HOUR : DEFAULT_HOUR)).split(':').map(Number);
  const target = WEEK_DAYS.indexOf((r.day ?? DEFAULT_WEEK_DAY).toLowerCase());
  const p = zonedParts(from);
  for (let k = 0; k <= 8; k++) {
    const day = new Date(Date.UTC(p.y, p.m - 1, p.d + k));
    if (weekly && (day.getUTCDay() + 6) % 7 !== target) continue;
    const t = parisTime(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), hh, mm);
    if (t.getTime() > from.getTime()) return t;
  }
  return null;
}

/** Variables retirées des messages le 29/09/2026 (refusées à l'enregistrement). */
export const REMOVED_VARIABLES = ['jalon', 'risque', 'seuil', 'document'] as const;
/** Variables retirées présentes dans un texte (« {jalon} »…). */
export function removedVariablesIn(text: string): string[] {
  return REMOVED_VARIABLES.filter((v) => text.includes(`{${v}}`)).map((v) => `{${v}}`);
}

export const WEEK_DAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

/** Messages des cas bloquants (§ 3), identiques à ceux de la vue. */
export const ERR_NO_MODEL = 'Aucun modèle choisi (modèles réinitialisés) : la règle ne pourra pas s’envoyer.';
export const ERR_NO_RECIPIENT = 'Aucun destinataire : la règle ne pourra pas s’envoyer.';

/** Calendrier de la table → champ `at` de la vue (« lundi 07:00 », « 18:00 »). */
export function atOf(r: Pick<RuleRow, 'frequency' | 'day' | 'hour'>): string {
  const hour = r.hour ?? '';
  if (r.frequency === 'DAILY' || r.frequency === 'CUSTOM') return hour || DEFAULT_HOUR;
  return `${r.day || DEFAULT_WEEK_DAY} ${hour || DEFAULT_WEEK_HOUR}`;
}

/** Champ `at` de la vue → calendrier de la table ; ce qui manque prend la valeur par défaut. */
export function parseAt(freq: UiFreq, at: string): Pick<RuleRow, 'day' | 'hour' | 'everyDays'> {
  const s = (at || '').toLowerCase();
  const hm = /([01]\d|2[0-3])[:h]([0-5]\d)/.exec(s);
  const hour = hm ? `${hm[1]}:${hm[2]}` : null;
  if (freq === 'day') return { day: null, hour: hour ?? DEFAULT_HOUR, everyDays: null };
  return { day: WEEK_DAYS.find((d) => s.includes(d)) ?? DEFAULT_WEEK_DAY, hour: hour ?? DEFAULT_WEEK_HOUR, everyDays: null };
}

/**
 * Règle de la table → `Rule` de la vue. `llmIds` : LLM actifs ; un modèle absent de cette liste
 * (supprimé, désactivé, modèles réinitialisés) est présenté comme « aucun modèle ».
 */
export function toUiRule(r: RuleRow, llmIds: ReadonlySet<string>): UiRule {
  return {
    id: r.id,
    title: r.name,
    profils: Object.keys(PROFILE_LABELS).filter((k) => r.targetProfiles.includes(k)).map((k) => PROFILE_LABELS[k]),
    projets: r.platform ? ['*'] : [...r.projectIds],
    canaux: (['APP', 'EMAIL'] as const).filter((c) => r.channels.includes(c)).map((c) => (c === 'APP' ? 'app' : 'mail')),
    freq: FREQ_TO_UI[r.frequency],
    at: atOf(r),
    on: r.enabled,
    model: r.modelId && llmIds.has(r.modelId) ? r.modelId : null,
    prompt: r.prompt,
    subject: r.subject,
    body: r.body,
  };
}

/** `Rule` de la vue → colonnes de la table (l'identifiant n'est pas concerné). */
export function fromUiRule(u: Omit<UiRule, 'id'>): Omit<RuleRow, 'id'> {
  const all = u.projets.includes('*');
  return {
    name: u.title.trim(),
    targetProfiles: [...new Set(u.profils)].map((p) => PROFILE_CODES[p]),
    projectIds: all ? [] : [...new Set(u.projets.map((c) => c.toUpperCase()))],
    platform: all,
    modelId: u.model ?? '',
    prompt: u.prompt,
    subject: u.subject,
    body: u.body,
    frequency: FREQ_FROM_UI[u.freq],
    ...parseAt(u.freq, u.at),
    channels: [...new Set(u.canaux)].sort().map((c) => (c === 'app' ? 'APP' : 'EMAIL')),
    enabled: u.on,
  };
}

/**
 * Cas bloquants (§ 3) : aucun modèle, ou aucun destinataire. Une règle bloquée peut être enregistrée et activée,
 * mais rien n'est envoyé (ni planification, ni test).
 */
export function blockingErrors(r: Pick<RuleRow, 'modelId' | 'targetProfiles'>, llmIds?: ReadonlySet<string>): string[] {
  const e: string[] = [];
  if (!r.modelId || (llmIds && !llmIds.has(r.modelId))) e.push(ERR_NO_MODEL);
  if (!r.targetProfiles.length) e.push(ERR_NO_RECIPIENT);
  return e;
}

/** Date relative d'un envoi : « à l'instant », « il y a 12 min », « il y a 3 h », « hier », « il y a 3 j ». */
export function relativeFr(at: Date, now: Date): string {
  const min = Math.max(0, Math.floor((now.getTime() - at.getTime()) / 60_000));
  if (min < 1) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'hier' : `il y a ${d} j`;
}

/** Envoi (`Delivery`) → ligne d'historique de la vue. */
export function toUiHistory(
  d: { id: string; ruleId: string; at: Date; channel: 'APP' | 'EMAIL'; recipientsCount: number; status: string; error: string | null; mode?: string | null; scheduledAt?: Date | null },
  now: Date,
): UiHistory {
  // Mode : envoi planifié à l'heure, rattrapé, remplacé ou abandonné ; null pour un envoi sur événement ou un test.
  const mode = d.mode ?? null, planned = d.scheduledAt ? sendTimeFr(d.scheduledAt) : '';
  const note =
    mode === 'CATCH_UP' ? `Rattrapé · prévu ${planned}, envoyé ${sendTimeFr(d.at)}`
    : mode === 'ON_TIME' ? `À l’heure · prévu ${planned}, envoyé ${sendTimeFr(d.at)}`
    : mode === 'REPLACED' ? `Remplacé par un envoi plus récent · prévu ${planned}`
    : mode === 'MISSED' ? `Abandonné · prévu ${planned}, plateforme arrêtée au-delà de la limite de rattrapage`
    : '';
  return {
    id: d.id,
    rid: d.ruleId,
    w: relativeFr(d.at, now),
    c: d.channel === 'EMAIL' ? 'E-mail' : 'Application',
    d: `${d.recipientsCount} destinataire${d.recipientsCount > 1 ? 's' : ''}`,
    ok: d.status === 'OK',
    at: d.at.toISOString(),
    error: d.error,
    mode,
    planned: d.scheduledAt ? d.scheduledAt.toISOString() : null,
    note,
  };
}

/** Profil destinataire (codes de la table), du plus large au plus restreint. */
export type AudienceProfile = 'admin' | 'pmo' | 'resp' | 'lec';
export const AUDIENCE_PRIORITY: AudienceProfile[] = ['admin', 'pmo', 'resp', 'lec'];
/** Chantiers lisibles par un groupe de destinataires : « * » (tous) ou liste d'identifiants. */
export type ChantierScope = '*' | string[];

/**
 * Périmètre d'un texte rédigé pour un profil (arbitrage du 29/09/2026 : un texte par profil) : ce que tous les
 * membres du profil peuvent lire sur le projet. Administrateur et PMO : tout le projet ; Responsable : chantiers
 * communs à tous les Responsables destinataires ; Lecteur : chantiers lisibles par tous (responsable ou lecteur).
 */
export function profileScope(profile: AudienceProfile, members: Array<{ responsable: string[]; lecteur: string[] } | undefined>): ChantierScope {
  if (profile === 'admin' || profile === 'pmo') return '*';
  if (!members.length) return [];
  const sets = members.map((m) => new Set(profile === 'resp' ? m?.responsable ?? [] : [...(m?.responsable ?? []), ...(m?.lecteur ?? [])]));
  return [...sets[0]].filter((ws) => sets.every((s) => s.has(ws))).sort();
}
