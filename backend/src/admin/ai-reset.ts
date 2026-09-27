import { PrismaClient } from '@prisma/client';

export interface AiResetCounts {
  models: number;
  assignments: number;
  usageRecords: number;
  budgetAlerts: number;
  providersKept: number;
}

/**
 * Réinitialisation des modèles d'IA (décision du 28/09/2026) : supprime les modèles, leur affectation
 * aux fonctions du Cockpit et le suivi des coûts (consommation et alertes budgétaires déjà envoyées).
 * Sont conservés : les fournisseurs et leurs clés, les plafonds budgétaires et les règles de notification
 * (dont le modèle est à choisir de nouveau). L'opération est tracée dans le journal d'audit.
 */
export async function resetAiModels(db: PrismaClient): Promise<AiResetCounts> {
  return db.$transaction(async (tx) => {
    const usageRecords = (await tx.usageRecord.deleteMany()).count;
    const budgetAlerts = (await tx.budgetAlertFired.deleteMany()).count;
    const assignments = (await tx.modelAssignment.deleteMany()).count;
    const models = (await tx.aiModel.deleteMany()).count;
    const providersKept = await tx.provider.count();
    await tx.auditEntry.create({
      data: {
        accountId: null,
        actorName: 'Système',
        origin: 'SYSTEM',
        action: 'Réinitialisation des modèles IA',
        target: `${models} modèle(s), ${assignments} affectation(s), ${usageRecords} ligne(s) de consommation supprimés · ${providersKept} fournisseur(s) conservé(s)`,
        severity: 'CRITICAL',
        entityType: 'AiModel',
        entityId: null,
      },
    });
    return { models, assignments, usageRecords, budgetAlerts, providersKept };
  });
}
