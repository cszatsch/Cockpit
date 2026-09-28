import { PrismaClient } from '@prisma/client';
import { loadDemo } from './source';
import { seedRise } from './rise';
import { seedAdmin } from './admin';
import { seedDictionnaire } from './dictionnaire';
import { createInitialAdmin } from '../../src/core/auth/initial-admin';

/**
 * Script d'amorçage : vide la base puis charge le jeu de démonstration
 * (Cockpit : `rise-data.js`, `planning-data.js` ; Console : constantes de `Console Admin.dc.html`).
 * Usage : `npm run db:seed` (idempotent : repart d'une base vide à chaque exécution).
 */
export async function runSeed(db: PrismaClient): Promise<void> {
  await truncateAll(db);
  const { rise, plan } = await loadDemo();
  await seedRise(db, rise, plan);
  await seedAdmin(db);
  await seedDictionnaire(db);
  // Compte initial (Cédric Schmitz), si RISE_INITIAL_ADMIN_PASSWORD est défini : il survit à la réinitialisation.
  await createInitialAdmin(db);
}

/** TRUNCATE ne déclenche pas les triggers de ligne : le journal reste protégé contre UPDATE/DELETE. */
export async function truncateAll(db: PrismaClient): Promise<void> {
  const tables: Array<{ tablename: string }> = await db.$queryRawUnsafe(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
  );
  if (!tables.length) return;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
}

if (require.main === module) {
  const db = new PrismaClient();
  runSeed(db)
    .then(async () => {
      const counts = {
        persons: await db.person.count(),
        milestones: await db.milestone.count(),
        risks: await db.risk.count(),
        sessions: await db.session.count(),
        deliverables: await db.deliverable.count(),
        habilitations: await db.habilitation.count(),
        accounts: await db.account.count(),
        usageRecords: await db.usageRecord.count(),
      };
      console.log('Amorçage terminé', counts);
    })
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
}
