/**
 * Réponses de Jev dans le Cockpit selon le cas d'usage (brief « Aiguillage des questions dans l'assistant JEV », 01/10/2026)
 * — règles pures, sans réseau. Cas 2 (guide) : `guideAnswerRules('cockpit')` et `guideExtractsBlock` (jev-rag.ts) ;
 * cas 5 (clarification) : consignes et demande ci-dessous. Les autres cas suivront (1, 4, 3).
 */
import { COCKPIT_CASE_LABEL, CockpitCase } from './jev-router-cockpit';

/** Ce que Jev sait faire dans le Cockpit (rappelé dans la clarification). */
export const COCKPIT_CAPABILITIES = [
  'Dans le Cockpit, je peux :',
  '- répondre sur les données du projet (risques, actions, jalons, décisions, comités, chantiers, planning…), dans la limite des chantiers que vous voyez ;',
  '- expliquer l’utilisation de l’application, d’après le guide utilisateur du Cockpit ;',
  '- créer, modifier ou supprimer un risque, un problème, une action ou une décision, après votre confirmation ;',
  '- retrouver une information dans les documents de la Base de connaissance (supports de comité, comptes rendus…).',
].join('\n');

/** Motif de la clarification : il oriente la demande de précision. */
export type CockpitClarifyReason = 'AMBIGU' | 'HORS_SUJET' | 'CONFIANCE' | 'ECRITURE' | 'INDISPONIBLE';

/** Consignes de la réponse de clarification (partie stable, mise en cache). */
export const COCKPIT_CLARIFY_RULES = [
  '## Demander une précision',
  COCKPIT_CAPABILITIES,
  '',
  'Consignes :',
  '- Réponds en français, en vouvoyant l’utilisateur, en 3 à 6 lignes au plus, sans emoji.',
  '- Dis en une phrase ce qui manque pour répondre, sans reproche.',
  '- Propose 2 ou 3 reformulations ou choix précis, en liste, que l’utilisateur peut reprendre tels quels.',
  '- N’invente aucune donnée du projet, aucune règle de l’application, aucune procédure.',
  '- N’annonce jamais qu’une modification a été faite : rien n’est enregistré à ce stade.',
].join('\n');

/**
 * Demande de clarification (partie variable), selon le motif. La phrase d'ouverture est celle du brief ;
 * `probable` : cas retenu par l'aiguillage avant le seuil, pour orienter les reformulations.
 */
export function cockpitClarifyPrompt(question: string, reason: CockpitClarifyReason, probable?: CockpitCase | null): string {
  const hint = probable && probable !== '5' ? ` La piste la plus probable est : ${COCKPIT_CASE_LABEL[probable].toLowerCase()}.` : '';
  const why: Record<CockpitClarifyReason, string> = {
    AMBIGU: 'La demande est ambiguë ou trop vague : on ne sait pas si elle porte sur les données du projet, l’utilisation de l’application, une modification ou un document.',
    HORS_SUJET: 'La demande semble sans rapport avec le Cockpit ou le projet : rappelle poliment ce que tu sais faire, puis propose des questions possibles sur le projet.',
    CONFIANCE: `La demande n’est pas assez précise pour savoir avec certitude ce qui est attendu.${hint}`,
    ECRITURE: 'La demande semble viser une modification des données, mais ce n’est pas certain : demande à l’utilisateur de confirmer ce qu’il veut enregistrer (objet, champ, nouvelle valeur), ou s’il veut seulement une information. Ne propose aucune modification comme déjà faite.',
    INDISPONIBLE: 'Le service qui oriente les questions est momentanément indisponible : demande à l’utilisateur de préciser s’il veut une donnée du projet, une explication sur l’application, une modification ou une information tirée d’un document.',
  };
  return `Génère une réponse à cette demande qui nécessite une clarification de l’utilisateur :\n${question}\n\n${why[reason]}`;
}

/** Motif de clarification d'après la décision de l'aiguillage. */
export function clarifyReasonOf(route: { status: string; choice: string | null; downgrade: string | null }): CockpitClarifyReason {
  if (route.status !== 'OK') return 'INDISPONIBLE';
  if (route.choice === 'hors_sujet') return 'HORS_SUJET';
  if (route.choice === 'modification' && route.downgrade) return 'ECRITURE';
  if (route.downgrade) return 'CONFIANCE';
  return 'AMBIGU';
}

