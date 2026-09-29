/**
 * Snapshots (vue `Snapshots.dc.html`) : consolidation des écarts, libellés des champs, compteurs, prochaine capture.
 * Règles pures, sans base ; le service `SnapshotsService` s'en sert pour les routes de la Console.
 */
import { ACTION_STATUS_FR, DECISION_STATUS_FR, PLAN_STATUS_FR, PRIORITY_FR, REPORT_STATUS_FR, WAVE_STATUS_FR, WS_STATUS_FR } from './labels';

export type ChangeOp = 'add' | 'mod' | 'del';

/** Écart brut entre deux états (moteur de comparaison, ou écarts de démonstration). */
export interface SnapshotChange {
  op: ChangeOp;
  entity: string;
  object: string;
  field?: string | null;
  before?: unknown;
  after?: unknown;
}

/** Élément de `GET /snapshots/:a/diff/:b` (format de la vue). */
export interface DiffItem {
  type: ChangeOp;
  entite: string;
  nom: string;
  champ?: string;
  avant?: string;
  apres?: string;
}

/** Libellé du snapshot créé automatiquement avant chaque restauration. */
export const SAFETY_LABEL = 'Sécurité avant restauration';
/** Auteur affiché de la sauvegarde de sécurité (l'audit, lui, garde l'administrateur qui restaure). */
export const SAFETY_AUTHOR = 'Système';
/** Fuseau des planifications (même règle que la tâche horaire `snapshots.scheduled`). */
export const SNAPSHOT_TIMEZONE = 'Europe/Paris';

/**
 * Consolide une suite chronologique d'écarts : les modifications successives d'un même champ deviennent
 * « première valeur → dernière valeur » ; un objet ajouté puis modifié reste un ajout ; ajouté puis supprimé
 * disparaît ; supprimé puis recréé disparaît aussi (présent aux deux bornes). Une modification revenue à sa
 * valeur de départ n'est pas une différence.
 */
export function consolidateChanges(changes: SnapshotChange[]): SnapshotChange[] {
  const out: Array<SnapshotChange | null> = [];
  const added = new Map<string, number>();
  const deleted = new Map<string, number>();
  const mods = new Map<string, number>();
  const obj = (c: SnapshotChange) => c.entity + '|' + c.object;
  const dropMods = (o: string) => {
    for (const [k, i] of mods) if (k.startsWith(o + '|')) { out[i] = null; mods.delete(k); }
  };
  for (const c of changes) {
    const o = obj(c);
    if (c.op === 'add') {
      if (deleted.has(o)) { out[deleted.get(o)!] = null; deleted.delete(o); continue; }
      added.set(o, out.push({ ...c }) - 1);
    } else if (c.op === 'del') {
      if (added.has(o)) { out[added.get(o)!] = null; added.delete(o); dropMods(o); continue; }
      dropMods(o);
      deleted.set(o, out.push({ ...c }) - 1);
    } else {
      if (added.has(o)) continue;
      const k = o + '|' + (c.field ?? '');
      const i = mods.get(k);
      if (i != null && out[i]) out[i] = { ...out[i]!, after: c.after };
      else mods.set(k, out.push({ ...c }) - 1);
    }
  }
  return out.filter((c): c is SnapshotChange => !!c && !(c.op === 'mod' && JSON.stringify(c.before ?? null) === JSON.stringify(c.after ?? null)));
}

/** Champs techniques ignorés par la comparaison (bruit : horodatages, versions, ordre d'affichage). */
export const DIFF_IGNORED_FIELDS = new Set(['id', 'createdAt', 'updatedAt', 'version', 'rowVersion', 'projectId', 'order']);

/** Libellés des champs affichés dans la comparaison ; un champ absent garde son nom technique. */
const FIELD_LABELS: Record<string, string> = {
  n: 'Intitulé', name: 'Nom', t: 'Intitulé', label: 'Libellé', shortName: 'Nom court', code: 'Code', seq: 'Numéro',
  detail: 'Détail', description: 'Description', plan: 'Plan de réponse', impact: 'Impact', decL: 'Décision',
  ownerId: 'Responsable', makerId: 'Décideur', personId: 'Personne', roleId: 'Rôle', teamId: 'Équipe',
  wsId: 'Chantier', workstreamId: 'Chantier', wsIds: 'Chantiers', phaseId: 'Phase', subphaseId: 'Sous-phase', waveId: 'Lot', bodyId: 'Instance',
  iso: 'Date prévue', baselineIso: 'Date de référence', dueIso: 'Échéance', due: 'Échéance', targetIso: 'Date cible', openedIso: 'Ouvert le',
  crIso: 'Créée le', ddIso: 'Date de décision', closedAt: 'Clôturée le', confirmedAt: 'Confirmé le',
  startDate: 'Début', start: 'Début', endDate: 'Fin', status: 'Statut', prio: 'Priorité', sev: 'Gravité',
  prog: 'Avancement', progressPct: 'Avancement', plannedPctOverride: 'Avancement prévu (forcé)', critical: 'Critique',
  firstName: 'Prénom', lastName: 'Nom', email: 'E-mail', title: 'Fonction', active: 'Actif', riskOverride: 'Risque (forcé)', teamLabel: 'Équipe',
};
/** Libellés propres à une entité (le même nom de champ n'a pas le même sens partout). */
const ENTITY_FIELD_LABELS: Record<string, Record<string, string>> = {
  Risque: { p: 'Probabilité', i: 'Impact' },
  Décision: { p: 'Priorité' },
};
const ENUM_LABELS: Record<string, Record<string, Record<string, string>>> = {
  Action: { status: ACTION_STATUS_FR, prio: PRIORITY_FR },
  Décision: { status: DECISION_STATUS_FR },
  Phase: { status: PLAN_STATUS_FR },
  'Sous-phase': { status: PLAN_STATUS_FR },
  Lot: { status: WAVE_STATUS_FR },
  Chantier: { status: WS_STATUS_FR },
  Rapport: { status: REPORT_STATUS_FR },
};
const PCT_FIELDS = new Set(['prog', 'progressPct', 'plannedPctOverride']);
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

