import { ZodObject } from 'zod';
import { Tx } from '../core/prisma.service';
import { AuditService, WriteCtx } from '../core/audit.service';
import { isIsoDate } from '../domain/dates';
import { normKey } from '../domain/labels';
import { PROJECT_INFO_BLOCK, PROJECT_INFO_ITEMS_MAX, PROJECT_INFO_LABEL_MAX, PROJECT_INFO_RUBRIQUES, PROJECT_INFO_VALUE_MAX, ProjectInfo } from '../domain/project-info';
import { multiValues, subphaseCodeError, workstreamSpan } from '../domain/workstream-links';
import * as S from '../cockpit/referential/schemas';
import { CellValue, ParsedWorkbook, SHEETS, SheetData } from './excel-reader';

/**
 * Contrôle et chargement du Référentiel depuis le fichier Excel d'initialisation.
 * Règles : brief Cockpit § 10, brief Console § 10.6, DECISIONS Q4.
 * Les validations reprennent les schémas de l'API (`referential/schemas.ts`).
 */

export type IssueLevel = 'ERROR' | 'WARNING';
export interface ImportIssue {
  level: IssueLevel;
  sheet: string;
  row: number | null;
  column?: string | null;
  message: string;
  /** SERVER : contrôle du serveur (fait foi) ; FILE : indication de la colonne CONTRÔLE du fichier. */
  source: 'SERVER' | 'FILE';
}

/** Couleurs nommées des instances → hexadécimal (brief § 10). */
export const COLOR_NAMES: Record<string, string> = {
  marine: '#10233A',
  sarcelle: '#1D8F86',
  bleu: '#3B7DD8',
  ambre: '#E39A2D',
  rouge: '#C2473B',
  violet: '#B25FC4',
  olive: '#6B8E23',
  gris: '#8A9AA6',
};
const FREQ: Record<string, string> = { quotidienne: 'DAILY', hebdomadaire: 'WEEKLY', bimensuelle: 'BIWEEKLY', mensuelle: 'MONTHLY', trimestrielle: 'QUARTERLY', semestrielle: 'SEMIANNUAL', 'a la demande': 'ON_DEMAND' };
const LEVEL: Record<string, string> = { strategique: 'STRATEGIC', pilotage: 'STEERING', operationnel: 'OPERATIONAL', 'hors cycle': 'OFF_CYCLE' };
const MEMBER_ROLE: Record<string, string> = { president: 'CHAIR', membre: 'MEMBER', secretaire: 'SECRETARY', invite: 'GUEST' };
const PLAN_STATUS: Record<string, string> = { prevu: 'PLANNED', prevue: 'PLANNED', 'en cours': 'IN_PROGRESS', termine: 'DONE', terminee: 'DONE' };
const WS_STATUS: Record<string, string> = { actif: 'ACTIVE', clos: 'CLOSED' };
const PROJECT_STATUS: Record<string, string> = { preparation: 'PREPARATION', actif: 'ACTIVE', clos: 'CLOSED' };

/**
 * Ancien modèle (décision D5 du 06/10/2026) : fichier sans l'onglet « 06 Info projet » ou sans les colonnes des
 * rattachements des chantiers ; refusé, avec ce message.
 */
export const OLD_MODEL_MESSAGE = 'Ancien modèle de fichier : téléchargez le modèle à jour (bouton « Modèle Excel ») et reportez-y vos données';
/** Colonnes ajoutées à l'onglet « 10 Chantiers » le 06/10/2026 (choix multiple, valeurs séparées par « ; »). */
export const WS_LINK_COLUMNS = ['Phases', 'Sous-phases', 'Dépendances'] as const;
/** Libellés de la rubrique « Le client » repris de l'onglet « 05 Projet » (décision D2 du 06/10/2026). */
export const CLIENT_FROM_PROJECT = { name: 'Raison sociale', sector: 'Secteur', country: 'Pays' } as const;

/** Q4 : valeurs par défaut des champs du modèle absents du fichier. */
export const IMPORT_DEFAULTS = { currency: 'EUR', progressPct: 0, memberRole: 'MEMBER', clientStatus: 'ACTIVE' } as const;

export interface ImportPlan {
  client: { name: string; sector: string | null };
  project: {
    code: string;
    name: string;
    objective: string | null;
    country: string;
    startDate: string;
    targetEndDate: string;
    timezone: string;
    status: string;
    editorTeam: string | null;
    integratorTeam: string | null;
    programDirector: string;
    sponsor: string | null;
    currency: string;
  };
  teams: Array<{ key: string; name: string; description: string | null }>;
  roles: Array<{ key: string; label: string; description: string | null; order: number }>;
  persons: Array<{ key: string; firstName: string; lastName: string; email: string; team: string; title: string | null; active: boolean }>;
  assignments: Array<{ person: string; role: string; startDate: string; endDate: string | null }>;
  waves: Array<{ key: string; seq: number; name: string; startDate: string; endDate: string; status: string; owner: string | null }>;
  phases: Array<{ key: string; seq: number; code: string; name: string; wave: string; startDate: string; endDate: string; status: string; description: string | null }>;
  subphases: Array<{ key: string; phase: string; code: string; name: string; startDate: string | null; endDate: string | null; status: string; description: string | null }>;
  workstreams: Array<{ key: string; code: string; seq: number; name: string; owner: string; wave: string | null; status: string; description: string | null; phases: string[]; subphases: string[]; dependsOn: string[] | 'ALL'; startDate: string | null; endDate: string | null }>;
  /** Objet « Info projet » (onglets 05 Projet pour « Le client » et 06 Info projet). */
  projectInfo: ProjectInfo;
  bodies: Array<{ key: string; name: string; shortName: string; color: string; frequency: string; level: string | null; description: string | null }>;
  members: Array<{ body: string; person: string; role: string }>;
  milestones: Array<{ code: string; n: string; phase: string; subphase: string | null; ws: string | null; wave: string | null; owner: string | null; iso: string; baselineIso: string | null }>;
  deliverables: Array<{ name: string; subphase: string; ws: string | null; owner: string; start: string | null; due: string }>;
}

export interface CheckResult {
  issues: ImportIssue[];
  plan: ImportPlan | null;
  counts: Record<string, number>;
  checks: Array<{ id: string; label: string; ok: boolean; detail: string }>;
}

// ───────────── utilitaires de conversion ─────────────

function str(v: CellValue): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim() || null;
}

/** Date Excel (objet Date, numéro de série, « JJ/MM/AAAA » ou ISO) → ISO. */
export function toIsoDate(v: CellValue): string | null | 'INVALID' {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return 'INVALID';
    // Les dates Excel sont des dates civiles : on neutralise le décalage horaire.
    const d = new Date(v.getTime() + 12 * 3600_000);
    return d.toISOString().slice(0, 10);
  }
  if (typeof v === 'number') {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (isIsoDate(s)) return s;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) {
    const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return isIsoDate(iso) ? iso : 'INVALID';
  }
  return 'INVALID';
}

