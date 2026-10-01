/**
 * Aiguillage des questions posées à Jev dans le Cockpit (brief « Aiguillage des questions dans l'assistant JEV
 * (application Cockpit) », 01/10/2026) : règles pures, sans réseau. Cinq cas d'usage, chacun avec son modèle (fonction
 * d'IA) et son skill :
 *   1. INSIGHT — données du projet (tables du Cockpit) → fonction Insights, skill « Insights » ;
 *   2. GUIDE — utilisation de l'application (guide utilisateur du Cockpit) → fonction Guidage, skill « Guidage Cockpit » ;
 *   3. MODIFICATION — créer, modifier, supprimer un enregistrement → fonction Gestion des données, skill du même nom ;
 *   4. DOCUMENTS — 4a contenu des documents de la Base de connaissance, 4b données enrichies par les documents →
 *      fonction Documents / Synthèse, skill « Analyser un document » ;
 *   5. CLARIFICATION — ambigu, hors périmètre ou confiance insuffisante (cas par défaut) → fonction Guidage.
 * La classification est faite par l'API TypeSafe de la carte « JEV » du Registre (question « choice » + deux questions
 * oui / non « noul » : demande d'écriture, plusieurs demandes), dans le même appel.
 */
import type { AiFunctionId } from '../core/llm.service';

/** Cas d'usage retenu (4 se décline en 4a / 4b). */
export type CockpitCase = '1' | '2' | '3' | '4a' | '4b' | '5';
/** Options de la question Choice (identifiants vus par le modèle). */
export type CockpitChoice = 'donnees' | 'guide' | 'modification' | 'document' | 'donnees_et_documents' | 'clarification' | 'hors_sujet';

export const COCKPIT_CHOICE_TO_CASE: Record<CockpitChoice, CockpitCase> = {
  donnees: '1', guide: '2', modification: '3', document: '4a', donnees_et_documents: '4b', clarification: '5', hors_sujet: '5',
};
export const COCKPIT_CASES: CockpitCase[] = ['1', '2', '3', '4a', '4b', '5'];
export const COCKPIT_CASE_LABEL: Record<CockpitCase, string> = {
  '1': 'Insight Cockpit', '2': 'Guide utilisateur', '3': 'Modification des données', '4a': 'Documents', '4b': 'Données + documents', '5': 'Clarification',
};

/** Modèle (fonction d'IA) et skill de chaque cas (brief, § Cas 1 à 5). */
export const COCKPIT_CASE_ROUTE: Record<CockpitCase, { functionId: AiFunctionId; skill: string | null }> = {
  '1': { functionId: 'insights', skill: 'Insights' },
  '2': { functionId: 'guidage', skill: 'Guidage Cockpit' },
  '3': { functionId: 'crud', skill: 'Gestion des données' },
  '4a': { functionId: 'doc_syn', skill: 'Analyser un document' },
  '4b': { functionId: 'doc_syn', skill: 'Analyser un document' },
  '5': { functionId: 'guidage', skill: null },
};

/** Seuil général : en deçà, la question part en clarification (cas 5). */
export const COCKPIT_ROUTER_MIN_CONFIDENCE = 0.45;
/**
 * Seuil propre au cas 3 (écriture) : plus exigeant, pour qu'aucune question de lecture ne soit traitée comme une
 * modification (objectif du brief : 0 % de lecture classée en modification). En deçà : clarification.
 */
export const COCKPIT_ROUTER_WRITE_MIN_CONFIDENCE = 0.75;
/** Garde-fou : la question oui / non « demande d'écriture » doit aussi le confirmer pour retenir le cas 3. */
export const COCKPIT_ROUTER_WRITE_NOUL_MIN = 0.5;
/** Au-dessus : le message contient plusieurs demandes (traitées dans l'ordre, ou question à l'utilisateur). */
export const COCKPIT_ROUTER_MULTI_NOUL_MIN = 0.6;
/** Questions précédentes transmises pour les questions de suite. */
export const COCKPIT_ROUTER_HISTORY_TURNS = 3;
/** Identifiants des questions de la requête (choisis par nous). */
export const COCKPIT_Q_CASE = 'cas_usage';
export const COCKPIT_Q_WRITE = 'demande_ecriture';
export const COCKPIT_Q_MULTI = 'plusieurs_demandes';

