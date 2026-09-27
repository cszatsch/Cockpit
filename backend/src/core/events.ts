import { Injectable } from '@nestjs/common';

/**
 * Bus d'événements interne (synchrone, en mémoire) : découple le Cockpit de la Console.
 * Ex. `usage.recorded` → alertes budgétaires (Console § 10.3) ; `risk.critical` → notifications (§ 10.5).
 */
export type RiseEvent =
  | { type: 'usage.recorded'; costEur: number; functionId: string; at: Date }
  | { type: 'risk.critical'; projectId: string; riskId: string }
  | { type: 'milestone.late'; projectId: string; milestoneId: string }
  | { type: 'document.analyzed'; projectId: string; documentId: string };

type Handler = (e: RiseEvent) => Promise<void> | void;

@Injectable()
export class EventBus {
  private handlers: Handler[] = [];

  on(h: Handler) {
    this.handlers.push(h);
  }

  /** Les erreurs des abonnés sont journalisées sans interrompre l'émetteur. */
  async emit(e: RiseEvent): Promise<void> {
    for (const h of this.handlers) {
      try {
        await h(e);
      } catch (err) {
        console.error(`Événement ${e.type} :`, err);
      }
    }
  }
}
