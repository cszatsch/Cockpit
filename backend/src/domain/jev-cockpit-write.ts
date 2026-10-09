/**
 * Jev du Cockpit — cas 3, modification des données (brief du 01/10/2026 ; arbitrages : suivi seulement — risques,
 * problèmes, actions, décisions ; description, impacts et actions de mitigation d'un risque rangés dans le plan, les
 * actions proposées comme actions liées). Règles pures, sans réseau : catalogue des champs, échelles et listes de
 * valeurs, correspondances (personnes, chantiers, instances), questions à choix, récapitulatifs.
 *
 * Principe : le modèle de la fonction Gestion des données EXTRAIT la demande (objet, opération, champs tels que dits) ;
 * le serveur RÉSOUT chaque valeur contre le référentiel et les règles, pose une question à choix pour chaque valeur
 * manquante, ambiguë ou invalide, contrôle les droits, puis propose un récapitulatif. Rien n'est écrit avant la
 * confirmation explicite ; l'écriture passe par le service métier (droits, règles, historique d'origine JEV).
 */

export type WriteEntity = 'RISK' | 'ISSUE' | 'ACTION' | 'DECISION' | 'PHASE' | 'SUBPHASE' | 'WORKSTREAM' | 'MILESTONE' | 'DELIVERABLE';
/**
 * Objets du Référentiel que Jev crée, modifie ou supprime (demande du commanditaire du 09/10/2026, qui lève la règle « jamais
 * le Référentiel » du 01/10/2026) : réservés au PMO, écrits par le service du Référentiel (contrôle des usages compris).
 */
export const REF_ENTITIES: WriteEntity[] = ['PHASE', 'SUBPHASE', 'WORKSTREAM', 'MILESTONE', 'DELIVERABLE'];
export const isRefEntity = (e: WriteEntity) => REF_ENTITIES.includes(e);
export type WriteOp = 'CREATE' | 'UPDATE' | 'DELETE';

export const WRITE_ENTITY_LABEL: Record<WriteEntity, { one: string; the: string; a: string; tab: string; tabLabel: string; space?: string }> = {
  RISK: { one: 'risque', the: 'le risque', a: 'un risque', tab: 'risques', tabLabel: 'Pilotage › Risques et problèmes' },
  ISSUE: { one: 'problème', the: 'le problème', a: 'un problème', tab: 'risques', tabLabel: 'Pilotage › Risques et problèmes' },
  ACTION: { one: 'action', the: 'l’action', a: 'une action', tab: 'actions', tabLabel: 'Pilotage › Actions' },
  DECISION: { one: 'décision', the: 'la décision', a: 'une décision', tab: 'decisions', tabLabel: 'Pilotage › Décisions' },
  PHASE: { one: 'phase', the: 'la phase', a: 'une phase', tab: 'referentiel', tabLabel: 'Info projet › Référentiel' },
  SUBPHASE: { one: 'sous-phase', the: 'la sous-phase', a: 'une sous-phase', tab: 'referentiel', tabLabel: 'Info projet › Référentiel' },
  WORKSTREAM: { one: 'chantier', the: 'le chantier', a: 'un chantier', tab: 'referentiel', tabLabel: 'Info projet › Référentiel' },
  MILESTONE: { one: 'jalon', the: 'le jalon', a: 'un jalon', tab: 'referentiel', tabLabel: 'Info projet › Référentiel' },
  // Livrable (09/10/2026) : sans code, désigné par son nom ; lien vers Pilotage › Livrables.
  DELIVERABLE: { one: 'livrable', the: 'le livrable', a: 'un livrable', tab: 'livrables', tabLabel: 'Pilotage › Livrables', space: 'pilotage' },
};

/** Code d'un objet modifiable par Jev (R03, P01, A-41, D-005). */
export const WRITE_CODE_RE = /\b(R\d{2,}|P\d{2,}|A-\d+|D-\d{3,})\b/gi;
export function entityOfCode(code: string): WriteEntity | null {
  if (/^R\d+$/i.test(code)) return 'RISK';
  if (/^P\d+$/i.test(code)) return 'ISSUE';
  if (/^A-\d+$/i.test(code)) return 'ACTION';
  if (/^D-\d+$/i.test(code)) return 'DECISION';
  return null;
}

