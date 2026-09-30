/**
 * Aiguillage des questions posées à Jev dans la Console (décision du 30/09/2026) : règles pures, sans réseau.
 * La classification est faite par l'API TypeSafe (modèle « Jev », System One), paramétrée dans le Registre des cartes
 * API : une question de type « Choice » évaluée sur un « state » (question, questions précédentes, page ouverte).
 * Réponse exploitable : { type: USAGE | DONNEES | AMBIGU | HORS_SUJET, confiance 0-1, justification }.
 */

export type RouteType = 'USAGE' | 'DONNEES' | 'AMBIGU' | 'HORS_SUJET';
/** Options de la question Choice (identifiants envoyés au modèle). */
export type RouterChoice = 'usage' | 'donnees' | 'mixte' | 'hors_sujet';

export interface RouteDecision {
  type: RouteType;
  confiance: number;
  justification: string;
  /** Option retenue par le modèle et distribution complète (analyse des erreurs). */
  choice: RouterChoice | null;
  probabilities: Partial<Record<RouterChoice, number>>;
}

/** Question précédente de la conversation (questions de suite). */
export interface RouterTurn { question: string; type?: RouteType | null }

/** Carte du Registre utilisée pour la classification (identifiant ; surcharge possible par JEV_ROUTER_CARD). */
export const JEV_ROUTER_CARD = 'jev';
/** En deçà de cette confiance, la question est traitée comme ambiguë (les deux traitements). */
export const ROUTER_MIN_CONFIDENCE = 0.5;
/** Questions précédentes transmises pour les questions de suite. */
export const ROUTER_HISTORY_TURNS = 3;
/** Identifiant de la question dans la requête (choisi par nous, jamais vu par le modèle). */
export const ROUTER_QUESTION_ID = 'type_question';

/** Réponse polie hors périmètre (sans appel au modèle de rédaction). */
export const OFF_TOPIC_REPLY = 'Je réponds aux questions sur la Console d’administration RISE : son fonctionnement (où trouver un réglage, comment faire, quelles règles s’appliquent) et ses données (comptes, droits, IA et coûts, projets, snapshots, notifications, modules, cartes API). Votre question sort de ce périmètre : pouvez-vous la reformuler en lien avec la Console ?';

const CHOICE_TO_TYPE: Record<RouterChoice, RouteType> = { usage: 'USAGE', donnees: 'DONNEES', mixte: 'AMBIGU', hors_sujet: 'HORS_SUJET' };
const LABEL: Record<RouterChoice, string> = { usage: 'usage', donnees: 'données', mixte: 'mixte', hors_sujet: 'hors sujet' };

/** Périmètre de la Console, donné au modèle comme contexte. */
const CONSOLE_SCOPE = 'Console d’administration de RISE, plateforme de pilotage de projets : comptes et droits (utilisateurs, invitations, administrateurs, habilitations PMO / Responsable / Lecteur), journal d’audit, IA (fournisseurs, clés API, modèles, affectation principal / secours, plafonds et consommation, journal des appels), assistant Jev (persona, skills), projets (bibliothèque, initialisation par fichier Excel, snapshots), modules, registre des cartes API, notifications envoyées aux utilisateurs, serveur d’envoi SMTP, guide utilisateur.';

/**
 * Versions des consignes de classification (le rapport de test compare les versions). `v1` : critères courts en
 * français. Les exemples éventuels d'une version ne reprennent jamais les questions du jeu de test.
 */
export const ROUTER_PROMPTS = {
  v1: {
    instructions: 'Quel est le type de la question posée par l’administrateur à l’assistant de la Console ?',
    criteria: {
      usage: 'Question sur le fonctionnement ou l’utilisation de la Console : comment faire, où trouver, à quoi sert, quelles règles s’appliquent.',
      donnees: 'Question sur des informations contenues dans les données de la Console : compter, lister, retrouver, vérifier un état actuel.',
      mixte: 'Question qui mêle fonctionnement et données, ou trop vague pour savoir laquelle des deux est demandée.',
      hors_sujet: 'Question sans rapport avec la Console d’administration.',
    },
  },
  // v2 (après analyse de v1) : consignes en anglais (langue d'entraînement principale de Jev), critère discriminant
  // explicite (la réponse dépend-elle des enregistrements actuels ?), options structurées. Exemples volontairement
  // différents des questions du jeu de test.
  v2: {
    instructions: 'Does answering the latest question require explaining how the admin console works, reading the platform’s current records, both, or neither? Use previous questions to interpret a short follow-up.',
    criteria: {
      usage: {
        covers: 'How the console works or how to use it: steps to do something, where a page or setting is, what a screen, field or status means, fixed rules of the product (durations, limits, what is allowed). The answer would be the same on any installation, whatever the current records.',
        not_for: 'Questions about who, which, how many or what state for the current accounts, projects, settings or history of this platform.',
        examples: ['Comment changer mon mot de passe ?', 'À quoi sert le journal des appels ?', 'Combien de caractères au minimum pour un mot de passe ?'],
      },
      donnees: {
        covers: 'The answer must be read from this platform’s current records or configuration: count, list, find, sum or check accounts, roles and rights, assigned models, active rules, API cards, projects, snapshots, AI spending, sessions, audit entries.',
        not_for: 'How-to questions or explanations of a feature.',
        examples: ['Quels comptes ont le profil Lecteur ?', 'Quelle dimension utilise la vectorisation ?', 'Combien d’extraits contient le guide indexé ?'],
      },
      mixte: {
        covers: 'The question needs both: an explanation of how the console works AND a check of current records (for example why a specific item of theirs is in a given state, or a how-to combined with a which/how-many request), or it is too short or vague to tell which one is asked.',
        examples: ['Pourquoi ce compte ne reçoit-il pas les e-mails ?', 'Comment ajouter un modèle et lesquels sont déjà actifs ?', 'snapshots ?'],
      },
      hors_sujet: {
        covers: 'Unrelated to the admin console or the RISE platform: general knowledge, creative writing, chit-chat, other software.',
        examples: ['Quel temps fera-t-il demain ?', 'Traduis ce texte en espagnol'],
      },
    },
  },
  // v3 : v2 + deux questions atomiques oui / non (« noul ») posées dans le même appel ; si les deux besoins sont
  // présents (fonctionnement ET données), la question est mixte (AMBIGU), quel que soit le choix principal.
  v3: {
    get instructions() { return ROUTER_V2.instructions; },
    get criteria() { return ROUTER_V2.criteria; },
    nouls: {
      besoin_fonctionnement: 'The latest question asks how to do something in the admin console, or how a feature, page or rule of the console works.',
      besoin_donnees: 'The latest question asks for information that must be read from this platform’s current records: who, which, how many, or the current state of a specific item.',
    },
  },
} as const;
export type RouterPromptVersion = keyof typeof ROUTER_PROMPTS;
const ROUTER_V2 = ROUTER_PROMPTS.v2;
/** Seuil des deux questions oui / non de v3 : au-dessus pour les deux, la question est mixte. */
export const ROUTER_MIXED_NOUL_MIN = 0.6;

