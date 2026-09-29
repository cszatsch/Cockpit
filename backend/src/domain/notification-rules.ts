/**
 * Règles de notification et d'alerte : conversion entre la table `NotificationRule` et le modèle `Rule` de la vue
 * « Notifications et alertes » (spécification NOTIFICATIONS ET ALERTES § 2), cas bloquants (§ 3), historique.
 * Règles pures, sans base.
 */

export type UiProfile = 'Admin' | 'PMO' | 'Responsable' | 'Lecteur';
/** Fréquences de la vue ; « Personnalisée » est retirée depuis le 29/09/2026. */
export type UiFreq = 'imm' | 'day' | 'week';
export type UiChannel = 'app' | 'mail';

/** Modèle `Rule` de la vue (§ 2). `projets: ['*']` = tous les projets. */
export interface UiRule {
  id: string;
  type: 'alerte' | 'notification';
  title: string;
  evt: string;
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
}

/** Colonnes de la table utiles à la conversion. */
export interface RuleRow {
  id: string;
  kind: 'NOTIFICATION' | 'ALERT';
  name: string;
  targetProfiles: string[];
  projectIds: string[];
  platform: boolean;
  modelId: string;
  prompt: string;
  subject: string;
  body: string;
  frequency: 'IMMEDIATE' | 'DAILY' | 'WEEKLY' | 'CUSTOM';
  day: string | null;
  hour: string | null;
  everyDays: number | null;
  channels: ('APP' | 'EMAIL')[];
  trigger: string;
  enabled: boolean;
}

/** Profils : code de la table → libellé de la vue (ordre d'affichage). */
export const PROFILE_LABELS: Record<string, UiProfile> = { admin: 'Admin', pmo: 'PMO', resp: 'Responsable', lec: 'Lecteur' };
const PROFILE_CODES = Object.fromEntries(Object.entries(PROFILE_LABELS).map(([k, v]) => [v, k])) as Record<UiProfile, string>;

// CUSTOM (ancienne fréquence « Personnalisée ») n'existe plus en base (migration du 29/09/2026) ; présentée comme quotidienne par sécurité.
const FREQ_TO_UI: Record<RuleRow['frequency'], UiFreq> = { IMMEDIATE: 'imm', DAILY: 'day', WEEKLY: 'week', CUSTOM: 'day' };
const FREQ_FROM_UI: Record<UiFreq, RuleRow['frequency']> = { imm: 'IMMEDIATE', day: 'DAILY', week: 'WEEKLY' };

/**
 * Événement déclencheur → fragment de la phrase de synthèse (« Quand un jalon est en retard, … »).
 * Le déclencheur n'est pas modifiable dans la vue ; une règle manuelle n'a pas de fragment (« l'événement se produit »).
 */
export const TRIGGER_EVT: Record<string, string> = {
  MILESTONE_LATE: 'un jalon est en retard',
  RISK_CRITICAL: 'un risque critique est ouvert',
  DOCUMENT_ANALYZED: 'un nouveau document est analysé',
  BUDGET_THRESHOLD: 'le seuil budgétaire IA est atteint',
  SCHEDULE: 'l’heure d’envoi arrive',
  MANUAL: '',
};

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
  if (r.frequency === 'WEEKLY') return `${r.day || DEFAULT_WEEK_DAY} ${hour || DEFAULT_WEEK_HOUR}`;
  return '';
}

/** Champ `at` de la vue → calendrier de la table ; ce qui manque prend la valeur par défaut. */
export function parseAt(freq: UiFreq, at: string): Pick<RuleRow, 'day' | 'hour' | 'everyDays'> {
  const s = (at || '').toLowerCase();
  const hm = /([01]\d|2[0-3])[:h]([0-5]\d)/.exec(s);
  const hour = hm ? `${hm[1]}:${hm[2]}` : null;
  if (freq === 'imm') return { day: null, hour: null, everyDays: null };
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
    type: r.kind === 'ALERT' ? 'alerte' : 'notification',
    title: r.name,
    evt: TRIGGER_EVT[r.trigger] ?? '',
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

/** `Rule` de la vue → colonnes de la table (le déclencheur et l'identifiant ne sont pas concernés). */
export function fromUiRule(u: Omit<UiRule, 'id' | 'evt'>): Omit<RuleRow, 'id' | 'trigger'> {
  const all = u.projets.includes('*');
  return {
    kind: u.type === 'alerte' ? 'ALERT' : 'NOTIFICATION',
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
 * mais rien n'est envoyé (ni événement, ni planification, ni test).
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
  d: { id: string; ruleId: string; at: Date; channel: 'APP' | 'EMAIL'; recipientsCount: number; status: string; error: string | null },
  now: Date,
): UiHistory {
  return {
    id: d.id,
    rid: d.ruleId,
    w: relativeFr(d.at, now),
    c: d.channel === 'EMAIL' ? 'E-mail' : 'Application',
    d: `${d.recipientsCount} destinataire${d.recipientsCount > 1 ? 's' : ''}`,
    ok: d.status === 'OK',
    at: d.at.toISOString(),
    error: d.error,
  };
}