/**
 * Échéance d'une action créée avec son risque (règle du commanditaire, 09/10/2026) : sans échéance propre, elle reprend
 * celle du plan de mitigation du risque. Copie unique, à la création du risque : ensuite les deux dates sont
 * indépendantes (l'échéance de l'action se modifie à la main ; changer celle du risque est sans effet sur l'action).
 */
export function linkedActionDue(actionDue: string | null | undefined, riskDue: string | null | undefined): string | null {
  return actionDue || riskDue || null;
}

/**
 * Référence citée → code de l'objet (09/10/2026). L'identifiant technique d'un objet porte le préfixe du projet quand son
 * code est déjà pris dans la base (PMS-R02 pour le risque R02 de PMS, `readableId`) : le préfixe du projet ouvert est
 * retiré (« PMS-R02 », « pms-r02 » → « R02 ») ; tout autre texte est rendu tel quel, en majuscules.
 */
export function normalizeWriteCode(ref: string, projectCode: string): string {
  const c = String(ref ?? '').trim().toUpperCase(), p = String(projectCode ?? '').trim().toUpperCase() + '-';
  return p.length > 1 && c.startsWith(p) && entityOfCode(c.slice(p.length)) ? c.slice(p.length) : c;
}

export type FieldKind = 'text' | 'scale5' | 'prio4' | 'person' | 'ws' | 'wsMulti' | 'body' | 'date' | 'enum' | 'source' | 'phase' | 'phaseMulti' | 'subphase';

export interface FieldSpec {
  key: string;
  label: string;
  kind: FieldKind;
  /** Obligatoire à la création. */
  required?: boolean;
  /** Valeurs permises (enum) : valeur API → libellé. */
  values?: Record<string, string>;
}

const STATUS = {
  RISK: { OPEN: 'Ouvert', MITIGATING: 'En mitigation', CLOSED: 'Clos' },
  ISSUE: { OPEN: 'Ouvert', RESOLVING: 'En résolution', RESOLVED: 'Résolu' },
  ACTION: { OPEN: 'À faire', IN_PROGRESS: 'En cours', BLOCKED: 'Bloquée', DONE: 'Terminée' },
  DECISION: { DRAFT: 'Brouillon', IN_REVIEW: 'En instruction', TO_ARBITRATE: 'À arbitrer', ARBITRATED: 'Arbitrée', CANCELLED: 'Annulée' },
  PLAN: { PLANNED: 'Prévue', IN_PROGRESS: 'En cours', DONE: 'Terminée' },
  WORKSTREAM: { ACTIVE: 'Actif', CLOSED: 'Clos' },
} as const;