/** Écran ouvert, pour le contexte de la demande. */
export const cockpitPageLabel = (space: string, tab?: string | null) => `Écran ouvert du Cockpit : ${[space, tab].filter(Boolean).join(' › ')}`;

/** Maintenant, heure de Paris (contexte de la demande). */
export const nowParisLabel = (d: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'medium' }).format(d);

// ───────────── Cas 1 : Insight sur les données du projet ─────────────

/** Consigne ajoutée à l'étape « requête » : la question vient de l'aiguillage (cas 1, données). */
export const COCKPIT_INSIGHT_DATA_HINT = 'La question porte sur les données du projet (aiguillage) : réponds par une requête SQL sur les vues ci-dessus.';

/** Périmètre de lecture de l'utilisateur, tel que les vues l'appliquent (projet, chantiers lisibles). */
export function cockpitScopeLine(chantiers: '*' | string[]): string {
  if (chantiers === '*') return 'L’utilisateur voit tout le projet (tous les chantiers).';
  if (!chantiers.length) return 'L’utilisateur n’a accès à aucun chantier : seules les données du projet non rattachées à un chantier sont lisibles.';
  return `L’utilisateur ne voit que les chantiers ${chantiers.join(', ')} (chantier_id) ; les lignes des autres chantiers sont absentes des vues. Ne laisse jamais entendre que tu vois tout le projet.`;
}

/** Consignes de l'étape « rédiger la réponse » (cas 1). */
export const COCKPIT_INSIGHT_ANSWER_RULES = [
  '## Réponse à partir des données du projet',
  'La question a été traduite en requête SQL, exécutée sur les données du projet que l’utilisateur a le droit de voir. Réponds à partir des résultats fournis, et d’eux seuls :',
  '- N’invente aucune valeur, aucun code, aucune date. Si les résultats sont vides, dis qu’aucune donnée ne correspond dans ton périmètre. S’ils sont tronqués, dis-le.',
  '- Commence par la réponse elle-même (le chiffre, la date, la liste), puis les éléments utiles, hiérarchisés : ce qui menace le prochain jalon d’abord.',
  '- Cite les codes des objets (R03, A-41, D-005, J07) ; traduis les statuts et les codes d’après le dictionnaire ; ne montre pas la requête SQL.',
  '- Si le périmètre de l’utilisateur est limité à certains chantiers, précise que la réponse porte sur ces chantiers.',
  '- Tu n’agis pas : n’annonce aucune modification ; indique, si c’est utile, l’écran du Cockpit où agir (Pilotage › Risques, par exemple).',
].join('\n');

/** Lecture impossible (requête refusée deux fois ou en échec) : jamais de réponse inventée. */
export const insightUnavailableReply = (why: string) => `Je n’ai pas pu lire les données du projet pour répondre (${why}). Reformulez la question, ou consultez directement l’écran concerné du Cockpit.`;

/** Source affichée sous la réponse : la vue consultée, en clair. */
export const insightSourceLabel = (view: string) => `Données · ${view.replace(/_/g, ' ')}`;

// ───────────── Réponses provisoires (étapes à venir) ─────────────

/** Cas 4b en attendant la lecture des documents : réponse par les données seules, signalée comme telle. */
export const COCKPIT_DOCS_PENDING_RULE = 'La question demande aussi ce que disent des documents (support de comité, compte rendu…). Tu ne peux pas encore lire les documents de la Base de connaissance : réponds sur la partie « données » seulement, et termine par une phrase qui le dit clairement.';
/** Cas 4a en attendant la lecture des documents : réponse fixe, sans appel au modèle. */
export const COCKPIT_DOCS_PENDING_REPLY = 'Je ne sais pas encore lire le contenu des documents de la Base de connaissance (supports de comité, comptes rendus…) : cette capacité arrive prochainement. En attendant, ouvrez le document depuis la Base de connaissance, où son résumé est disponible.';
/** Cas 3 sans modification identifiée (en attendant le traitement complet des modifications). */
export const COCKPIT_WRITE_UNCLEAR_REPLY = 'Je n’ai pas identifié de modification précise à proposer. Indiquez l’objet (par exemple A-41 ou R03) et le changement voulu (statut, échéance…), ou créez une action avec « crée une action : … ».';
