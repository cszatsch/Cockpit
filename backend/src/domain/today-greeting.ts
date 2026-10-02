/**
 * Message d'accueil de l'écran Aujourd'hui rédigé par Jev (02/10/2026, `docs/DECISIONS.md`) : règles pures.
 * Le serveur rassemble des faits vérifiés (filtrés par les droits), Jev en tire une ou deux phrases avec le ton de sa
 * Personnalité (Soul) ; la réponse est contrôlée avant d'être gardée. Sinon, message calculé par règles.
 */

/** Comité annoncé dans le message : COPIL, sinon le premier comité stratégique du projet. */
export const WELCOME_BODY_SHORT_NAME = 'COPIL';
/** Module de la Console qui active le message de Jev (sinon : message calculé par règles). */
export const GREETING_MODULE_ID = 'jev_accueil';
/** Longueur maximale du message affiché sous le titre « Aujourd'hui ». */
export const GREETING_MAX_CHARS = 240;
/** Nombre de faits envoyés au modèle, par ordre de priorité. */
export const GREETING_MAX_FACTS = 6;
/** Version des consignes (tracée avec chaque message). */
export const GREETING_PROMPT_VERSION = 'accueil-v1';
/** Conservation des messages générés. */
export const GREETING_PURGE_DAYS = 30;
/** Mots maximum demandés au modèle (bouchon hors ligne compris). */
export const GREETING_MAX_WORDS = 45;

export type Moment = 'matin' | 'après-midi' | 'soir';
/** Un compte et le premier élément concerné (titre), pour nommer la priorité. */
export type Count = { count: number; first: string | null };

export interface GreetingFacts {
  firstName: string;
  /** Jour de la semaine (« vendredi ») et date (« 2 oct. »). */
  weekday: string;
  dateLabel: string;
  moment: Moment;
  /** Prochaine séance du comité d'accueil (COPIL), dans les 45 jours. */
  committee: { name: string; dateLabel: string; inDays: number } | null;
  /** Décisions qui attendent l'arbitrage de la personne. */
  decisions: Count;
  /** Actions de la personne dont l'échéance est passée. */
  lateActions: Count;
  /** Actions de la personne à échéance dans les 7 jours. */
  dueThisWeek: Count;
  /** Risques critiques ouverts des chantiers visibles ; `recent` : créés ou modifiés depuis la veille. */
  criticalRisks: Count & { recent: number };
  /** Jalons des chantiers visibles dans les 7 jours. */
  milestonesThisWeek: Count;
  /** Actions de la personne terminées la veille. */
  doneYesterday: number;
}

const pl = (n: number, s: string, p = s + 's') => `${n} ${n > 1 ? p : s}`;
const q = (t: string | null) => (t ? ` (« ${t} »)` : '');

/** Moment de la journée à l'heure du projet. */
export function momentOf(hour: number): Moment {
  return hour < 12 ? 'matin' : hour < 18 ? 'après-midi' : 'soir';
}

/**
 * Faits du jour, du plus important au moins important, en phrases simples (ce que le modèle reçoit) :
 * comité imminent, retards, arbitrages, risques critiques récents, comité plus lointain, échéances de la semaine,
 * jalons, actions terminées la veille. Les faits nuls ne sont pas envoyés.
 */
export function rankedFacts(f: GreetingFacts): string[] {
  const out: Array<[number, string]> = [];
  const c = f.committee;
  const when = c ? (c.inDays === 0 ? 'aujourd’hui' : c.inDays === 1 ? 'demain' : `le ${c.dateLabel}, dans ${c.inDays} jours`) : '';
  if (c && c.inDays <= 2) out.push([100, `Prochaine séance du ${c.name} : ${when}.`]);
  if (f.lateActions.count) out.push([90, `${pl(f.lateActions.count, 'action')} de la personne ${f.lateActions.count > 1 ? 'ont' : 'a'} dépassé l’échéance${q(f.lateActions.first)}.`]);
  if (f.decisions.count) out.push([80, `${pl(f.decisions.count, 'décision')} ${f.decisions.count > 1 ? 'attendent' : 'attend'} son arbitrage${q(f.decisions.first)}.`]);
  if (f.criticalRisks.recent) out.push([70, `${pl(f.criticalRisks.recent, 'risque critique', 'risques critiques')} ${f.criticalRisks.recent > 1 ? 'ont' : 'a'} changé depuis hier${q(f.criticalRisks.first)}.`]);
  if (c && c.inDays > 2) out.push([60, `Prochaine séance du ${c.name} : ${when}.`]);
  if (f.dueThisWeek.count) out.push([50, `${pl(f.dueThisWeek.count, 'action')} de la personne ${f.dueThisWeek.count > 1 ? 'arrivent' : 'arrive'} à échéance dans les 7 jours${q(f.dueThisWeek.first)}.`]);
  if (f.criticalRisks.count && !f.criticalRisks.recent) out.push([40, `${pl(f.criticalRisks.count, 'risque critique ouvert', 'risques critiques ouverts')} sur ses chantiers${q(f.criticalRisks.first)}.`]);
  if (f.milestonesThisWeek.count) out.push([30, `${pl(f.milestonesThisWeek.count, 'jalon')} dans les 7 jours${q(f.milestonesThisWeek.first)}.`]);
  if (f.doneYesterday) out.push([20, `${pl(f.doneYesterday, 'action terminée', 'actions terminées')} hier par la personne.`]);
  return out.sort((a, b) => b[0] - a[0]).slice(0, GREETING_MAX_FACTS).map((x) => x[1]);
}

/** Accroche selon le moment et le jour (lundi matin : « Bonne semaine »). */
export function salutation(f: GreetingFacts): string {
  if (f.moment === 'soir') return `Bonsoir ${f.firstName}`;
  if (f.weekday === 'lundi' && f.moment === 'matin') return `Bonne semaine ${f.firstName}`;
  return `Bonjour ${f.firstName}`;
}