/** Champs que Jev sait renseigner, par objet (clés de l'API métier). */
export const WRITE_FIELDS: Record<WriteEntity, FieldSpec[]> = {
  RISK: [
    { key: 'n', label: 'Libellé', kind: 'text', required: true },
    { key: 'p', label: 'Probabilité', kind: 'scale5', required: true },
    { key: 'i', label: 'Impact', kind: 'scale5', required: true },
    // Un ou plusieurs chantiers, ou tous (risque transverse), 08/10/2026.
    { key: 'wsIds', label: 'Chantiers', kind: 'wsMulti', required: true },
    { key: 'owner', label: 'Porteur', kind: 'person', required: true },
    { key: 'plan', label: 'Plan de mitigation', kind: 'text' },
    { key: 'dueIso', label: 'Échéance', kind: 'date' },
    { key: 'status', label: 'Statut', kind: 'enum', values: STATUS.RISK },
  ],
  ISSUE: [
    { key: 'n', label: 'Libellé', kind: 'text', required: true },
    { key: 'sev', label: 'Sévérité', kind: 'scale5', required: true },
    { key: 'wsId', label: 'Chantier', kind: 'ws', required: true },
    { key: 'owner', label: 'Porteur', kind: 'person', required: true },
    { key: 'detail', label: 'Détail', kind: 'text' },
    { key: 'targetIso', label: 'Résolution visée', kind: 'date' },
    { key: 'status', label: 'Statut', kind: 'enum', values: STATUS.ISSUE },
  ],
  ACTION: [
    { key: 'n', label: 'Libellé', kind: 'text', required: true },
    { key: 'wsId', label: 'Chantier', kind: 'ws', required: true },
    { key: 'owner', label: 'Porteur', kind: 'person', required: true },
    { key: 'dueIso', label: 'Échéance', kind: 'date' },
    { key: 'status', label: 'Statut', kind: 'enum', values: STATUS.ACTION },
    { key: 'prio', label: 'Priorité', kind: 'enum', values: { HIGH: 'Haute', MEDIUM: 'Moyenne', LOW: 'Basse' } },
    { key: 'detail', label: 'Détail', kind: 'text' },
    { key: 'source', label: 'Origine', kind: 'source' },
  ],
  DECISION: [
    { key: 't', label: 'Point de décision', kind: 'text', required: true },
    { key: 'p', label: 'Priorité', kind: 'prio4', required: true },
    { key: 'wsId', label: 'Chantier', kind: 'ws', required: true },
    { key: 'bodyId', label: 'Instance de décision', kind: 'body', required: true },
    { key: 'status', label: 'Statut', kind: 'enum', values: STATUS.DECISION },
    { key: 'ddIso', label: 'Date de décision', kind: 'date' },
    { key: 'decL', label: 'Texte de la décision', kind: 'text' },
    { key: 'maker', label: 'Décideur', kind: 'person' },
    { key: 'impact', label: 'Impact', kind: 'text' },
  ],
  // Référentiel (09/10/2026) : clés de l'API du Référentiel (`PhaseCreate`, `SubphaseCreate`, `WorkstreamCreate`, `MilestoneCreate`).
  PHASE: [
    { key: 'name', label: 'Nom', kind: 'text', required: true },
    { key: 'startDate', label: 'Début', kind: 'date', required: true },
    { key: 'endDate', label: 'Fin', kind: 'date', required: true },
    { key: 'ownerId', label: 'Responsable', kind: 'person', required: true },
    { key: 'status', label: 'Statut', kind: 'enum', values: STATUS.PLAN },
    { key: 'description', label: 'Description', kind: 'text' },
  ],
  SUBPHASE: [
    { key: 'phaseId', label: 'Phase', kind: 'phase', required: true },
    { key: 'name', label: 'Nom', kind: 'text', required: true },
    { key: 'startDate', label: 'Début', kind: 'date' },
    { key: 'endDate', label: 'Fin', kind: 'date' },
    { key: 'ownerId', label: 'Responsable', kind: 'person' },
    { key: 'status', label: 'Statut', kind: 'enum', values: STATUS.PLAN },
    { key: 'description', label: 'Description', kind: 'text' },
  ],
  WORKSTREAM: [
    { key: 'name', label: 'Nom', kind: 'text', required: true },
    { key: 'ownerId', label: 'Responsable', kind: 'person', required: true },
    { key: 'phaseIds', label: 'Phases', kind: 'phaseMulti' },
    { key: 'status', label: 'Statut', kind: 'enum', values: STATUS.WORKSTREAM },
    { key: 'description', label: 'Description', kind: 'text' },
  ],
  MILESTONE: [
    { key: 'n', label: 'Intitulé', kind: 'text', required: true },
    { key: 'iso', label: 'Date prévue', kind: 'date', required: true },
    { key: 'phaseId', label: 'Phase', kind: 'phase', required: true },
    { key: 'wsId', label: 'Chantier', kind: 'ws' },
    { key: 'owner', label: 'Responsable', kind: 'person' },
  ],
  DELIVERABLE: [
    { key: 'name', label: 'Nom', kind: 'text', required: true },
    { key: 'subphaseId', label: 'Sous-phase', kind: 'subphase', required: true },
    { key: 'workstreamId', label: 'Chantier', kind: 'ws' },
    { key: 'ownerId', label: 'Responsable', kind: 'person', required: true },
    { key: 'start', label: 'Début', kind: 'date' },
    { key: 'due', label: 'Fin', kind: 'date', required: true },
  ],
};
/** Objets que Jev ne modifie pas (encore) : libellé pour le message qui oriente vers le bon écran (09/10/2026). */
export const UNSUPPORTED_OBJECTS: Record<string, string> = {
  SESSION: 'les séances', SEANCE: 'les séances', PERSON: 'les personnes', PERSONNE: 'les personnes',
  TEAM: 'les équipes', EQUIPE: 'les équipes', WAVE: 'les vagues', VAGUE: 'les vagues', ROLE: 'les rôles', ASSIGNMENT: 'les affectations', AFFECTATION: 'les affectations',
  GOVERNANCE_BODY: 'les instances', INSTANCE: 'les instances', CLIENT: 'les clients', PROJECT: 'la fiche du projet', PROJET: 'la fiche du projet',
  DOCUMENT: 'les documents', TASK: 'les tâches', TACHE: 'les tâches', BAROMETER: 'le baromètre', BAROMETRE: 'le baromètre', REPORT: 'les rapports', RAPPORT: 'les rapports',
};
export const fieldSpec = (e: WriteEntity, key: string) => WRITE_FIELDS[e].find((f) => f.key === key) ?? null;