/** Version en service (choisie d'après le rapport de test). */
export const ROUTER_PROMPT_VERSION: RouterPromptVersion = 'v2';

/** Corps de la requête TypeSafe (POST /v1/systemone). `model` vient de la carte du Registre. */
export function buildRouterRequest(question: string, opts: { model: string; history?: RouterTurn[]; page?: string | null; version?: RouterPromptVersion }) {
  const p: { instructions: string; criteria: unknown; nouls?: Record<string, string> } = ROUTER_PROMPTS[opts.version ?? ROUTER_PROMPT_VERSION];
  const history = (opts.history ?? []).slice(-ROUTER_HISTORY_TURNS);
  return {
    model: opts.model,
    state: {
      assistant_scope: CONSOLE_SCOPE,
      ...(opts.page ? { open_page: opts.page } : {}),
      ...(history.length ? { previous_questions: history.map((h) => h.question) } : {}),
      latest_question: question,
    },
    questions: {
      [ROUTER_QUESTION_ID]: { type: 'choice', instructions: p.instructions, criteria: p.criteria },
      ...Object.fromEntries(Object.entries(p.nouls ?? {}).map(([id, instructions]) => [id, { type: 'noul', instructions }])),
    },
  };
}

/** Réponse illisible de l'API (format inattendu). */
export class RouterResponseError extends Error {}

/**
 * Lecture de la réponse : option retenue et confiance. `mixte` → AMBIGU ; confiance sous le seuil → AMBIGU (les deux
 * traitements), sauf hors sujet très probable. Justification : distribution des probabilités, lisible.
 */
export function parseRouterResponse(raw: unknown, minConfidence = ROUTER_MIN_CONFIDENCE): RouteDecision {
  const a = (raw as any)?.answers?.[ROUTER_QUESTION_ID];
  const choice = a?.choice as RouterChoice | undefined;
  const conf = Number(a?.confidence);
  if (!a || !choice || !(choice in CHOICE_TO_TYPE) || !Number.isFinite(conf)) throw new RouterResponseError('Réponse de classification illisible');
  const probabilities = Object.fromEntries(Object.entries(a.probabilities ?? {}).filter(([k, v]) => k in CHOICE_TO_TYPE && typeof v === 'number')) as Partial<Record<RouterChoice, number>>;
  let type = CHOICE_TO_TYPE[choice];
  // v3 : besoins « fonctionnement » et « données » tous deux présents → mixte.
  const nf = Number((raw as any)?.answers?.besoin_fonctionnement?.noul), nd = Number((raw as any)?.answers?.besoin_donnees?.noul);
  const both = Number.isFinite(nf) && Number.isFinite(nd) && nf >= ROUTER_MIXED_NOUL_MIN && nd >= ROUTER_MIXED_NOUL_MIN && (type === 'USAGE' || type === 'DONNEES');
  if (both) type = 'AMBIGU';
  const offTopicSure = choice === 'hors_sujet' && (probabilities.hors_sujet ?? conf) >= 0.6;
  if (conf < minConfidence && !offTopicSure && type !== 'AMBIGU') type = 'AMBIGU';
  const dist = (Object.keys(CHOICE_TO_TYPE) as RouterChoice[]).map((k) => `${LABEL[k]} ${Math.round((probabilities[k] ?? 0) * 100)} %`).join(' · ');
  const needs = Number.isFinite(nf) && Number.isFinite(nd) ? ` ; besoins : fonctionnement ${nf.toFixed(2)}, données ${nd.toFixed(2)}` : '';
  const why = both ? `fonctionnement et données demandés tous deux${needs}` : type === 'AMBIGU' && choice !== 'mixte' ? `confiance ${conf.toFixed(2)} sous le seuil ${minConfidence}${needs}` : `confiance ${conf.toFixed(2)}${needs}`;
  return { type, confiance: Math.round(conf * 1000) / 1000, justification: `${LABEL[choice]} retenu (${why}) — ${dist}`, choice, probabilities };
}
