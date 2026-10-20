import { AsyncLocalStorage } from 'async_hooks';

/**
 * Question saisie par la personne, portée par le fil d'exécution (journal des appels, 20/10/2026) : posée à l'entrée
 * de Jev (Console et Cockpit), lue par `LlmService` à l'enregistrement de chaque appel fait pour y répondre. Hors de
 * ce contexte (tâche de fond, action d'un écran), aucun appel n'a de question.
 */
const store = new AsyncLocalStorage<{ question?: string }>();

/** Ouvre le contexte ; la question y est notée plus tard (`noteCallQuestion`), une fois le corps de la requête lu. */
export function withCallQuestion<T>(fn: () => Promise<T>, question?: string): Promise<T> {
  return store.run({ question }, fn);
}

export function noteCallQuestion(question: string) {
  const s = store.getStore();
  if (s) s.question = question;
}

export function currentCallQuestion(): string | undefined {
  return store.getStore()?.question;
}