/** Échelle 1 à 5 (probabilité, impact, sévérité) : libellés et mots reconnus. */
export const SCALE5_LABEL: Record<number, string> = { 1: 'Très faible', 2: 'Faible', 3: 'Moyen', 4: 'Élevé', 5: 'Très élevé' };
/** Priorité d'une décision (1 à 4). */
export const PRIO4_LABEL: Record<number, string> = { 4: 'Critique', 3: 'Haute', 2: 'Moyenne', 1: 'Basse' };

export const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, ' ').replace(/\s+/g, ' ').trim();

const SCALE_WORDS: Array<[RegExp, number]> = [
  [/\btres faible|negligeable|minime\b/, 1], [/\btres (eleve|fort|important)|critique|majeur|maximal\b/, 5],
  [/\bfaible|bas(se)?\b/, 2], [/\bmoyen(ne)?|modere(e)?|medium\b/, 3], [/\beleve(e)?|fort(e)?|important(e)?|haut(e)?\b/, 4],
];

/**
 * Valeur d'échelle 1 à 5 : un nombre, un mot (« élevée »), ou une fourchette (« moyen à élevé », « 3-4 ») → plusieurs
 * candidats (question à choix). Sans valeur reconnue : liste vide.
 */
export function scaleCandidates(raw: unknown, max = 5): number[] {
  if (raw === null || raw === undefined || raw === '') return [];
  if (typeof raw === 'number') return Number.isInteger(raw) && raw >= 1 && raw <= max ? [raw] : [];
  const t = norm(raw);
  const nums = [...t.matchAll(/\b([1-5])\b/g)].map((m) => +m[1]).filter((n) => n <= max);
  if (nums.length) return [...new Set(nums)].sort();
  const parts = t.split(/\s+(?:a|ou|-|\/|voire)\s+|\s*[-/]\s*/).filter(Boolean);
  const found = new Set<number>();
  for (const part of parts) {
    for (const [re, v] of SCALE_WORDS) if (re.test(part)) { found.add(Math.min(v, max)); break; }
  }
  return [...found].sort();
}

/** Priorité d'une décision : nombre 1-4 ou mot. */
export function prio4Candidates(raw: unknown): number[] {
  if (typeof raw === 'number') return raw >= 1 && raw <= 4 ? [raw] : [];
  const t = norm(raw);
  const n = t.match(/\b([1-4])\b/);
  if (n) return [+n[1]];
  if (/critique|urgent/.test(t)) return [4];
  if (/haut|eleve|fort|important/.test(t)) return [3];
  if (/moyen|normal|modere/.test(t)) return [2];
  if (/bas|faible/.test(t)) return [1];
  return [];
}

