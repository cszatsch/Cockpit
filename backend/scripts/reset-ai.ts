/**
 * Réinitialisation des modèles d'IA : suppression des modèles, de leur affectation et du suivi des coûts.
 * Les fournisseurs (et leurs clés), les plafonds et les règles de notification sont conservés.
 *
 *   npm run ia:reinitialiser -- --confirmer
 *
 * Sans `--confirmer`, le script affiche seulement ce qui serait supprimé.
 */
import { PrismaClient } from '@prisma/client';
import { resetAiModels } from '../src/admin/ai-reset';

async function main(): Promise<number> {
  const db = new PrismaClient();
  try {
    const [models, assignments, usageRecords, providers] = await Promise.all([db.aiModel.count(), db.modelAssignment.count(), db.usageRecord.count(), db.provider.count()]);
    console.log(`Base : ${models} modèle(s), ${assignments} affectation(s), ${usageRecords} ligne(s) de consommation ; ${providers} fournisseur(s) conservé(s).`);
    if (!process.argv.includes('--confirmer')) {
      console.log('Aucune suppression : relancez avec --confirmer pour réinitialiser.');
      return 0;
    }
    const r = await resetAiModels(db);
    console.log(`Réinitialisation faite : ${r.models} modèle(s), ${r.assignments} affectation(s), ${r.usageRecords} ligne(s) de consommation et ${r.budgetAlerts} alerte(s) budgétaire(s) supprimés.`);
    return 0;
  } finally {
    await db.$disconnect();
  }
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
