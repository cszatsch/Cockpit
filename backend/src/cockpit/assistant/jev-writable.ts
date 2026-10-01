import { ACTIONS, DECISIONS, ISSUES, RISKS, TxEntity } from '../pilotage/transactional';

/** Objets que Jev peut créer, modifier ou supprimer (suivi : arbitrage du 01/10/2026) ; jamais le Référentiel (§ 7.14). */
export const JEV_WRITABLE_DEFS: Record<'RISK' | 'ISSUE' | 'ACTION' | 'DECISION', TxEntity> = { RISK: RISKS, ISSUE: ISSUES, ACTION: ACTIONS, DECISION: DECISIONS };