/** Périmètre du Cockpit, donné au modèle comme contexte. */
export const COCKPIT_ROUTER_SCOPE = 'RISE Cockpit, the project-steering application used by project teams (PMO, workstream leads, readers). Its records: risks, issues, actions, decisions and arbitration sheets, milestones, deliverables, planning (phases, sub-phases, workstreams called « chantiers », progress), steering committees (instances such as COPIL, sessions, generated reports), team barometer, budget, people, teams and roles. Its knowledge base stores the project documents (presentations, minutes, reports, contracts, deliverables). The assistant can answer from the records, from the user guide, from the documents, and can create, update or delete records after the user confirms.';

/**
 * Versions des consignes (le rapport de test compare les versions). Les exemples ne reprennent jamais les questions du
 * jeu de test (`test/fixtures/jev-routage-cockpit.json`). Consignes en anglais (langue d'entraînement principale de
 * Jev ; leçon du banc de la Console), questions posées en français.
 */
const V2 = {
  instructions: 'Which kind of help does the latest message ask the RISE Cockpit assistant for? Use previous questions to interpret a short follow-up. If the message contains several requests, classify the one stated first.',
  criteria: {
    donnees: {
      covers: 'The answer must be read from the project’s current records: count, list, find, compare or check risks, issues, actions, decisions, milestones, deliverables, planning and progress of workstreams, committee sessions and dates, budget, barometer, people and their roles.',
      not_for: 'How to use the application; requests to create, change or delete a record; what a document, presentation or minutes say.',
      examples: ['Combien d’actions sont bloquées ?', 'Qui est responsable du chantier Interfaces ?', 'Quelles décisions attendent un arbitrage ?'],
    },
    guide: {
      covers: 'How the Cockpit works or how the user can do something themselves: steps, where a page or setting is, what a screen, field, indicator or status means, product rules, permissions, who to contact. The answer would be the same for any project.',
      not_for: 'Questions about the current records; asking the assistant to make the change itself.',
      examples: ['Comment ajouter une séance au calendrier des comités ?', 'Que signifie le badge « manuel » sur un livrable ?', 'Qui peut modifier le référentiel ?'],
    },
    modification: {
      covers: 'The user asks the assistant itself to create, add, record, update, change, close, reopen, postpone, reassign or delete a record now (an order or a request to act), possibly giving the record’s content.',
      not_for: 'Asking how to do it themselves (guide); asking to read, list or check records (donnees); hypothetical questions.',
      examples: ['Passe l’action A-07 au statut terminé.', 'Crée un problème de sévérité 4 sur le chantier Ventes : retard de livraison des données clients.', 'Supprime le risque R09.'],
    },
    document: {
      covers: 'The answer is in the content of one or more project documents of the knowledge base: presentations, committee decks, minutes, reports, contracts, deliverables. What a document says, its outline, a summary, what was presented or decided in a given meeting, including documents designated indirectly (the last committee deck, the kick-off presentation).',
      not_for: 'Current records of the application (donnees); how to upload or manage documents (guide).',
      examples: ['Résume le compte rendu du comité de chantier de mars.', 'Que dit le contrat sur les pénalités de retard ?'],
    },
    donnees_et_documents: {
      covers: 'The question needs the current records AND what project documents say about them: compare the current state with what a document announced, or explain current records with context written in documents.',
      not_for: 'Questions answered by the records alone, or by documents alone.',
      examples: ['Les actions décidées au dernier comité projet sont-elles terminées ?', 'Le budget actuel est-il conforme à celui présenté dans le support de lancement ?'],
    },
    clarification: {
      covers: 'Too short, too vague or ambiguous to know which of the above is wanted, or it refers to something the assistant cannot identify (« fais-le », « et lui ? » without context).',
      examples: ['livrables ?', 'Tu peux vérifier ce truc ?'],
    },
    hors_sujet: {
      covers: 'Unrelated to the Cockpit or the project: general knowledge, personal tasks, creative writing, chit-chat, other software.',
      examples: ['Quel est le cours de l’euro ?', 'Raconte-moi une blague'],
    },
  },
  nouls: {
    [COCKPIT_Q_WRITE]: 'The latest message asks the assistant itself to create, change or delete a record of the project now (not a question about records, not a question about how to do it).',
    [COCKPIT_Q_MULTI]: 'The latest message contains two or more distinct requests (for example a question and an order to change data, or two unrelated questions).',
  },
  
} as const;

