/**
 * Écran « Initialisation d'un projet » (spécification Initialisation projet § 2 et § 5) : résultat du contrôle mis
 * au format lu par l'écran — `{ project, sheets, issues, missing }` — et les 5 contrôles, dans l'ordre de l'écran.
 * Les dates sont des chaînes AAAA-MM-JJ (converties en dates par la Console). Règles pures, testées.
 */
import { OLD_MODEL_MESSAGE, type ImportIssue, type ImportPlan } from './referential-import';
import { SHEETS } from './excel-reader';
import { PROJECT_INFO_RUBRIQUES } from '../domain/project-info';

export const SCREEN_SHEETS: Record<string, string> = {
  '01 Équipes': 'Équipes', '02 Rôles': 'Rôles', '03 Personnes': 'Personnes', '04 Affectations': 'Affectations', '05 Projet': 'Projet', '06 Info projet': 'Info projet', '07 Lots': 'Lots',
  '08 Phases': 'Phases', '09 Sous-phases': 'Sous-phases', '10 Chantiers': 'Chantiers', '11 Instances': 'Instances', '12 Membres': 'Membres', '13 Jalons': 'Jalons', '14 Livrables': 'Livrables',
};
const ST_FR: Record<string, string> = { PREPARATION: 'Préparation', ACTIVE: 'Actif', CLOSED: 'Clos', PLANNED: 'Prévu', IN_PROGRESS: 'En cours', DONE: 'Terminé' };
const MISSING = /^Onglet « (.+) » manquant$/;
const DUPLICATE = /^Le code .+ existe déjà$/;

export interface ScreenIssue {
  lvl: 'err' | 'warn';
  sheet: string;
  row: number | '';
  msg: string;
}
export interface ScreenCheck {
  id: 'structure' | 'project' | 'required' | 'consistency' | 'warnings';
  label: string;
  status: 'ok' | 'err' | 'warn';
  count: number;
  detail: string;
}
type Cell = string | number | null;
export interface ScreenData {
  project: Array<{ l: string; v: Cell; r: boolean }>;
  sheets: Record<string, { heads: Array<[string, 'r' | 'o' | 'c']>; rows: Cell[][] }>;
  issues: ScreenIssue[];
  missing: string[];
}

const pl = (n: number, w: string) => `${n} ${w}${n > 1 ? 's' : ''}`;

/**
 * Les 5 contrôles de l'écran (§ 2), dans l'ordre : structure, fiche projet (code présent et libre), champs
 * obligatoires, cohérence (erreurs du serveur), avertissements (non bloquants, colonne CONTRÔLE du fichier comprise :
 * décision Q4, seuls les contrôles du serveur bloquent).
 */
export function screenChecks(code: string | null, duplicate: boolean, missing: string[], issues: ScreenIssue[]): ScreenCheck[] {
  const errs = issues.filter((i) => i.lvl === 'err'), warns = issues.filter((i) => i.lvl === 'warn');
  // Ancien modèle (décision D5 du 06/10/2026) : compté dans la structure, pas dans la cohérence.
  const old = errs.filter((i) => i.msg.startsWith(OLD_MODEL_MESSAGE)).length;
  const oblig = errs.filter((i) => /obligatoire/.test(i.msg)).length, coh = errs.length - oblig - old;
  const projectKo = !code || duplicate;
  return [
    { id: 'structure', label: 'Structure du fichier', status: missing.length || old ? 'err' : 'ok', count: missing.length + old, detail: old ? 'Ancien modèle de fichier : téléchargez le modèle à jour' : missing.length ? `Onglets manquants : ${missing.join(', ')}` : `${SHEETS.length} onglets reconnus` },
    { id: 'project', label: 'Fiche projet', status: projectKo ? 'err' : 'ok', count: projectKo ? 1 : 0, detail: code ? `Code ${code}${duplicate ? ' · déjà utilisé dans la bibliothèque' : ' · disponible'}` : 'Code projet absent' },
    { id: 'required', label: 'Champs obligatoires', status: oblig ? 'err' : 'ok', count: oblig, detail: oblig ? pl(oblig, 'erreur') : 'Tous les champs obligatoires sont renseignés' },
    { id: 'consistency', label: 'Contrôles de cohérence', status: coh ? 'err' : 'ok', count: coh, detail: coh ? pl(coh, 'erreur') : 'Aucune incohérence bloquante' },
    { id: 'warnings', label: 'Avertissements', status: warns.length ? 'warn' : 'ok', count: warns.length, detail: warns.length ? `${warns.length} à vérifier` : 'Aucun' },
  ];
}