/**
 * Message calculé par règles (repli : module désactivé, génération en cours, refusée ou en échec) : l'accroche et la
 * seule priorité du jour, sans compteur à zéro ni accord au masculin ou au féminin.
 */
export function ruleGreeting(f: GreetingFacts): string {
  // Une date abrégée en fin de phrase (« 26 oct. ») porte déjà le point final.
  return ruleSentence(f).replace(/\.\.$/, '.');
}

function ruleSentence(f: GreetingFacts): string {
  const c = f.committee, d = f.decisions.count, hi = salutation(f);
  const dec = d ? ` : ${pl(d, 'décision')} ${d > 1 ? 'attendent' : 'attend'} encore votre arbitrage.` : '.';
  if (c && c.inDays <= 1) return `${hi}, le ${c.name} a lieu ${c.inDays === 0 ? 'aujourd’hui' : 'demain'}${dec}`;
  if (f.lateActions.count) {
    const n = f.lateActions.count, who = n > 1 ? `${n} de vos actions ont` : 'une de vos actions a';
    return `${hi}, ${who} dépassé l’échéance${f.lateActions.first ? `, à commencer par « ${f.lateActions.first} »` : ''}.`;
  }
  if (d) return `${hi}, ${pl(d, 'décision')} ${d > 1 ? 'attendent' : 'attend'} votre arbitrage${c ? ` avant le ${c.name} du ${c.dateLabel}` : ''}.`;
  if (f.criticalRisks.recent) return `${hi}, ${pl(f.criticalRisks.recent, 'risque critique', 'risques critiques')} ${f.criticalRisks.recent > 1 ? 'ont' : 'a'} évolué depuis hier${f.criticalRisks.first ? ` : « ${f.criticalRisks.first} »` : ''}.`;
  if (f.dueThisWeek.count) return `${hi}, ${pl(f.dueThisWeek.count, 'action')} ${f.dueThisWeek.count > 1 ? 'arrivent' : 'arrive'} à échéance cette semaine${c ? ` ; prochain ${c.name} le ${c.dateLabel}` : ''}.`;
  if (c) return `${hi}, rien d’urgent aujourd’hui : le prochain ${c.name} a lieu le ${c.dateLabel}, dans ${c.inDays} jours.`;
  return `${hi}, rien d’urgent aujourd’hui.`;
}

/** Consignes de rédaction (après la base, l'Identité et la Personnalité de Jev, qui donnent le ton). */
export const GREETING_RULES = `## Message d’accueil de l’écran « Aujourd’hui »
Tu écris le message d’accueil affiché sous le titre « Aujourd’hui » du Cockpit, à l’ouverture de l’écran.
- Une ou deux phrases, ${GREETING_MAX_CHARS} caractères au plus, en français, avec le ton de ta Personnalité.
- Commence par saluer la personne par son prénom, selon le moment de la journée.
- Mets en avant une seule priorité : le premier fait de la liste. Un second fait seulement s’il tient dans la même phrase.
- N’utilise que les faits fournis : aucun autre chiffre, nom, date ni titre. Recopie les titres tels quels.
- Formulation neutre : pas d’accord au masculin ou au féminin pour la personne (pas de « prêt », « prête »).
- Texte brut : pas de Markdown, pas de lien, pas d’emoji, pas de guillemets autour du message.
- Pas de question de relance, pas de signature.`;

/** Message utilisateur envoyé au modèle : contexte du jour et faits par priorité. */
export function greetingPrompt(f: GreetingFacts): string {
  const facts = rankedFacts(f);
  return [
    `Prénom : ${f.firstName}`,
    `Jour : ${f.weekday} ${f.dateLabel}, ${f.moment}`,
    'Faits du jour, du plus important au moins important :',
    ...(facts.length ? facts.map((x) => `- ${x}`) : ['- Rien d’urgent aujourd’hui.']),
    '',
    'Écris le message d’accueil.',
  ].join('\n');
}

/** Nombres d'un texte (« 1er » → 1, « 2 oct. » → 2). */
const numbersOf = (s: string) => (s.match(/\d+/g) ?? []).map(Number);
const TUTOIEMENT = /(^|[^\p{L}])(tu|toi|ton|ta|tes|t['’])(?=$|[^\p{L}])/iu;

/**
 * Contrôle de la réponse avant de la garder : texte brut sur une ligne, longueur, vouvoiement, et chaque nombre du
 * message présent dans les faits fournis (aucun chiffre inventé).
 */
export function checkGreeting(raw: string, f: GreetingFacts): { ok: true; text: string } | { ok: false; reason: string } {
  let text = raw.replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim();
  // Message entier entre guillemets : guillemets retirés.
  const quoted = text.match(/^(?:«\s*(.*?)\s*»|"(.*)"|“(.*)”)$/);
  if (quoted) text = (quoted[1] ?? quoted[2] ?? quoted[3]).trim();
  if (!text) return { ok: false, reason: 'réponse vide' };
  if (text.length > GREETING_MAX_CHARS) return { ok: false, reason: `trop long (${text.length} caractères)` };
  if (/https?:|\[[^\]]*\]\(|#/.test(text)) return { ok: false, reason: 'lien ou mise en forme' };
  if (TUTOIEMENT.test(text)) return { ok: false, reason: 'tutoiement' };
  const allowed = new Set(numbersOf([greetingPrompt(f), f.dateLabel].join(' ')));
  const unknown = numbersOf(text).filter((n) => !allowed.has(n));
  if (unknown.length) return { ok: false, reason: `nombre absent des faits (${unknown.join(', ')})` };
  return { ok: true, text };
}
