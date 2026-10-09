import { ZodTypeAny } from 'zod';
import { ACTIONS, DECISIONS, ISSUES, RISKS, TxEntity } from '../pilotage/transactional';
import { DELIVERABLES, EntityConfig, MILESTONES, PHASES, SUBPHASES, WORKSTREAMS } from '../referential/entities';
import { WriteEntity } from '../../domain/jev-cockpit-write';

/** Objets du suivi que Jev peut créer, modifier ou supprimer (arbitrage du 01/10/2026) : service transactionnel. */
export const JEV_WRITABLE_DEFS: Record<'RISK' | 'ISSUE' | 'ACTION' | 'DECISION', TxEntity> = { RISK: RISKS, ISSUE: ISSUES, ACTION: ACTIONS, DECISION: DECISIONS };

/**
 * Objets du Référentiel que Jev peut créer, modifier ou supprimer (demande du commanditaire du 09/10/2026, PMO seulement) :
 * service du Référentiel (droits, contrôle des usages à la suppression, historique d'origine JEV).
 */
export const JEV_REF_DEFS: Record<'PHASE' | 'SUBPHASE' | 'WORKSTREAM' | 'MILESTONE' | 'DELIVERABLE', EntityConfig> = { PHASE: PHASES, SUBPHASE: SUBPHASES, WORKSTREAM: WORKSTREAMS, MILESTONE: MILESTONES, DELIVERABLE: DELIVERABLES };

/** Table Prisma, schémas de création et de modification d'un objet modifiable par Jev, quel que soit son service. */
export function jevDef(e: WriteEntity): { delegate: string; create: ZodTypeAny; patch: ZodTypeAny } {
  const d: TxEntity | EntityConfig = (JEV_WRITABLE_DEFS as any)[e] ?? (JEV_REF_DEFS as any)[e];
  return { delegate: d.delegate, create: d.create, patch: d.patch };
}
