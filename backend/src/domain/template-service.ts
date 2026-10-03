/**
 * Mise en service d'un template publié (étape 6 de « Créer un template », 04/10/2026).
 *
 * La publication enregistre le template à l'état `PENDING`, puis une tâche du serveur enchaîne quatre étapes
 * (`servicePhase` 0 à 3, 4 = zones de données préparées) avant l'état `READY`. Le même avancement alimente l'étape 6
 * (4 tâches) et la carte « Mise en service » de « Générer un rapport » (3 phases). L'état est enregistré en base :
 * il survit à un rechargement et se lit identiquement pour tous les utilisateurs. Un template qui n'est pas `READY`
 * ne sert à générer aucun rapport (écran et API).
 */

export type ServiceStatus = 'PENDING' | 'READY' | 'FAILED';

/** Tâches de l'étape 6, dans l'ordre (`servicePhase` = tâche en cours). */
export const SERVICE_TASKS = ['Génération du PowerPoint de référence', 'Gel de la structure, du design et des zones de données', 'Activation du template', 'Ajout à la Bibliothèque'];
/** Phases de la carte « Mise en service ». */
export const SERVICE_PHASES = ['Enregistrement du PowerPoint de référence', 'Ajout à la Bibliothèque', 'Préparation des zones de données'];
/** Phase de la carte selon l'étape du serveur : 0-1 → enregistrement, 2-3 → Bibliothèque, 4 → zones de données. */
export const cardPhase = (phase: number) => (phase <= 1 ? 0 : phase <= 3 ? 1 : 2);
/** Étiquette « Nouveau » : jusqu'à la première génération d'un rapport, 24 h au plus après la mise en service (arbitrage du 04/10/2026). */
export const NEW_BADGE_MS = 24 * 60 * 60 * 1000;

export interface ServiceFields { serviceStatus: string; servicePhase: number; serviceError: string | null; serviceReadyAt: Date | null; firstReportAt: Date | null }

export function serviceView(t: ServiceFields, now: Date = new Date()) {
  const status = (t.serviceStatus || 'READY') as ServiceStatus;
  return {
    status,
    phase: status === 'READY' ? SERVICE_TASKS.length + 1 : t.servicePhase,
    tasksDone: status === 'READY' ? SERVICE_TASKS.length : Math.min(t.servicePhase, SERVICE_TASKS.length),
    cardPhase: status === 'READY' ? SERVICE_PHASES.length : cardPhase(t.servicePhase),
    error: status === 'FAILED' ? t.serviceError : null,
    readyAt: t.serviceReadyAt,
    isNew: status === 'READY' && !!t.serviceReadyAt && !t.firstReportAt && now.getTime() - t.serviceReadyAt.getTime() < NEW_BADGE_MS,
  };
}

export const NOT_READY_MESSAGE = 'Template en cours de mise en service : il sera utilisable dans quelques secondes.';
export const FAILED_MESSAGE = 'Mise en service interrompue : relancez-la depuis « Générer un rapport ».';
export const INTERRUPTED_ERROR = 'Mise en service interrompue par un redémarrage du serveur.';