export const COCKPIT_ROUTER_PROMPTS = {
  'cockpit-v2': V2,
  // v3 (après analyse de v2) : « noter / consigner qu'un fait a eu lieu » est une écriture ; 4b couvre explicitement
  // « ce qui avait été annoncé, prévu ou décidé dans une présentation ou une séance passée tient-il encore ? ».
  'cockpit-v3': {
    instructions: V2.instructions,
    nouls: V2.nouls,
    criteria: {
      donnees: { ...V2.criteria.donnees, not_for: 'How to use the application; requests to create, change or delete a record; what a document, presentation or minutes say; whether something announced in a past presentation or meeting still holds (that also needs documents).' },
      guide: V2.criteria.guide,
      modification: {
        covers: 'The user asks the assistant itself to create, add, record, update, change, close, reopen, postpone, reassign or delete a record now (an order or a request to act), possibly giving the record’s content. Includes asking to note, log or record that something happened (a decision was taken, an action is done), which means updating the matching record.',
        not_for: V2.criteria.modification.not_for,
        examples: [...V2.criteria.modification.examples, 'Consigne que le problème P07 est résolu depuis hier.'],
      },
      document: V2.criteria.document,
      donnees_et_documents: {
        covers: 'The question needs the current records AND what project documents say about them: compare the current state with what a document, a past presentation or a past meeting announced, planned or decided (is it still on track, was it done, does it still hold), or explain current records with context written in documents.',
        not_for: V2.criteria.donnees_et_documents.not_for,
        examples: [...V2.criteria.donnees_et_documents.examples, 'Les dates promises dans la proposition de l’intégrateur sont-elles respectées ?'],
      },
      clarification: V2.criteria.clarification,
      hors_sujet: V2.criteria.hors_sujet,
    },
  },
} as const;
export type CockpitRouterVersion = keyof typeof COCKPIT_ROUTER_PROMPTS;
/** Version en service (choisie d'après le rapport de test). */
export const COCKPIT_ROUTER_VERSION: CockpitRouterVersion = 'cockpit-v3';

export interface CockpitRouterTurn { question: string; cas?: CockpitCase | null }

/** Corps de la requête TypeSafe (POST /v1/systemone). `model` vient de la carte du Registre. */
export function buildCockpitRouterRequest(question: string, opts: { model: string; history?: CockpitRouterTurn[]; page?: string | null; version?: CockpitRouterVersion }) {
  const p = COCKPIT_ROUTER_PROMPTS[opts.version ?? COCKPIT_ROUTER_VERSION];
  const history = (opts.history ?? []).slice(-COCKPIT_ROUTER_HISTORY_TURNS);
  return {
    model: opts.model,
    state: {
      assistant_scope: COCKPIT_ROUTER_SCOPE,
      ...(opts.page ? { open_page: opts.page } : {}),
      ...(history.length ? { previous_questions: history.map((h) => h.question) } : {}),
      latest_question: question,
    },
    questions: {
      [COCKPIT_Q_CASE]: { type: 'choice', instructions: p.instructions, criteria: p.criteria },
      ...Object.fromEntries(Object.entries(p.nouls).map(([id, instructions]) => [id, { type: 'noul', instructions }])),
    },
  };
}

