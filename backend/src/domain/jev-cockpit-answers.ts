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
