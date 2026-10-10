/**
 * Suppression d'un projet (Console › Projets, demande du commanditaire du 10/10/2026) : règles pures.
 *
 * Les données d'un projet sont toutes les lignes des tables qui portent son identifiant (`projectId` / `project_id`), puis
 * celles des tables qui en dépendent par une clé étrangère en cascade (liens de phases, de chantiers, membres d'instances,
 * extraits de documents…). Avant suppression, elles sont archivées (sauvegarde de sécurité, restaurable 48 h) ; elles sont
 * effacées des enfants vers les parents et restaurées dans l'ordre inverse.
 *
 * Ne sont jamais supprimés : la consommation d'IA et l'usage de la plateforme (Consommation et coûts › IA et › Accès doivent
 * rester inchangés), le journal d'audit et l'historique des documents (en ajout seul).
 */

/** Durée de conservation de la sauvegarde de sécurité d'un projet supprimé (arbitrage du commanditaire : 48 h). */
export const TRASH_RETENTION_HOURS = 48;

/** Tables jamais touchées par la suppression d'un projet. */
export const KEPT_TABLES = new Set([
  'UsageRecord', 'usage_events', 'usage_agg_hour', 'usage_agg_day', // Consommation et coûts › IA et › Accès
  'AuditEntry', 'document_events', // en ajout seul
  'project_trash', '_prisma_migrations',
]);

/** Colonnes qui portent l'identifiant du projet. */
export const PROJECT_COLUMNS = ['projectId', 'project_id'];

/** Clé étrangère à une seule colonne (`deleteRule` : 'c' cascade, 'r' restrict, 'a' no action, 'n' set null, 'd' set default). */
export interface ForeignKey { child: string; childCol: string; parent: string; parentCol: string; deleteRule: string }

const q = (id: string) => `"${id.replace(/"/g, '""')}"`;

/**
 * Prédicat SQL de chaque table touchée (paramètre `$1` = identifiant du projet) : colonne du projet, ligne du projet lui-même,
 * ou enfant en cascade d'une ligne déjà retenue. Les tables conservées (`KEPT_TABLES`) ne sont jamais retenues.
 */
export function selectionPlan(direct: Array<{ table: string; column: string }>, fks: ForeignKey[], kept: Set<string> = KEPT_TABLES): Map<string, string> {
  const preds = new Map<string, string[]>();
  const add = (t: string, p: string) => { if (kept.has(t)) return; const l = preds.get(t) ?? []; if (!l.includes(p)) l.push(p); preds.set(t, l); };
  add('Project', `${q('id')} = $1`);
  for (const d of direct) add(d.table, `${q(d.column)} = $1`);
  // Enfants en cascade, jusqu'à stabilité (profondeur bornée).
  for (let round = 0; round < 8; round++) {
    let grew = false;
    for (const fk of fks) {
      if (fk.deleteRule !== 'c' || fk.child === fk.parent || !preds.has(fk.parent) || kept.has(fk.child)) continue;
      const parent = `(${preds.get(fk.parent)!.join(' OR ')})`;
      const p = `${q(fk.childCol)} IN (SELECT ${q(fk.parentCol)} FROM ${q(fk.parent)} WHERE ${parent})`;
      const before = preds.get(fk.child)?.length ?? 0;
      // Une table déjà retenue par sa colonne de projet n'a pas besoin du chemin en cascade.
      if (preds.get(fk.child)?.some((x) => !x.includes(' IN (SELECT '))) continue;
      add(fk.child, p);
      if ((preds.get(fk.child)?.length ?? 0) > before) grew = true;
    }
    if (!grew) break;
  }
  return new Map([...preds].map(([t, l]) => [t, l.map((x) => `(${x})`).join(' OR ')]));
}

/**
 * Ordre de suppression : enfants avant parents (toute clé étrangère entre tables retenues, références à soi-même ignorées).
 * Les cycles éventuels sont rompus dans l'ordre alphabétique. L'ordre de restauration est l'inverse.
 */
export function deletionOrder(tables: string[], fks: ForeignKey[]): string[] {
  const set = new Set(tables);
  const parentsOf = new Map<string, Set<string>>(tables.map((t) => [t, new Set<string>()]));
  for (const fk of fks) if (set.has(fk.child) && set.has(fk.parent) && fk.child !== fk.parent) parentsOf.get(fk.child)!.add(fk.parent);
  // Une table est supprimée quand aucune table restante ne la référence.
  const remaining = new Set([...tables].sort());
  const out: string[] = [];
  while (remaining.size) {
    const free = [...remaining].filter((t) => ![...remaining].some((c) => c !== t && parentsOf.get(c)!.has(t)));
    const next = free.length ? free : [[...remaining][0]];
    for (const t of next) { remaining.delete(t); out.push(t); }
  }
  return out;
}

/** Fin de la conservation d'une sauvegarde de sécurité. */
export const trashExpiry = (deletedAt: Date) => new Date(deletedAt.getTime() + TRASH_RETENTION_HOURS * 3_600_000);

/** Code saisi pour confirmer la suppression : le code du projet, sans tenir compte de la casse ni des espaces autour. */
export const confirmsCode = (typed: string | undefined | null, code: string) => (typed ?? '').trim().toUpperCase() === code.trim().toUpperCase();