/** Contrôle du serveur → données de l'écran. `duplicate` : le code existe déjà dans la bibliothèque. */
export function toScreen(plan: ImportPlan | null, rawIssues: ImportIssue[]): ScreenData {
  const out: ScreenData = { project: [], sheets: {}, issues: [], missing: [] };
  for (const i of rawIssues) {
    const m = MISSING.exec(i.message);
    if (m) { out.missing.push(m[1]); continue; }
    // Code déjà utilisé : l'écran le signale lui-même (bibliothèque, `existingCodes`) ; compté dans « Fiche projet ».
    if (DUPLICATE.test(i.message)) continue;
    out.issues.push({ lvl: i.level === 'ERROR' ? 'err' : 'warn', sheet: SCREEN_SHEETS[i.sheet] ?? i.sheet, row: i.row ?? '', msg: i.message });
  }
  if (!plan) return out;
  const per: Record<string, string> = {}, team: Record<string, string> = {}, role: Record<string, string> = {}, wave: Record<string, string> = {};
  const ph: Record<string, string> = {}, sp: Record<string, string> = {}, ws: Record<string, string> = {}, body: Record<string, string> = {};
  plan.persons.forEach((p) => { per[p.key] = `${p.firstName} ${p.lastName}`.trim(); });
  plan.teams.forEach((t) => { team[t.key] = t.name; });
  plan.roles.forEach((r) => { role[r.key] = r.label; });
  plan.waves.forEach((w) => { wave[w.key] = `Lot ${w.seq}`; });
  plan.phases.forEach((p) => { ph[p.key] = `${p.seq} · ${p.name}`; });
  plan.subphases.forEach((s) => { sp[s.key] = `${s.code} · ${s.name}`; });
  plan.workstreams.forEach((w) => { ws[w.key] = w.name; });
  plan.bodies.forEach((b) => { body[b.key] = b.name; });
  const k = (map: Record<string, string>, key: string | null | undefined) => (key == null ? '' : map[key] ?? key);
  const dt = (d: string | null | undefined) => (d ? String(d).slice(0, 10) : '');
  const P = plan.project;
  const fields: Array<[string, Cell | undefined, boolean?]> = [
    ['Nom du client', plan.client.name, true], ['Secteur d’activité', plan.client.sector], ['Pays', P.country, true], ['Code projet', P.code, true], ['Nom du projet', P.name, true], ['Objectifs', P.objective],
    ['Éditeur de la solution', k(team, P.editorTeam)], ['Intégrateur', k(team, P.integratorTeam)], ['Date de démarrage', dt(P.startDate), true], ['Date de fin cible', dt(P.targetEndDate), true],
    ['Fuseau horaire', P.timezone, true], ['Statut', ST_FR[P.status] ?? P.status], ['Directeur de programme', k(per, P.programDirector), true], ['Sponsor', k(per, P.sponsor)],
  ];
  out.project = fields.map(([l, v, r]) => ({ l, v: v == null ? '' : v, r: !!r }));
  const g = (heads: Array<[string, 'r' | 'o' | 'c']>, rows: Cell[][]) => ({ heads, rows });
  out.sheets = {
    'Équipes': g([['Nom', 'r'], ['Description', 'o'], ['Personnes', 'c']], plan.teams.map((t) => [t.name, t.description ?? '', plan.persons.filter((p) => p.team === t.key).length])),
    'Rôles': g([['Libellé', 'r'], ['Description', 'o']], plan.roles.map((r) => [r.label, r.description ?? ''])),
    'Personnes': g([['Nom complet', 'r'], ['Email', 'r'], ['Équipe', 'r'], ['Fonction', 'o']], plan.persons.map((p) => [per[p.key], p.email, k(team, p.team), p.title ?? ''])),
    'Affectations': g([['Personne', 'r'], ['Rôle', 'r'], ['Début', 'r'], ['Fin', 'o']], plan.assignments.map((a) => [k(per, a.person), k(role, a.role), dt(a.startDate), dt(a.endDate)])),
    'Lots': g([['N°', 'r'], ['Périmètre', 'r'], ['Début', 'r'], ['Fin', 'r'], ['Statut', 'o']], plan.waves.map((w) => [w.seq, w.name, dt(w.startDate), dt(w.endDate), ST_FR[w.status] ?? w.status ?? ''])),
    'Phases': g([['N°', 'r'], ['Nom', 'r'], ['Lot', 'r'], ['Début', 'r'], ['Fin', 'r']], plan.phases.map((p) => [p.seq, p.name, k(wave, p.wave), dt(p.startDate), dt(p.endDate)])),
    'Sous-phases': g([['Phase', 'r'], ['N°', 'r'], ['Nom', 'r'], ['Début', 'o'], ['Fin', 'o']], plan.subphases.map((s) => [k(ph, s.phase), s.code, s.name, dt(s.startDate), dt(s.endDate)])),
    'Info projet': g([['Rubrique', 'r'], ['Libellé', 'o'], ['Valeur', 'r']], PROJECT_INFO_RUBRIQUES.flatMap((r): Cell[][] => {
      const v = plan.projectInfo[r.key];
      return typeof v === 'string' ? (v ? [[r.label, '', v]] : []) : (v as Array<string | [string, string]>).map((x) => (Array.isArray(x) ? [r.label, x[0], x[1]] : [r.label, '', x]));
    })),
    'Chantiers': g([['Code', 'c'], ['Nom', 'r'], ['Responsable', 'r'], ['Lot', 'o'], ['Phases', 'o'], ['Sous-phases', 'o'], ['Dépendances', 'o']], plan.workstreams.map((w) => [w.code, w.name, k(per, w.owner), k(wave, w.wave),
      w.phases.map((p) => k(ph, p)).join(' ; '), w.subphases.map((s) => plan.subphases.find((x) => x.key === s)?.code ?? s).join(' ; '), w.dependsOn === 'ALL' ? 'Tous' : w.dependsOn.map((d) => k(ws, d)).join(' ; ')])),
    'Instances': g([['Nom', 'r'], ['Nom court', 'r'], ['Couleur', 'r'], ['Fréquence', 'r']], plan.bodies.map((b) => [b.name, b.shortName, b.color, b.frequency])),
    'Membres': g([['Instance', 'r'], ['Personne', 'r'], ['Rôle', 'o']], plan.members.map((m) => [k(body, m.body), k(per, m.person), m.role ?? ''])),
    'Jalons': g([['Code', 'c'], ['Libellé', 'r'], ['Phase', 'r'], ['Chantier', 'o'], ['Date prévue', 'r']], plan.milestones.map((m) => [m.code, m.n, k(ph, m.phase), k(ws, m.ws), dt(m.iso)])),
    'Livrables': g([['Nom', 'r'], ['Sous-phase', 'r'], ['Responsable', 'r'], ['Échéance', 'r']], plan.deliverables.map((d) => [d.name, k(sp, d.subphase), k(per, d.owner), dt(d.due)])),
  };
  return out;
}

/** Avancement de la création (§ 4) : phase 1 à 5 et pourcentage global (20 % par phase). */
export function creationPercent(phase: number, fraction: number): number {
  return Math.max(0, Math.min(100, Math.round(((phase - 1) + Math.max(0, Math.min(1, fraction))) * 20)));
}