function splitName(full: string) {
  const i = full.indexOf(' ');
  return i < 0 ? { firstName: full, lastName: '' } : { firstName: full.slice(0, i), lastName: full.slice(i + 1) };
}

// ───────────── contrôle ─────────────

export function checkWorkbook(wb: ParsedWorkbook): CheckResult {
  const issues: ImportIssue[] = [];
  const err = (sheet: string, row: number | null, column: string | null, message: string) => issues.push({ level: 'ERROR', sheet, row, column, message, source: 'SERVER' });
  const warn = (sheet: string, row: number | null, column: string | null, message: string) => issues.push({ level: 'WARNING', sheet, row, column, message, source: 'SERVER' });

  // 1. Structure ; ancien modèle refusé (D5) avec un message qui invite à télécharger le modèle à jour.
  const wsCols = wb.sheets['10 Chantiers']?.columns.map((c) => c.header) ?? [];
  const missingCols = wb.sheets['10 Chantiers'] ? WS_LINK_COLUMNS.filter((c) => !wsCols.includes(c)) : [];
  // Un ancien modèle (avant le 06/10/2026, ou numéroté 05b, 06 Lots… avant le 07/10/2026) n'a pas l'onglet « 06 Info
  // projet » : un seul message, sans la liste des onglets que l'ancienne numérotation ferait paraître manquants.
  if (wb.missingSheets.includes('06 Info projet')) {
    err('06 Info projet', null, null, `${OLD_MODEL_MESSAGE} (onglet « 06 Info projet » absent)`);
    return finish(issues, null, wb);
  }
  if (missingCols.length) err('10 Chantiers', null, null, `${OLD_MODEL_MESSAGE} (colonne${missingCols.length > 1 ? 's' : ''} ${missingCols.map((c) => `« ${c} »`).join(', ')} absente${missingCols.length > 1 ? 's' : ''} de l'onglet 10 Chantiers)`);
  for (const m of wb.missingSheets) err(m, null, null, `Onglet « ${m} » manquant`);
  if (wb.missingSheets.length || missingCols.length) return finish(issues, null, wb);

  const sheet = (name: (typeof SHEETS)[number]): SheetData => wb.sheets[name];
  const colLetter = (sh: string, header: string) => wb.sheets[sh]?.columns.find((c) => c.header === header)?.letter ?? header;

  /** Champs obligatoires d'une ligne commencée (§ 10.6.3). */
  const required = (sh: string, r: { row: number; values: Record<string, CellValue> }) => {
    let ok = true;
    for (const c of wb.sheets[sh].columns) {
      if (c.type === 'REQUIRED' && (r.values[c.header] === null || r.values[c.header] === undefined)) {
        err(sh, r.row, c.letter, `« ${c.header} » est obligatoire`);
        ok = false;
      }
    }
    return ok;
  };
  const date = (sh: string, r: { row: number; values: Record<string, CellValue> }, header: string): string | null => {
    const d = toIsoDate(r.values[header]);
    if (d === 'INVALID') {
      err(sh, r.row, colLetter(sh, header), `« ${header} » : date invalide (JJ/MM/AAAA attendu)`);
      return null;
    }
    return d;
  };
  const fileControl = (sh: string, r: { row: number; control: string | null }) => {
    // Q4 : la colonne CONTRÔLE du fichier est reprise comme indication ; les contrôles du serveur font foi.
    if (!r.control) return;
    if (r.control.startsWith('⚠') || r.control.startsWith('◔')) {
      issues.push({ level: 'WARNING', sheet: sh, row: r.row, column: null, message: `Contrôle du fichier : ${r.control.replace(/^[⚠◔]\s*/, '')}`, source: 'FILE' });
    }
  };
  const zod = (sh: string, row: number, schema: ZodObject<any>, obj: unknown, map: Record<string, string> = {}) => {
    const r = schema.safeParse(obj);
    if (!r.success) for (const i of r.error.issues) err(sh, row, map[String(i.path[0])] ?? String(i.path[0] ?? ''), `${map[String(i.path[0])] ?? i.path.join('.')} : ${i.message}`);
    return r.success;
  };

  const plan: ImportPlan = {
    client: { name: '', sector: null },
    project: {} as ImportPlan['project'],
    teams: [],
    roles: [],
    persons: [],
    assignments: [],
    waves: [],
    phases: [],
    subphases: [],
    workstreams: [],
    bodies: [],
    members: [],
    milestones: [],
    deliverables: [],
    projectInfo: { identity: [], brands: [], pitch: '', stakes: [], scope: [], systems: [], geo: [], legal: [] },
  };

  // 01 Équipes
  const teamKeys = new Map<string, number>();
  for (const r of sheet('01 Équipes').rows) {
    fileControl('01 Équipes', r);
    if (!required('01 Équipes', r)) continue;
    const name = str(r.values['Nom'])!;
    const k = normKey(name);
    if (teamKeys.has(k)) err('01 Équipes', r.row, 'B', `Équipe « ${name} » en double (ligne ${teamKeys.get(k)})`);
    else teamKeys.set(k, r.row);
    plan.teams.push({ key: k, name, description: str(r.values['Description']) });
  }

  // 02 Rôles
  const roleKeys = new Map<string, number>();
  for (const [i, r] of sheet('02 Rôles').rows.entries()) {
    fileControl('02 Rôles', r);
    if (!required('02 Rôles', r)) continue;
    const label = str(r.values['Libellé'])!;
    const k = normKey(label);
    if (roleKeys.has(k)) err('02 Rôles', r.row, 'B', `Rôle « ${label} » en double (ligne ${roleKeys.get(k)})`);
    else roleKeys.set(k, r.row);
    plan.roles.push({ key: k, label, description: str(r.values['Description']), order: i });
  }

  // 03 Personnes (colonne Permission ignorée, Q4)
  const personKeys = new Map<string, number>();
  const emails = new Map<string, number>();
  for (const r of sheet('03 Personnes').rows) {
    fileControl('03 Personnes', r);
    const values = { ...r.values, Permission: 'ignorée' };
    if (!required('03 Personnes', { row: r.row, values })) continue;
    const full = str(r.values['Nom complet'])!;
    const k = normKey(full);
    const email = str(r.values['Email'])!.toLowerCase();
    const team = str(r.values['Équipe'])!;
    if (personKeys.has(k)) err('03 Personnes', r.row, 'B', `Personne « ${full} » en double (ligne ${personKeys.get(k)})`);
    else personKeys.set(k, r.row);
    if (emails.has(email)) err('03 Personnes', r.row, 'C', `E-mail ${email} en double (ligne ${emails.get(email)})`);
    else emails.set(email, r.row);
    if (!teamKeys.has(normKey(team))) err('03 Personnes', r.row, 'D', `Équipe « ${team} » inconnue (onglet 01 Équipes)`);
    const { firstName, lastName } = splitName(full);
    const actif = normKey(str(r.values['Actif']) ?? 'oui');
    zod('03 Personnes', r.row, S.PersonCreate.pick({ firstName: true, email: true }), { firstName, email }, { email: 'C', firstName: 'B' });
    plan.persons.push({ key: k, firstName, lastName, email, team: normKey(team), title: str(r.values['Fonction']), active: actif !== 'non' });
  }
  const person = (sh: string, row: number, col: string, name: string | null, what = 'Personne') => {
    if (!name) return null;
    if (!personKeys.has(normKey(name))) {
      err(sh, row, col, `${what} « ${name} » inconnue (onglet 03 Personnes)`);
      return null;
    }
    return normKey(name);
  };

  // 04 Affectations
  const assignSeen = new Set<string>();
  for (const r of sheet('04 Affectations').rows) {
    fileControl('04 Affectations', r);
    if (!required('04 Affectations', r)) continue;
    const p = person('04 Affectations', r.row, 'B', str(r.values['Personne']));
    const role = str(r.values['Rôle'])!;
    if (!roleKeys.has(normKey(role))) err('04 Affectations', r.row, 'C', `Rôle « ${role} » inconnu (onglet 02 Rôles)`);
    const s = date('04 Affectations', r, 'Début');
    const e = date('04 Affectations', r, 'Fin');
    if (s && e && e < s) err('04 Affectations', r.row, 'F', 'Fin avant début');
    const k = `${p}|${normKey(role)}|${s}`;
    if (assignSeen.has(k)) err('04 Affectations', r.row, 'B', 'Affectation en double (même personne, rôle et début)');
    assignSeen.add(k);
    if (p && s) plan.assignments.push({ person: p, role: normKey(role), startDate: s, endDate: e });
  }

  // 05 Projet
  const f = (label: string) => wb.projectForm.find((x) => normKey(x.label) === normKey(label));
  for (const fld of wb.projectForm) if (fld.type === 'REQUIRED' && (fld.value === null || fld.value === undefined)) err('05 Projet', fld.row, 'D', `« ${fld.label} » est obligatoire`);
  const pv = (label: string) => str(f(label)?.value ?? null);
  const pd = (label: string) => {
    const x = f(label);
    const d = toIsoDate(x?.value ?? null);
    if (d === 'INVALID') {
      err('05 Projet', x?.row ?? null, 'D', `« ${label} » : date invalide`);
      return null;
    }
    return d;
  };
  const code = (pv('Code projet') ?? '').toUpperCase();
  if (code && !/^[A-Z0-9][A-Z0-9_-]{1,19}$/.test(code)) err('05 Projet', f('Code projet')?.row ?? null, 'D', 'Code projet : 2 à 20 caractères (lettres, chiffres, - ou _)');
  const start = pd('Date de démarrage');
  const end = pd('Date de fin cible');
  if (start && end && end < start) err('05 Projet', f('Date de fin cible')?.row ?? null, 'D', 'Fin cible avant démarrage');
  const tz = pv('Fuseau horaire');
  if (tz) {
    try {
      new Intl.DateTimeFormat('fr-FR', { timeZone: tz });
    } catch {
      err('05 Projet', f('Fuseau horaire')?.row ?? null, 'D', `Fuseau horaire « ${tz} » invalide`);
    }
  }
  const statusLabel = pv('Statut');
  const status = statusLabel ? PROJECT_STATUS[normKey(statusLabel)] : 'PREPARATION';
  if (statusLabel && !status) err('05 Projet', f('Statut')?.row ?? null, 'D', `Statut « ${statusLabel} » inconnu`);
  const director = person('05 Projet', f('Directeur de programme')?.row ?? 0, 'D', pv('Directeur de programme'), 'Directeur de programme');
  const sponsor = person('05 Projet', f('Sponsor')?.row ?? 0, 'D', pv('Sponsor'), 'Sponsor');
  const teamRef = (label: string) => {
    const v = pv(label);
    if (v && !teamKeys.has(normKey(v))) err('05 Projet', f(label)?.row ?? null, 'D', `${label} : équipe « ${v} » inconnue`);
    return v ? normKey(v) : null;
  };
  plan.client = { name: pv('Nom du client') ?? '', sector: pv('Secteur d’activité') ?? pv("Secteur d'activité") };
  plan.project = {
    code,
    name: pv('Nom du projet') ?? '',
    objective: pv('Objectifs'),
    country: pv('Pays') ?? '',
    startDate: start ?? '',
    targetEndDate: end ?? '',
    timezone: tz ?? 'Europe/Paris',
    status: status ?? 'PREPARATION',
    editorTeam: teamRef('Éditeur de la solution'),
    integratorTeam: teamRef('Intégrateur'),
    programDirector: director ?? '',
    sponsor,
    currency: IMPORT_DEFAULTS.currency,
  };

  // 06 Info projet (06/10/2026) : « Le client » commence par la raison sociale, le secteur et le pays de 05 Projet (D2) ;
  // « Programme en une phrase » et au moins un « Enjeu stratégique » sont obligatoires (D1).
  const IP = '06 Info projet';
  const info = plan.projectInfo;
  const fromProject: Array<[string, string | null]> = [[CLIENT_FROM_PROJECT.name, plan.client.name || null], [CLIENT_FROM_PROJECT.sector, plan.client.sector], [CLIENT_FROM_PROJECT.country, plan.project.country || null]];
  info.identity = fromProject.filter((x): x is [string, string] => !!x[1]);
  const rubrique = new Map<string, (typeof PROJECT_INFO_RUBRIQUES)[number]>();
  for (const r of PROJECT_INFO_RUBRIQUES) { rubrique.set(normKey(r.label), r); rubrique.set(normKey(r.key), r); }
  let pitchRow: number | null = null;
  for (const r of sheet(IP).rows) {
    fileControl(IP, r);
    if (!required(IP, r)) continue;
    const rubLabel = str(r.values['Rubrique'])!;
    const rub = rubrique.get(normKey(rubLabel));
    if (!rub) { err(IP, r.row, 'B', `Rubrique « ${rubLabel} » inconnue (liste dans l’onglet Références)`); continue; }
    const label = str(r.values['Libellé']);
    const val = str(r.values['Valeur'])!;
    if (val.length > PROJECT_INFO_VALUE_MAX) err(IP, r.row, 'D', `Valeur : ${PROJECT_INFO_VALUE_MAX} caractères au plus`);
    if (rub.kv) {
      if (!label) { err(IP, r.row, 'C', `« Libellé » est obligatoire pour la rubrique « ${rub.label} »`); continue; }
      if (label.length > PROJECT_INFO_LABEL_MAX) err(IP, r.row, 'C', `Libellé : ${PROJECT_INFO_LABEL_MAX} caractères au plus`);
      const list = info[rub.key as 'identity' | 'scope' | 'systems'];
      if (rub.key === 'identity' && fromProject.some(([l]) => normKey(l) === normKey(label))) err(IP, r.row, 'C', `« ${label} » est déjà repris de l’onglet 05 Projet (rubrique « ${rub.label} »)`);
      else if (list.some(([l]) => normKey(l) === normKey(label))) err(IP, r.row, 'C', `Libellé « ${label} » en double dans la rubrique « ${rub.label} »`);
      else list.push([label, val]);
    } else {
      if (label) warn(IP, r.row, 'C', `Libellé ignoré : la rubrique « ${rub.label} » est une liste de valeurs`);
      if (rub.key === 'pitch') {
        if (pitchRow) err(IP, r.row, 'B', `« ${rub.label} » : une seule ligne attendue (déjà ligne ${pitchRow})`);
        else { pitchRow = r.row; info.pitch = val; }
      } else info[rub.key as 'brands' | 'stakes' | 'geo' | 'legal'].push(val);
    }
  }
  for (const r of PROJECT_INFO_RUBRIQUES) {
    const n = r.key === 'pitch' ? 0 : info[r.key].length;
    if (n > PROJECT_INFO_ITEMS_MAX) err(IP, null, 'B', `Rubrique « ${r.label} » : ${PROJECT_INFO_ITEMS_MAX} lignes au plus (${n})`);
  }
  if (!info.pitch) err(IP, null, 'B', '« Programme en une phrase » est obligatoire (une ligne)');
  if (!info.stakes.length) err(IP, null, 'B', '« Enjeux stratégiques » est obligatoire (au moins une ligne)');

  // 07 Lots
  const waveKeys = new Map<string, { row: number; start: string | null; end: string | null }>();
  for (const r of sheet('07 Lots').rows) {
    fileControl('07 Lots', r);
    if (!required('07 Lots', r)) continue;
    const seq = Number(r.values['N°']);
    if (!Number.isInteger(seq) || seq < 1) {
      err('07 Lots', r.row, 'C', 'N° de lot : entier ≥ 1 attendu');
      continue;
    }
    const key = `lot ${seq}`;
    if (waveKeys.has(key)) err('07 Lots', r.row, 'C', `Lot ${seq} en double`);
    const s = date('07 Lots', r, 'Début');
    const e = date('07 Lots', r, 'Fin');
    if (s && e && e < s) err('07 Lots', r.row, 'F', 'Fin avant début');
    const st = str(r.values['Statut']);
    if (st && !PLAN_STATUS[normKey(st)]) err('07 Lots', r.row, 'G', `Statut « ${st} » inconnu`);
    const owner = person('07 Lots', r.row, 'H', str(r.values['Responsable']), 'Responsable');
    waveKeys.set(key, { row: r.row, start: s, end: e });
    plan.waves.push({ key, seq, name: str(r.values['Périmètre'])!, startDate: s ?? '', endDate: e ?? '', status: st ? PLAN_STATUS[normKey(st)] ?? 'PLANNED' : 'PLANNED', owner });
  }

  // 08 Phases (clé « N° · Nom »)
  const phaseKeys = new Map<string, { code: string; start: string | null; end: string | null }>();
  for (const r of sheet('08 Phases').rows) {
    fileControl('08 Phases', r);
    if (!required('08 Phases', r)) continue;
    const seq = Number(r.values['N°']);
    if (!Number.isInteger(seq) || seq < 1) {
      err('08 Phases', r.row, 'C', 'N° de phase : entier ≥ 1 attendu');
      continue;
    }
    const name = str(r.values['Nom'])!;
    const key = normKey(`${seq} · ${name}`);
    if ([...phaseKeys.values()].some((p) => p.code === String(seq))) err('08 Phases', r.row, 'C', `Phase n°${seq} en double`);
    const wave = str(r.values['Lot'])!;
    if (!waveKeys.has(normKey(wave))) err('08 Phases', r.row, 'E', `Lot « ${wave} » inconnu (onglet 07 Lots)`);
    const s = date('08 Phases', r, 'Début');
    const e = date('08 Phases', r, 'Fin');
    if (s && e && e < s) err('08 Phases', r.row, 'G', 'Fin avant début');
    const st = str(r.values['Statut']);
    if (st && !PLAN_STATUS[normKey(st)]) err('08 Phases', r.row, 'H', `Statut « ${st} » inconnu`);
    phaseKeys.set(key, { code: String(seq), start: s, end: e });
    plan.phases.push({ key, seq, code: String(seq), name, wave: normKey(wave), startDate: s ?? '', endDate: e ?? '', status: st ? PLAN_STATUS[normKey(st)] ?? 'PLANNED' : 'PLANNED', description: str(r.values['Description']) });
  }

  // 09 Sous-phases (clé « N° · Nom »)
  const spKeys = new Map<string, { phase: string }>();
  for (const r of sheet('09 Sous-phases').rows) {
    fileControl('09 Sous-phases', r);
    if (!required('09 Sous-phases', r)) continue;
    const phaseLabel = str(r.values['Phase'])!;
    const ph = phaseKeys.get(normKey(phaseLabel));
    if (!ph) err('09 Sous-phases', r.row, 'C', `Phase « ${phaseLabel} » inconnue (onglet 08 Phases)`);
    const code = String(r.values['N°']).replace(',', '.');
    // Numérotation libre (07/10/2026) : unique dans le projet (contrôle « en double » ci-dessous), sans séparateur.
    const codeError = subphaseCodeError(code);
    if (codeError) err('09 Sous-phases', r.row, 'D', `N° « ${code} » : ${codeError}`);
    const name = str(r.values['Nom'])!;
    const key = normKey(`${code} · ${name}`);
    if ([...spKeys.keys()].some((k) => k.startsWith(`${normKey(code)} ·`))) err('09 Sous-phases', r.row, 'D', `Sous-phase ${code} en double`);
    const s = date('09 Sous-phases', r, 'Début');
    const e = date('09 Sous-phases', r, 'Fin');
    if (s && e && e < s) err('09 Sous-phases', r.row, 'G', 'Fin avant début');
    if (ph && ((s && ((ph.start && s < ph.start) || (ph.end && s > ph.end))) || (e && ((ph.start && e < ph.start) || (ph.end && e > ph.end))))) warn('09 Sous-phases', r.row, 'F', 'Début ou fin hors de la période de la phase');
    const st = str(r.values['Statut']);
    spKeys.set(key, { phase: normKey(phaseLabel) });
    plan.subphases.push({ key, phase: normKey(phaseLabel), code, name, startDate: s, endDate: e, status: st ? PLAN_STATUS[normKey(st)] ?? 'PLANNED' : 'PLANNED', description: str(r.values['Description']) });
  }

  // 10 Chantiers (clé = nom ; code attribué par le serveur dans l'ordre des lignes). Phases, sous-phases et dépendances
  // (06/10/2026) : choix multiple, valeurs séparées par « ; » ; une sous-phase appartient à l'une des phases du chantier.
  const WS = '10 Chantiers';
  const phaseOfToken = new Map<string, string>();
  for (const p of plan.phases) { phaseOfToken.set(normKey(p.code), p.key); phaseOfToken.set(normKey(p.name), p.key); phaseOfToken.set(p.key, p.key); }
  const spOfToken = new Map<string, { key: string; phase: string; code: string }>();
  for (const s of plan.subphases) { const v = { key: s.key, phase: s.phase, code: s.code }; spOfToken.set(normKey(s.code), v); spOfToken.set(s.key, v); }
  const phaseLabel = (k: string) => { const p = plan.phases.find((x) => x.key === k); return p ? `${p.code} · ${p.name}` : k; };
  const rawDeps: Array<{ key: string; row: number; tokens: string[] }> = [];
  const wsKeys = new Map<string, number>();
  for (const [i, r] of sheet('10 Chantiers').rows.entries()) {
    fileControl('10 Chantiers', r);
    if (!required('10 Chantiers', r)) continue;
    const name = str(r.values['Nom'])!;
    const k = normKey(name);
    if (wsKeys.has(k)) err('10 Chantiers', r.row, 'C', `Chantier « ${name} » en double (ligne ${wsKeys.get(k)})`);
    wsKeys.set(k, r.row);
    const owner = person('10 Chantiers', r.row, 'D', str(r.values['Responsable']), 'Responsable');
    const wave = str(r.values['Lot']);
    if (wave && !waveKeys.has(normKey(wave))) err('10 Chantiers', r.row, 'E', `Lot « ${wave} » inconnu`);
    const st = str(r.values['Statut']);
    if (st && !WS_STATUS[normKey(st)]) err('10 Chantiers', r.row, 'F', `Statut « ${st} » inconnu`);
    const phases: string[] = [];
    for (const t of multiValues(r.values['Phases'])) {
      const p = phaseOfToken.get(normKey(t));
      if (!p) err(WS, r.row, colLetter(WS, 'Phases'), `Phase « ${t} » inconnue (onglet 08 Phases)`);
      else if (!phases.includes(p)) phases.push(p);
    }
    const subphases: string[] = [];
    for (const t of multiValues(r.values['Sous-phases'])) {
      const s = spOfToken.get(normKey(t));
      if (!s) err(WS, r.row, colLetter(WS, 'Sous-phases'), `Sous-phase « ${t} » inconnue (onglet 09 Sous-phases)`);
      else if (!phases.includes(s.phase)) err(WS, r.row, colLetter(WS, 'Sous-phases'), `Sous-phase ${s.code} hors des phases du chantier : sa phase « ${phaseLabel(s.phase)} » n’est pas dans la colonne Phases`);
      else if (!subphases.includes(s.key)) subphases.push(s.key);
    }
    rawDeps.push({ key: k, row: r.row, tokens: multiValues(r.values['Dépendances']) });
    // Début et fin (07/10/2026, colonnes facultatives ; absentes des fichiers antérieurs) : saisies, sinon calculées à
    // partir des sous-phases du chantier, puis de ses phases, puis du projet.
    const ds = date(WS, r, 'Début'), de = date(WS, r, 'Fin');
    if (ds && de && de < ds) err(WS, r.row, colLetter(WS, 'Fin'), 'Fin avant début');
    const span = workstreamSpan(
      { start: ds, end: de },
      plan.subphases.filter((s) => subphases.includes(s.key)).map((s) => ({ start: s.startDate, end: s.endDate })),
      plan.phases.filter((p) => phases.includes(p.key)).map((p) => ({ start: p.startDate || null, end: p.endDate || null })),
      { start: plan.project.startDate || null, end: plan.project.targetEndDate || null },
    );
    plan.workstreams.push({ key: k, code: `C${i + 1}`, seq: i + 1, name, owner: owner ?? '', wave: wave ? normKey(wave) : null, status: st ? WS_STATUS[normKey(st)] ?? 'ACTIVE' : 'ACTIVE', description: str(r.values['Description']), phases, subphases, dependsOn: [], startDate: span.start, endDate: span.end });
  }
  // Dépendances : noms (ou codes C1, C2…) de chantiers du fichier, ou « Tous » seul ; pas d'auto-dépendance. Dépendances
  // réciproques admises (07/10/2026, `docs/DECISIONS.md`) : un chantier en alimente un autre sur certaines phases, et inversement.
  const depCol = colLetter(WS, 'Dépendances');
  const wsOfToken = (t: string) => plan.workstreams.find((w) => normKey(w.name) === normKey(t) || normKey(w.code) === normKey(t))?.key;
  for (const d of rawDeps) {
    const w = plan.workstreams.find((x) => x.key === d.key)!;
    if (d.tokens.some((t) => normKey(t) === 'tous')) {
      if (d.tokens.length > 1) err(WS, d.row, depCol, '« Tous » ne se combine pas avec d’autres chantiers');
      else w.dependsOn = 'ALL';
      continue;
    }
    for (const t of d.tokens) {
      const dep = wsOfToken(t);
      if (!dep) err(WS, d.row, depCol, `Chantier « ${t} » inconnu (onglet 10 Chantiers)`);
      else if (dep === d.key) err(WS, d.row, depCol, `Le chantier « ${w.name} » dépend de lui-même`);
      else if (!(w.dependsOn as string[]).includes(dep)) (w.dependsOn as string[]).push(dep);
    }
  }

  // 11 Instances
  const bodyKeys = new Map<string, number>();
  const shortNames = new Map<string, number>();
  for (const r of sheet('11 Instances').rows) {
    fileControl('11 Instances', r);
    if (!required('11 Instances', r)) continue;
    const name = str(r.values['Nom'])!;
    const short = str(r.values['Nom court'])!;
    if (bodyKeys.has(normKey(name))) err('11 Instances', r.row, 'B', `Instance « ${name} » en double`);
    bodyKeys.set(normKey(name), r.row);
    if (shortNames.has(normKey(short))) err('11 Instances', r.row, 'C', `Nom court « ${short} » en double`);
    shortNames.set(normKey(short), r.row);
    const colorLabel = str(r.values['Couleur'])!;
    const color = COLOR_NAMES[normKey(colorLabel)] ?? (/^#[0-9a-f]{6}$/i.test(colorLabel) ? colorLabel.toUpperCase() : null);
    if (!color) err('11 Instances', r.row, 'D', `Couleur « ${colorLabel} » inconnue`);
    const fr = str(r.values['Fréquence'])!;
    const frequency = FREQ[normKey(fr)];
    if (!frequency) err('11 Instances', r.row, 'F', `Fréquence « ${fr} » inconnue`);
    const lv = str(r.values['Niveau']);
    if (lv && !LEVEL[normKey(lv)]) err('11 Instances', r.row, 'G', `Niveau « ${lv} » inconnu`);
    plan.bodies.push({ key: normKey(name), name, shortName: short, color: color ?? '#8A9AA6', frequency: frequency ?? 'ON_DEMAND', level: lv ? LEVEL[normKey(lv)] ?? null : null, description: str(r.values['Rôle de l’instance']) ?? str(r.values["Rôle de l'instance"]) });
  }

  // 12 Membres
  const memberSeen = new Set<string>();
  const bodiesWithMembers = new Set<string>();
  for (const r of sheet('12 Membres').rows) {
    fileControl('12 Membres', r);
    if (!required('12 Membres', r)) continue;
    const b = str(r.values['Instance'])!;
    if (!bodyKeys.has(normKey(b))) err('12 Membres', r.row, 'B', `Instance « ${b} » inconnue (onglet 11 Instances)`);
    const p = person('12 Membres', r.row, 'C', str(r.values['Personne']));
    const k = `${normKey(b)}|${p}`;
    if (memberSeen.has(k)) err('12 Membres', r.row, 'C', 'Membre en double dans cette instance');
    memberSeen.add(k);
    const rl = str(r.values['Rôle dans l’instance']) ?? str(r.values["Rôle dans l'instance"]);
    if (rl && !MEMBER_ROLE[normKey(rl)]) err('12 Membres', r.row, 'D', `Rôle « ${rl} » inconnu`);
    bodiesWithMembers.add(normKey(b));
    if (p) plan.members.push({ body: normKey(b), person: p, role: rl ? MEMBER_ROLE[normKey(rl)] ?? IMPORT_DEFAULTS.memberRole : IMPORT_DEFAULTS.memberRole });
  }
  for (const b of plan.bodies) if (!bodiesWithMembers.has(b.key)) warn('11 Instances', bodyKeys.get(b.key) ?? null, 'I', `L'instance « ${b.name} » n'a aucun membre`);

  // 13 Jalons (code attribué par le serveur dans l'ordre des lignes)
  for (const [i, r] of sheet('13 Jalons').rows.entries()) {
    fileControl('13 Jalons', r);
    if (!required('13 Jalons', r)) continue;
    const phaseLabel = str(r.values['Phase'])!;
    const ph = phaseKeys.get(normKey(phaseLabel));
    if (!ph) err('13 Jalons', r.row, 'D', `Phase « ${phaseLabel} » inconnue`);
    const spLabel = str(r.values['Sous-phase']);
    if (spLabel) {
      const sp = spKeys.get(normKey(spLabel));
      if (!sp) err('13 Jalons', r.row, 'E', `Sous-phase « ${spLabel} » inconnue`);
      else if (sp.phase !== normKey(phaseLabel)) err('13 Jalons', r.row, 'E', `La sous-phase « ${spLabel} » n'appartient pas à la phase « ${phaseLabel} »`);
    }
    const ws = str(r.values['Chantier']);
    if (ws && !wsKeys.has(normKey(ws))) err('13 Jalons', r.row, 'F', `Chantier « ${ws} » inconnu`);
    const wave = str(r.values['Lot']);
    if (wave && !waveKeys.has(normKey(wave))) err('13 Jalons', r.row, 'G', `Lot « ${wave} » inconnu`);
    const owner = person('13 Jalons', r.row, 'H', str(r.values['Responsable']), 'Responsable');
    const iso = date('13 Jalons', r, 'Date prévue');
    const base = date('13 Jalons', r, 'Date de référence');
    if (iso && ph && ((ph.start && iso < ph.start) || (ph.end && iso > ph.end))) warn('13 Jalons', r.row, 'I', 'Date prévue hors de la période de la phase');
    plan.milestones.push({ code: `J${String(i + 1).padStart(2, '0')}`, n: str(r.values['Libellé'])!, phase: normKey(phaseLabel), subphase: spLabel ? normKey(spLabel) : null, ws: ws ? normKey(ws) : null, wave: wave ? normKey(wave) : null, owner, iso: iso ?? '', baselineIso: base });
  }

  // 14 Livrables
  for (const r of sheet('14 Livrables').rows) {
    fileControl('14 Livrables', r);
    if (!required('14 Livrables', r)) continue;
    const spLabel = str(r.values['Sous-phase'])!;
    if (!spKeys.has(normKey(spLabel))) err('14 Livrables', r.row, 'C', `Sous-phase « ${spLabel} » inconnue`);
    const ws = str(r.values['Chantier']);
    if (ws && !wsKeys.has(normKey(ws))) err('14 Livrables', r.row, 'D', `Chantier « ${ws} » inconnu`);
    const owner = person('14 Livrables', r.row, 'E', str(r.values['Responsable']), 'Responsable');
    const s = date('14 Livrables', r, 'Début');
    const due = date('14 Livrables', r, 'Échéance');
    if (s && due && due < s) err('14 Livrables', r.row, 'G', 'Échéance avant début');
    plan.deliverables.push({ name: str(r.values['Nom'])!, subphase: normKey(spLabel), ws: ws ? normKey(ws) : null, owner: owner ?? '', start: s, due: due ?? '' });
  }

  if (wb.projectControl?.startsWith('⚠')) issues.push({ level: 'WARNING', sheet: '05 Projet', row: 24, column: 'D', message: `Contrôle du fichier : ${wb.projectControl.replace(/^⚠\s*/, '')}`, source: 'FILE' });
  return finish(issues, plan, wb);
}

function finish(issues: ImportIssue[], plan: ImportPlan | null, wb: ParsedWorkbook): CheckResult {
  const errors = issues.filter((i) => i.level === 'ERROR');
  const counts: Record<string, number> = plan
    ? { teams: plan.teams.length, roles: plan.roles.length, persons: plan.persons.length, assignments: plan.assignments.length, waves: plan.waves.length, phases: plan.phases.length, subphases: plan.subphases.length, workstreams: plan.workstreams.length, governanceBodies: plan.bodies.length, members: plan.members.length, milestones: plan.milestones.length, deliverables: plan.deliverables.length }
    : {};
  const bySheet = (prefix: string) => errors.filter((e) => e.sheet.startsWith(prefix) || prefix === '*').length;
  const checks = [
    { id: 'structure', label: `Structure du fichier (${SHEETS.length} onglets)`, ok: !wb.missingSheets.length && !errors.some((e) => e.message.startsWith(OLD_MODEL_MESSAGE)), detail: errors.some((e) => e.message.startsWith(OLD_MODEL_MESSAGE)) ? 'Ancien modèle de fichier' : wb.missingSheets.length ? `${wb.missingSheets.length} onglet(s) manquant(s)` : `${SHEETS.length} onglets présents` },
    { id: 'project', label: 'Fiche projet complète', ok: bySheet('05') === 0, detail: bySheet('05') ? `${bySheet('05')} erreur(s)` : 'Champs obligatoires renseignés' },
    { id: 'required', label: 'Champs obligatoires', ok: !errors.some((e) => /obligatoire/.test(e.message)), detail: `${errors.filter((e) => /obligatoire/.test(e.message)).length} champ(s) manquant(s)` },
    { id: 'references', label: 'Références entre onglets et doublons', ok: !errors.some((e) => /inconnu|double|appartient|hors des phases|lui-même|Tous/.test(e.message)), detail: `${errors.filter((e) => /inconnu|double|appartient|hors des phases|lui-même|Tous/.test(e.message)).length} erreur(s)` },
    { id: 'rules', label: 'Règles de dates et de codes', ok: !errors.some((e) => /date|avant|N°|Fin|Code/.test(e.message)), detail: `${issues.filter((e) => e.level === 'WARNING').length} avertissement(s)` },
  ];
  return { issues, plan, counts, checks };
}

// ───────────── chargement (transactionnel) ─────────────

export interface CommitTarget {
  projectId: string;
  /** Crée le client et le projet (console) ou complète un projet existant (Cockpit). */
  createProject: boolean;
  /** Préfixe des identifiants techniques (code projet) pour éviter les collisions entre projets. */
  idPrefix: string;
  /**
   * Avancement (écran « Initialisation d'un projet », § 4) : phase 1 à 5 et part faite de la phase (0 à 1).
   * Phases, dans l'ordre d'écriture : projet ; lots et phases ; chantiers et jalons ; personnes et habilitations ;
   * instances de pilotage. Aucune clé étrangère ne vise les personnes ni les équipes : l'ordre est libre.
   */
  progress?: (phase: number, fraction: number) => void | Promise<void>;
}

export async function commitPlan(db: Tx, plan: ImportPlan, target: CommitTarget, audit: AuditService, ctx: WriteCtx): Promise<Record<string, number>> {
  const id = (kind: string, k: string | number) => `${target.idPrefix}-${kind}-${String(k).replace(/[^A-Za-z0-9.]/g, '').slice(0, 40)}`;
  const P = target.projectId;
  const teamId: Record<string, string> = {};
  const roleId: Record<string, string> = {};
  const personId: Record<string, string> = {};
  const waveId: Record<string, string> = {};
  const phaseId: Record<string, string> = {};
  const spId: Record<string, string> = {};
  const wsId: Record<string, string> = {};
  const bodyId: Record<string, string> = {};

  if (target.progress) await target.progress(1, 0);
  if (target.createProject) {
    const clientCode = plan.client.name.slice(0, 40);
    const client = (await db.client.findUnique({ where: { code: clientCode } })) ?? (await db.client.create({ data: { id: id('client', 1), code: clientCode, name: plan.client.name, description: plan.client.sector, status: IMPORT_DEFAULTS.clientStatus } }));
    await db.project.create({
      data: {
        id: P,
        clientId: client.id,
        code: plan.project.code,
        name: plan.project.name,
        objective: plan.project.objective,
        startDate: plan.project.startDate,
        targetEndDate: plan.project.targetEndDate,
        timezone: plan.project.timezone,
        country: plan.project.country,
        // Console § 7.8 : le projet créé a le statut PREPARATION.
        status: 'PREPARATION',
        currency: plan.project.currency,
      },
    });
  }
  // Info projet (06/10/2026) : rubriques écrites dans le bloc `referential`, sans toucher à ses autres données.
  const ipWhere = { projectId_key: { projectId: P, key: PROJECT_INFO_BLOCK } };
  const ipCur = await db.contentBlock.findUnique({ where: ipWhere });
  const ipData = { ...((ipCur?.data as object) ?? {}), ...plan.projectInfo };
  await db.contentBlock.upsert({ where: ipWhere, create: { projectId: P, key: PROJECT_INFO_BLOCK, data: ipData }, update: { data: ipData, version: { increment: 1 } } });
  if (target.progress) await target.progress(1, 1);
  // Identifiants techniques calculés d'avance : chaque phase peut viser des objets écrits dans une autre.
  plan.teams.forEach((t, k) => { teamId[t.key] = id('t', k + 1); });
  plan.roles.forEach((r) => { roleId[r.key] = id('ro', r.order + 1); });
  plan.persons.forEach((p, k) => { personId[p.key] = id('p', k + 1); });
  plan.waves.forEach((w) => { waveId[w.key] = id('w', w.seq); });
  plan.phases.forEach((p) => { phaseId[p.key] = id('P', p.seq); });
  plan.subphases.forEach((sp) => { spId[sp.key] = id('SP', sp.code); });
  plan.workstreams.forEach((w) => { wsId[w.key] = id('C', w.seq); });
  plan.bodies.forEach((b, k) => { bodyId[b.key] = id('g', k + 1); });
  const tick = async (phase: number, done: number, total: number) => { if (target.progress) await target.progress(phase, total ? done / total : 1); };
  const director = personId[plan.project.programDirector] ?? null;

  // Phase 2 : lots, phases, sous-phases.
  const n2 = plan.waves.length + plan.phases.length + plan.subphases.length;
  let d2 = 0;
  await tick(2, 0, n2);
  for (const w of plan.waves) {
    await db.wave.create({ data: { id: waveId[w.key], projectId: P, seq: w.seq, name: w.name, startDate: w.startDate, endDate: w.endDate, status: w.status as any, ownerId: w.owner ? personId[w.owner] : null } });
    await tick(2, ++d2, n2);
  }
  for (const p of plan.phases) {
    await db.phase.create({
      data: {
        id: phaseId[p.key],
        projectId: P,
        seq: p.seq,
        code: p.code,
        name: p.name,
        description: p.description,
        startDate: p.startDate,
        endDate: p.endDate,
        status: p.status as any,
        progressPct: IMPORT_DEFAULTS.progressPct,
        // Q4 : responsable de phase = directeur de programme.
        ownerId: director,
        waves: { create: [{ waveId: waveId[p.wave] }] },
      },
    });
    await tick(2, ++d2, n2);
  }
  for (const sp of plan.subphases) {
    await db.subphase.create({ data: { id: spId[sp.key], projectId: P, phaseId: phaseId[sp.phase], code: sp.code, name: sp.name, description: sp.description, startDate: sp.startDate, endDate: sp.endDate, status: sp.status as any, progressPct: IMPORT_DEFAULTS.progressPct } });
    await tick(2, ++d2, n2);
  }

  // Phase 3 : chantiers, jalons, livrables.
  const n3 = plan.workstreams.length + plan.milestones.length + plan.deliverables.length;
  let d3 = 0;
  await tick(3, 0, n3);
  for (const w of plan.workstreams) {
    await db.workstream.create({
      data: {
        id: wsId[w.key],
        projectId: P,
        code: w.code,
        seq: w.seq,
        name: w.name,
        ownerId: personId[w.owner],
        status: w.status as any,
        description: w.description,
        startDate: w.startDate,
        endDate: w.endDate,
        dependsOnAll: w.dependsOn === 'ALL',
        waves: w.wave ? { create: [{ waveId: waveId[w.wave] }] } : undefined,
        phases: w.phases.length ? { create: w.phases.map((p) => ({ phaseId: phaseId[p] })) } : undefined,
        subphases: w.subphases.length ? { create: w.subphases.map((s) => ({ subphaseId: spId[s] })) } : undefined,
      },
    });
    await tick(3, ++d3, n3);
  }
  // Dépendances entre chantiers, une fois tous les chantiers créés.
  const deps = plan.workstreams.flatMap((w) => (w.dependsOn === 'ALL' ? [] : w.dependsOn.map((d) => ({ wsId: wsId[w.key], dependsOnId: wsId[d] }))));
  if (deps.length) await db.workstreamDependency.createMany({ data: deps });
  for (const m of plan.milestones) {
    await db.milestone.create({
      data: {
        id: id('ms', m.code),
        projectId: P,
        code: m.code,
        n: m.n,
        phaseId: phaseId[m.phase],
        subphaseId: m.subphase ? spId[m.subphase] : null,
        wsId: m.ws ? wsId[m.ws] : null,
        waveId: m.wave ? waveId[m.wave] : null,
        ownerId: m.owner ? personId[m.owner] : null,
        iso: m.iso,
        baselineIso: m.baselineIso ?? m.iso,
        confirmedAt: new Date(),
      },
    });
    await tick(3, ++d3, n3);
  }
  for (const [k, dl] of plan.deliverables.entries()) {
    await db.deliverable.create({ data: { id: id('l', k + 1), projectId: P, name: dl.name, subphaseId: spId[dl.subphase], workstreamId: dl.ws ? wsId[dl.ws] : null, ownerId: personId[dl.owner], start: dl.start, due: dl.due, prog: IMPORT_DEFAULTS.progressPct, order: k } });
    await tick(3, ++d3, n3);
  }

  // Phase 4 : équipes, rôles, personnes, affectations, habilitations ; liens du projet vers ses personnes et équipes.
  const n4 = plan.teams.length + plan.roles.length + plan.persons.length + plan.assignments.length + plan.workstreams.length + 1;
  let d4 = 0;
  await tick(4, 0, n4);
  for (const t of plan.teams) {
    await db.team.create({ data: { id: teamId[t.key], projectId: P, name: t.name, description: t.description } });
    await tick(4, ++d4, n4);
  }
  for (const r of plan.roles) {
    await db.projectRole.create({ data: { id: roleId[r.key], projectId: P, label: r.label, description: r.description, order: r.order } });
    await tick(4, ++d4, n4);
  }
  for (const [k, p] of plan.persons.entries()) {
    await db.person.create({ data: { id: personId[p.key], projectId: P, firstName: p.firstName, lastName: p.lastName, email: p.email, teamId: teamId[p.team], title: p.title, active: p.active, order: k } });
    await tick(4, ++d4, n4);
  }
  for (const [k, a] of plan.assignments.entries()) {
    await db.assignment.create({ data: { id: id('as', k + 1), projectId: P, personId: personId[a.person], roleId: roleId[a.role], startDate: a.startDate, endDate: a.endDate } });
    await tick(4, ++d4, n4);
  }
  for (const w of plan.workstreams) {
    // § 10 : les habilitations RESPONSABLE se déduisent des responsables de chantier.
    await db.habilitation.create({ data: { id: id('hab', `R${w.seq}`), projectId: P, personId: personId[w.owner], profile: 'RESPONSABLE', wsId: wsId[w.key] } });
    await tick(4, ++d4, n4);
  }
  await db.project.update({
    where: { id: P },
    data: {
      programDirectorId: director,
      sponsorId: plan.project.sponsor ? personId[plan.project.sponsor] : null,
      editorTeamId: plan.project.editorTeam ? teamId[plan.project.editorTeam] : null,
      integratorTeamId: plan.project.integratorTeam ? teamId[plan.project.integratorTeam] : null,
    },
  });
  await tick(4, ++d4, n4);

  // Phase 5 : instances de pilotage et leurs membres.
  const n5 = plan.bodies.length + plan.members.length;
  let d5 = 0;
  await tick(5, 0, n5);
  for (const [k, b] of plan.bodies.entries()) {
    await db.governanceBody.create({ data: { id: bodyId[b.key], projectId: P, name: b.name, shortName: b.shortName, color: b.color, frequency: b.frequency as any, level: (b.level as any) ?? null, description: b.description, order: k } });
    await tick(5, ++d5, n5);
  }
  for (const [k, m] of plan.members.entries()) {
    await db.bodyMember.create({ data: { bodyId: bodyId[m.body], personId: personId[m.person], role: m.role as any, order: k } });
    await tick(5, ++d5, n5);
  }
  const created = {
    teams: plan.teams.length,
    roles: plan.roles.length,
    persons: plan.persons.length,
    assignments: plan.assignments.length,
    waves: plan.waves.length,
    phases: plan.phases.length,
    subphases: plan.subphases.length,
    workstreams: plan.workstreams.length,
    habilitations: plan.workstreams.length,
    governanceBodies: plan.bodies.length,
    members: plan.members.length,
    milestones: plan.milestones.length,
    deliverables: plan.deliverables.length,
  };
  // Historique : une entrée de création par objet importé, origine IMPORT (brief § 10).
  const objects: Array<[string, Record<string, string>]> = [
    ['TEAM', teamId], ['ROLE', roleId], ['PERSON', personId], ['WAVE', waveId], ['PHASE', phaseId], ['SUBPHASE', spId], ['WORKSTREAM', wsId], ['GOVERNANCE_BODY', bodyId],
  ];
  const rows = objects.flatMap(([entityType, ids]) => Object.values(ids).map((entityId) => ({ entityType, entityId })));
  rows.push(...plan.milestones.map((m) => ({ entityType: 'MILESTONE', entityId: id('ms', m.code) })));
  rows.push(...plan.deliverables.map((_, i) => ({ entityType: 'DELIVERABLE', entityId: id('l', i + 1) })));
  await db.auditEntry.createMany({
    data: rows.map((r) => ({ ...r, accountId: ctx.actor.accountId, actorName: ctx.actor.fullName, personId: ctx.actor.personId, profileUsed: ctx.profileUsed, origin: 'IMPORT' as const, severity: 'INFO' as const, action: 'Création', projectId: P })),
  });
  await audit.action(db, { ...ctx, origin: 'IMPORT' }, { action: 'Import du Référentiel', target: plan.project.code, severity: 'SENSITIVE', entityType: 'PROJECT', entityId: P, details: created });
  return created;
}