export interface CockpitRouteDecision {
  cas: CockpitCase;
  confiance: number;
  /** Option retenue par le modèle (avant les seuils) et distribution complète. */
  choice: CockpitChoice | null;
  probabilities: Partial<Record<CockpitChoice, number>>;
  /** Probabilités des deux questions oui / non (null si absentes). */
  ecriture: number | null;
  multi: boolean;
  multiScore: number | null;
  /** Cas renvoyé en clarification par un seuil (motif lisible), sinon null. */
  downgrade: string | null;
  justification: string;
}

export class CockpitRouterResponseError extends Error {}

/**
 * Lecture de la réponse et règles de décision :
 * - modification retenue seulement si confiance ≥ seuil d'écriture ET « demande d'écriture » ≥ son seuil ; sinon cas 5 ;
 * - autres cas sous le seuil général → cas 5, sauf hors sujet très probable ;
 * - plusieurs demandes : signalé (`multi`), le cas retenu est celui de la première demande.
 */
export function parseCockpitRouterResponse(raw: unknown): CockpitRouteDecision {
  const ans = (raw as any)?.answers ?? {};
  const a = ans[COCKPIT_Q_CASE];
  const choice = a?.choice as CockpitChoice | undefined;
  const conf = Number(a?.confidence);
  if (!a || !choice || !(choice in COCKPIT_CHOICE_TO_CASE) || !Number.isFinite(conf)) throw new CockpitRouterResponseError('Réponse de classification illisible');
  const probabilities = Object.fromEntries(Object.entries(a.probabilities ?? {}).filter(([k, v]) => k in COCKPIT_CHOICE_TO_CASE && typeof v === 'number')) as Partial<Record<CockpitChoice, number>>;
  const num = (x: unknown) => (Number.isFinite(Number(x)) && x !== null && x !== undefined ? Number(x) : null);
  const ecriture = num(ans[COCKPIT_Q_WRITE]?.noul), multiScore = num(ans[COCKPIT_Q_MULTI]?.noul);
  let cas = COCKPIT_CHOICE_TO_CASE[choice];
  let downgrade: string | null = null;
  if (choice === 'modification') {
    if (conf < COCKPIT_ROUTER_WRITE_MIN_CONFIDENCE) downgrade = `modification à ${conf.toFixed(2)}, sous le seuil d’écriture ${COCKPIT_ROUTER_WRITE_MIN_CONFIDENCE}`;
    else if (ecriture !== null && ecriture < COCKPIT_ROUTER_WRITE_NOUL_MIN) downgrade = `demande d’écriture non confirmée (${ecriture.toFixed(2)})`;
  } else if (cas !== '5' && conf < COCKPIT_ROUTER_MIN_CONFIDENCE) downgrade = `confiance ${conf.toFixed(2)} sous le seuil ${COCKPIT_ROUTER_MIN_CONFIDENCE}`;
  if (downgrade) cas = '5';
  const multi = multiScore !== null && multiScore >= COCKPIT_ROUTER_MULTI_NOUL_MIN;
  const dist = (Object.keys(COCKPIT_CHOICE_TO_CASE) as CockpitChoice[]).filter((k) => (probabilities[k] ?? 0) >= 0.01).map((k) => `${k} ${Math.round((probabilities[k] ?? 0) * 100)} %`).join(' · ');
  const extras = [ecriture !== null ? `écriture ${ecriture.toFixed(2)}` : '', multiScore !== null ? `plusieurs demandes ${multiScore.toFixed(2)}` : ''].filter(Boolean).join(', ');
  return {
    cas, confiance: Math.round(conf * 1000) / 1000, choice, probabilities, ecriture, multi, multiScore, downgrade,
    justification: `${choice} retenu (confiance ${conf.toFixed(2)}${extras ? ' ; ' + extras : ''})${downgrade ? ` → clarification : ${downgrade}` : ''} — ${dist}`,
  };
}