export const fieldLabel = (entity: string, field: string) => ENTITY_FIELD_LABELS[entity]?.[field] ?? FIELD_LABELS[field] ?? field;

/** « 2026-09-12 » (ou un instant ISO) → « 12 sept. 2026 », « 1er » pour le premier du mois. */
export function frDay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const d = Number(m[3]);
  return (d === 1 ? '1er' : String(d)) + ' ' + MONTHS[Number(m[2]) - 1] + ' ' + m[1];
}

/**
 * Valeur lisible d'un champ : identifiants résolus en noms (personnes, chantiers, phases… d'après les deux états
 * comparés), dates en français, pourcentages, oui / non, codes d'énumération traduits. Vide : « — ».
 */
export function formatValue(entity: string, field: string, v: unknown, names: Map<string, string>): string {
  if (v == null || v === '') return '—';
  if (Array.isArray(v)) return v.length ? v.map((x) => formatValue(entity, field, x, names)).join(', ') : '—';
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non';
  if (typeof v === 'number') return PCT_FIELDS.has(field) ? v + ' %' : String(v);
  if (typeof v === 'object') return JSON.stringify(v);
  const s = String(v);
  if (/Ids?$/.test(field) && names.has(s)) return names.get(s)!;
  const en = ENUM_LABELS[entity]?.[field]?.[s];
  if (en) return en;
  if (/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/.test(s)) return frDay(s);
  return s;
}

/** Écarts consolidés → éléments de la vue. */
export function toDiffItems(changes: SnapshotChange[]): DiffItem[] {
  return consolidateChanges(changes).map((c) =>
    c.op === 'mod'
      ? { type: c.op, entite: c.entity, nom: c.object, champ: c.field ?? '', avant: c.before == null ? '—' : String(c.before), apres: c.after == null ? '—' : String(c.after) }
      : { type: c.op, entite: c.entity, nom: c.object },
  );
}

/** Compteurs de la vue (tâches = actions) à partir des effectifs par entité capturés. */
export const COUNTER_ENTITIES = { taches: 'Action', jalons: 'Jalon', risques: 'Risque', livrables: 'Livrable' } as const;
export function counters(counts: Record<string, number> | null | undefined) {
  const c = counts ?? {};
  return { taches: c.Action ?? 0, jalons: c.Jalon ?? 0, risques: c.Risque ?? 0, livrables: c.Livrable ?? 0 };
}

// ───────────── Planification ─────────────

export interface ScheduleLike {
  enabled: boolean;
  frequency: string;
  day: string;
  hour: string;
}

/**
 * Jour de la semaine, quantième et heure (« 04 ») à Paris. Par parties : en français, l'heure seule se formate
 * « 04 h », ce qui faisait échouer la comparaison avec « 04:00 » (aucune capture planifiée ne partait).
 */
function parisParts(d: Date) {
  const parts = new Intl.DateTimeFormat('fr-FR', { timeZone: SNAPSHOT_TIMEZONE, weekday: 'long', day: 'numeric', hour: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { weekday: get('weekday').toLowerCase(), day: get('day'), hour: get('hour').padStart(2, '0') };
}

/**
 * La planification est-elle due à cet instant ? (tâche horaire, minute 0, heure de Paris) :
 * quotidienne chaque jour à l'heure choisie, hebdomadaire le jour choisi, mensuelle le 1er du mois.
 */
export function isSnapshotDue(sc: ScheduleLike, now: Date): boolean {
  const p = parisParts(now);
  const f = sc.frequency.toLowerCase();
  if (sc.hour.slice(0, 2) !== p.hour) return false;
  if (f.startsWith('quotid')) return true;
  if (f.startsWith('mensu')) return p.day === '1';
  return sc.day.toLowerCase() === p.weekday;
}

/** Prochaine capture planifiée strictement après `now` (heure pleine suivante), ou `null` si suspendue. */
export function nextSnapshotRun(sc: ScheduleLike, now: Date): Date | null {
  if (!sc.enabled) return null;
  const t = new Date(now);
  t.setUTCMinutes(0, 0, 0);
  for (let i = 0; i < 24 * 63; i++) {
    t.setUTCHours(t.getUTCHours() + 1);
    if (isSnapshotDue(sc, t)) return new Date(t);
  }
  return null;
}