/** Valeur d'une liste (statut, priorité d'action) : clé API ou libellé. */
export function enumValue(raw: unknown, values: Record<string, string>): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const t = norm(raw);
  for (const [k, l] of Object.entries(values)) if (t === norm(k) || t === norm(l)) return k;
  const words: Array<[RegExp, string[]]> = [
    [/termin|fini|fait|clotur|clos|ferm/, ['DONE', 'CLOSED', 'RESOLVED']], [/en cours|demarr|commenc/, ['IN_PROGRESS', 'RESOLVING']], [/bloqu/, ['BLOCKED']],
    [/mitig/, ['MITIGATING']], [/rouv|ouvert|a faire/, ['OPEN']], [/resolu/, ['RESOLVED']], [/arbitre/, ['ARBITRATED']], [/a arbitrer/, ['TO_ARBITRATE']],
    [/instruction|revue/, ['IN_REVIEW']], [/brouillon/, ['DRAFT']], [/annul|abandon/, ['CANCELLED']], [/haut|urgent/, ['HIGH']], [/moyen/, ['MEDIUM']], [/bas|faible/, ['LOW']],
  ];
  for (const [re, keys] of words) if (re.test(t)) { const k = keys.find((x) => x in values); if (k) return k; }
  return null;
}

/** Date : AAAA-MM-JJ, JJ/MM/AAAA ou JJ/MM (année du jour, ou suivante si la date est passée). */
export function parseDate(raw: unknown, todayIso: string): string | null {
  const t = String(raw ?? '').trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
  if (m) {
    let y = m[3] ? +m[3] : +todayIso.slice(0, 4);
    if (y < 100) y += 2000;
    const d = valid(y, +m[2], +m[1]);
    if (d && !m[3] && d < todayIso) return valid(y + 1, +m[2], +m[1]);
    return d;
  }
  return null;
}
function valid(y: number, mo: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

export interface Named { id: string; label: string; keys: string[] }

/** Correspondances d'un nom dans une liste (personnes, chantiers, instances) : exactes d'abord, puis partielles. */
export function matchNamed(raw: unknown, items: Named[]): Named[] {
  const t = norm(raw);
  if (!t) return [];
  const exact = items.filter((x) => x.keys.some((k) => norm(k) === t));
  if (exact.length) return exact;
  const words = t.split(' ').filter((w) => w.length > 1);
  return items.filter((x) => words.length && words.every((w) => x.keys.some((k) => norm(k).split(' ').some((kw) => kw.startsWith(w)))));
}

/** Date au format de l'écran. */
export const frDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

// ───────────── Brouillon ─────────────

export interface DraftOp {
  entity: WriteEntity;
  op: WriteOp;
  /** UPDATE / DELETE : objet visé. */
  code?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  /** Valeurs telles que dites par l'utilisateur (extraction du modèle), puis valeurs résolues (API métier). */
  raw: Record<string, unknown>;
  fields: Record<string, unknown>;
  /** Libellés lisibles des valeurs résolues (récapitulatif). */
  shown: Record<string, string>;
  /** Création d'un risque : actions de mitigation proposées comme actions liées. */
  linked?: Array<{ n: string; owner?: string | null; dueIso?: string | null }>;
}
export interface DraftQuestion {
  op: number;
  field: string;
  text: string;
  options: Array<{ label: string; value: string | number | null }>;
  /** Réponse libre possible (saisie dans le champ de Jev). */
  free?: boolean;
  /** Choix multiple (chantiers d'un risque) : pastilles à cocher, puis « Valider la sélection ». */
  multi?: boolean;
  /** Choix direct supplémentaire en mode multiple (« Tous les chantiers »). */
  extra?: Array<{ label: string; value: string }>;
}
export interface WriteDraft {
  ops: DraftOp[];
  question: DraftQuestion | null;
  /** Questions déjà posées (garde-fou : au-delà, la demande est abandonnée). */
  asked: number;
}
/** Questions au plus pour une même demande. */
export const WRITE_MAX_QUESTIONS = 8;
/** Options d'une question à choix au plus. */
export const WRITE_MAX_OPTIONS = 6;

// ───────────── Extraction par le modèle ─────────────

/** Consignes de l'étape « extraire la demande » (partie stable, mise en cache). */
export const WRITE_EXTRACT_RULES = [
  '## Extraire une demande de modification',
  'L’utilisateur demande de créer, modifier ou supprimer un enregistrement du projet : risque (RISK), problème (ISSUE), action (ACTION), décision (DECISION), ou, dans le Référentiel, phase (PHASE), sous-phase (SUBPHASE), chantier (WORKSTREAM), jalon (MILESTONE) ou livrable (DELIVERABLE). Ta seule tâche : extraire sa demande telle qu’il l’a formulée. Le serveur vérifiera chaque valeur, posera les questions nécessaires et demandera sa confirmation : tu n’écris rien, tu ne poses aucune question, tu n’inventes aucune valeur.',
  '',
  'Champs par objet (clé : signification) :',
  '- RISK : n (libellé), p (probabilité 1 à 5), i (impact 1 à 5), wsIds (chantiers concernés : un ou plusieurs codes ou noms séparés par des virgules, ou « tous » pour un risque transverse), owner (porteur), plan (plan de mitigation), dueIso (échéance), status (Ouvert, En mitigation, Clos).',
  '- ISSUE : n (libellé), sev (sévérité 1 à 5), wsId, owner, detail, targetIso (résolution visée), status (Ouvert, En résolution, Résolu).',
  '- ACTION : n (libellé), wsId, owner, dueIso, status (À faire, En cours, Bloquée, Terminée), prio (Haute, Moyenne, Basse), detail, source (code de l’objet d’origine : R03, P02, D-005).',
  '- PHASE : name (nom), startDate, endDate, ownerId (responsable), status (Prévue, En cours, Terminée), description.',
  '- SUBPHASE : phaseId (phase : numéro ou nom), name, startDate, endDate, ownerId, status (Prévue, En cours, Terminée), description.',
  '- WORKSTREAM : name (nom du chantier), ownerId (responsable), phaseIds (phases : numéros ou noms séparés par des virgules), status (Actif, Clos), description.',
  '- MILESTONE : n (intitulé du jalon), iso (date prévue), phaseId (phase), wsId (chantier, ou « transverse »), owner (responsable).',
  '- DELIVERABLE (livrable) : name (nom), subphaseId (sous-phase : code ou nom), workstreamId (chantier, ou « aucun »), ownerId (responsable), start (début), due (fin).',
  '- DECISION : t (point de décision), p (priorité : Critique, Haute, Moyenne, Basse), wsId, bodyId (instance de décision : COPIL…), status (Brouillon, En instruction, À arbitrer, Arbitrée, Annulée), ddIso (date de décision), decL (texte de la décision), maker (décideur), impact.',
  '',
  'Règles :',
  '- Recopie les valeurs avec les mots de l’utilisateur (« Élevée », « moyen à élevé », « Karim », « Finance ») : ne les convertis pas, sauf les dates.',
  '- Dates : convertis-les en AAAA-MM-JJ d’après la date du jour (« vendredi », « fin du mois », « 15 novembre ») ; si la date n’est pas déterminable, recopie-la telle quelle.',
  '- « moi », « je » pour un porteur : écris « moi ».',
  '- Modification ou suppression : indique le code de l’objet visé (R03, A-41…) s’il est cité ou s’il ressort de la conversation ; sinon, null. Phase, sous-phase, chantier ou jalon : son code (5, 2.3, C4, J03) ou, à défaut, son nom tel que l’utilisateur l’écrit (« 5. Ancrer le changement ») ; livrable : son nom tel qu’il est écrit (« Note de cadrage »).',
  '- Autre objet (séance, personne, équipe, document, tâche…) : renvoie quand même l’opération avec son type en majuscules (SESSION, PERSON, TEAM, DOCUMENT, TASK…), sans champs.',
  '- Création d’un risque : regroupe dans « plan » la description, les impacts possibles et les actions de mitigation (texte complet, en phrases ou en liste) ; liste aussi chaque action de mitigation dans « actions_liees » (n, et owner / dueIso s’ils sont donnés).',
  '- Si une « Modification en cours » est fournie, la demande la complète ou la corrige : renvoie la modification complète mise à jour (mêmes opérations, valeurs corrigées ou ajoutées).',
  '- Plusieurs enregistrements demandés : une opération par enregistrement, dans l’ordre de la demande.',
  '',
  'Réponds uniquement par un objet JSON, sans texte autour :',
  '{"operations": [{"objet": "RISK", "operation": "CREATE", "code": null, "champs": {"n": "…", "p": "…", "i": "…", "wsIds": "…", "owner": "…", "plan": "…"}, "actions_liees": [{"n": "…"}]}]}',
  'Si la demande ne vise aucune création, modification ou suppression : {"operations": []}',
].join('\n');

export interface ExtractedOp { entity: WriteEntity; op: WriteOp; code: string | null; fields: Record<string, unknown>; linked: Array<{ n: string; owner?: string | null; dueIso?: string | null }> }

/** Objets demandés que Jev ne modifie pas (09/10/2026) : type et opération, pour orienter l'utilisateur. */
export function unsupportedRequests(raw: string): Array<{ objet: string; op: WriteOp }> {
  const m = String(raw || '').match(/\{[\s\S]*\}/);
  if (!m) return [];
  let j: any;
  try { j = JSON.parse(m[0]); } catch { return []; }
  return (Array.isArray(j?.operations) ? j.operations : [])
    .map((o: any) => ({ objet: norm(o?.objet ?? '').toUpperCase().replace(/\s+/g, '_'), op: String(o?.operation ?? '').toUpperCase() as WriteOp }))
    .filter((o: { objet: string; op: WriteOp }) => o.objet && !WRITE_FIELDS[o.objet as WriteEntity] && ['CREATE', 'UPDATE', 'DELETE'].includes(o.op));
}

/** Message pour un objet que Jev ne modifie pas : quoi faire à la place (09/10/2026). */
export function unsupportedReply(list: Array<{ objet: string; op: WriteOp }>): string {
  const o = list[0], what = UNSUPPORTED_OBJECTS[o.objet] ?? 'cet objet';
  const verb = o.op === 'CREATE' ? 'créer' : o.op === 'DELETE' ? 'supprimer' : 'modifier';
  return `Je ne sais pas encore ${verb} ${what}. Passez par l’écran concerné (le Référentiel, dans Info projet, pour les données du projet). Je peux créer, modifier ou supprimer les risques, problèmes, actions, décisions, phases, sous-phases, chantiers, jalons et livrables.`;
}

/** Lecture de l'extraction : objets et opérations connus seulement, champs du catalogue seulement. */
export function parseExtraction(raw: string): ExtractedOp[] {
  const m = String(raw || '').match(/\{[\s\S]*\}/);
  if (!m) return [];
  let j: any;
  try {
    j = JSON.parse(m[0]);
  } catch {
    return [];
  }
  const out: ExtractedOp[] = [];
  for (const o of Array.isArray(j?.operations) ? j.operations : []) {
    const entity = String(o?.objet ?? '').toUpperCase() as WriteEntity;
    const op = String(o?.operation ?? '').toUpperCase() as WriteOp;
    if (!WRITE_FIELDS[entity] || !['CREATE', 'UPDATE', 'DELETE'].includes(op)) continue;
    const keys = new Set(WRITE_FIELDS[entity].map((f) => f.key));
    // Risque : « wsId » (chantier) lu comme liste de chantiers « wsIds » (08/10/2026).
    const fields = Object.fromEntries(Object.entries(o?.champs ?? {}).map(([k, v]) => [entity === 'RISK' && k === 'wsId' ? 'wsIds' : k, v] as [string, unknown]).filter(([k, v]) => keys.has(k) && v !== null && v !== undefined && v !== ''));
    const linked = entity === 'RISK' && op === 'CREATE' && Array.isArray(o?.actions_liees)
      ? o.actions_liees.filter((a: any) => a && typeof a.n === 'string' && a.n.trim()).slice(0, 8).map((a: any) => ({ n: String(a.n).trim().slice(0, 1000), owner: a.owner ?? null, dueIso: a.dueIso ?? null }))
      : [];
    // Objet du Référentiel : référence gardée telle quelle (code ou nom, « 5. Ancrer le changement »).
    const code = typeof o?.code === 'string' && o.code.trim() ? (isRefEntity(entity) ? o.code.trim() : o.code.trim().toUpperCase()) : typeof o?.code === 'number' ? String(o.code) : null;
    out.push({ entity, op, code, fields, linked });
  }
  return out.slice(0, 5);
}

// ───────────── Messages ─────────────

/** Ligne du récapitulatif : « Libellé : valeur ». */
export function recapLines(d: DraftOp): string[] {
  const specs = WRITE_FIELDS[d.entity];
  return specs.filter((f) => d.shown[f.key] !== undefined).map((f) => `${f.label} : ${d.shown[f.key]}`);
}

/** Résumé d'une opération (une ligne). */
export function opTitle(d: DraftOp): string {
  const L = WRITE_ENTITY_LABEL[d.entity];
  if (d.op === 'CREATE') return `Créer ${L.a}`;
  if (d.op === 'DELETE') return `Supprimer ${L.the} ${d.code}`;
  return `Modifier ${L.the} ${d.code}`;
}

export const WRITE_RECAP_REPLY = (n: number, del: boolean) =>
  `Voici ${n > 1 ? 'les enregistrements' : 'l’enregistrement'} tel${n > 1 ? 's' : ''} qu’${n > 1 ? 'ils seront écrits' : 'il sera écrit'}. Rien n’est enregistré avant votre validation (« Valider et enregistrer » ou « Refuser »).${del ? ' Une suppression est définitive : retapez le code de l’objet pour la confirmer.' : ''}`;
export const WRITE_NOTHING_REPLY = 'Je n’ai pas identifié de modification à faire sur un risque, un problème, une action, une décision, une phase, une sous-phase, un chantier, un jalon ou un livrable. Précisez l’objet (par exemple R03, A-41 ou la phase 5), l’opération (créer, modifier, supprimer) et les valeurs.';
/** Objet du Référentiel : réservé au PMO (09/10/2026). */
export const REF_PMO_ONLY_REPLY = 'Le Référentiel (phases, sous-phases, chantiers, jalons, livrables) est modifiable par le PMO uniquement.';
export const WRITE_CANCELLED_REPLY = 'Demande annulée : rien n’a été enregistré.';
export const WRITE_TOO_MANY_REPLY = 'Je n’arrive pas à compléter cette demande : rien n’a été enregistré. Reformulez-la en une phrase complète, ou saisissez l’enregistrement avec « Saisir sans Jev ».';
/** Libellé du choix « annuler la demande », proposé avec chaque question. */
export const WRITE_CANCEL_LABEL = 'Annuler la demande';

/** Valeur « Tous les chantiers » d'un choix de chantiers (risque transverse). */
export const WS_ALL_VALUE = '__ALL__';
export const WS_ALL_LABEL = 'Tous les chantiers (transverse)';
export const WS_MULTI_SUBMIT_LABEL = 'Valider la sélection';
/** Réponse libre « tous », « transverse »… : tous les chantiers. */
export const WS_ALL_RE = /^\s*(tous|toutes|tout le projet|transverse|l['’]ensemble)\b/i;
