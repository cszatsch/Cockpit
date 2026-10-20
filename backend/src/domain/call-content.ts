/**
 * Extraits du journal des appels (Consommation et coûts, décision du 20/10/2026) : la question saisie par la personne
 * et le début de la réponse du LLM, jamais le prompt assemblé par le serveur. Seuls les `CALL_EXCERPT_CHARS` premiers
 * caractères sont enregistrés (rien de plus n'entre en base), adresses e-mail masquées ; effacés au bout de
 * `CALL_CONTENT_RETENTION_DAYS` jours, la ligne de coût restant. Règles pures, testées dans test/unit.
 */

/** Caractères conservés de la question et de la réponse. */
export const CALL_EXCERPT_CHARS = 50;
/** Conservation des extraits (jours), comme la mémoire de Jev ; au-delà, la ligne de coût reste sans extrait. */
export const CALL_CONTENT_RETENTION_DAYS = 30;
/** Remplacement d'une adresse e-mail dans un extrait. */
export const EMAIL_MASK = '[e-mail]';

/** État des extraits d'un appel (`UsageRecord.contentState`) ; null : appel antérieur au 20/10/2026. */
export type CallContentState = 'KEPT' | 'PURGED';

/**
 * Extrait enregistré : espaces et retours à la ligne réduits, e-mails masqués (avant la coupe : une adresse coupée
 * resterait lisible), puis coupe à `CALL_EXCERPT_CHARS` caractères avec « … ». Null pour un texte vide.
 */
export function callExcerpt(text: string | null | undefined, max = CALL_EXCERPT_CHARS): string | null {
  if (!text) return null;
  const clean = text.replace(/[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[a-z]{2,}/gi, EMAIL_MASK).replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  const chars = Array.from(clean);
  return chars.length > max ? chars.slice(0, max).join('').trimEnd() + '…' : clean;
}

/**
 * Ce que montre le détail d'un appel :
 * - `not_recorded` : appel antérieur à l'enregistrement des extraits ;
 * - `none` : vectorisation ou reclassement (pas de question ni de texte généré) ;
 * - `purged` : extraits effacés après `CALL_CONTENT_RETENTION_DAYS` jours ;
 * - `hidden` : l'administrateur n'a pas le droit « voir le détail individuel » (`AdminGrant.seeIndividual`) ;
 * - `kept` : question et réponse ; sans question saisie, `context` dit d'où vient l'appel (tâche de fond ou action
 *   de l'écran, avec la fonction).
 */
export type CallContentView =
  | { state: 'not_recorded' | 'none' | 'purged' | 'hidden'; question: null; response: null; context: null }
  | { state: 'kept'; question: string | null; response: string | null; context: string | null };

export function callContentView(
  r: { contentState: string | null; promptExcerpt: string | null; responseExcerpt: string | null; accountId: string | null },
  o: { llm: boolean; canSee: boolean; fnLabel: string },
): CallContentView {
  const empty = (state: 'not_recorded' | 'none' | 'purged' | 'hidden') => ({ state, question: null, response: null, context: null });
  if (!o.llm) return empty('none');
  if (r.contentState == null) return empty('not_recorded');
  if (r.contentState === 'PURGED') return empty('purged');
  if (!o.canSee) return empty('hidden');
  const context = r.promptExcerpt ? null : `${r.accountId ? 'action de l’écran' : 'tâche de fond'} · ${o.fnLabel}`;
  return { state: 'kept', question: r.promptExcerpt, response: r.responseExcerpt, context };
}
